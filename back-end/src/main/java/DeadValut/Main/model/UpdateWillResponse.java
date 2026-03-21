// model/UpdateWillResponse.java
package DeadValut.Main.model;

import java.util.List;
import java.util.UUID;

/**
 * Returned by PUT /api/will after a successful will update.
 *
 * @param newConfigId          UUID of the new beneficiary config row.
 * @param templateType         Vault type of the newly deployed contract.
 * @param beneficiaries        Resolved beneficiary list from the updated will text.
 * @param oldContractAddress   The revoked vault (for display/Basescan link).
 * @param revokeTxHash         Hash of the revoke() transaction on the old vault.
 * @param newContractAddress   The newly deployed vault — user must re-fund this address.
 * @param deploymentTxHash     Hash of the new vault deployment transaction.
 */
public record UpdateWillResponse(
        UUID               newConfigId,
        String             templateType,
        List<ResolvedBeneficiary> beneficiaries,
        String             oldContractAddress,
        String             revokeTxHash,
        String             newContractAddress,
        String             deploymentTxHash
) {}