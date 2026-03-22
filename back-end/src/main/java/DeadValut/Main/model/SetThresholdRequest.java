// model/SetThresholdRequest.java
package DeadValut.Main.model;

import jakarta.validation.constraints.Min;

/**
 * Request body for {@code PUT /api/keyholders/threshold}.
 * Sets how many keyholder approvals are required before the vault triggers.
 * A value of 0 disables the feature (legacy behaviour — trigger fires immediately).
 */
public record SetThresholdRequest(
        @Min(value = 0, message = "threshold must be 0 or greater")
        int threshold
) {}