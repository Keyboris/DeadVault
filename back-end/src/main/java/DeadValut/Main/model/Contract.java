// model/Contract.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "contracts")
public class Contract {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    /**
     * FK to beneficiary_configs.id — used by GracePeriodWatcherJob to look up
     * conditional beneficiary positions when dispatching a CONDITIONAL_SURVIVAL trigger.
     */
    @Column(name = "beneficiary_config_id")
    private UUID beneficiaryConfigId;

    @Column(name = "contract_address", nullable = false, unique = true, length = 42)
    private String contractAddress;

    @Column(name = "deployment_tx_hash", length = 66)
    private String deploymentTxHash;

    /**
     * STANDARD | TIME_LOCKED | CONDITIONAL_SURVIVAL
     * Determines which trigger path GracePeriodWatcherJob uses.
     */
    @Column(name = "vault_type", nullable = false, length = 30)
    private String vaultType = "STANDARD";

    @Column(name = "status", nullable = false, length = 20)
    private String status = "ACTIVE";

    @Column(name = "deployed_at", nullable = false, updatable = false)
    private Instant deployedAt = Instant.now();

    @Column(name = "triggered_at")
    private Instant triggeredAt;

    @Column(name = "owners", columnDefinition = "TEXT")
    private String owners;

    @Column(name = "threshold")
    private Integer threshold;

    @Column(name = "inactivity_seconds")
    private Integer inactivitySeconds;

    @Column(name = "grace_seconds")
    private Integer graceSeconds;

    public Contract() {}

    public UUID getId()                           { return id; }
    public UUID getUserId()                       { return userId; }
    public void setUserId(UUID u)                 { this.userId = u; }
    public UUID getBeneficiaryConfigId()          { return beneficiaryConfigId; }
    public void setBeneficiaryConfigId(UUID id)   { this.beneficiaryConfigId = id; }
    public String getContractAddress()            { return contractAddress; }
    public void setContractAddress(String a)      { this.contractAddress = a; }
    public String getDeploymentTxHash()           { return deploymentTxHash; }
    public void setDeploymentTxHash(String h)     { this.deploymentTxHash = h; }
    public String getVaultType()                  { return vaultType; }
    public void setVaultType(String t)            { this.vaultType = t; }
    public String getStatus()                     { return status; }
    public void setStatus(String s)               { this.status = s; }
    public Instant getDeployedAt()                { return deployedAt; }
    public Instant getTriggeredAt()               { return triggeredAt; }
    public void setTriggeredAt(Instant t)         { this.triggeredAt = t; }

    public String getOwners()                     { return owners; }
    public void setOwners(String o)               { this.owners = o; }
    public Integer getThreshold()                 { return threshold; }
    public void setThreshold(Integer t)           { this.threshold = t; }
    public Integer getInactivitySeconds()         { return inactivitySeconds; }
    public void setInactivitySeconds(Integer s)   { this.inactivitySeconds = s; }
    public Integer getGraceSeconds()              { return graceSeconds; }
    public void setGraceSeconds(Integer s)        { this.graceSeconds = s; }
}