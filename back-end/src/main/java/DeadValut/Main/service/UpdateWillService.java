// service/UpdateWillService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

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
    private final TransactionTemplate tx;

    public UpdateWillService(IntentExtractionService intentExtractionService,
                             VaultTypeRouter vaultTypeRouter,
                             ContractDeploymentService contractDeploymentService,
                             BeneficiaryConfigRepository configRepo,
                             BeneficiaryRepository beneficiaryRepo,
                             ContractRepository contractRepo,
                             UserRepository userRepository,
                             TransactionTemplate tx) {
        this.intentExtractionService = intentExtractionService;
        this.vaultTypeRouter         = vaultTypeRouter;
        this.contractDeploymentService = contractDeploymentService;
        this.configRepo              = configRepo;
        this.beneficiaryRepo         = beneficiaryRepo;
        this.contractRepo            = contractRepo;
        this.userRepository          = userRepository;
        this.tx                      = tx;
    }

    public UpdateWillResponse updateWill(UUID userId, String newWillText) {

        // 1. Load user wallet
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        String userWalletAddress = user.getWalletAddress();

        // 2. Load current contract — must exist
        Contract oldContract = contractRepo.findByUserId(userId)
            .orElseThrow(() -> new IllegalStateException(
                "No vault found — submit a will first (POST /api/will)"));

        // 3. Guard: refuse if vault is already triggered, mid-trigger, or revoked
        if ("TRIGGERED".equals(oldContract.getStatus())
                || "TRIGGERING".equals(oldContract.getStatus())
                || "REVOKED".equals(oldContract.getStatus())) {
            throw new IllegalStateException(
                "Vault status is " + oldContract.getStatus() + " — will cannot be updated");
        }

        String oldContractAddress = oldContract.getContractAddress();

        // 4. Extract new intent — fail fast before touching the chain
        IntentExtractionResult extraction = intentExtractionService.extract(newWillText);
        if (!extraction.validationErrors().isEmpty()) {
            throw new IllegalArgumentException(
                "Will could not be processed: " + String.join("; ", extraction.validationErrors()));
        }
        VaultDeploymentParams newParams = vaultTypeRouter.route(extraction);

        // 5. Revoke the old vault on-chain (irreversible)
        String revokeTxHash;
        try {
            revokeTxHash = contractDeploymentService.revokeVault(oldContractAddress);
            log.info("Old vault {} revoked — tx: {}", oldContractAddress, revokeTxHash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to revoke old vault: " + e.getMessage(), e);
        }

        // 6. Mark old contract REVOKED + old config SUPERSEDED (committed immediately
        //    so DB reflects the on-chain state even if later steps fail)
        tx.executeWithoutResult(status -> {
            oldContract.setStatus("REVOKED");
            contractRepo.save(oldContract);
            configRepo.findById(oldContract.getBeneficiaryConfigId())
                .ifPresent(old -> { old.setStatus("SUPERSEDED"); configRepo.save(old); });
        });

        // 7. Persist new beneficiary config + rows
        List<ResolvedBeneficiary> resolved = extraction.resolvedBeneficiaries();
        BeneficiaryConfig newConfig = tx.execute(status -> {
            BeneficiaryConfig c = new BeneficiaryConfig();
            c.setUserId(userId);
            c.setRawIntentText(newWillText);
            c.setTemplateType(extraction.templateType());
            c.setConfidenceScore(extraction.confidenceScore());
            c.setStatus("DEPLOYING");
            configRepo.save(c);

            for (int i = 0; i < resolved.size(); i++) {
                ResolvedBeneficiary rb = resolved.get(i);
                Beneficiary b = new Beneficiary();
                b.setConfigId(c.getId());
                b.setPosition(i);
                b.setWalletAddress(rb.walletAddress());
                b.setBasisPoints(rb.basisPoints());
                b.setLabel(rb.name());
                b.setCondition(rb.condition());
                beneficiaryRepo.save(b);
            }
            return c;
        });

        // 8. Deploy new vault
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
            tx.executeWithoutResult(status -> {
                newConfig.setStatus("FAILED");
                configRepo.save(newConfig);
            });
            throw new RuntimeException("New vault deployment failed: " + e.getMessage(), e);
        }

        // 9. Update existing contract record (user_id has UNIQUE constraint)
        tx.executeWithoutResult(status -> {
            oldContract.setBeneficiaryConfigId(newConfig.getId());
            oldContract.setContractAddress(newVaultAddress);
            oldContract.setDeploymentTxHash(deployTxHash);
            oldContract.setVaultType(vaultType);
            oldContract.setStatus("ACTIVE");
            contractRepo.save(oldContract);

            newConfig.setStatus("DEPLOYED");
            configRepo.save(newConfig);
        });

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
