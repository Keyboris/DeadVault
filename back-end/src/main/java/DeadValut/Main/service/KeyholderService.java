// service/KeyholderService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Manages the secondary-keyholder list and the per-user approval threshold.
 *
 * <h2>Feature overview</h2>
 * <ol>
 *   <li>The vault owner adds between 1 and 10 trusted contacts (keyholders) by
 *       wallet address.</li>
 *   <li>The owner sets a threshold N (1 ≤ N ≤ keyholderCount). N = 0 disables
 *       the feature.</li>
 *   <li>When the owner's grace period expires (see {@link GracePeriodWatcherJob}),
 *       the scheduler checks whether the feature is enabled. If it is, it opens a
 *       {@link KeyholderConfirmationRound} instead of firing the vault immediately.
 *       </li>
 *   <li>Each keyholder calls {@code POST /api/keyholders/confirm?roundId=…} to
 *       cast their vote. Once the threshold is met, {@link ConfirmationService}
 *       fires the vault and marks the round APPROVED.</li>
 *   <li>If the round expires before enough votes arrive the round is marked
 *       EXPIRED and the vault fires anyway (see {@link KeyholderExpiryJob}).</li>
 *   <li>If the owner checks back in, all PENDING rounds are cancelled (REJECTED)
 *       and the vault is NOT triggered.</li>
 * </ol>
 */
@Service
public class KeyholderService {

    private static final int MAX_KEYHOLDERS = 10;

    private final SecondaryKeyholderRepository keyholderRepo;
    private final UserRepository userRepository;

    public KeyholderService(SecondaryKeyholderRepository keyholderRepo,
                            UserRepository userRepository) {
        this.keyholderRepo = keyholderRepo;
        this.userRepository = userRepository;
    }

    // ── READ ────────────────────────────────────────────────────────────────

    public List<KeyholderResponse> listKeyholders(UUID userId) {
        return keyholderRepo.findByUserId(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    // ── WRITE ───────────────────────────────────────────────────────────────

    @Transactional
    public KeyholderResponse addKeyholder(UUID userId, AddKeyholderRequest req) {
        // Enforce cap
        if (keyholderRepo.countByUserId(userId) >= MAX_KEYHOLDERS) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Maximum of " + MAX_KEYHOLDERS + " keyholders allowed");
        }

        // Prevent duplicates (case-insensitive)
        if (keyholderRepo.existsByUserIdAndWalletAddressIgnoreCase(
                userId, req.walletAddress())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Keyholder " + req.walletAddress() + " already registered");
        }

        // Prevent the owner from adding themselves
        User user = loadUser(userId);
        if (user.getWalletAddress().equalsIgnoreCase(req.walletAddress())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "You cannot add your own wallet as a keyholder");
        }

        SecondaryKeyholder kh = new SecondaryKeyholder();
        kh.setUserId(userId);
        kh.setWalletAddress(req.walletAddress().toLowerCase());
        kh.setLabel(req.label());
        kh.setEmail(req.email());
        return toResponse(keyholderRepo.save(kh));
    }

    @Transactional
    public void removeKeyholder(UUID userId, UUID keyholderID) {
        SecondaryKeyholder kh = keyholderRepo.findById(keyholderID)
                .filter(k -> k.getUserId().equals(userId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Keyholder not found"));

        // If removal would make threshold impossible, auto-reduce threshold
        User user = loadUser(userId);
        int remaining = keyholderRepo.countByUserId(userId) - 1;
        if (user.getKeyholderThreshold() > remaining) {
            user.setKeyholderThreshold(remaining); // auto-reduce (may become 0 = disabled)
            userRepository.save(user);
        }

        keyholderRepo.delete(kh);
    }

    @Transactional
    public void setThreshold(UUID userId, int threshold) {
        User user = loadUser(userId);
        int count = keyholderRepo.countByUserId(userId);

        if (threshold < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "threshold must be >= 0");
        }
        if (threshold > count) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "threshold (" + threshold + ") cannot exceed the number of registered " +
                    "keyholders (" + count + ")");
        }

        user.setKeyholderThreshold(threshold);
        userRepository.save(user);
    }

    // ── INTERNAL helpers used by the scheduler ───────────────────────────────

    /**
     * Returns true when the secondary-keyholder feature is active for this user.
     * The scheduler calls this before deciding whether to open a confirmation round
     * or fire the vault immediately.
     */
    public boolean isFeatureEnabled(UUID userId) {
        User user = loadUser(userId);
        return user.getKeyholderThreshold() > 0;
    }

    public int getThreshold(UUID userId) {
        return loadUser(userId).getKeyholderThreshold();
    }

    public List<SecondaryKeyholder> getRawKeyholders(UUID userId) {
        return keyholderRepo.findByUserId(userId);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "User not found"));
    }

    private KeyholderResponse toResponse(SecondaryKeyholder kh) {
        return new KeyholderResponse(
                kh.getId(),
                kh.getWalletAddress(),
                kh.getLabel(),
                kh.getEmail(),
                kh.getAddedAt());
    }
}