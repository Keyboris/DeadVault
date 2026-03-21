// model/BeneficiarySummary.java
package DeadValut.Main.model;

/**
 * Read-only projection of a single beneficiary row.
 * Returned as part of ContractSummaryResponse — the frontend uses this to render
 * the "who gets what" list beneath each vault card.
 */
public record BeneficiarySummary(
        String label,           // human-readable name extracted by LangChain4j
        String walletAddress,   // 0x... on-chain address
        int    basisPoints,     // out of 10 000 — divide by 100 for percentage
        String condition        // "ALWAYS" | "CONDITIONAL_SURVIVAL"
) {}