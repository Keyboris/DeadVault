// service/CheckInService.java
package DeadValut.Main.service;

import DeadValut.Main.model.*;
import DeadValut.Main.repository.CheckInConfigRepository;
import DeadValut.Main.repository.SwitchEventRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class CheckInService {

    private static final int DEFAULT_INTERVAL_DAYS = 30;
    private static final int DEFAULT_GRACE_DAYS = 7;
    private static final String ACTIVE_STATUS = "ACTIVE";

    private final CheckInConfigRepository configRepo;
    private final SwitchEventRepository   eventRepo;

    public CheckInService(CheckInConfigRepository configRepo,
                          SwitchEventRepository eventRepo) {
        this.configRepo = configRepo;
        this.eventRepo  = eventRepo;
    }

    @Transactional
    public CheckInResponse recordCheckIn(UUID userId) {
        CheckInConfig config = resolveConfig(userId);

        int intervalDays = config.getIntervalDays() > 0 ? config.getIntervalDays() : DEFAULT_INTERVAL_DAYS;
        if (config.getIntervalDays() <= 0) {
            config.setIntervalDays(intervalDays);
        }
        if (config.getGracePeriodDays() <= 0) {
            config.setGracePeriodDays(DEFAULT_GRACE_DAYS);
        }

        config.setLastCheckInAt(Instant.now());
        config.setNextDueAt(Instant.now().plus(intervalDays, ChronoUnit.DAYS));
        config.setGraceExpiresAt(null);
        config.setStatus(ACTIVE_STATUS);
        configRepo.save(config);

        try {
            eventRepo.save(SwitchEvent.of(userId, "CHECK_IN", null));
        } catch (Exception ignored) {
            // Event logging must not fail the user-facing check-in action.
        }
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
        CheckInConfig config = resolveConfig(userId);

        boolean needsSave = false;
        int intervalDays = config.getIntervalDays() > 0 ? config.getIntervalDays() : DEFAULT_INTERVAL_DAYS;
        if (config.getIntervalDays() <= 0) {
            config.setIntervalDays(intervalDays);
            needsSave = true;
        }
        if (config.getGracePeriodDays() <= 0) {
            config.setGracePeriodDays(DEFAULT_GRACE_DAYS);
            needsSave = true;
        }
        if (config.getNextDueAt() == null) {
            Instant anchor = config.getLastCheckInAt() != null ? config.getLastCheckInAt() : Instant.now();
            config.setNextDueAt(anchor.plus(intervalDays, ChronoUnit.DAYS));
            needsSave = true;
        }
        if (config.getStatus() == null || config.getStatus().isBlank()) {
            config.setStatus(ACTIVE_STATUS);
            needsSave = true;
        }
        if (needsSave) {
            configRepo.save(config);
        }

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

    private CheckInConfig resolveConfig(UUID userId) {
        return configRepo.findAllByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User has not submitted a will yet"
                ));
    }
}