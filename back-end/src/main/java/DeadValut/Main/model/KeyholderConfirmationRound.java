// model/KeyholderConfirmationRound.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * One confirmation round opened when a user's grace period expires and they
 * have secondary keyholders configured. The vault trigger is deferred until
 * {@code confirmationsReceived >= thresholdRequired} (APPROVED) or the round
 * expires / is cancelled (REJECTED/EXPIRED).
 */
@Entity
@Table(name = "keyholder_confirmation_rounds")
public class KeyholderConfirmationRound {

    public enum Status { PENDING, APPROVED, REJECTED, EXPIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** FK to the specific contract row that will be triggered on APPROVED. */
    @Column(name = "contract_id", nullable = false)
    private UUID contractId;

    /** Snapshot of the threshold at the time this round was created. */
    @Column(name = "threshold_required", nullable = false)
    private int thresholdRequired;

    @Column(name = "confirmations_received", nullable = false)
    private int confirmationsReceived = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false,
            columnDefinition = "confirmation_round_status")
    private Status status = Status.PENDING;

    /** Round auto-expires 72 h after creation if not enough votes arrive. */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    public KeyholderConfirmationRound() {}

    public UUID getId()                              { return id; }
    public UUID getUserId()                          { return userId; }
    public void setUserId(UUID u)                    { this.userId = u; }
    public UUID getContractId()                      { return contractId; }
    public void setContractId(UUID c)                { this.contractId = c; }
    public int getThresholdRequired()                { return thresholdRequired; }
    public void setThresholdRequired(int t)          { this.thresholdRequired = t; }
    public int getConfirmationsReceived()            { return confirmationsReceived; }
    public void setConfirmationsReceived(int c)      { this.confirmationsReceived = c; }
    public Status getStatus()                        { return status; }
    public void setStatus(Status s)                  { this.status = s; }
    public Instant getExpiresAt()                    { return expiresAt; }
    public void setExpiresAt(Instant t)              { this.expiresAt = t; }
    public Instant getCreatedAt()                    { return createdAt; }
    public Instant getResolvedAt()                   { return resolvedAt; }
    public void setResolvedAt(Instant t)             { this.resolvedAt = t; }

    /** Convenience: has the threshold already been met? */
    public boolean isThresholdMet() {
        return confirmationsReceived >= thresholdRequired;
    }
}