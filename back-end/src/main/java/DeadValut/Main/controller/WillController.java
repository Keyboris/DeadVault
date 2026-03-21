// controller/WillController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.WillRequest;
import DeadValut.Main.model.WillResponse;
import DeadValut.Main.service.WillService;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class WillController {

    private final WillService willService;

    public WillController(WillService willService) {
        this.willService = willService;
    }

    public WillResponse submitWill(UUID userId, WillRequest request) {
        return willService.submitWill(userId, request.willText());
    }
}