// service/CheckInService.java  (UPDATED — cancels pending keyholder rounds on check-in)
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.CheckInConfigRepository;
import DeadValut.Main.repository.SwitchEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class CheckInService {

    private final CheckInConfigRepository configRepo;
    private final SwitchEventRepository   eventRepo;
    private final ConfirmationService     confirmationService;

    public CheckInService(CheckInConfigRepository configRepo,
                          SwitchEventRepository eventRepo,
                          ConfirmationService confirmationService) {
        this.configRepo          = configRepo;
        this.eventRepo           = eventRepo;
        this.confirmationService = confirmationService;
    }

    @Transactional
    public CheckInResponse recordCheckIn(UUID userId) {
        CheckInConfig config = configRepo.findByUserId(userId)
            .orElseThrow(() -> new RuntimeException("No check-in config for user"));

        config.setLastCheckInAt(Instant.now());
        config.setNextDueAt(Instant.now().plus(config.getIntervalDays(), ChronoUnit.DAYS));
        config.setGraceExpiresAt(null);
        config.setStatus("ACTIVE");
        configRepo.save(config);

        // If a keyholder confirmation round is pending (owner missed a check-in but
        // now came back), cancel it so the vault is NOT triggered.
        confirmationService.cancelPendingRounds(userId);

        eventRepo.save(SwitchEvent.of(userId, "CHECK_IN", null));
        return new CheckInResponse(config.getNextDueAt(), config.getIntervalDays());
    }

    /**
     * Returns the full status needed by the frontend countdown clock.
     *
     *   lastCheckInAt   → clock starts here
     *   nextDueAt       → clock expires here
     *   secondsRemaining → precise countdown (negative = overdue)
     *   intervalDays    → total period length for the progress ring
     *   gracePeriodDays → warn threshold — clock turns orange below this
     *   status          → ACTIVE | GRACE | TRIGGERED | REVOKED
     */
    public CheckInStatusResponse getStatus(UUID userId) {
        CheckInConfig config = configRepo.findByUserId(userId)
            .orElseThrow(() -> new RuntimeException("No check-in config found for user"));

        long secondsRemaining = ChronoUnit.SECONDS.between(Instant.now(), config.getNextDueAt());

        return new CheckInStatusResponse(
                config.getLastCheckInAt(),
                config.getNextDueAt(),
                secondsRemaining,
                config.getIntervalDays(),
                config.getGracePeriodDays(),
                config.getStatus()
        );
    }
}