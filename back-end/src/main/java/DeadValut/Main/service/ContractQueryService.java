// service/ContractQueryService.java
package DeadValut.Main.service;

import DeadValut.Main.model.BeneficiarySummary;
import DeadValut.Main.model.ContractSummaryResponse;
import DeadValut.Main.model.Contract;
import DeadValut.Main.repository.BeneficiaryRepository;
import DeadValut.Main.repository.ContractRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.http.HttpService;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

import org.web3j.utils.Convert;

@Service
public class ContractQueryService {

    private final ContractRepository contractRepo;
    private final BeneficiaryRepository beneficiaryRepo;

    @Value("${dms.blockchain.rpc-url}")
    private String rpcUrl;

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
        List<Contract> contracts = contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED");

        try (Web3j web3j = Web3j.build(new HttpService(rpcUrl))) {
            return contracts.stream().map(contract -> mapContractSummary(contract, web3j)).toList();
        } catch (Exception ignored) {
            return contracts.stream().map(contract -> mapContractSummary(contract, null)).toList();
        }
    }

    private ContractSummaryResponse mapContractSummary(Contract contract, Web3j web3j) {
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

        BigInteger ethWei = BigInteger.ZERO;
        if (web3j != null) {
            try {
                ethWei = web3j.ethGetBalance(contract.getContractAddress(), DefaultBlockParameterName.LATEST)
                        .send()
                        .getBalance();
            } catch (Exception ignored) {
                ethWei = BigInteger.ZERO;
            }
        }

        return new ContractSummaryResponse(
                contract.getId(),
                contract.getContractAddress(),
                contract.getDeploymentTxHash(),
                contract.getVaultType(),
                contract.getStatus(),
                contract.getDeployedAt(),
                beneficiaries,
                ethWei.toString(),
                formatEth(ethWei),
                contract.getOwners() != null ? List.of(contract.getOwners().split(",")) : null,
                contract.getThreshold(),
                contract.getInactivitySeconds(),
                contract.getGraceSeconds());
    }



    private String formatEth(BigInteger wei) {
        BigDecimal eth = Convert.fromWei(new BigDecimal(wei), Convert.Unit.ETHER);
        BigDecimal rounded = eth.setScale(6, RoundingMode.DOWN).stripTrailingZeros();
        return rounded.compareTo(BigDecimal.ZERO) == 0 ? "0" : rounded.toPlainString();
    }
}