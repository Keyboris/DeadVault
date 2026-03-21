package DeadValut.Main.controller;

import DeadValut.Main.model.VaultBalanceResponse;
import DeadValut.Main.service.VaultBalanceService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class VaultController {

    private final VaultBalanceService vaultBalanceService;

    public VaultController(VaultBalanceService vaultBalanceService) {
        this.vaultBalanceService = vaultBalanceService;
    }

    public VaultBalanceResponse getBalance(UUID userId, List<String> tokens) {
        return vaultBalanceService.getVaultBalance(userId, tokens);
    }
}