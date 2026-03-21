package DeadValut.Main.service;

import DeadValut.Main.model.Contract;
import DeadValut.Main.model.TokenBalance;
import DeadValut.Main.model.VaultBalanceResponse;
import DeadValut.Main.repository.ContractRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.Utf8String;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.http.HttpService;
import org.web3j.utils.Convert;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
public class VaultBalanceService {

    private final ContractRepository contractRepository;

    @Value("${dms.blockchain.rpc-url}")
    private String rpcUrl;

    public VaultBalanceService(ContractRepository contractRepository) {
        this.contractRepository = contractRepository;
    }

    public VaultBalanceResponse getVaultBalance(UUID userId, List<String> tokenAddresses) {
        Contract contract = contractRepository.findByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No vault found — submit a will first"
                ));

        try (Web3j web3j = Web3j.build(new HttpService(rpcUrl))) {
            BigInteger ethWei = web3j.ethGetBalance(contract.getContractAddress(), DefaultBlockParameterName.LATEST)
                    .send()
                    .getBalance();

            List<String> safeTokenAddresses = tokenAddresses == null
                    ? Collections.emptyList()
                    : tokenAddresses;
            List<TokenBalance> tokenBalances = new ArrayList<>();

            for (String tokenAddress : safeTokenAddresses) {
                tokenBalances.add(readTokenBalance(web3j, tokenAddress, contract.getContractAddress()));
            }

            return new VaultBalanceResponse(
                    contract.getContractAddress(),
                    ethWei.toString(),
                    formatEth(ethWei),
                    tokenBalances
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Base RPC error", e);
        }
    }

    private TokenBalance readTokenBalance(Web3j web3j, String tokenAddress, String vaultAddress) {
        int decimals = readDecimals(web3j, tokenAddress);
        String symbol = readSymbol(web3j, tokenAddress);
        BigInteger rawBalance = readErc20Balance(web3j, tokenAddress, vaultAddress);

        BigDecimal scaled = new BigDecimal(rawBalance);
        BigDecimal divisor = BigDecimal.TEN.pow(Math.max(decimals, 0));
        String formatted = divisor.compareTo(BigDecimal.ZERO) > 0
                ? scaled.divide(divisor, Math.min(Math.max(decimals, 0), 8), RoundingMode.DOWN)
                    .stripTrailingZeros()
                    .toPlainString()
                : scaled.toPlainString();

        return new TokenBalance(
                tokenAddress,
                symbol,
                rawBalance.toString(),
                formatted,
                decimals
        );
    }

    private int readDecimals(Web3j web3j, String tokenAddress) {
        try {
            Function fn = new Function(
                    "decimals",
                    List.of(),
                    List.of(new TypeReference<Uint8>() {})
            );
            List<Type> decoded = callFunction(web3j, tokenAddress, fn);
            if (decoded.isEmpty()) {
                return 18;
            }
            Uint8 value = (Uint8) decoded.get(0);
            return value.getValue().intValue();
        } catch (Exception ignored) {
            return 18;
        }
    }

    private String readSymbol(Web3j web3j, String tokenAddress) {
        try {
            Function fn = new Function(
                    "symbol",
                    List.of(),
                    List.of(new TypeReference<Utf8String>() {})
            );
            List<Type> decoded = callFunction(web3j, tokenAddress, fn);
            if (decoded.isEmpty()) {
                return "UNKNOWN";
            }
            Utf8String value = (Utf8String) decoded.get(0);
            return value.getValue();
        } catch (Exception ignored) {
            return "UNKNOWN";
        }
    }

    private BigInteger readErc20Balance(Web3j web3j, String tokenAddress, String vaultAddress) {
        try {
            Function fn = new Function(
                    "balanceOf",
                    List.of(new Address(vaultAddress)),
                    List.of(new TypeReference<Uint256>() {})
            );
            List<Type> decoded = callFunction(web3j, tokenAddress, fn);
            if (decoded.isEmpty()) {
                return BigInteger.ZERO;
            }
            Uint256 value = (Uint256) decoded.get(0);
            return value.getValue();
        } catch (Exception ignored) {
            return BigInteger.ZERO;
        }
    }

    private List<Type> callFunction(Web3j web3j, String contractAddress, Function function) throws Exception {
        String encoded = FunctionEncoder.encode(function);
        Transaction tx = Transaction.createEthCallTransaction(null, contractAddress, encoded);
        EthCall response = web3j.ethCall(tx, DefaultBlockParameterName.LATEST).send();
        if (response.hasError()) {
            throw new IllegalStateException(response.getError().getMessage());
        }
        return FunctionReturnDecoder.decode(response.getValue(), function.getOutputParameters());
    }

    private String formatEth(BigInteger wei) {
        BigDecimal eth = Convert.fromWei(new BigDecimal(wei), Convert.Unit.ETHER);
        BigDecimal rounded = eth.setScale(6, RoundingMode.DOWN).stripTrailingZeros();
        return rounded.compareTo(BigDecimal.ZERO) == 0 ? "0" : rounded.toPlainString();
    }
}