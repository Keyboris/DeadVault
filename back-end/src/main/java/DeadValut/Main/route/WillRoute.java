// route/WillRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.WillController;
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

    /**
     * POST /api/will
     *
     * Accepts a plain-English will from the frontend (already packaged as JSON by the client).
     * Runs the full pipeline: LangChain4j intent extraction → DMSVault deployment on Base.
     * Returns the deployed vault address and extracted beneficiary list.
     *
     * Request body (sent by frontend):
     * {
     *   "willText": "Give 70% to my wife Alice (0xABC...) and 30% to my son Jack (0xDEF...)"
     * }
     */
    @PostMapping
    public ResponseEntity<WillResponse> submitWill(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody WillRequest request) {
        return ResponseEntity.ok(willController.submitWill(userId, request));
    }
}