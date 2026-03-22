// model/KeyholderResponse.java
package DeadValut.Main.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Returned by GET /api/keyholders and POST /api/keyholders.
 */
public record KeyholderResponse(
        UUID    id,
        String  walletAddress,
        String  label,
        String  email,
        Instant addedAt
) {}