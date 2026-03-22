// service/JwtService.java  (UPDATED — adds extractWalletAddress)
package DeadValut.Main.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expirationMs;

    public JwtService(
            @Value("${dms.jwt.secret}") String secret,
            @Value("${dms.jwt.expiration-ms:86400000}") long expirationMs) {
        this.key          = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(UUID userId, String walletAddress) {
        return Jwts.builder()
            .subject(userId.toString())
            .claim("wallet", walletAddress)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expirationMs))
            .signWith(key)
            .compact();
    }

    public UUID extractUserId(String token) {
        Claims claims = parseClaims(token);
        return UUID.fromString(claims.getSubject());
    }

    /**
     * Extracts the wallet address claim embedded in the JWT.
     * Used by {@link DeadValut.Main.route.KeyholderRoute} to identify which
     * keyholder is casting a confirmation vote without requiring them to pass
     * their wallet address as a separate request parameter.
     */
    public String extractWalletAddress(String token) {
        return parseClaims(token).get("wallet", String.class);
    }

    public boolean isValid(String token) {
        try { extractUserId(token); return true; }
        catch (Exception e) { return false; }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                   .verifyWith(key)
                   .build()
                   .parseSignedClaims(token)
                   .getPayload();
    }
}