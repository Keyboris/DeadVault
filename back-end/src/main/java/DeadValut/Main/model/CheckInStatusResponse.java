// model/CheckInStatusResponse.java
package DeadValut.Main.model;

import java.time.Instant;

public record CheckInStatusResponse(Instant nextDueAt, long daysRemaining, String status) {}