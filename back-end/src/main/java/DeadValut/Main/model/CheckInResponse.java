// model/CheckInResponse.java
package DeadValut.Main.model;

import java.time.Instant;

public record CheckInResponse(Instant nextDueAt, int intervalDays) {}