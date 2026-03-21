// service/WillService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public WillService(IntentExtractionService intentExtractionService,
                       VaultTypeRouter vaultTypeRouter,
                       ContractDeploymentService contractDeploymentService,
                       BeneficiaryConfigRepository configRepo,
                       BeneficiaryRepository beneficiaryRepo,
                       ContractRepository contractRepo,
                       CheckInConfigRepository checkInConfigRepo,
                       UserRepository userRepository) {
        this.intentExtractionService = intentExtractionService;
        this.vaultTypeRouter = vaultTypeRouter;
        this.contractDeploymentService = contractDeploymentService;
        this.configRepo = configRepo;
        this.beneficiaryRepo = beneficiaryRepo;
        this.contractRepo = contractRepo;
        this.checkInConfigRepo = checkInConfigRepo;
        this.userRepository = userRepository;
    }

    @Transactional
    public WillResponse submitWill(UUID userId, String willText) {

        // 1. Fetch user to get wallet address (needed as vault owner)
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        String userWalletAddress = user.getWalletAddress();

        // 2. Run LangChain4j intent extraction — returns richer result including timeLockDays
        IntentExtractionResult extraction = intentExtractionService.extract(willText);

        // 3. Hard-stop if the LLM could not resolve all wallet addresses or arithmetic is wrong
        if (!extraction.validationErrors().isEmpty()) {
            throw new IllegalArgumentException(
                "Will could not be processed: " + String.join("; ", extraction.validationErrors())
            );
        }

        // 4. Route extraction result to the correct VaultDeploymentParams subtype.
        //    This is where TIME_LOCKED / CONDITIONAL_SURVIVAL / STANDARD diverge.
        VaultDeploymentParams deploymentParams = vaultTypeRouter.route(extraction);

        // 5. Persist the beneficiary config (raw text + resolved params)
        BeneficiaryConfig config = new BeneficiaryConfig();
        config.setUserId(userId);
        config.setRawIntentText(willText);
        config.setTemplateType(extraction.templateType());
        config.setConfidenceScore(extraction.confidenceScore());
        config.setStatus("DEPLOYING");
        configRepo.save(config);

        // 6. Persist individual beneficiary rows.
        //    The position (0-based) MUST match the order in the on-chain beneficiaries[] array
        //    so GracePeriodWatcherJob can call confirmSurvival(index) on the correct slot.
        List<ResolvedBeneficiary> resolved = extraction.resolvedBeneficiaries();
        for (int i = 0; i < resolved.size(); i++) {
            ResolvedBeneficiary rb = resolved.get(i);
            Beneficiary b = new Beneficiary();
            b.setConfigId(config.getId());
            b.setPosition(i);                      // mirrors on-chain array index
            b.setWalletAddress(rb.walletAddress());
            b.setBasisPoints(rb.basisPoints());
            b.setLabel(rb.name());
            b.setCondition(rb.condition());        // ALWAYS | CONDITIONAL_SURVIVAL
            beneficiaryRepo.save(b);
        }

        // 7. Deploy the correct vault type via DMSFactory — user's wallet is set as vault owner.
        //    ContractDeploymentService dispatches to the right factory method based on params type.
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
            config.setStatus("FAILED");
            configRepo.save(config);
            throw new RuntimeException("Vault deployment failed: " + e.getMessage(), e);
        }

        // 8. Persist contract record.
        //    vault_type → GracePeriodWatcherJob dispatches to the correct trigger path.
        //    beneficiaryConfigId → GracePeriodWatcherJob looks up conditional beneficiary indices.
        Contract contract = new Contract();
        contract.setUserId(userId);
        contract.setBeneficiaryConfigId(config.getId());   // links scheduler to beneficiary positions
        contract.setContractAddress(vaultAddress);
        contract.setDeploymentTxHash(txHash);
        contract.setVaultType(vaultType);
        contract.setStatus("ACTIVE");
        contractRepo.save(contract);

        config.setStatus("DEPLOYED");
        configRepo.save(config);

        // 9. Create the check-in config so the scheduler can start monitoring
        if (checkInConfigRepo.findByUserId(userId).isEmpty()) {
            CheckInConfig checkIn = new CheckInConfig();
            checkIn.setUserId(userId);
            checkIn.setIntervalDays(30);   // default — user can update later
            checkIn.setGracePeriodDays(7);
            checkIn.setLastCheckInAt(Instant.now());
            checkIn.setNextDueAt(Instant.now().plus(30, ChronoUnit.DAYS));
            checkIn.setStatus("ACTIVE");
            checkInConfigRepo.save(checkIn);
        }

        return new WillResponse(
            config.getId(),
            extraction.templateType(),
            resolved,
            vaultAddress,
            txHash
        );
    }
}