// model/ResolvedBeneficiary.java
package DeadValut.Main.model;

/**
 * A single beneficiary as resolved by IntentExtractionService.
 *
 * condition values:
 *   "ALWAYS"              — unconditional release (standard and time-lock vaults)
 *   "CONDITIONAL_SURVIVAL"— beneficiary must be confirmed alive before their share is released
 *
 * timeLockDays: only populated when the parent templateType is TIME_LOCKED.
 *   e.g. "release to my kids 6 months after my death" → timeLockDays = 180
 *   ContractDeploymentService converts this to a Unix timestamp at deploy time.
 */
public record ResolvedBeneficiary(
        String name,
        String walletAddress,       // must be non-null by the time the vault is deployed
        int    basisPoints,         // out of 10000
        String condition,           // "ALWAYS" | "CONDITIONAL_SURVIVAL"
        int    timeLockDays         // 0 unless templateType == TIME_LOCKED
) {}