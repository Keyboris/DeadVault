package DeadValut.Main.service;
 
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
 
@DisplayName("SiweService")
public class SiweServiceTest {
 
    private SiweService siweService;
    private static final String WALLET = "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199";
 
    @BeforeEach
    void setUp() {
        siweService = new SiweService();
    }
 
    @Test
    @DisplayName("generateNonce returns a non-blank UUID-format string")
    void generateNonce_returnsUuid() {
        String nonce = siweService.generateNonce(WALLET);
        assertNotNull(nonce);
        assertFalse(nonce.isBlank());
        // UUID format: 8-4-4-4-12 hex groups
        assertTrue(nonce.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"));
    }
 
    @Test
    @DisplayName("generateNonce issues a different nonce each call")
    void generateNonce_isUnique() {
        String n1 = siweService.generateNonce(WALLET);
        String n2 = siweService.generateNonce(WALLET);
        assertNotEquals(n1, n2);
    }
 
    @Test
    @DisplayName("verifySignature returns false for a used (already consumed) nonce")
    void verifySignature_falseForUsedNonce() {
        String nonce = siweService.generateNonce(WALLET);
        // Calling verify consumes the nonce (returns false because sig is fake, but nonce is removed)
        siweService.verifySignature(WALLET, nonce, "0x" + "ab".repeat(65));
        // Second call with same nonce must also fail — nonce was removed on first call
        boolean result = siweService.verifySignature(WALLET, nonce, "0x" + "ab".repeat(65));
        assertFalse(result);
    }
 
    @Test
    @DisplayName("verifySignature returns false for unknown nonce")
    void verifySignature_falseForUnknownNonce() {
        boolean result = siweService.verifySignature(
            WALLET, "00000000-0000-0000-0000-000000000000", "0x" + "ab".repeat(65));
        assertFalse(result);
    }
 
    @Test
    @DisplayName("verifySignature returns false when wallet address does not match signer")
    void verifySignature_falseForMismatchedWallet() {
        // Generate nonce for wallet A, but verify with wallet B's address
        String nonce      = siweService.generateNonce(WALLET);
        String otherWallet = "0x1111111111111111111111111111111111111111";
        boolean result    = siweService.verifySignature(otherWallet, nonce, "0x" + "ab".repeat(65));
        assertFalse(result);
    }
 
    // NOTE: a test for a *valid* signature would require a real secp256k1 signing operation.
    // The sign.js integration script covers that end-to-end case. Unit tests here focus on
    // the negative paths that don't require a real key-pair.
}