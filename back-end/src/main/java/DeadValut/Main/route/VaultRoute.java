package DeadValut.Main.route;

import DeadValut.Main.controller.VaultController;
import DeadValut.Main.model.VaultBalanceResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/vault")
public class VaultRoute {

    private final VaultController vaultController;

    public VaultRoute(VaultController vaultController) {
        this.vaultController = vaultController;
    }

    @GetMapping("/balance")
    public ResponseEntity<VaultBalanceResponse> balance(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(name = "tokens", required = false) List<String> tokens
    ) {
        return ResponseEntity.ok(vaultController.getBalance(userId, tokens));
    }
}