// model/VerifyRequest.java
package DeadValut.Main.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record VerifyRequest(
        @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{40}$", message = "Invalid wallet address")
        String walletAddress,

        @NotBlank
        String nonce,

        @NotBlank @Size(min = 130, max = 134, message = "Invalid Ethereum signature length")
        String signature
) {}