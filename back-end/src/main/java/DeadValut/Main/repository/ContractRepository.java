// repository/ContractRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.Contract;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContractRepository extends JpaRepository<Contract, UUID> {

    /** Returns the single ACTIVE (or TRIGGERING) vault for a user. */
    Optional<Contract> findByUserId(UUID userId);

    /** Returns ALL contracts for a user across all statuses — used by ContractQueryService. */
    List<Contract> findAllByUserId(UUID userId);

    /**
     * Returns all contracts for a user whose status is NOT the given value.
     * Typical call: findAllByUserIdAndStatusNot(userId, "REVOKED") to exclude old vaults.
     */
    List<Contract> findAllByUserIdAndStatusNot(UUID userId, String status);

    @Modifying
    @Transactional
    @Query("UPDATE Contract c SET c.status = 'TRIGGERING' " +
           "WHERE c.userId = :userId AND c.status = 'ACTIVE'")
    int setStatusIfActive(@Param("userId") UUID userId);

    @Modifying
    @Transactional
    @Query("UPDATE Contract c SET c.status = :status " +
           "WHERE c.userId = :userId AND c.status = 'TRIGGERING'")
    int setStatusIfTriggering(@Param("userId") UUID userId, @Param("status") String status);

    @Modifying
    @Transactional
    @Query("UPDATE Contract c SET c.status = 'TRIGGERED', c.triggeredAt = :triggeredAt " +
           "WHERE c.userId = :userId")
    void setTriggered(@Param("userId") UUID userId,
                      @Param("triggeredAt") Instant triggeredAt);

    default void setTriggered(UUID userId, String txHash, Instant triggeredAt) {
        setTriggered(userId, triggeredAt);
    }
}