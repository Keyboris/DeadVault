package DeadValut.Main.model;

public record TokenBalance(
        String tokenAddress,
        String symbol,
        String balanceRaw,
        String balanceFormatted,
        int decimals
) {
}