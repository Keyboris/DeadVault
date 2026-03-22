// model/AddKeyholderRequest.java
package DeadValut.Main.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/keyholders}.
 * Adds one secondary keyholder to the authenticated user's account.
 */
public record AddKeyholderRequest(

        @NotBlank(message = "walletAddress is required")
        @Pattern(regexp = "^0x[0-9a-fA-F]{40}$",
                 message = "walletAddress must be a valid Ethereum address")
        String walletAddress,

        @Size(max = 255, message = "label must be 255 characters or fewer")
        String label,

        @Size(max = 255, message = "email must be 255 characters or fewer")
        String email
) {}