// service/ConfirmationService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Handles the confirmation-round lifecycle:
 * <ul>
 *   <li>Opening a new round when the grace period expires (called by the
 *       scheduler).</li>
 *   <li>Receiving keyholder votes.</li>
 *   <li>Firing the vault once the threshold is met.</li>
 *   <li>Cancelling pending rounds when the owner checks back in.</li>
 *   <li>Expiring rounds that timed out.</li>
 * </ul>
 */
@Service
public class ConfirmationService {

    private static final Logger log = LoggerFactory.getLogger(ConfirmationService.class);

    /** Keyholders have this many hours to cast their votes before the round expires. */
    private static final long ROUND_TTL_HOURS = 72;

    private final KeyholderConfirmationRoundRepository roundRepo;
    private final KeyholderVoteRepository voteRepo;
    private final SecondaryKeyholderRepository keyholderRepo;
    private final ContractRepository contractRepo;
    private final ContractDeploymentService deploymentService;
    private final SwitchEventRepository eventRepo;
    private final CheckInConfigRepository checkInConfigRepo;

    public ConfirmationService(
            KeyholderConfirmationRoundRepository roundRepo,
            KeyholderVoteRepository voteRepo,
            SecondaryKeyholderRepository keyholderRepo,
            ContractRepository contractRepo,
            ContractDeploymentService deploymentService,
            SwitchEventRepository eventRepo,
            CheckInConfigRepository checkInConfigRepo) {
        this.roundRepo = roundRepo;
        this.voteRepo = voteRepo;
        this.keyholderRepo = keyholderRepo;
        this.contractRepo = contractRepo;
        this.deploymentService = deploymentService;
        this.eventRepo = eventRepo;
        this.checkInConfigRepo = checkInConfigRepo;
    }

    // ── Called by GracePeriodWatcherJob ──────────────────────────────────────

    /**
     * Opens a confirmation round for {@code userId} using the TRIGGERING contract.
     * The caller (scheduler) must have already set the contract status to TRIGGERING
     * via {@code contractRepo.setStatusIfActive()}.
     *
     * @param userId    the vault owner whose grace period just expired
     * @param threshold how many votes are required (snapshot from user record)
     * @return the newly created round
     */
    @Transactional
    public KeyholderConfirmationRound openRound(UUID userId, int threshold) {
        // Resolve the TRIGGERING contract
        Contract contract = contractRepo.findByUserIdAndStatus(userId, "TRIGGERING")
                .orElseThrow(() -> new IllegalStateException(
                        "No TRIGGERING contract for user " + userId));

        KeyholderConfirmationRound round = new KeyholderConfirmationRound();
        round.setUserId(userId);
        round.setContractId(contract.getId());
        round.setThresholdRequired(threshold);
        round.setExpiresAt(Instant.now().plus(ROUND_TTL_HOURS, ChronoUnit.HOURS));
        KeyholderConfirmationRound saved = roundRepo.save(round);

        eventRepo.save(SwitchEvent.of(userId, "GRACE_STARTED",
                java.util.Map.of("keyholderRoundId", saved.getId().toString(),
                                 "threshold", threshold)));

        log.info("Keyholder confirmation round {} opened for user {} (threshold={})",
                saved.getId(), userId, threshold);
        return saved;
    }

    // ── Called by POST /api/keyholders/confirm ────────────────────────────────

    /**
     * Records one keyholder vote.  If the threshold is now met, triggers the vault
     * immediately within the same transaction.
     *
     * @param roundId         the confirmation round UUID
     * @param callerWallet    wallet address of the keyholder casting the vote
     * @return updated round state
     */
    @Transactional
    public ConfirmationRoundResponse castVote(UUID roundId, String callerWallet) {
        KeyholderConfirmationRound round = loadPendingRound(roundId);

        // Verify the caller is a registered keyholder for the vault owner
        SecondaryKeyholder keyholder = keyholderRepo
                .findByUserIdAndWalletAddressIgnoreCase(round.getUserId(), callerWallet)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Caller is not a registered keyholder for this vault"));

        // Prevent double-voting
        if (voteRepo.existsByRoundIdAndKeyholderID(roundId, keyholder.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You have already voted in this round");
        }

        // Record the vote
        KeyholderVote vote = new KeyholderVote();
        vote.setRoundId(roundId);
        vote.setKeyholderID(keyholder.getId());
        voteRepo.save(vote);

        int total = voteRepo.countByRoundId(roundId);
        round.setConfirmationsReceived(total);

        if (total >= round.getThresholdRequired()) {
            approveAndTrigger(round);
        } else {
            roundRepo.save(round);
        }

        log.info("Vote recorded for round {} by keyholder {} ({}/{})",
                roundId, callerWallet, total, round.getThresholdRequired());

        return toResponse(round);
    }

    // ── Called by CheckInService (owner checks back in) ────────────────────────

    /**
     * Cancels all PENDING rounds for the user.
     * Also rolls the TRIGGERING contract back to ACTIVE so the scheduler won't
     * attempt a double-trigger.
     */
    @Transactional
    public void cancelPendingRounds(UUID userId) {
        List<KeyholderConfirmationRound> pending =
                roundRepo.findPendingRoundsByUserId(userId);

        if (pending.isEmpty()) return;

        Instant now = Instant.now();
        pending.forEach(r -> {
            r.setStatus(KeyholderConfirmationRound.Status.REJECTED);
            r.setResolvedAt(now);
            roundRepo.save(r);
            // Roll the TRIGGERING contract back so the vault stays alive
            contractRepo.setStatusIfTriggering(userId, "ACTIVE");
            log.info("Round {} cancelled (owner checked in)", r.getId());
        });

        eventRepo.save(SwitchEvent.of(userId, "CHECK_IN",
                java.util.Map.of("cancelledRounds", pending.size())));
    }

    // ── Called by KeyholderExpiryJob ──────────────────────────────────────────

    /**
     * Called by the scheduler sweep for rounds whose {@code expiresAt} has passed.
     * Policy: trigger the vault anyway (the owner has been unreachable long enough).
     */
    @Transactional
    public void expireRound(KeyholderConfirmationRound round) {
        round.setStatus(KeyholderConfirmationRound.Status.EXPIRED);
        round.setResolvedAt(Instant.now());
        roundRepo.save(round);

        // Proceed to trigger — missing threshold but owner is unreachable
        dispatchTrigger(round);
        log.warn("Round {} expired — triggering vault anyway for user {}",
                round.getId(), round.getUserId());
    }

    // ── READ ────────────────────────────────────────────────────────────────

    public ConfirmationRoundResponse getPendingRound(UUID userId) {
        KeyholderConfirmationRound round = roundRepo
                .findTopByUserIdAndStatusOrderByCreatedAtDesc(
                        userId, KeyholderConfirmationRound.Status.PENDING)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No active confirmation round for this user"));
        return toResponse(round);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void approveAndTrigger(KeyholderConfirmationRound round) {
        round.setStatus(KeyholderConfirmationRound.Status.APPROVED);
        round.setResolvedAt(Instant.now());
        roundRepo.save(round);
        dispatchTrigger(round);
    }

    private void dispatchTrigger(KeyholderConfirmationRound round) {
        UUID userId = round.getUserId();
        try {
            Contract contract = contractRepo.findById(round.getContractId())
                    .orElseThrow(() -> new IllegalStateException(
                            "Contract " + round.getContractId() + " not found"));

            String txHash = triggerByVaultType(contract);

            contractRepo.setTriggered(userId, txHash, Instant.now());

            checkInConfigRepo.findByUserId(userId).ifPresent(cfg -> {
                cfg.setStatus("TRIGGERED");
                checkInConfigRepo.save(cfg);
            });

            eventRepo.save(SwitchEvent.of(userId, "TRIGGERED",
                    java.util.Map.of("txHash", txHash,
                                     "vaultType", contract.getVaultType(),
                                     "triggeredByKeyholders", true)));

            log.info("Vault triggered after keyholder approval for user {} tx={}",
                    userId, txHash);

        } catch (Exception e) {
            // Roll status back so the scheduler can retry
            contractRepo.setStatusIfTriggering(userId, "ACTIVE");
            log.error("Vault trigger after keyholder approval FAILED for user {}: {}",
                    userId, e.getMessage());
            throw new RuntimeException("Vault trigger failed: " + e.getMessage(), e);
        }
    }

    private String triggerByVaultType(Contract contract) throws Exception {
        return switch (contract.getVaultType()) {
            case "STANDARD", "TIME_LOCKED" ->
                deploymentService.triggerVault(contract.getContractAddress());
            case "CONDITIONAL_SURVIVAL" ->
                deploymentService.triggerVault(contract.getContractAddress());
            default -> throw new IllegalStateException(
                    "Unknown vault type: " + contract.getVaultType());
        };
    }

    private KeyholderConfirmationRound loadPendingRound(UUID roundId) {
        KeyholderConfirmationRound round = roundRepo.findById(roundId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Confirmation round not found"));
        if (round.getStatus() != KeyholderConfirmationRound.Status.PENDING) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "Round is no longer pending (status=" + round.getStatus() + ")");
        }
        if (Instant.now().isAfter(round.getExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "Confirmation round has expired");
        }
        return round;
    }

    private ConfirmationRoundResponse toResponse(KeyholderConfirmationRound r) {
        return new ConfirmationRoundResponse(
                r.getId(),
                r.getUserId(),
                r.getStatus().name(),
                r.getThresholdRequired(),
                r.getConfirmationsReceived(),
                r.getExpiresAt(),
                r.getCreatedAt());
    }
}