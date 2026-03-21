// route/AuthRoute.java
package DeadValut.Main.route;

import DeadValut.Main.controller.AuthController;
import DeadValut.Main.model.NonceResponse;
import DeadValut.Main.model.TokenResponse;
import DeadValut.Main.model.VerifyRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthRoute {

    private final AuthController authController;

    public AuthRoute(AuthController authController) {
        this.authController = authController;
    }

    @GetMapping("/nonce")
    public ResponseEntity<NonceResponse> nonce(@RequestParam String walletAddress) {
        return ResponseEntity.ok(authController.nonce(walletAddress));
    }

    @PostMapping("/verify")
    public ResponseEntity<TokenResponse> verify(@Valid @RequestBody VerifyRequest request) {
        return ResponseEntity.ok(authController.verify(request));
    }
}