// repository/CheckInConfigRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.CheckInConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CheckInConfigRepository extends JpaRepository<CheckInConfig, UUID> {

    Optional<CheckInConfig> findByUserId(UUID userId);

    /** Used by CheckInPollerJob — finds ACTIVE configs whose next_due_at has passed. */
    @Query("SELECT c FROM CheckInConfig c WHERE c.status = 'ACTIVE' AND c.nextDueAt < :now")
    List<CheckInConfig> findMissedCheckIns(@Param("now") Instant now);

    /** Used by GracePeriodWatcherJob — finds GRACE configs whose grace_expires_at has passed. */
    @Query("SELECT c FROM CheckInConfig c WHERE c.status = 'GRACE' AND c.graceExpiresAt < :now")
    List<CheckInConfig> findExpiredGracePeriods(@Param("now") Instant now);
}