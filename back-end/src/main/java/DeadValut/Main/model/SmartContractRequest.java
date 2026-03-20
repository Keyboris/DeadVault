package DeadValut.Main.model;

import jakarta.validation.constraints.NotBlank;

public record SmartContractRequest(
        @NotBlank(message = "prompt is required")
        String prompt
) {
}