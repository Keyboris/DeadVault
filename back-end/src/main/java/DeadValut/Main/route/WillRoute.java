// route/WillRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.WillController;
import DeadValut.Main.model.UpdateWillResponse;
import DeadValut.Main.model.WillRequest;
import DeadValut.Main.model.WillResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/will")
public class WillRoute {

    private final WillController willController;

    public WillRoute(WillController willController) {
        this.willController = willController;
    }

    /**
     * POST /api/will
     *
     * Accepts a plain-English will from the frontend (already packaged as JSON by the client).
     * Runs the full pipeline: LangChain4j intent extraction → DMSVault deployment on Base.
     * Returns the deployed vault address and extracted beneficiary list.
     *
     * Request body:
     * {
     *   "willText": "Give 70% to my wife Alice (0xABC...) and 30% to my son Jack (0xDEF...)"
     * }
     */
    @PostMapping
    public ResponseEntity<WillResponse> submitWill(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody WillRequest request) {
        return ResponseEntity.ok(willController.submitWill(userId, request));
    }

    /**
     * PUT /api/will
     *
     * BUG-4 FIX: UpdateWillService was fully implemented but no route mapping existed,
     * making the feature unreachable over HTTP.
     *
     * Accepts a revised plain-English will. The pipeline:
     *   1. Extracts intent from the new will text via LangChain4j.
     *   2. Calls revoke() on the user's current ACTIVE vault on-chain — ETH is returned
     *      to the user's wallet automatically by the contract.
     *   3. Deploys a fresh vault of the appropriate type with the new beneficiary list.
     *
     * Returns both the old (now revoked) and new vault addresses. The user must send
     * ETH to the new address to re-fund the vault.
     *
     * Errors:
     *   409 Conflict — vault is already TRIGGERED or TRIGGERING; update not allowed.
     *   400 Bad Request — LangChain4j could not resolve all wallet addresses or the
     *                     arithmetic failed validation.
     *   500 — on-chain revoke or deploy transaction failed.
     *
     * Request body (same shape as POST):
     * {
     *   "willText": "Give everything equally to my three children (0xAAA...) (0xBBB...) (0xCCC...)"
     * }
     */
    @PutMapping
    public ResponseEntity<UpdateWillResponse> updateWill(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody WillRequest request) {
        return ResponseEntity.ok(willController.updateWill(userId, request));
    }
}