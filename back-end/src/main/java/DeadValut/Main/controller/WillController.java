// controller/WillController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.UpdateWillResponse;
import DeadValut.Main.model.WillRequest;
import DeadValut.Main.model.WillResponse;
import DeadValut.Main.service.UpdateWillService;
import DeadValut.Main.service.WillService;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class WillController {

    private final WillService willService;
    private final UpdateWillService updateWillService;

    public WillController(WillService willService, UpdateWillService updateWillService) {
        this.willService = willService;
        this.updateWillService = updateWillService;
    }

    public WillResponse submitWill(UUID userId, WillRequest request) {
        return willService.submitWill(userId, request.willText());
    }

    public UpdateWillResponse updateWill(UUID userId, WillRequest request) {
        return updateWillService.updateWill(userId, request.willText());
    }
}