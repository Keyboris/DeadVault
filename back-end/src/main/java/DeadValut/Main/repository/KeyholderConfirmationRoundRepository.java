// repository/KeyholderConfirmationRoundRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.KeyholderConfirmationRound;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface KeyholderConfirmationRoundRepository
        extends JpaRepository<KeyholderConfirmationRound, UUID> {

    /** Latest PENDING round for a user, if any. */
    Optional<KeyholderConfirmationRound> findTopByUserIdAndStatusOrderByCreatedAtDesc(
            UUID userId, KeyholderConfirmationRound.Status status);

    /** All PENDING rounds whose expiry has passed — for the expiry sweep job. */
    @Query("SELECT r FROM KeyholderConfirmationRound r " +
           "WHERE r.status = 'PENDING' AND r.expiresAt < :now")
    List<KeyholderConfirmationRound> findExpiredPendingRounds(@Param("now") Instant now);

    /** Cancel all PENDING rounds for a user (e.g. when the owner checks back in). */
    @Query("SELECT r FROM KeyholderConfirmationRound r " +
           "WHERE r.userId = :userId AND r.status = 'PENDING'")
    List<KeyholderConfirmationRound> findPendingRoundsByUserId(@Param("userId") UUID userId);
}