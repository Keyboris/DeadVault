package DeadValut.Main.scheduler;
 
import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.junit.jupiter.api.*;
import org.mockito.*;
import org.quartz.JobExecutionContext;
 
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
 
@DisplayName("CheckInPollerJob")
public class CheckInPollerJobTest {
 
    @Mock private CheckInConfigRepository configRepo;
    @Mock private SwitchEventRepository   eventRepo;
    @Mock private JobExecutionContext      context;
 
    private CheckInPollerJob job;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        job = new CheckInPollerJob(configRepo, eventRepo);
    }
 
    @Test
    @DisplayName("execute transitions ACTIVE overdue configs to GRACE")
    void execute_overdueConfig_transitionedToGrace() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = new CheckInConfig();
        cfg.setUserId(userId);
        cfg.setStatus("ACTIVE");
        cfg.setGracePeriodDays(7);
        cfg.setNextDueAt(Instant.now().minus(1, ChronoUnit.HOURS));
 
        when(configRepo.findMissedCheckIns(any())).thenReturn(List.of(cfg));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        job.execute(context);
 
        assertEquals("GRACE", cfg.getStatus());
        assertNotNull(cfg.getGraceExpiresAt());
        // graceExpiresAt should be ~7 days from now
        long graceSeconds = ChronoUnit.SECONDS.between(Instant.now(), cfg.getGraceExpiresAt());
        assertTrue(graceSeconds > 7L * 86_400 - 10);
    }
 
    @Test
    @DisplayName("execute saves a GRACE_STARTED switch event")
    void execute_savesGraceStartedEvent() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = new CheckInConfig();
        cfg.setUserId(userId);
        cfg.setStatus("ACTIVE");
        cfg.setGracePeriodDays(7);
        cfg.setNextDueAt(Instant.now().minus(1, ChronoUnit.HOURS));
 
        when(configRepo.findMissedCheckIns(any())).thenReturn(List.of(cfg));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        job.execute(context);
 
        ArgumentCaptor<SwitchEvent> cap = ArgumentCaptor.forClass(SwitchEvent.class);
        verify(eventRepo).save(cap.capture());
        assertEquals(SwitchEvent.EventType.GRACE_STARTED, cap.getValue().getEventType());
        assertEquals(userId, cap.getValue().getUserId());
    }
 
    @Test
    @DisplayName("execute does nothing when no configs are overdue")
    void execute_noOverdueConfigs_noSideEffects() {
        when(configRepo.findMissedCheckIns(any())).thenReturn(List.of());
 
        job.execute(context);
 
        verify(configRepo, never()).save(any());
        verify(eventRepo,  never()).save(any());
    }
 
    @Test
    @DisplayName("execute handles multiple overdue configs independently")
    void execute_multipleOverdue_allTransitioned() {
        CheckInConfig cfg1 = new CheckInConfig();
        cfg1.setUserId(UUID.randomUUID()); cfg1.setStatus("ACTIVE"); cfg1.setGracePeriodDays(7);
        cfg1.setNextDueAt(Instant.now().minus(2, ChronoUnit.DAYS));
 
        CheckInConfig cfg2 = new CheckInConfig();
        cfg2.setUserId(UUID.randomUUID()); cfg2.setStatus("ACTIVE"); cfg2.setGracePeriodDays(7);
        cfg2.setNextDueAt(Instant.now().minus(1, ChronoUnit.DAYS));
 
        when(configRepo.findMissedCheckIns(any())).thenReturn(List.of(cfg1, cfg2));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        job.execute(context);
 
        assertEquals("GRACE", cfg1.getStatus());
        assertEquals("GRACE", cfg2.getStatus());
        verify(eventRepo, times(2)).save(any());
    }
}