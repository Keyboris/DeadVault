// model/ContractSummaryResponse.java
package DeadValut.Main.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Per-vault summary returned by GET /api/contracts.
 *
 * The frontend uses this to render the vault card grid:
 *   - contractAddress  → link to Basescan
 *   - vaultType        → badge (STANDARD / TIME_LOCKED / CONDITIONAL_SURVIVAL)
 *   - status           → badge colour (ACTIVE green / TRIGGERED red / REVOKED grey)
 *   - deployedAt       → "deployed X days ago"
 *   - beneficiaries    → collapsible list of who gets what
 */
public record ContractSummaryResponse(
        UUID                    id,
        String                  contractAddress,
        String                  deploymentTxHash,
        String                  vaultType,
        String                  status,
        Instant                 deployedAt,
        List<BeneficiarySummary> beneficiaries
) {}