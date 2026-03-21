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
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContractRepository extends JpaRepository<Contract, UUID> {

    Optional<Contract> findByUserId(UUID userId);

    /**
     * Optimistic lock — atomically flips ACTIVE → TRIGGERING for exactly one row.
     * Returns 1 if the update happened (safe to proceed), 0 if already TRIGGERING/TRIGGERED
     * (another scheduler node got there first — skip this user).
     */
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

    /**
     * Overload used by GracePeriodWatcherJob which also passes the trigger tx hash.
     * The tx hash is recorded in switch_events metadata rather than the contracts table
     * (the schema stores it in switch_events.metadata JSONB), so this just delegates.
     */
    default void setTriggered(UUID userId, String txHash, Instant triggeredAt) {
        setTriggered(userId, triggeredAt);
    }
}