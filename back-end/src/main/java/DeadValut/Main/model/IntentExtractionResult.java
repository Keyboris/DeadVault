// model/IntentExtractionResult.java
package DeadValut.Main.model;

import java.util.List;

public record IntentExtractionResult(
        String templateType,
        int    timeLockDays,              // > 0 only when templateType == TIME_LOCKED
        List<ResolvedBeneficiary> resolvedBeneficiaries,
        List<String> pendingResolution,   // names whose walletAddress is still null
        List<String> validationErrors,
        double confidenceScore
) {}    