// model/WillResponse.java
package DeadValut.Main.model;

import java.util.List;
import java.util.UUID;

public record WillResponse(
        UUID configId,
        String templateType,
        List<ResolvedBeneficiary> beneficiaries,
        String contractAddress,
        String deploymentTxHash
) {}