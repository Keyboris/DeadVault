// route/KeyholderRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.KeyholderController;
import DeadValut.Main.model.*;
import DeadValut.Main.service.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST routes for secondary-keyholder management and the confirmation-vote flow.
 *
 * <h2>Keyholder management (owner only)</h2>
 * <pre>
 * GET    /api/keyholders                          list registered keyholders
 * POST   /api/keyholders                          add a keyholder
 * DELETE /api/keyholders/{id}                     remove a keyholder
 * PUT    /api/keyholders/threshold                set approval threshold
 * </pre>
 *
 * <h2>Confirmation-vote flow (any registered keyholder)</h2>
 * <pre>
 * GET    /api/keyholders/confirmation-round?userId={uuid}
 *                                                 fetch the PENDING round for a vault owner
 * POST   /api/keyholders/confirm?roundId={uuid}   cast an approval vote
 * </pre>
 *
 * <p>All endpoints require a valid JWT. The /confirm and /confirmation-round
 * endpoints are also accessible to keyholders (not just the vault owner),
 * so they are listed separately in {@link DeadValut.Main.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/keyholders")
public class KeyholderRoute {

    private final KeyholderController keyholderController;
    private final JwtService          jwtService;

    public KeyholderRoute(KeyholderController keyholderController,
                          JwtService jwtService) {
        this.keyholderController = keyholderController;
        this.jwtService          = jwtService;
    }

    // ── Keyholder management (vault owner) ───────────────────────────────────

    /**
     * Returns all secondary keyholders registered by the authenticated user.
     */
    @GetMapping
    public ResponseEntity<List<KeyholderResponse>> listKeyholders(
            @AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(keyholderController.list(userId));
    }

    /**
     * Adds a new secondary keyholder.
     * <p>Max 10 keyholders per user. Duplicate wallet addresses are rejected.</p>
     */
    @PostMapping
    public ResponseEntity<KeyholderResponse> addKeyholder(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody AddKeyholderRequest request) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(keyholderController.add(userId, request));
    }

    /**
     * Removes a secondary keyholder.
     * <p>If removal would make the stored threshold impossible (threshold > remaining
     * count), the threshold is automatically reduced by {@link DeadValut.Main.service.KeyholderService}.</p>
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> removeKeyholder(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        keyholderController.remove(userId, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Sets the number of keyholder approvals required before the vault is triggered.
     * <ul>
     *   <li>0 — disables the feature (trigger fires immediately as before)</li>
     *   <li>N — N votes required; must not exceed the current keyholder count</li>
     * </ul>
     */
    @PutMapping("/threshold")
    public ResponseEntity<Void> setThreshold(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody SetThresholdRequest request) {
        keyholderController.setThreshold(userId, request.threshold());
        return ResponseEntity.noContent().build();
    }

    // ── Confirmation-vote flow ────────────────────────────────────────────────

    /**
     * Returns the currently PENDING confirmation round for a vault owner.
     * Keyholders use this to discover the {@code roundId} they need to vote on.
     *
     * @param userId the UUID of the vault owner (NOT the calling keyholder)
     */
    @GetMapping("/confirmation-round")
    public ResponseEntity<ConfirmationRoundResponse> getPendingRound(
            @RequestParam UUID userId) {
        return ResponseEntity.ok(keyholderController.getPendingRound(userId));
    }

    /**
     * Casts one approval vote in the specified round.
     * The caller must be a registered keyholder for the round's vault owner.
     * If the threshold is met after this vote the vault is triggered immediately
     * and the round status changes to APPROVED.
     *
     * @param roundId         the confirmation round UUID
     * @param authorization   raw {@code Authorization: Bearer <token>} header —
     *                        used to extract the calling wallet for verification
     */
    @PostMapping("/confirm")
    public ResponseEntity<ConfirmationRoundResponse> confirm(
            @RequestParam UUID roundId,
            @RequestHeader("Authorization") String authorization) {
        String token       = authorization.substring(7); // strip "Bearer "
        String callerWallet = jwtService.extractWalletAddress(token);
        return ResponseEntity.ok(keyholderController.castVote(roundId, callerWallet));
    }
}