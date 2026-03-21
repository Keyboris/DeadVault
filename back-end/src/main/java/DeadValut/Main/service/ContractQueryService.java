// service/ContractQueryService.java
package DeadValut.Main.service;

import DeadValut.Main.model.BeneficiarySummary;
import DeadValut.Main.model.ContractSummaryResponse;
import DeadValut.Main.repository.BeneficiaryRepository;
import DeadValut.Main.repository.ContractRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class ContractQueryService {

    private final ContractRepository contractRepo;
    private final BeneficiaryRepository beneficiaryRepo;

    public ContractQueryService(ContractRepository contractRepo,
                                BeneficiaryRepository beneficiaryRepo) {
        this.contractRepo    = contractRepo;
        this.beneficiaryRepo = beneficiaryRepo;
    }

    /**
     * Returns all non-revoked vaults for the given user, each enriched with its
     * beneficiary list ordered by on-chain position.
     *
     * "Non-revoked" means status IN (ACTIVE, TRIGGERING, TRIGGERED) so the frontend
     * can show both the live vault and any already-triggered history.
     */
    public List<ContractSummaryResponse> getContracts(UUID userId) {
        return contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED")
                .stream()
                .map(contract -> {
                    List<BeneficiarySummary> beneficiaries = List.of();

                    if (contract.getBeneficiaryConfigId() != null) {
                        beneficiaries = beneficiaryRepo
                                .findByConfigIdOrderByPosition(contract.getBeneficiaryConfigId())
                                .stream()
                                .map(b -> new BeneficiarySummary(
                                        b.getLabel(),
                                        b.getWalletAddress(),
                                        b.getBasisPoints(),
                                        b.getCondition()))
                                .toList();
                    }

                    return new ContractSummaryResponse(
                            contract.getId(),
                            contract.getContractAddress(),
                            contract.getDeploymentTxHash(),
                            contract.getVaultType(),
                            contract.getStatus(),
                            contract.getDeployedAt(),
                            beneficiaries);
                })
                .toList();
    }
}