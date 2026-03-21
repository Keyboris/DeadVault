// scheduler/GracePeriodWatcherJob.java
package DeadValut.Main.scheduler;

import DeadValut.Main.model.Contract;
import DeadValut.Main.model.SwitchEvent;
import DeadValut.Main.repository.*;
import DeadValut.Main.service.ContractDeploymentService;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Component
public class GracePeriodWatcherJob implements Job {

    private static final Logger log = LoggerFactory.getLogger(GracePeriodWatcherJob.class);

    private final CheckInConfigRepository configRepo;
    private final ContractRepository contractRepo;
    private final BeneficiaryRepository beneficiaryRepo;
    private final ContractDeploymentService deploymentService;
    private final SwitchEventRepository eventRepo;

    public GracePeriodWatcherJob(CheckInConfigRepository configRepo,
                                  ContractRepository contractRepo,
                                  BeneficiaryRepository beneficiaryRepo,
                                  ContractDeploymentService deploymentService,
                                  SwitchEventRepository eventRepo) {
        this.configRepo = configRepo;
        this.contractRepo = contractRepo;
        this.beneficiaryRepo = beneficiaryRepo;
        this.deploymentService = deploymentService;
        this.eventRepo = eventRepo;
    }

    @Override
    public void execute(JobExecutionContext context) {
        configRepo.findExpiredGracePeriods(Instant.now()).forEach(config -> {
            var userId = config.getUserId();

            // Optimistic lock — prevents duplicate trigger if job fires twice on restart
            int locked = contractRepo.setStatusIfActive(userId);
            if (locked == 0) {
                log.warn("Skipping user {} — already triggering or triggered", userId);
                return;
            }

            try {
                Contract contract = contractRepo.findByUserId(userId).orElseThrow();
                String txHash = dispatch(contract);

                contractRepo.setTriggered(userId, txHash, Instant.now());
                config.setStatus("TRIGGERED");
                configRepo.save(config);
                eventRepo.save(SwitchEvent.of(userId, "TRIGGERED",
                    Map.of("txHash", txHash, "vaultType", contract.getVaultType())));
                log.info("Vault triggered for user {} (type={}) — tx: {}",
                    userId, contract.getVaultType(), txHash);

            } catch (Exception e) {
                // For TIME_LOCKED vaults the trigger() call will revert if the time-lock
                // has not yet elapsed. The exception rolls the status back to ACTIVE so the
                // job retries on the next 15-minute cycle without any manual intervention.
                log.error("Trigger attempt for user {} (type={}) failed: {} — will retry",
                    userId, contractRepo.findByUserId(userId)
                        .map(Contract::getVaultType).orElse("UNKNOWN"),
                    e.getMessage());
                contractRepo.setStatusIfTriggering(userId, "ACTIVE");
            }
        });
    }

    /**
     * Dispatches to the correct trigger path based on the vault type stored in the DB.
     * This is the only place in the scheduler that knows about vault types — all contract
     * interaction logic stays in ContractDeploymentService.
     */
    private String dispatch(Contract contract) throws Exception {
        return switch (contract.getVaultType()) {

            case "STANDARD", "TIME_LOCKED" ->
                // TIME_LOCKED: trigger() will revert on-chain if unlockTime has not passed.
                // The exception propagates up, rolls status back to ACTIVE, and retries next cycle.
                deploymentService.triggerVault(contract.getContractAddress());

            case "CONDITIONAL_SURVIVAL" -> {
                // Retrieve the indices of beneficiaries that require survival confirmation.
                // These are stored in the beneficiaries table with condition = CONDITIONAL_SURVIVAL.
                List<Integer> conditionalIndexes = beneficiaryRepo
                    .findByConfigIdOrderByIndex(contract.getBeneficiaryConfigId())
                    .stream()
                    .filter(b -> "CONDITIONAL_SURVIVAL".equals(b.getCondition()))
                    .map(b -> b.getIndex())    // 0-based position in the original beneficiary list
                    .toList();

                yield deploymentService.triggerConditionalVault(
                    contract.getContractAddress(), conditionalIndexes);
            }

            default -> throw new IllegalStateException(
                "Unknown vault type: " + contract.getVaultType());
        };
    }
}