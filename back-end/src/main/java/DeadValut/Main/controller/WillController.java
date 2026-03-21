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

    public WillController(WillService willService,
                          UpdateWillService updateWillService) {
        this.willService       = willService;
        this.updateWillService = updateWillService;
    }

    public WillResponse submitWill(UUID userId, WillRequest request) {
        return willService.submitWill(userId, request.willText());
    }

    /**
     * BUG-4 FIX: UpdateWillService was fully implemented but this controller had no
     * corresponding method, making the service unreachable over HTTP.
     * Revokes the user's current ACTIVE vault on-chain, re-extracts intent from the
     * new will text, deploys a replacement vault, and returns both the old and new
     * contract addresses so the frontend can display them to the user.
     */
    public UpdateWillResponse updateWill(UUID userId, WillRequest request) {
        return updateWillService.updateWill(userId, request.willText());
    }
}