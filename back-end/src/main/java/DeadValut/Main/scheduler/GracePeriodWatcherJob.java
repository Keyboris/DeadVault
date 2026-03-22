// scheduler/GracePeriodWatcherJob.java  (UPDATED — keyholder gate)
package DeadValut.Main.scheduler;

import DeadValut.Main.model.Contract;
import DeadValut.Main.model.SwitchEvent;
import DeadValut.Main.repository.*;
import DeadValut.Main.service.ConfirmationService;
import DeadValut.Main.service.ContractDeploymentService;
import DeadValut.Main.service.KeyholderService;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Quartz job — runs every 15 minutes.
 *
 * <p>For each user whose grace period has expired:
 * <ol>
 *   <li>Attempt an optimistic lock on the ACTIVE vault (→ TRIGGERING).</li>
 *   <li><strong>If the user has secondary keyholders configured</strong>
 *       ({@code keyholderThreshold > 0}), open a
 *       {@link DeadValut.Main.model.KeyholderConfirmationRound} and return —
 *       the vault remains in TRIGGERING until the round resolves.</li>
 *   <li><strong>Otherwise</strong> (feature disabled), dispatch the vault trigger
 *       immediately as before.</li>
 * </ol>
 *
 * <p>The keyholder path is handled by {@link ConfirmationService#openRound}.
 * The vault trigger path (on approval or round expiry) is in
 * {@link ConfirmationService#castVote} / {@link ConfirmationService#expireRound}.
 */
@Component
public class GracePeriodWatcherJob implements Job {

    private static final Logger log = LoggerFactory.getLogger(GracePeriodWatcherJob.class);

    private final CheckInConfigRepository configRepo;
    private final ContractRepository contractRepo;
    private final BeneficiaryRepository beneficiaryRepo;
    private final ContractDeploymentService deploymentService;
    private final SwitchEventRepository eventRepo;
    private final KeyholderService keyholderService;
    private final ConfirmationService confirmationService;

    public GracePeriodWatcherJob(CheckInConfigRepository configRepo,
                                  ContractRepository contractRepo,
                                  BeneficiaryRepository beneficiaryRepo,
                                  ContractDeploymentService deploymentService,
                                  SwitchEventRepository eventRepo,
                                  KeyholderService keyholderService,
                                  ConfirmationService confirmationService) {
        this.configRepo = configRepo;
        this.contractRepo = contractRepo;
        this.beneficiaryRepo = beneficiaryRepo;
        this.deploymentService = deploymentService;
        this.eventRepo = eventRepo;
        this.keyholderService = keyholderService;
        this.confirmationService = confirmationService;
    }

    @Override
    public void execute(JobExecutionContext context) {
        configRepo.findExpiredGracePeriods(Instant.now()).forEach(config -> {
            var userId = config.getUserId();

            // Optimistic lock — transitions the user's ACTIVE vault to TRIGGERING.
            int locked = contractRepo.setStatusIfActive(userId);
            if (locked == 0) {
                log.warn("Skipping user {} — no ACTIVE vault (already triggering/triggered)",
                        userId);
                return;
            }

            // ── Keyholder gate ───────────────────────────────────────────────
            if (keyholderService.isFeatureEnabled(userId)) {
                int threshold = keyholderService.getThreshold(userId);
                try {
                    confirmationService.openRound(userId, threshold);
                    // Update the check-in config to GRACE so the UI shows the right state
                    config.setStatus("GRACE");
                    configRepo.save(config);
                    log.info("Keyholder confirmation round opened for user {} (threshold={})",
                            userId, threshold);
                } catch (Exception e) {
                    // Roll back the TRIGGERING lock so the job can retry next cycle
                    contractRepo.setStatusIfTriggering(userId, "ACTIVE");
                    log.error("Failed to open keyholder round for user {}: {}",
                            userId, e.getMessage());
                }
                return; // do NOT trigger immediately
            }
            // ────────────────────────────────────────────────────────────────

            // No keyholders configured — trigger immediately (original behaviour)
            try {
                Contract contract = contractRepo
                        .findByUserIdAndStatus(userId, "TRIGGERING")
                        .orElseThrow(() -> new IllegalStateException(
                                "TRIGGERING contract not found for user " + userId));

                String txHash = dispatch(contract);

                contractRepo.setTriggered(userId, txHash, Instant.now());
                config.setStatus("TRIGGERED");
                configRepo.save(config);
                eventRepo.save(SwitchEvent.of(userId, "TRIGGERED",
                    Map.of("txHash", txHash, "vaultType", contract.getVaultType())));
                log.info("Vault triggered for user {} (type={}) tx={}",
                        userId, contract.getVaultType(), txHash);

            } catch (Exception e) {
                String vaultType = contractRepo
                        .findByUserIdAndStatus(userId, "TRIGGERING")
                        .map(Contract::getVaultType)
                        .orElse("UNKNOWN");
                log.error("Trigger attempt for user {} (type={}) failed: {} — will retry",
                        userId, vaultType, e.getMessage());
                contractRepo.setStatusIfTriggering(userId, "ACTIVE");
            }
        });
    }

    /**
     * Dispatches to the correct trigger path based on the vault type stored in the DB.
     */
    private String dispatch(Contract contract) throws Exception {
        return switch (contract.getVaultType()) {

            case "STANDARD", "TIME_LOCKED" ->
                deploymentService.triggerVault(contract.getContractAddress());

            case "CONDITIONAL_SURVIVAL" -> {
                List<Integer> conditionalIndexes = beneficiaryRepo
                    .findByConfigIdOrderByIndex(contract.getBeneficiaryConfigId())
                    .stream()
                    .filter(b -> "CONDITIONAL_SURVIVAL".equals(b.getCondition()))
                    .map(b -> b.getIndex())
                    .toList();

                yield deploymentService.triggerConditionalVault(
                    contract.getContractAddress(), conditionalIndexes);
            }

            default -> throw new IllegalStateException(
                "Unknown vault type: " + contract.getVaultType());
        };
    }
}