// service/WillService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class WillService {

    private final IntentExtractionService intentExtractionService;
    private final VaultTypeRouter vaultTypeRouter;
    private final ContractDeploymentService contractDeploymentService;
    private final BeneficiaryConfigRepository configRepo;
    private final BeneficiaryRepository beneficiaryRepo;
    private final ContractRepository contractRepo;
    private final CheckInConfigRepository checkInConfigRepo;
    private final UserRepository userRepository;
    private final TransactionTemplate tx;

    public WillService(IntentExtractionService intentExtractionService,
                       VaultTypeRouter vaultTypeRouter,
                       ContractDeploymentService contractDeploymentService,
                       BeneficiaryConfigRepository configRepo,
                       BeneficiaryRepository beneficiaryRepo,
                       ContractRepository contractRepo,
                       CheckInConfigRepository checkInConfigRepo,
                       UserRepository userRepository,
                       TransactionTemplate tx) {
        this.intentExtractionService = intentExtractionService;
        this.vaultTypeRouter = vaultTypeRouter;
        this.contractDeploymentService = contractDeploymentService;
        this.configRepo = configRepo;
        this.beneficiaryRepo = beneficiaryRepo;
        this.contractRepo = contractRepo;
        this.checkInConfigRepo = checkInConfigRepo;
        this.userRepository = userRepository;
        this.tx = tx;
    }

    public WillResponse submitWill(UUID userId, String willText) {

        // 1. Fetch user to get wallet address (needed as vault owner)
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        String userWalletAddress = user.getWalletAddress();

        // 2. Run LangChain4j intent extraction
        IntentExtractionResult extraction = intentExtractionService.extract(willText);

        // 3. Hard-stop if the LLM could not resolve all wallet addresses or arithmetic is wrong
        if (!extraction.validationErrors().isEmpty()) {
            throw new IllegalArgumentException(
                "Will could not be processed: " + String.join("; ", extraction.validationErrors())
            );
        }

        // 4. Route extraction result to the correct VaultDeploymentParams subtype
        VaultDeploymentParams deploymentParams = vaultTypeRouter.route(extraction);
        List<ResolvedBeneficiary> resolved = extraction.resolvedBeneficiaries();

        // 5. Persist config + beneficiaries (committed immediately in its own transaction)
        BeneficiaryConfig config = tx.execute(status -> {
            BeneficiaryConfig c = new BeneficiaryConfig();
            c.setUserId(userId);
            c.setRawIntentText(willText);
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

        // 6. Deploy vault on-chain (NOT inside a DB transaction)
        String vaultAddress;
        String txHash;
        String vaultType;
        try {
            ContractDeploymentService.DeployResult result =
                contractDeploymentService.deployVault(userWalletAddress, deploymentParams);
            vaultAddress = result.contractAddress();
            txHash       = result.txHash();
            vaultType    = result.vaultType();
        } catch (Exception e) {
            // Mark config FAILED in a separate transaction that won't be rolled back
            tx.executeWithoutResult(status -> {
                configRepo.findById(config.getId()).ifPresent(c -> {
                    c.setStatus("FAILED");
                    configRepo.save(c);
                });
            });
            throw new RuntimeException("Vault deployment failed: " + e.getMessage(), e);
        }

        // 7. Persist contract record + finalize config (committed in its own transaction)
        tx.executeWithoutResult(status -> {
            Contract contract = new Contract();
            contract.setUserId(userId);
            contract.setBeneficiaryConfigId(config.getId());
            contract.setContractAddress(vaultAddress);
            contract.setDeploymentTxHash(txHash);
            contract.setVaultType(vaultType);
            contract.setStatus("ACTIVE");
            contractRepo.save(contract);

            config.setStatus("DEPLOYED");
            configRepo.save(config);

            if (checkInConfigRepo.findByUserId(userId).isEmpty()) {
                CheckInConfig checkIn = new CheckInConfig();
                checkIn.setUserId(userId);
                checkIn.setIntervalDays(30);
                checkIn.setGracePeriodDays(7);
                checkIn.setLastCheckInAt(Instant.now());
                checkIn.setNextDueAt(Instant.now().plus(30, ChronoUnit.DAYS));
                checkIn.setStatus("ACTIVE");
                checkInConfigRepo.save(checkIn);
            }
        });

        return new WillResponse(
            config.getId(),
            extraction.templateType(),
            resolved,
            vaultAddress,
            txHash
        );
    }
}
