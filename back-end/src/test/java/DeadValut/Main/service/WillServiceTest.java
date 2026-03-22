package DeadValut.Main.service;
 
import DeadValut.Main.model.*;
import DeadValut.Main.repository.*;
import org.junit.jupiter.api.*;
import org.mockito.*;
 
import java.util.List;
import java.util.Optional;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
 
@DisplayName("WillService")
public class WillServiceTest {
 
    @Mock private IntentExtractionService           intentExtractionService;
    @Mock private VaultTypeRouter                   vaultTypeRouter;
    @Mock private ContractDeploymentService         contractDeploymentService;
    @Mock private BeneficiaryConfigRepository       configRepo;
    @Mock private BeneficiaryRepository             beneficiaryRepo;
    @Mock private ContractRepository                contractRepo;
    @Mock private CheckInConfigRepository           checkInConfigRepo;
    @Mock private UserRepository                    userRepository;
 
    private WillService willService;
 
    private static final String WALLET = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private static final String BENEFICIARY_WALLET_1 = "0x" + "1".repeat(40);
    private static final String BENEFICIARY_WALLET_2 = "0x" + "2".repeat(40);
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        willService = new WillService(
            intentExtractionService, vaultTypeRouter, contractDeploymentService,
            configRepo, beneficiaryRepo, contractRepo, checkInConfigRepo, userRepository);
    }
 
    private IntentExtractionResult validExtraction(String templateType) {
        return new IntentExtractionResult(
            templateType, 0, 0, 0, 0, List.of(),
            List.of(
                new ResolvedBeneficiary("Alice", BENEFICIARY_WALLET_1, 6000, "ALWAYS", 0),
                new ResolvedBeneficiary("Bob",   BENEFICIARY_WALLET_2, 4000, "ALWAYS", 0)
            ),
            List.of(), List.of(), 0.99
        );

    }
 
    @Test
    @DisplayName("submitWill happy path: calls deploy, persists config, creates check-in")
    void submitWill_happyPath() throws Exception {
        UUID userId = UUID.randomUUID();
        User user   = new User(); user.setWalletAddress(WALLET);
 
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
 
        IntentExtractionResult extraction = validExtraction("PERCENTAGE_SPLIT");
        when(intentExtractionService.extract(anyString())).thenReturn(extraction);
 
        VaultDeploymentParams params = new VaultDeploymentParams.Standard(
            List.of(BENEFICIARY_WALLET_1, BENEFICIARY_WALLET_2), List.of(6000, 4000));
        when(vaultTypeRouter.route(extraction)).thenReturn(params);
 
        ContractDeploymentService.DeployResult deployResult =
            new ContractDeploymentService.DeployResult("0x" + "C".repeat(40), "0x" + "D".repeat(64), "STANDARD");
        when(contractDeploymentService.deployVault(eq(WALLET), any())).thenReturn(deployResult);
 
        BeneficiaryConfig savedConfig = new BeneficiaryConfig();
        when(configRepo.save(any())).thenReturn(savedConfig);
        when(beneficiaryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(contractRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(checkInConfigRepo.findByUserId(userId)).thenReturn(Optional.empty());
        when(checkInConfigRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        WillResponse resp = willService.submitWill(userId, "Give 60% to Alice and 40% to Bob");
 
        assertNotNull(resp);
        assertEquals("0x" + "C".repeat(40), resp.contractAddress());
        assertEquals("0x" + "D".repeat(64), resp.deploymentTxHash());
        assertEquals("PERCENTAGE_SPLIT",    resp.templateType());
        assertEquals(2, resp.beneficiaries().size());
 
        verify(contractDeploymentService).deployVault(eq(WALLET), eq(params));
        verify(checkInConfigRepo).save(any(CheckInConfig.class));
    }
 
    @Test
    @DisplayName("submitWill throws when LLM returns validation errors")
    void submitWill_validationErrors_throws() throws Exception { // <--- ADD THIS HERE
        UUID userId = UUID.randomUUID();
        User user   = new User(); user.setWalletAddress(WALLET);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        IntentExtractionResult badExtraction = new IntentExtractionResult(
            "UNKNOWN", 0, 0, 0, 0, List.of(), List.of(), List.of(), List.of("Wallet address missing"), 0.3);

        when(intentExtractionService.extract(anyString())).thenReturn(badExtraction);

        assertThrows(IllegalArgumentException.class,
            () -> willService.submitWill(userId, "Give money to Alice"));
        
        verify(contractDeploymentService, never()).deployVault(any(), any());
    }
 
    @Test
    @DisplayName("submitWill saves config as FAILED when deployment throws")
    void submitWill_deploymentFails_configMarkedFailed() throws Exception {
        UUID userId = UUID.randomUUID();
        User user   = new User(); user.setWalletAddress(WALLET);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
 
        IntentExtractionResult extraction = validExtraction("PERCENTAGE_SPLIT");
        when(intentExtractionService.extract(anyString())).thenReturn(extraction);
        when(vaultTypeRouter.route(any())).thenReturn(
            new VaultDeploymentParams.Standard(List.of(BENEFICIARY_WALLET_1), List.of(10000)));
        when(contractDeploymentService.deployVault(any(), any()))
            .thenThrow(new RuntimeException("RPC error"));
 
        BeneficiaryConfig savedConfig = new BeneficiaryConfig();
        when(configRepo.save(any())).thenReturn(savedConfig);
        when(beneficiaryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        assertThrows(RuntimeException.class,
            () -> willService.submitWill(userId, "Give everything to Alice"));
 
        // Second save call should set status to FAILED
        ArgumentCaptor<BeneficiaryConfig> cap = ArgumentCaptor.forClass(BeneficiaryConfig.class);
        verify(configRepo, atLeast(2)).save(cap.capture());
        boolean hasFailed = cap.getAllValues().stream()
            .anyMatch(c -> "FAILED".equals(c.getStatus()));
        assertTrue(hasFailed);
    }
 
    @Test
    @DisplayName("submitWill does NOT create a second check-in config if one already exists")
    void submitWill_existingCheckIn_notDuplicated() throws Exception {
        UUID userId = UUID.randomUUID();
        User user   = new User(); user.setWalletAddress(WALLET);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
 
        IntentExtractionResult extraction = validExtraction("PERCENTAGE_SPLIT");
        when(intentExtractionService.extract(anyString())).thenReturn(extraction);
        when(vaultTypeRouter.route(any())).thenReturn(
            new VaultDeploymentParams.Standard(List.of(BENEFICIARY_WALLET_1, BENEFICIARY_WALLET_2), List.of(6000, 4000)));
        when(contractDeploymentService.deployVault(any(), any()))
            .thenReturn(new ContractDeploymentService.DeployResult("0x" + "C".repeat(40), "0x" + "D".repeat(64), "STANDARD"));
 
        BeneficiaryConfig saved = new BeneficiaryConfig();
        when(configRepo.save(any())).thenReturn(saved);
        when(beneficiaryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(contractRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
 
        // Existing check-in config already present
        when(checkInConfigRepo.findByUserId(userId)).thenReturn(Optional.of(new CheckInConfig()));
 
        willService.submitWill(userId, "Give 60% to Alice and 40% to Bob");
 
        verify(checkInConfigRepo, never()).save(any());
    }
}