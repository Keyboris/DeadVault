// scheduler/KeyholderExpiryJob.java
package DeadValut.Main.scheduler;

import DeadValut.Main.model.KeyholderConfirmationRound;
import DeadValut.Main.repository.KeyholderConfirmationRoundRepository;
import DeadValut.Main.service.ConfirmationService;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/**
 * Quartz job that runs every 30 minutes and sweeps for PENDING confirmation
 * rounds whose {@code expiresAt} timestamp has passed.
 *
 * <p>Policy: if keyholders failed to reach the threshold in time, we trigger
 * the vault anyway. The owner has been unreachable for the full grace period
 * PLUS the round TTL (72 h), which is ample time for a human response.</p>
 *
 * <p>Registered in {@link QuartzConfig}.</p>
 */
@Component
public class KeyholderExpiryJob implements Job {

    private static final Logger log = LoggerFactory.getLogger(KeyholderExpiryJob.class);

    private final KeyholderConfirmationRoundRepository roundRepo;
    private final ConfirmationService confirmationService;

    public KeyholderExpiryJob(KeyholderConfirmationRoundRepository roundRepo,
                               ConfirmationService confirmationService) {
        this.roundRepo = roundRepo;
        this.confirmationService = confirmationService;
    }

    @Override
    public void execute(JobExecutionContext context) {
        List<KeyholderConfirmationRound> expired =
                roundRepo.findExpiredPendingRounds(Instant.now());

        if (expired.isEmpty()) return;

        log.info("KeyholderExpiryJob: {} expired round(s) found", expired.size());

        expired.forEach(round -> {
            try {
                confirmationService.expireRound(round);
            } catch (Exception e) {
                log.error("Failed to expire round {} for user {}: {}",
                        round.getId(), round.getUserId(), e.getMessage());
            }
        });
    }
}