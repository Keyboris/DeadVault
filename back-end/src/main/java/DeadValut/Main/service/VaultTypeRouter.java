// service/VaultTypeRouter.java
package DeadValut.Main.service;

import DeadValut.Main.model.IntentExtractionResult;
import DeadValut.Main.model.ResolvedBeneficiary;
import DeadValut.Main.model.VaultDeploymentParams;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class VaultTypeRouter {

    /**
     * Converts an {@link IntentExtractionResult} into the correct {@link VaultDeploymentParams}
     * subtype. The sealed interface ensures the compiler will flag any unhandled new types.
     *
     * @throws IllegalArgumentException if templateType is unrecognised or required fields are absent
     */
    public VaultDeploymentParams route(IntentExtractionResult extraction) {
        List<ResolvedBeneficiary> beneficiaries = extraction.resolvedBeneficiaries();
        List<String>  wallets     = beneficiaries.stream().map(ResolvedBeneficiary::walletAddress).toList();
        List<Integer> basisPoints = beneficiaries.stream().map(ResolvedBeneficiary::basisPoints).toList();

        return switch (extraction.templateType()) {

            case "EQUAL_SPLIT", "PERCENTAGE_SPLIT" ->
                new VaultDeploymentParams.Standard(wallets, basisPoints);

            case "TIME_LOCKED" -> {
                int days = extraction.timeLockDays();
                if (days <= 0) throw new IllegalArgumentException(
                    "TIME_LOCKED vault requires timeLockDays > 0, got: " + days);
                yield new VaultDeploymentParams.TimeLocked(wallets, basisPoints, days);
            }

            case "CONDITIONAL_SURVIVAL" -> {
                List<Boolean> mustSurvive = beneficiaries.stream()
                    .map(b -> "CONDITIONAL_SURVIVAL".equals(b.condition()))
                    .toList();
                yield new VaultDeploymentParams.Conditional(wallets, basisPoints, mustSurvive);
            }

            case "MULTISIG_DEADMAN" -> {
                int threshold = extraction.threshold() > 0 ? extraction.threshold() : 1;
                int inactivity = extraction.inactivitySeconds() > 0 ? extraction.inactivitySeconds() : 2592000;
                int grace = extraction.graceSeconds() > 0 ? extraction.graceSeconds() : 604800;
                List<String> owners = extraction.owners() != null && !extraction.owners().isEmpty() 
                    ? extraction.owners() 
                    : List.of(extraction.resolvedBeneficiaries().get(0).walletAddress());
                yield new VaultDeploymentParams.Multisig(owners, threshold, inactivity, grace, wallets, basisPoints);
            }

            default -> throw new IllegalArgumentException(
                "Unrecognised templateType: " + extraction.templateType());

        };
    }
}