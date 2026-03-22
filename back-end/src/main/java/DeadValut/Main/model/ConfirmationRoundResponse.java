package DeadValut.Main.model;
 
import java.time.Instant;
import java.util.UUID;
 
/**
 * Returned by GET /api/keyholders/confirmation-round and POST /api/keyholders/confirm.
 * Gives keyholders (and the frontend) visibility into the current vote state.
 */
public record ConfirmationRoundResponse(
        UUID    roundId,
        UUID    userId,
        String  status,               // PENDING | APPROVED | REJECTED | EXPIRED
        int     thresholdRequired,
        int     confirmationsReceived,
        Instant expiresAt,
        Instant createdAt
) {}
 