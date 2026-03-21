// route/CheckInRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.CheckInController;
import DeadValut.Main.model.CheckInResponse;
import DeadValut.Main.model.CheckInStatusResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/check-in")
public class CheckInRoute {

    private final CheckInController checkInController;

    public CheckInRoute(CheckInController checkInController) {
        this.checkInController = checkInController;
    }

    @PostMapping
    public ResponseEntity<CheckInResponse> checkIn(@AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(checkInController.checkIn(userId));
    }

    @GetMapping("/status")
    public ResponseEntity<CheckInStatusResponse> status(@AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(checkInController.status(userId));
    }
}