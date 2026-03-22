// config/QuartzConfig.java  (UPDATED — adds KeyholderExpiryJob trigger)
package DeadValut.Main.config;

import DeadValut.Main.scheduler.CheckInPollerJob;
import DeadValut.Main.scheduler.GracePeriodWatcherJob;
import DeadValut.Main.scheduler.KeyholderExpiryJob;
import org.quartz.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class QuartzConfig {

    // ── Existing jobs ──────────────────────────────────────────────────────

    @Bean
    public JobDetail checkInPollerDetail() {
        return JobBuilder.newJob(CheckInPollerJob.class)
            .withIdentity("checkInPoller").storeDurably().build();
    }

    @Bean
    public Trigger checkInPollerTrigger(JobDetail checkInPollerDetail) {
        return TriggerBuilder.newTrigger()
            .forJob(checkInPollerDetail)
            .withSchedule(CronScheduleBuilder.cronSchedule("0 0 * * * ?"))  // hourly
            .build();
    }

    @Bean
    public JobDetail graceWatcherDetail() {
        return JobBuilder.newJob(GracePeriodWatcherJob.class)
            .withIdentity("graceWatcher").storeDurably().build();
    }

    @Bean
    public Trigger graceWatcherTrigger(JobDetail graceWatcherDetail) {
        return TriggerBuilder.newTrigger()
            .forJob(graceWatcherDetail)
            .withSchedule(CronScheduleBuilder.cronSchedule("0 */15 * * * ?"))  // every 15 min
            .build();
    }

    // ── New: keyholder confirmation-round expiry sweep ─────────────────────

    /**
     * Sweeps for PENDING confirmation rounds whose expiry timestamp has passed
     * and triggers the vault on their behalf (owner unresponsive, keyholders
     * did not gather enough votes in time).
     * Runs every 30 minutes — less frequent than the grace watcher because
     * rounds have a 72-hour TTL, so minute-level precision is unnecessary.
     */
    @Bean
    public JobDetail keyholderExpiryDetail() {
        return JobBuilder.newJob(KeyholderExpiryJob.class)
            .withIdentity("keyholderExpiryJob").storeDurably().build();
    }

    @Bean
    public Trigger keyholderExpiryTrigger(JobDetail keyholderExpiryDetail) {
        return TriggerBuilder.newTrigger()
            .forJob(keyholderExpiryDetail)
            .withSchedule(CronScheduleBuilder.cronSchedule("0 */30 * * * ?"))  // every 30 min
            .build();
    }
}