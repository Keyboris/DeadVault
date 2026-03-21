// config/QuartzConfig.java
package DeadValut.Main.config;

import DeadValut.Main.scheduler.CheckInPollerJob;
import DeadValut.Main.scheduler.GracePeriodWatcherJob;
import org.quartz.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class QuartzConfig {

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
}   