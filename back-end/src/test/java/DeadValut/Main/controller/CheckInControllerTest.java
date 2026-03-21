package DeadValut.Main.controller;
 
import DeadValut.Main.model.*;
import DeadValut.Main.service.CheckInService;
import org.junit.jupiter.api.*;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
 
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
 
@DisplayName("CheckInController")
public class CheckInControllerTest {
 
    @Mock private CheckInService checkInService;
    private CheckInController    controller;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        controller = new CheckInController(checkInService);
    }
 
    @Test
    @DisplayName("checkIn delegates to CheckInService.recordCheckIn")
    void checkIn_delegatesToService() {
        UUID userId           = UUID.randomUUID();
        CheckInResponse mockResp = new CheckInResponse(
            Instant.now().plus(30, ChronoUnit.DAYS), 30);
        when(checkInService.recordCheckIn(userId)).thenReturn(mockResp);
 
        CheckInResponse resp = controller.checkIn(userId);
 
        assertEquals(mockResp, resp);
        verify(checkInService).recordCheckIn(userId);
    }
 
    @Test
    @DisplayName("status delegates to CheckInService.getStatus")
    void status_delegatesToService() {
        UUID userId = UUID.randomUUID();
        CheckInStatusResponse mockResp = new CheckInStatusResponse(
            Instant.now().minus(5, ChronoUnit.DAYS),
            Instant.now().plus(25, ChronoUnit.DAYS),
            25L * 86_400, 30, 7, "ACTIVE");
        when(checkInService.getStatus(userId)).thenReturn(mockResp);
 
        CheckInStatusResponse resp = controller.status(userId);
 
        assertEquals(mockResp, resp);
        verify(checkInService).getStatus(userId);
    }
}