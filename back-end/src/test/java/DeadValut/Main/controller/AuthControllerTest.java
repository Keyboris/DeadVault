package DeadValut.Main.controller;
 
import DeadValut.Main.model.*;
import DeadValut.Main.repository.UserRepository;
import DeadValut.Main.service.JwtService;
import DeadValut.Main.service.SiweService;
import org.junit.jupiter.api.*;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
 
import java.util.Optional;
import java.util.UUID;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
 
@DisplayName("AuthController")
public class AuthControllerTest {
 
    @Mock private SiweService     siweService;
    @Mock private JwtService      jwtService;
    @Mock private UserRepository  userRepository;
 
    private AuthController controller;
 
    private static final String WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        controller = new AuthController(siweService, jwtService, userRepository);
    }
 
    @Test
    @DisplayName("nonce delegates to SiweService and echoes walletAddress")
    void nonce_delegatesToSiweService() {
        when(siweService.generateNonce(WALLET)).thenReturn("test-nonce-uuid");
 
        NonceResponse resp = controller.nonce(WALLET);
 
        assertEquals(WALLET, resp.walletAddress());
        assertEquals("test-nonce-uuid", resp.nonce());
        verify(siweService).generateNonce(WALLET);
    }
 
    @Test
    @DisplayName("verify returns a JWT when signature is valid and user exists")
    void verify_existingUser_returnsToken() {
        VerifyRequest req = new VerifyRequest(WALLET, "nonce-123", "0x" + "ab".repeat(65));
 
        when(siweService.verifySignature(WALLET, "nonce-123", "0x" + "ab".repeat(65)))
            .thenReturn(true);
 
        User existingUser = new User();
        existingUser.setWalletAddress(WALLET);
        UUID userId = UUID.randomUUID();
        when(userRepository.findByWalletAddress(WALLET.toLowerCase()))
            .thenReturn(Optional.of(existingUser));
        when(jwtService.generateToken(any(), eq(WALLET))).thenReturn("mock.jwt.token");
 
        TokenResponse resp = controller.verify(req);
 
        assertEquals("mock.jwt.token", resp.token());
        verify(userRepository, never()).save(any()); // existing user — no save
    }
 
    @Test
    @DisplayName("verify creates a new user on first sign-in")
    void verify_newUser_createsUser() {
        VerifyRequest req = new VerifyRequest(WALLET, "nonce-abc", "0x" + "ab".repeat(65));
 
        when(siweService.verifySignature(any(), any(), any())).thenReturn(true);
        when(userRepository.findByWalletAddress(WALLET.toLowerCase())).thenReturn(Optional.empty());
 
        User savedUser = new User();
        savedUser.setWalletAddress(WALLET);
        when(userRepository.save(any())).thenReturn(savedUser);
        when(jwtService.generateToken(any(), any())).thenReturn("new.jwt.token");
 
        controller.verify(req);
 
        verify(userRepository).save(any(User.class));
    }
 
    @Test
    @DisplayName("verify throws RuntimeException when SIWE signature is invalid")
    void verify_invalidSignature_throws() {
        VerifyRequest req = new VerifyRequest(WALLET, "bad-nonce", "0x" + "ab".repeat(65));
 
        when(siweService.verifySignature(any(), any(), any())).thenReturn(false);
 
        assertThrows(RuntimeException.class, () -> controller.verify(req));
        verify(jwtService, never()).generateToken(any(), any());
    }
}