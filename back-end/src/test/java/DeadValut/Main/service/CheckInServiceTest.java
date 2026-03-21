package DeadValut.Main.service;
 
import DeadValut.Main.model.*;
import DeadValut.Main.repository.CheckInConfigRepository;
import DeadValut.Main.repository.SwitchEventRepository;
import org.junit.jupiter.api.*;
import org.mockito.*;
 
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
 
@DisplayName("CheckInService")
public class CheckInServiceTest {
 
    @Mock private CheckInConfigRepository configRepo;
    @Mock private SwitchEventRepository   eventRepo;
 
    private CheckInService service;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new CheckInService(configRepo, eventRepo);
    }
 
    private CheckInConfig buildConfig(UUID userId, int intervalDays, int gracePeriodDays) {
        CheckInConfig cfg = new CheckInConfig();
        cfg.setUserId(userId);
        cfg.setIntervalDays(intervalDays);
        cfg.setGracePeriodDays(gracePeriodDays);
        cfg.setLastCheckInAt(Instant.now().minus(5, ChronoUnit.DAYS));
        cfg.setNextDueAt(Instant.now().plus(25, ChronoUnit.DAYS));
        cfg.setStatus("ACTIVE");
        return cfg;
    }
 
    // ── recordCheckIn ────────────────────────────────────────────────────────
 
    @Test
    @DisplayName("recordCheckIn advances nextDueAt by intervalDays from now")
    void recordCheckIn_advancesNextDueAt() {
        UUID userId         = UUID.randomUUID();
        CheckInConfig cfg   = buildConfig(userId, 30, 7);
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        CheckInResponse resp = service.recordCheckIn(userId);
 
        assertNotNull(resp.nextDueAt());
        // nextDueAt should be ~30 days from now (within a 5-second window for test execution)
        long secondsUntilDue = ChronoUnit.SECONDS.between(Instant.now(), resp.nextDueAt());
        assertTrue(secondsUntilDue > 30L * 86_400 - 5);
        assertTrue(secondsUntilDue < 30L * 86_400 + 5);
        assertEquals(30, resp.intervalDays());
    }
 
    @Test
    @DisplayName("recordCheckIn saves a CHECK_IN switch event")
    void recordCheckIn_savesCheckInEvent() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        service.recordCheckIn(userId);
 
        ArgumentCaptor<SwitchEvent> cap = ArgumentCaptor.forClass(SwitchEvent.class);
        verify(eventRepo).save(cap.capture());
        assertEquals(SwitchEvent.EventType.CHECK_IN, cap.getValue().getEventType());
    }
 
    @Test
    @DisplayName("recordCheckIn throws when no config exists for user")
    void recordCheckIn_noConfig_throws() {
        UUID userId = UUID.randomUUID();
        when(configRepo.findByUserId(userId)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> service.recordCheckIn(userId));
    }
 
    @Test
    @DisplayName("recordCheckIn resets status to ACTIVE and clears graceExpiresAt")
    void recordCheckIn_resetsGraceState() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        cfg.setStatus("GRACE");
        cfg.setGraceExpiresAt(Instant.now().plus(3, ChronoUnit.DAYS));
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
        when(configRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        service.recordCheckIn(userId);
 
        assertEquals("ACTIVE", cfg.getStatus());
        assertNull(cfg.getGraceExpiresAt());
    }
 
    // ── getStatus ────────────────────────────────────────────────────────────
 
    @Test
    @DisplayName("getStatus returns all required clock fields")
    void getStatus_returnsAllClockFields() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
 
        CheckInStatusResponse resp = service.getStatus(userId);
 
        assertNotNull(resp.lastCheckInAt());
        assertNotNull(resp.nextDueAt());
        assertNotNull(resp.status());
        assertEquals(30, resp.intervalDays());
        assertEquals(7, resp.gracePeriodDays());
    }
 
    @Test
    @DisplayName("getStatus secondsRemaining is positive when nextDueAt is in the future")
    void getStatus_positiveSecondsRemaining_whenFuture() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        cfg.setNextDueAt(Instant.now().plus(10, ChronoUnit.DAYS));
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
 
        CheckInStatusResponse resp = service.getStatus(userId);
 
        assertTrue(resp.secondsRemaining() > 0);
    }
 
    @Test
    @DisplayName("getStatus secondsRemaining is negative when nextDueAt is in the past")
    void getStatus_negativeSecondsRemaining_whenPast() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        cfg.setNextDueAt(Instant.now().minus(2, ChronoUnit.DAYS));
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
 
        CheckInStatusResponse resp = service.getStatus(userId);
 
        assertTrue(resp.secondsRemaining() < 0);
    }
 
    @Test
    @DisplayName("getStatus reflects GRACE status")
    void getStatus_graceStatus() {
        UUID userId       = UUID.randomUUID();
        CheckInConfig cfg = buildConfig(userId, 30, 7);
        cfg.setStatus("GRACE");
        when(configRepo.findByUserId(userId)).thenReturn(Optional.of(cfg));
 
        CheckInStatusResponse resp = service.getStatus(userId);
 
        assertEquals("GRACE", resp.status());
    }
 
    @Test
    @DisplayName("getStatus throws when no config exists")
    void getStatus_noConfig_throws() {
        UUID userId = UUID.randomUUID();
        when(configRepo.findByUserId(userId)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> service.getStatus(userId));
    }
}