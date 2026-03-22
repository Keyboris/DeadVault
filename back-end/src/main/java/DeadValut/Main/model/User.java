// model/User.java  (UPDATED — adds keyholderThreshold)
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "wallet_address", nullable = false, unique = true, length = 42)
    private String walletAddress;

    @Column(name = "email")
    private String email;

    /**
     * Number of secondary-keyholder approvals required before the vault trigger
     * is dispatched when the grace period expires.
     *
     * <ul>
     *   <li>0 (default) — feature disabled; vault fires immediately as before.</li>
     *   <li>N &gt; 0   — a confirmation round is opened; N votes are needed.</li>
     * </ul>
     *
     * The value is validated at write time: it must never exceed the number of
     * registered keyholders (enforced in {@code KeyholderService}).
     */
    @Column(name = "keyholder_threshold", nullable = false)
    private int keyholderThreshold = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public User() {}

    public UUID getId()                        { return id; }
    public String getWalletAddress()           { return walletAddress; }
    public void setWalletAddress(String w)     { this.walletAddress = w; }
    public String getEmail()                   { return email; }
    public void setEmail(String e)             { this.email = e; }
    public int getKeyholderThreshold()         { return keyholderThreshold; }
    public void setKeyholderThreshold(int t)   { this.keyholderThreshold = t; }
    public Instant getCreatedAt()              { return createdAt; }
}