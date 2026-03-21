package DeadValut.Main.service;
 
import DeadValut.Main.model.*;
import DeadValut.Main.repository.BeneficiaryRepository;
import DeadValut.Main.repository.ContractRepository;
import org.junit.jupiter.api.*;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
 
import java.time.Instant;
import java.util.List;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
 
@DisplayName("ContractQueryService")
public class ContractQueryServiceTest {
 
    @Mock private ContractRepository   contractRepo;
    @Mock private BeneficiaryRepository beneficiaryRepo;
 
    private ContractQueryService service;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ContractQueryService(contractRepo, beneficiaryRepo);
    }
 
    private Contract buildContract(UUID userId, String status) {
        Contract c = new Contract();
        c.setUserId(userId);
        c.setContractAddress("0x" + "C".repeat(40));
        c.setDeploymentTxHash("0x" + "D".repeat(64));
        c.setVaultType("STANDARD");
        c.setStatus(status);
        c.setBeneficiaryConfigId(UUID.randomUUID());
        return c;
    }
 
    private Beneficiary buildBeneficiary(UUID configId, String label, int basisPoints) {
        Beneficiary b = new Beneficiary();
        b.setConfigId(configId);
        b.setPosition(0);
        b.setLabel(label);
        b.setWalletAddress("0x" + "A".repeat(40));
        b.setBasisPoints(basisPoints);
        b.setCondition("ALWAYS");
        return b;
    }
 
    @Test
    @DisplayName("getContracts returns only non-REVOKED contracts")
    void getContracts_excludesRevoked() {
        UUID userId    = UUID.randomUUID();
        Contract active = buildContract(userId, "ACTIVE");
        when(contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED"))
            .thenReturn(List.of(active));
        when(beneficiaryRepo.findByConfigIdOrderByPosition(any())).thenReturn(List.of());
 
        List<ContractSummaryResponse> result = service.getContracts(userId);
 
        assertEquals(1, result.size());
        assertEquals("ACTIVE", result.get(0).status());
    }
 
    @Test
    @DisplayName("getContracts returns empty list when user has no contracts")
    void getContracts_emptyForNewUser() {
        UUID userId = UUID.randomUUID();
        when(contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED"))
            .thenReturn(List.of());
 
        List<ContractSummaryResponse> result = service.getContracts(userId);
 
        assertTrue(result.isEmpty());
    }
 
    @Test
    @DisplayName("getContracts enriches each contract with its beneficiary list")
    void getContracts_enrichesWithBeneficiaries() {
        UUID userId     = UUID.randomUUID();
        Contract active = buildContract(userId, "ACTIVE");
        UUID configId   = active.getBeneficiaryConfigId();
 
        Beneficiary alice = buildBeneficiary(configId, "Alice", 6000);
        Beneficiary bob   = buildBeneficiary(configId, "Bob",   4000);
 
        when(contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED"))
            .thenReturn(List.of(active));
        when(beneficiaryRepo.findByConfigIdOrderByPosition(configId))
            .thenReturn(List.of(alice, bob));
 
        List<ContractSummaryResponse> result = service.getContracts(userId);
 
        assertEquals(1, result.size());
        assertEquals(2, result.get(0).beneficiaries().size());
        assertEquals("Alice", result.get(0).beneficiaries().get(0).label());
        assertEquals(6000,    result.get(0).beneficiaries().get(0).basisPoints());
        assertEquals("Bob",   result.get(0).beneficiaries().get(1).label());
    }
 
    @Test
    @DisplayName("getContracts handles null beneficiaryConfigId gracefully")
    void getContracts_nullConfigId_returnsEmptyBeneficiaries() {
        UUID userId     = UUID.randomUUID();
        Contract active = buildContract(userId, "ACTIVE");
        active.setBeneficiaryConfigId(null);   // orphaned contract — no config
 
        when(contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED"))
            .thenReturn(List.of(active));
 
        List<ContractSummaryResponse> result = service.getContracts(userId);
 
        assertEquals(1, result.size());
        assertTrue(result.get(0).beneficiaries().isEmpty());
        verify(beneficiaryRepo, never()).findByConfigIdOrderByPosition(any());
    }
 
    @Test
    @DisplayName("getContracts returns multiple contracts for a user who has updated their will")
    void getContracts_multipleContracts() {
        UUID userId      = UUID.randomUUID();
        Contract active  = buildContract(userId, "ACTIVE");
        Contract triggered = buildContract(userId, "TRIGGERED");
 
        when(contractRepo.findAllByUserIdAndStatusNot(userId, "REVOKED"))
            .thenReturn(List.of(active, triggered));
        when(beneficiaryRepo.findByConfigIdOrderByPosition(any())).thenReturn(List.of());
 
        List<ContractSummaryResponse> result = service.getContracts(userId);
 
        assertEquals(2, result.size());
    }
}