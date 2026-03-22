// model/KeyholderVote.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * One approval vote cast by a secondary keyholder.
 * A keyholder may vote at most once per round (enforced by the DB unique constraint
 * {@code uq_round_keyholder_vote}).
 */
@Entity
@Table(name = "keyholder_votes",
       uniqueConstraints = @UniqueConstraint(
           name = "uq_round_keyholder_vote",
           columnNames = {"round_id", "keyholder_id"}))
public class KeyholderVote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "keyholder_id", nullable = false)
    private UUID keyholderID;

    @Column(name = "voted_at", nullable = false, updatable = false)
    private Instant votedAt = Instant.now();

    public KeyholderVote() {}

    public UUID getId()                  { return id; }
    public UUID getRoundId()             { return roundId; }
    public void setRoundId(UUID r)       { this.roundId = r; }
    public UUID getKeyholderID()         { return keyholderID; }
    public void setKeyholderID(UUID k)   { this.keyholderID = k; }
    public Instant getVotedAt()          { return votedAt; }
}