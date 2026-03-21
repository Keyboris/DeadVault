package DeadValut.Main.service;
 
import org.junit.jupiter.api.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

 
@DisplayName("JwtService")
public class JwtServiceTest {
 
    private JwtService jwtService;
 
    @BeforeEach
    void setUp() {
        // 32-char secret satisfies HMAC-SHA256 minimum key size
        jwtService = new JwtService(
            "test-secret-key-minimum-32-chars!",
            86_400_000L  // 24 hours
        );
    }
 
    @Test
    @DisplayName("generateToken returns a non-blank JWT")
    void generateToken_returnsNonBlank() {
        UUID userId  = UUID.randomUUID();
        String token = jwtService.generateToken(userId, "0xABCDef1234567890abcdef1234567890abcdef12");
        assertNotNull(token);
        assertFalse(token.isBlank());
        // JWTs have three dot-separated segments
        assertEquals(3, token.split("\\.").length);
    }
 
    @Test
    @DisplayName("extractUserId round-trips the original UUID")
    void extractUserId_roundTrips() {
        UUID userId  = UUID.randomUUID();
        String token = jwtService.generateToken(userId, "0x1234567890abcdef1234567890abcdef12345678");
        assertEquals(userId, jwtService.extractUserId(token));
    }
 
    @Test
    @DisplayName("isValid returns true for a fresh token")
    void isValid_trueForFreshToken() {
        String token = jwtService.generateToken(UUID.randomUUID(), "0x0000000000000000000000000000000000000001");
        assertTrue(jwtService.isValid(token));
    }
 
    @Test
    @DisplayName("isValid returns false for a tampered token")
    void isValid_falseForTamperedToken() {
        String token   = jwtService.generateToken(UUID.randomUUID(), "0x0000000000000000000000000000000000000001");
        String tampered = token.substring(0, token.length() - 4) + "XXXX";
        assertFalse(jwtService.isValid(tampered));
    }
 
    @Test
    @DisplayName("isValid returns false for a token signed with a different secret")
    void isValid_falseForWrongSecret() {
        JwtService other  = new JwtService("completely-different-secret-key!!", 86_400_000L);
        String token      = other.generateToken(UUID.randomUUID(), "0x0000000000000000000000000000000000000001");
        assertFalse(jwtService.isValid(token));
    }
 
    @Test
    @DisplayName("isValid returns false for an expired token")
    void isValid_falseForExpiredToken() {
        // expirationMs = 1 ms → expired before the test even reads it
        JwtService shortLived = new JwtService("test-secret-key-minimum-32-chars!", 1L);
        String token          = shortLived.generateToken(UUID.randomUUID(), "0x0000000000000000000000000000000000000001");
        try { Thread.sleep(10); } catch (InterruptedException ignored) {}
        assertFalse(shortLived.isValid(token));
    }
 
    @Test
    @DisplayName("extractUserId throws for an invalid token")
    void extractUserId_throwsForInvalid() {
        assertThrows(Exception.class, () -> jwtService.extractUserId("not.a.jwt"));
    }
}