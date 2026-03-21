// route/WillRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.WillController;
import DeadValut.Main.model.UpdateWillResponse;
import DeadValut.Main.model.WillRequest;
import DeadValut.Main.model.WillResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/will")
public class WillRoute {

    private final WillController willController;

    public WillRoute(WillController willController) {
        this.willController = willController;
    }

    @PostMapping
    public ResponseEntity<WillResponse> submitWill(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody WillRequest request) {
        return ResponseEntity.ok(willController.submitWill(userId, request));
    }

    @PutMapping
    public ResponseEntity<UpdateWillResponse> updateWill(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody WillRequest request) {
        return ResponseEntity.ok(willController.updateWill(userId, request));
    }
}