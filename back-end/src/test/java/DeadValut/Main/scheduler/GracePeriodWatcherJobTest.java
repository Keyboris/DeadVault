package DeadValut.Main.scheduler;

import DeadValut.Main.model.CheckInConfig;
import DeadValut.Main.model.Contract;
import DeadValut.Main.model.SwitchEvent;
import DeadValut.Main.repository.*;
import DeadValut.Main.service.ContractDeploymentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GracePeriodWatcherJobTest {

    private CheckInConfigRepository  configRepo;
    private ContractRepository       contractRepo;
    private BeneficiaryRepository    beneficiaryRepo;
    private ContractDeploymentService deploymentService;
    private SwitchEventRepository    eventRepo;
    private GracePeriodWatcherJob    job;

    @BeforeEach
    void setUp() {
        configRepo        = mock(CheckInConfigRepository.class);
        contractRepo      = mock(ContractRepository.class);
        beneficiaryRepo   = mock(BeneficiaryRepository.class);
        deploymentService = mock(ContractDeploymentService.class);
        eventRepo         = mock(SwitchEventRepository.class);
        job = new GracePeriodWatcherJob(
                configRepo, contractRepo, beneficiaryRepo, deploymentService, eventRepo);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private CheckInConfig graceConfig(UUID userId) {
        CheckInConfig c = new CheckInConfig();
        c.setUserId(userId);
        c.setIntervalDays(30);
        c.setGracePeriodDays(7);
        c.setStatus("GRACE");
        c.setGraceExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));
        return c;
    }

    private Contract activeContract(UUID userId, String vaultType) {
        Contract c = new Contract();
        c.setUserId(userId);
        c.setContractAddress("0xVault");
        c.setVaultType(vaultType);
        c.setStatus("ACTIVE");
        return c;
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    void execute_triggersStandardVault() throws Exception {
        UUID userId = UUID.randomUUID();
        CheckInConfig config = graceConfig(userId);
        Contract contract = activeContract(userId, "STANDARD");

        when(configRepo.findExpiredGracePeriods(any())).thenReturn(List.of(config));
        when(contractRepo.setStatusIfActive(userId)).thenReturn(1);
        // Fix: use findByUserIdAndStatus instead of the removed findByUserId
        when(contractRepo.findByUserIdAndStatus(userId, "TRIGGERING"))
                .thenReturn(Optional.of(contract));
        when(deploymentService.triggerVault("0xVault")).thenReturn("0xTxHash");

        job.execute(null);

        verify(deploymentService).triggerVault("0xVault");
        // The 3-arg default method delegates to the 2-arg @Query method; Mockito records the 2-arg call
        verify(contractRepo).setTriggered(eq(userId), any(Instant.class));
        assertEquals("TRIGGERED", config.getStatus());

        ArgumentCaptor<SwitchEvent> eventCaptor = ArgumentCaptor.forClass(SwitchEvent.class);
        verify(eventRepo).save(eventCaptor.capture());
        assertEquals(SwitchEvent.EventType.TRIGGERED, eventCaptor.getValue().getEventType());
    }

    @Test
    void execute_skipsWhenNoActiveLock() throws Exception {
        UUID userId = UUID.randomUUID();
        CheckInConfig config = graceConfig(userId);

        when(configRepo.findExpiredGracePeriods(any())).thenReturn(List.of(config));
        // setStatusIfActive returns 0 → vault already triggering or triggered
        when(contractRepo.setStatusIfActive(userId)).thenReturn(0);

        job.execute(null);

        // Fix: should never reach findByUserIdAndStatus when lock returns 0
        verify(contractRepo, never()).findByUserIdAndStatus(any(), any());
        verify(deploymentService, never()).triggerVault(any());
        verify(eventRepo, never()).save(any());
    }

    @Test
    void execute_rollsBackStatusOnDeploymentFailure() throws Exception {
        UUID userId = UUID.randomUUID();
        CheckInConfig config = graceConfig(userId);
        Contract contract = activeContract(userId, "STANDARD");

        when(configRepo.findExpiredGracePeriods(any())).thenReturn(List.of(config));
        when(contractRepo.setStatusIfActive(userId)).thenReturn(1);
        // Fix: use findByUserIdAndStatus instead of the removed findByUserId
        when(contractRepo.findByUserIdAndStatus(userId, "TRIGGERING"))
                .thenReturn(Optional.of(contract));
        when(deploymentService.triggerVault("0xVault"))
                .thenThrow(new RuntimeException("RPC timeout"));

        job.execute(null);

        verify(contractRepo).setStatusIfTriggering(userId, "ACTIVE");
        verify(contractRepo, never()).setTriggered(any(), any(), any());
        assertNotEquals("TRIGGERED", config.getStatus());
    }

    @Test
    void execute_triggersTimeLockVault_retriesWhenNotYetUnlocked() throws Exception {
        UUID userId = UUID.randomUUID();
        CheckInConfig config = graceConfig(userId);
        Contract contract = activeContract(userId, "TIME_LOCKED");

        when(configRepo.findExpiredGracePeriods(any())).thenReturn(List.of(config));
        when(contractRepo.setStatusIfActive(userId)).thenReturn(1);
        // Fix: use findByUserIdAndStatus instead of the removed findByUserId
        when(contractRepo.findByUserIdAndStatus(userId, "TRIGGERING"))
                .thenReturn(Optional.of(contract));
        // Simulate on-chain revert because time-lock has not elapsed
        when(deploymentService.triggerVault("0xVault"))
                .thenThrow(new RuntimeException("time lock not expired"));

        job.execute(null);

        // Should roll back to ACTIVE so the next cycle can retry
        verify(contractRepo).setStatusIfTriggering(userId, "ACTIVE");
    }

    @Test
    void execute_triggersConditionalVault() throws Exception {
        UUID userId   = UUID.randomUUID();
        UUID configId = UUID.randomUUID();

        CheckInConfig checkIn = graceConfig(userId);
        Contract contract = activeContract(userId, "CONDITIONAL_SURVIVAL");
        contract.setBeneficiaryConfigId(configId);

        // Stub beneficiaries — index 0 = ALWAYS, index 1 = CONDITIONAL
        DeadValut.Main.model.Beneficiary b0 = new DeadValut.Main.model.Beneficiary();
        b0.setPosition(0); b0.setCondition("ALWAYS");
        DeadValut.Main.model.Beneficiary b1 = new DeadValut.Main.model.Beneficiary();
        b1.setPosition(1); b1.setCondition("CONDITIONAL_SURVIVAL");

        when(configRepo.findExpiredGracePeriods(any())).thenReturn(List.of(checkIn));
        when(contractRepo.setStatusIfActive(userId)).thenReturn(1);
        // Fix: use findByUserIdAndStatus instead of the removed findByUserId
        when(contractRepo.findByUserIdAndStatus(userId, "TRIGGERING"))
                .thenReturn(Optional.of(contract));
        when(beneficiaryRepo.findByConfigIdOrderByIndex(configId))
                .thenReturn(List.of(b0, b1));
        when(deploymentService.triggerConditionalVault("0xVault", List.of(1)))
                .thenReturn("0xConditionalTx");

        job.execute(null);

        verify(deploymentService).triggerConditionalVault("0xVault", List.of(1));
        verify(contractRepo).setTriggered(eq(userId), any(Instant.class));
    }
}