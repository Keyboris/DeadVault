// model/SwitchEvent.java
package DeadValut.Main.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "switch_events")
public class SwitchEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "event_type", nullable = false, columnDefinition = "event_type")
    @Enumerated(EnumType.STRING)
    private EventType eventType;

    @Column(name = "metadata", columnDefinition = "jsonb")
    private String metadata;   // stored as JSONB; serialised to/from String in the service layer

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public enum EventType {
        CHECK_IN, MISSED, GRACE_STARTED, TRIGGERED, EXECUTED, REVOKED
    }

    public SwitchEvent() {}

    /**
     * Factory helper used by services and schedulers.
     * @param metadata  Optional key-value metadata serialised to JSON, or null.
     */
    public static SwitchEvent of(UUID userId, String eventType, Map<String, Object> metadata) {
        SwitchEvent e = new SwitchEvent();
        e.userId    = userId;
        e.eventType = EventType.valueOf(eventType);
        if (metadata != null) {
            try {
                e.metadata = new ObjectMapper().writeValueAsString(metadata);
            } catch (Exception ex) {
                e.metadata = "{}";
            }
        }
        return e;
    }

    public Long getId()          { return id; }
    public UUID getUserId()      { return userId; }
    public EventType getEventType() { return eventType; }
    public String getMetadata()  { return metadata; }
    public Instant getCreatedAt(){ return createdAt; }
}