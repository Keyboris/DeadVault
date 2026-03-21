package DeadValut.Main.model;

import java.util.List;

public record VaultBalanceResponse(
        String contractAddress,
        String ethBalanceWei,
        String ethBalanceEther,
        List<TokenBalance> tokens
) {
}