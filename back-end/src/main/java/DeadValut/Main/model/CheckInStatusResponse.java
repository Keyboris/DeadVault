// model/CheckInStatusResponse.java
package DeadValut.Main.model;

import java.time.Instant;

/**
 * Returned by GET /api/check-in/status.
 *
 * Frontend countdown clock usage:
 *
 *   totalSeconds   = intervalDays * 86_400
 *   elapsedSeconds = now - lastCheckInAt (epoch seconds)
 *   progress %     = elapsedSeconds / totalSeconds * 100
 *   countdown      = secondsRemaining → format as DD:HH:MM:SS
 *
 * The clock turns orange when secondsRemaining < gracePeriodDays * 86_400,
 * and red when status == "GRACE".
 */
public record CheckInStatusResponse(
        Instant lastCheckInAt,    // epoch instant the current interval started — clock start
        Instant nextDueAt,        // epoch instant the interval expires — countdown target
        long    secondsRemaining, // precise seconds until nextDueAt (negative if overdue)
        int     intervalDays,     // total interval length in days — for progress ring denominator
        int     gracePeriodDays,  // grace window after missing — frontend shows warning threshold
        String  status            // ACTIVE | GRACE | TRIGGERED | REVOKED
) {}