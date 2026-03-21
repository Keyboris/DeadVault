// model/CheckInConfig.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "check_in_configs")
public class CheckInConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "interval_days", nullable = false)
    private int intervalDays = 30;

    @Column(name = "grace_period_days", nullable = false)
    private int gracePeriodDays = 7;

    @Column(name = "last_check_in_at")
    private Instant lastCheckInAt;

    @Column(name = "next_due_at")
    private Instant nextDueAt;

    @Column(name = "grace_expires_at")
    private Instant graceExpiresAt;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "ACTIVE";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public CheckInConfig() {}

    public UUID getId()                          { return id; }
    public UUID getUserId()                      { return userId; }
    public void setUserId(UUID u)                { this.userId = u; }
    public int getIntervalDays()                 { return intervalDays; }
    public void setIntervalDays(int d)           { this.intervalDays = d; }
    public int getGracePeriodDays()              { return gracePeriodDays; }
    public void setGracePeriodDays(int d)        { this.gracePeriodDays = d; }
    public Instant getLastCheckInAt()            { return lastCheckInAt; }
    public void setLastCheckInAt(Instant t)      { this.lastCheckInAt = t; }
    public Instant getNextDueAt()                { return nextDueAt; }
    public void setNextDueAt(Instant t)          { this.nextDueAt = t; }
    public Instant getGraceExpiresAt()           { return graceExpiresAt; }
    public void setGraceExpiresAt(Instant t)     { this.graceExpiresAt = t; }
    public String getStatus()                    { return status; }
    public void setStatus(String s)              { this.status = s; }
}