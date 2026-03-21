// service/UpdateWillService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class UpdateWillService {

    private static final String ZERO_TX_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        String userWalletAddress = user.getWalletAddress();

        // 2. Load current contract — must exist
        Contract oldContract = contractRepo.findByUserId(userId)
            .orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "No vault found — use POST /api/will first"
            ));

        // 3. Guard: refuse if vault is already triggered or mid-trigger
        if ("TRIGGERED".equals(oldContract.getStatus())
                || "TRIGGERING".equals(oldContract.getStatus())) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Vault already triggered or mid-trigger — cannot update"
            );
        }

        String oldContractAddress = oldContract.getContractAddress();

        // 4. Extract new intent — fail fast before touching the chain
        IntentExtractionResult extraction = intentExtractionService.extract(newWillText);
        if (!extraction.validationErrors().isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Will could not be processed: " + String.join("; ", extraction.validationErrors())
            );
        }
        VaultDeploymentParams newParams = vaultTypeRouter.route(extraction);

        // 5. Mark old beneficiary config SUPERSEDED
        configRepo.findById(oldContract.getBeneficiaryConfigId())
            .ifPresent(old -> { old.setStatus("SUPERSEDED"); configRepo.save(old); });

        // 6. Persist new beneficiary config
        BeneficiaryConfig newConfig = new BeneficiaryConfig();
        newConfig.setUserId(userId);
        newConfig.setRawIntentText(newWillText);
        newConfig.setTemplateType(extraction.templateType());
        newConfig.setConfidenceScore(extraction.confidenceScore());
        newConfig.setStatus("DEPLOYING");
        configRepo.save(newConfig);

        // 7. Persist new beneficiary rows
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
            newConfig.setStatus("FAILED");
            configRepo.save(newConfig);
            String message = e.getMessage() != null ? e.getMessage() : "Blockchain deployment failed";
            if (message.toLowerCase().contains("vault already exists for this owner")) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Factory rejected replacement vault for this owner. Revoke old vault and retry, or deploy updated factory support.",
                    e
                );
            }
            throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Blockchain deployment failed",
                e
            );
        }

        // 9. Update existing contract row in-place (user_id is unique in contracts table).
        oldContract.setBeneficiaryConfigId(newConfig.getId());
        oldContract.setContractAddress(newVaultAddress);
        oldContract.setDeploymentTxHash(deployTxHash);
        oldContract.setVaultType(vaultType);
        oldContract.setStatus("ACTIVE");
        contractRepo.save(oldContract);

        newConfig.setStatus("DEPLOYED");
        configRepo.save(newConfig);

        return new UpdateWillResponse(
            newConfig.getId(),
            extraction.templateType(),
            resolved,
            oldContractAddress,
            ZERO_TX_HASH,
            newVaultAddress,
            deployTxHash
        );
    }
}