package DeadValut.Main.service;
 
import DeadValut.Main.model.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
 
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
 
@DisplayName("VaultTypeRouter")
public class VaultTypeRouterTest {
 
    private VaultTypeRouter router;
 
    private static final ResolvedBeneficiary ALICE =
        new ResolvedBeneficiary("Alice", "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 5000, "ALWAYS", 0);
    private static final ResolvedBeneficiary BOB =
        new ResolvedBeneficiary("Bob",   "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 5000, "ALWAYS", 0);
 
    @BeforeEach
    void setUp() { router = new VaultTypeRouter(); }
 
    @ParameterizedTest(name = "templateType={0} → Standard params")
    @ValueSource(strings = {"EQUAL_SPLIT", "PERCENTAGE_SPLIT"})
    @DisplayName("EQUAL_SPLIT and PERCENTAGE_SPLIT both produce Standard params")
    void standardVaultTypes_produceStandardParams(String templateType) {
        IntentExtractionResult result = new IntentExtractionResult(
            templateType, 0, List.of(ALICE, BOB), List.of(), List.of(), 0.99);
 
        VaultDeploymentParams params = router.route(result);
 
        assertInstanceOf(VaultDeploymentParams.Standard.class, params);
        assertEquals(List.of(ALICE.walletAddress(), BOB.walletAddress()), params.wallets());
        assertEquals(List.of(5000, 5000), params.basisPoints());
    }
 
    @Test
    @DisplayName("TIME_LOCKED produces TimeLocked params with correct timeLockDays")
    void timeLocked_producesTimeLockedParams() {
        IntentExtractionResult result = new IntentExtractionResult(
            "TIME_LOCKED", 180,
            List.of(new ResolvedBeneficiary("Alice", "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 10000, "ALWAYS", 180)),
            List.of(), List.of(), 0.95);
 
        VaultDeploymentParams params = router.route(result);
 
        assertInstanceOf(VaultDeploymentParams.TimeLocked.class, params);
        assertEquals(180, ((VaultDeploymentParams.TimeLocked) params).timeLockDays());
    }
 
    @Test
    @DisplayName("TIME_LOCKED with timeLockDays=0 throws IllegalArgumentException")
    void timeLocked_zeroTimeLockDays_throws() {
        IntentExtractionResult result = new IntentExtractionResult(
            "TIME_LOCKED", 0, List.of(ALICE), List.of(), List.of(), 0.9);
        assertThrows(IllegalArgumentException.class, () -> router.route(result));
    }
 
    @Test
    @DisplayName("CONDITIONAL_SURVIVAL produces Conditional params with correct mustSurvive flags")
    void conditional_producesConditionalParams() {
        ResolvedBeneficiary alwaysB = new ResolvedBeneficiary(
            "Alice", "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 5000, "ALWAYS", 0);
        ResolvedBeneficiary conditionalB = new ResolvedBeneficiary(
            "Bob",   "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 5000, "CONDITIONAL_SURVIVAL", 0);
 
        IntentExtractionResult result = new IntentExtractionResult(
            "CONDITIONAL_SURVIVAL", 0, List.of(alwaysB, conditionalB),
            List.of(), List.of(), 0.92);
 
        VaultDeploymentParams params = router.route(result);
 
        assertInstanceOf(VaultDeploymentParams.Conditional.class, params);
        assertEquals(List.of(false, true),
            ((VaultDeploymentParams.Conditional) params).mustSurviveOwner());
    }
 
    @Test
    @DisplayName("Unknown templateType throws IllegalArgumentException")
    void unknownTemplateType_throws() {
        IntentExtractionResult result = new IntentExtractionResult(
            "NONSENSE", 0, List.of(ALICE), List.of(), List.of(), 0.5);
        assertThrows(IllegalArgumentException.class, () -> router.route(result));
    }
}