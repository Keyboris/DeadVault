// service/CheckInService.java
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
    private final SwitchEventRepository eventRepo;

    public CheckInService(CheckInConfigRepository configRepo, SwitchEventRepository eventRepo) {
        this.configRepo = configRepo;
        this.eventRepo = eventRepo;
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

        eventRepo.save(SwitchEvent.of(userId, "CHECK_IN", null));
        return new CheckInResponse(config.getNextDueAt(), config.getIntervalDays());
    }

    public CheckInStatusResponse getStatus(UUID userId) {
        CheckInConfig config = configRepo.findByUserId(userId)
            .orElseThrow(() -> new RuntimeException("No config found"));
        long daysLeft = Instant.now().until(config.getNextDueAt(), ChronoUnit.DAYS);
        return new CheckInStatusResponse(config.getNextDueAt(), daysLeft, config.getStatus());
    }
}