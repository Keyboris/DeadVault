package DeadValut.Main.controller;
 
import DeadValut.Main.model.*;
import DeadValut.Main.service.ContractQueryService;
import org.junit.jupiter.api.*;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
 
import java.time.Instant;
import java.util.List;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
 
@DisplayName("ContractQueryController")
public class ContractQueryControllerTest {
 
    @Mock private ContractQueryService    contractQueryService;
    private ContractQueryController       controller;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        controller = new ContractQueryController(contractQueryService);
    }
 
    @Test
    @DisplayName("getContracts delegates to ContractQueryService")
    void getContracts_delegatesToService() {
        UUID userId = UUID.randomUUID();
        List<ContractSummaryResponse> mockList = List.of(
            new ContractSummaryResponse(
                UUID.randomUUID(), "0x" + "C".repeat(40), "0x" + "D".repeat(64),
                "STANDARD", "ACTIVE", Instant.now(), List.of()));
        when(contractQueryService.getContracts(userId)).thenReturn(mockList);
 
        List<ContractSummaryResponse> result = controller.getContracts(userId);
 
        assertEquals(mockList, result);
        verify(contractQueryService).getContracts(userId);
    }
 
    @Test
    @DisplayName("getContracts returns empty list when service returns empty list")
    void getContracts_emptyList() {
        UUID userId = UUID.randomUUID();
        when(contractQueryService.getContracts(userId)).thenReturn(List.of());
 
        List<ContractSummaryResponse> result = controller.getContracts(userId);
 
        assertTrue(result.isEmpty());
    }
}