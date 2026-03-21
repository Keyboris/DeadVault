// model/User.java
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

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public User() {}

    public UUID getId()                    { return id; }
    public String getWalletAddress()       { return walletAddress; }
    public void setWalletAddress(String w) { this.walletAddress = w; }
    public String getEmail()               { return email; }
    public void setEmail(String e)         { this.email = e; }
    public Instant getCreatedAt()          { return createdAt; }
}