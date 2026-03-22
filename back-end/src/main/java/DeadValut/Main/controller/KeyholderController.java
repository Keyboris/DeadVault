// controller/KeyholderController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.*;
import DeadValut.Main.service.ConfirmationService;
import DeadValut.Main.service.KeyholderService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Application-layer controller (not a @RestController) that sits between
 * {@link DeadValut.Main.route.KeyholderRoute} and the service layer.
 * Follows the same thin-controller pattern used throughout the codebase.
 */
@Component
public class KeyholderController {

    private final KeyholderService    keyholderService;
    private final ConfirmationService confirmationService;

    public KeyholderController(KeyholderService keyholderService,
                               ConfirmationService confirmationService) {
        this.keyholderService    = keyholderService;
        this.confirmationService = confirmationService;
    }

    // ── Keyholder management ─────────────────────────────────────────────────

    public List<KeyholderResponse> list(UUID userId) {
        return keyholderService.listKeyholders(userId);
    }

    public KeyholderResponse add(UUID userId, AddKeyholderRequest request) {
        return keyholderService.addKeyholder(userId, request);
    }

    public void remove(UUID userId, UUID keyholderID) {
        keyholderService.removeKeyholder(userId, keyholderID);
    }

    public void setThreshold(UUID userId, int threshold) {
        keyholderService.setThreshold(userId, threshold);
    }

    // ── Confirmation round ───────────────────────────────────────────────────

    /**
     * Returns the currently PENDING confirmation round for the given user.
     * Keyholders poll this endpoint to discover which round they should vote on.
     */
    public ConfirmationRoundResponse getPendingRound(UUID userId) {
        return confirmationService.getPendingRound(userId);
    }

    /**
     * Records one keyholder vote.
     *
     * @param roundId      the UUID of the confirmation round
     * @param callerWallet the wallet address extracted from the caller's JWT
     */
    public ConfirmationRoundResponse castVote(UUID roundId, String callerWallet) {
        return confirmationService.castVote(roundId, callerWallet);
    }
}