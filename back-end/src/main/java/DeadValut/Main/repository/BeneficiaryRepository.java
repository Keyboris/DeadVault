// repository/BeneficiaryRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.Beneficiary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BeneficiaryRepository extends JpaRepository<Beneficiary, UUID> {

    List<Beneficiary> findByConfigId(UUID configId);

    /**
     * Returns beneficiaries ordered by their position column (0-based on-chain index).
     * Used by GracePeriodWatcherJob to identify conditional beneficiary indices for
     * confirmSurvival(index) calls on CONDITIONAL_SURVIVAL vaults.
     */
    List<Beneficiary> findByConfigIdOrderByPosition(UUID configId);

    /**
     * Alias for {@link #findByConfigIdOrderByPosition} — Spring Data derives the query
     * from the method name, so both variants produce identical SQL.
     * Kept for callers that use the older "Index" naming convention.
     */
    default List<Beneficiary> findByConfigIdOrderByIndex(UUID configId) {
        return findByConfigIdOrderByPosition(configId);
    }
}