// model/WillRequest.java
package DeadValut.Main.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WillRequest(
        @NotBlank(message = "willText is required")
        @Size(min = 10, max = 2000, message = "willText must be between 10 and 2000 characters")
        String willText
) {}