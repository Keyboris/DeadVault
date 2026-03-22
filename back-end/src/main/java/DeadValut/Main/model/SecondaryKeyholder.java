// model/SecondaryKeyholder.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * A trusted contact appointed by the vault owner.
 * When the owner's grace period expires and the feature is enabled
 * (user.keyholder_threshold > 0), a confirmation round is opened.
 * A majority of keyholders must cast a vote before the vault fires.
 */
@Entity
@Table(name = "secondary_keyholders",
       uniqueConstraints = @UniqueConstraint(
           name = "uq_user_keyholder",
           columnNames = {"user_id", "wallet_address"}))
public class SecondaryKeyholder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** EIP-55 mixed-case or lowercase — stored as provided, compared lower-case. */
    @Column(name = "wallet_address", nullable = false, length = 42)
    private String walletAddress;

    /** Human-readable name so the owner can identify their keyholders. */
    @Column(name = "label", length = 255)
    private String label;

    /** Optional e-mail used by the notification service to prompt the keyholder. */
    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "added_at", nullable = false, updatable = false)
    private Instant addedAt = Instant.now();

    public SecondaryKeyholder() {}

    public UUID getId()                     { return id; }
    public UUID getUserId()                 { return userId; }
    public void setUserId(UUID u)           { this.userId = u; }
    public String getWalletAddress()        { return walletAddress; }
    public void setWalletAddress(String w)  { this.walletAddress = w; }
    public String getLabel()                { return label; }
    public void setLabel(String l)          { this.label = l; }
    public String getEmail()                { return email; }
    public void setEmail(String e)          { this.email = e; }
    public Instant getAddedAt()             { return addedAt; }
}