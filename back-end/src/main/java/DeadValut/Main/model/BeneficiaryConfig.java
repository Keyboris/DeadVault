// model/BeneficiaryConfig.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "beneficiary_configs")
public class BeneficiaryConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "raw_intent_text", nullable = false, columnDefinition = "TEXT")
    private String rawIntentText;

    @Column(name = "template_type", length = 50)
    private String templateType;

    @Column(name = "confidence_score", precision = 4)
    private Double confidenceScore;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING_REVIEW";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    public BeneficiaryConfig() {}

    public UUID getId()                         { return id; }
    public UUID getUserId()                     { return userId; }
    public void setUserId(UUID u)               { this.userId = u; }
    public String getRawIntentText()            { return rawIntentText; }
    public void setRawIntentText(String t)      { this.rawIntentText = t; }
    public String getTemplateType()             { return templateType; }
    public void setTemplateType(String t)       { this.templateType = t; }
    public Double getConfidenceScore()          { return confidenceScore; }
    public void setConfidenceScore(Double s)    { this.confidenceScore = s; }
    public String getStatus()                   { return status; }
    public void setStatus(String s)             { this.status = s; }
    public Instant getConfirmedAt()             { return confirmedAt; }
    public void setConfirmedAt(Instant t)       { this.confirmedAt = t; }
}