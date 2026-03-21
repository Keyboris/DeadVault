// service/UpdateWillService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class UpdateWillService {

    private static final Logger log = LoggerFactory.getLogger(UpdateWillService.class);

    private final IntentExtractionService intentExtractionService;
    private final VaultTypeRouter vaultTypeRouter;
    private final ContractDeploymentService contractDeploymentService;
    private final BeneficiaryConfigRepository configRepo;
    private final BeneficiaryRepository beneficiaryRepo;
    private final ContractRepository contractRepo;
    private final UserRepository userRepository;

    public UpdateWillService(IntentExtractionService intentExtractionService,
                             VaultTypeRouter vaultTypeRouter,
                             ContractDeploymentService contractDeploymentService,
                             BeneficiaryConfigRepository configRepo,
                             BeneficiaryRepository beneficiaryRepo,
                             ContractRepository contractRepo,
                             UserRepository userRepository) {
        this.intentExtractionService = intentExtractionService;
        this.vaultTypeRouter         = vaultTypeRouter;
        this.contractDeploymentService = contractDeploymentService;
        this.configRepo              = configRepo;
        this.beneficiaryRepo         = beneficiaryRepo;
        this.contractRepo            = contractRepo;
        this.userRepository          = userRepository;
    }

    @Transactional
    public UpdateWillResponse updateWill(UUID userId, String newWillText) {

        // 1. Load user wallet
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        String userWalletAddress = user.getWalletAddress();

        // 2. Load current contract — must exist
        Contract oldContract = contractRepo.findByUserId(userId)
            .orElseThrow(() -> new IllegalStateException(
                "No vault found — submit a will first (POST /api/will)"));

        // 3. Guard: refuse if vault is already triggered or mid-trigger
        if ("TRIGGERED".equals(oldContract.getStatus())
                || "TRIGGERING".equals(oldContract.getStatus())) {
            throw new IllegalStateException(
                "Vault has already been triggered — will cannot be updated");
        }

        String oldContractAddress = oldContract.getContractAddress();

        // 4. Extract new intent — fail fast before touching the chain
        IntentExtractionResult extraction = intentExtractionService.extract(newWillText);
        if (!extraction.validationErrors().isEmpty()) {
            throw new IllegalArgumentException(
                "Will could not be processed: " + String.join("; ", extraction.validationErrors()));
        }
        VaultDeploymentParams newParams = vaultTypeRouter.route(extraction);

        // 5. Revoke the old vault on-chain.
        //    revoke() sends all ETH back to the vault owner (the user's wallet).
        //    This will throw if the vault has already been triggered — caught and rethrown below.
        String revokeTxHash;
        try {
            revokeTxHash = contractDeploymentService.revokeVault(oldContractAddress);
            log.info("Old vault {} revoked — tx: {}", oldContractAddress, revokeTxHash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to revoke old vault: " + e.getMessage(), e);
        }

        // 6. Mark old contract record REVOKED
        oldContract.setStatus("REVOKED");
        contractRepo.save(oldContract);

        // 7. Mark old beneficiary config SUPERSEDED
        configRepo.findById(oldContract.getBeneficiaryConfigId())
            .ifPresent(old -> { old.setStatus("SUPERSEDED"); configRepo.save(old); });

        // 8. Persist new beneficiary config
        BeneficiaryConfig newConfig = new BeneficiaryConfig();
        newConfig.setUserId(userId);
        newConfig.setRawIntentText(newWillText);
        newConfig.setTemplateType(extraction.templateType());
        newConfig.setConfidenceScore(extraction.confidenceScore());
        newConfig.setStatus("DEPLOYING");
        configRepo.save(newConfig);

        // 9. Persist new beneficiary rows
        List<ResolvedBeneficiary> resolved = extraction.resolvedBeneficiaries();
        for (int i = 0; i < resolved.size(); i++) {
            ResolvedBeneficiary rb = resolved.get(i);
            Beneficiary b = new Beneficiary();
            b.setConfigId(newConfig.getId());
            b.setPosition(i);
            b.setWalletAddress(rb.walletAddress());
            b.setBasisPoints(rb.basisPoints());
            b.setLabel(rb.name());
            b.setCondition(rb.condition());
            beneficiaryRepo.save(b);
        }

        // 10. Deploy new vault
        String newVaultAddress;
        String deployTxHash;
        String vaultType;
        try {
            ContractDeploymentService.DeployResult result =
                contractDeploymentService.deployVault(userWalletAddress, newParams);
            newVaultAddress = result.contractAddress();
            deployTxHash    = result.txHash();
            vaultType       = result.vaultType();
        } catch (Exception e) {
            newConfig.setStatus("FAILED");
            configRepo.save(newConfig);
            throw new RuntimeException("New vault deployment failed: " + e.getMessage(), e);
        }

        // 11. Persist new contract record — links to new beneficiary config
        Contract newContract = new Contract();
        newContract.setUserId(userId);
        newContract.setBeneficiaryConfigId(newConfig.getId());
        newContract.setContractAddress(newVaultAddress);
        newContract.setDeploymentTxHash(deployTxHash);
        newContract.setVaultType(vaultType);
        newContract.setStatus("ACTIVE");
        contractRepo.save(newContract);

        newConfig.setStatus("DEPLOYED");
        configRepo.save(newConfig);

        log.info("Will updated for user {} — new vault: {}", userId, newVaultAddress);

        return new UpdateWillResponse(
            newConfig.getId(),
            extraction.templateType(),
            resolved,
            oldContractAddress,
            revokeTxHash,
            newVaultAddress,
            deployTxHash
        );
    }
}