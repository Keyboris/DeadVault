// controller/CheckInController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.CheckInResponse;
import DeadValut.Main.model.CheckInStatusResponse;
import DeadValut.Main.service.CheckInService;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class CheckInController {

    private final CheckInService checkInService;

    public CheckInController(CheckInService checkInService) {
        this.checkInService = checkInService;
    }

    public CheckInResponse checkIn(UUID userId) {
        return checkInService.recordCheckIn(userId);
    }

    public CheckInStatusResponse status(UUID userId) {
        return checkInService.getStatus(userId);
    }
}