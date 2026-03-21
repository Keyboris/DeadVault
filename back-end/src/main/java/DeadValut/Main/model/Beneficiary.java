// model/Beneficiary.java
package DeadValut.Main.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "beneficiaries")
public class Beneficiary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "config_id", nullable = false)
    private UUID configId;

    /** 0-based index — must match the on-chain beneficiaries[] array position. */
    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "wallet_address", nullable = false, length = 42)
    private String walletAddress;

    @Column(name = "basis_points", nullable = false)
    private int basisPoints;

    @Column(name = "label", length = 255)
    private String label;

    /** ALWAYS | CONDITIONAL_SURVIVAL — mirrors the on-chain mustSurviveOwner flag. */
    @Column(name = "condition", nullable = false, length = 30)
    private String condition = "ALWAYS";

    public Beneficiary() {}

    public UUID getId()                    { return id; }
    public UUID getConfigId()              { return configId; }
    public void setConfigId(UUID c)        { this.configId = c; }
    public int getPosition()               { return position; }
    public void setPosition(int p)         { this.position = p; }
    public String getWalletAddress()       { return walletAddress; }
    public void setWalletAddress(String w) { this.walletAddress = w; }
    public int getBasisPoints()            { return basisPoints; }
    public void setBasisPoints(int b)      { this.basisPoints = b; }
    public String getLabel()               { return label; }
    public void setLabel(String l)         { this.label = l; }
    public String getCondition()           { return condition; }
    public void setCondition(String c)     { this.condition = c; }
    /** Alias used by GracePeriodWatcherJob dispatch logic. */
    public int getIndex()                  { return position; }
}