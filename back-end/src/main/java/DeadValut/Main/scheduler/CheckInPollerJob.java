// scheduler/CheckInPollerJob.java
package DeadValut.Main.scheduler;

import DeadValut.Main.model.SwitchEvent;
import DeadValut.Main.repository.CheckInConfigRepository;
import DeadValut.Main.repository.SwitchEventRepository;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Component
public class CheckInPollerJob implements Job {

    private final CheckInConfigRepository configRepo;
    private final SwitchEventRepository eventRepo;

    public CheckInPollerJob(CheckInConfigRepository configRepo, SwitchEventRepository eventRepo) {
        this.configRepo = configRepo;
        this.eventRepo = eventRepo;
    }

    @Override
    public void execute(JobExecutionContext context) {
        configRepo.findMissedCheckIns(Instant.now()).forEach(config -> {
            config.setStatus("GRACE");
            config.setGraceExpiresAt(
                Instant.now().plus(config.getGracePeriodDays(), ChronoUnit.DAYS)
            );
            configRepo.save(config);
            eventRepo.save(SwitchEvent.of(config.getUserId(), "GRACE_STARTED", null));
        });
    }
}