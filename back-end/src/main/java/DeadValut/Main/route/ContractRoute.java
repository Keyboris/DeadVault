// route/ContractRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.ContractQueryController;
import DeadValut.Main.model.ContractSummaryResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * GET /api/contracts
 *
 * Returns every non-revoked vault for the authenticated user, including the
 * beneficiary list for each vault. The frontend uses this to render the vault card
 * grid and to know which contract address to direct the user to fund on Basescan.
 *
 * Response example:
 * [
 *   {
 *     "id": "...",
 *     "contractAddress": "0xABC...",
 *     "deploymentTxHash": "0xDEF...",
 *     "vaultType": "STANDARD",
 *     "status": "ACTIVE",
 *     "deployedAt": "2025-01-01T12:00:00Z",
 *     "beneficiaries": [
 *       { "label": "Alice", "walletAddress": "0x111...", "basisPoints": 6000, "condition": "ALWAYS" },
 *       { "label": "Bob",   "walletAddress": "0x222...", "basisPoints": 4000, "condition": "ALWAYS" }
 *     ]
 *   }
 * ]
 *
 * An empty array means no will has been submitted yet — frontend should show the
 * "Write your will" onboarding prompt.
 */
@RestController
@RequestMapping("/api/contracts")
public class ContractRoute {

    private final ContractQueryController contractQueryController;

    public ContractRoute(ContractQueryController contractQueryController) {
        this.contractQueryController = contractQueryController;
    }

    @GetMapping
    public ResponseEntity<List<ContractSummaryResponse>> getContracts(
            @AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(contractQueryController.getContracts(userId));
    }
}