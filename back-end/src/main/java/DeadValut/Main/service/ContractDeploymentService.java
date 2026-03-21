// service/ContractDeploymentService.java
package DeadValut.Main.service;

import DeadValut.Main.model.VaultDeploymentParams;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.web3j.abi.*;
import org.web3j.abi.datatypes.*;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.*;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.response.*;
import org.web3j.protocol.http.HttpService;
import org.web3j.tx.response.PollingTransactionReceiptProcessor;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class ContractDeploymentService {

    @Value("${dms.blockchain.rpc-url}")
    private String rpcUrl;

    @Value("${dms.blockchain.hot-wallet-key}")
    private String privateKey;

    @Value("${dms.blockchain.factory-address}")
    private String factoryAddress;

    @Value("${dms.blockchain.chain-id}")
    private long chainId;

    @Value("${dms.blockchain.gas-limit}")
    private long gasLimit;

    public record DeployResult(String contractAddress, String txHash, String vaultType) {}

    /**
     * keccak256("VaultCreated(address,address,uint8)")
     * Matches DMSFactory.sol: event VaultCreated(address indexed owner, address vault, uint8 vaultType)
     *
     * Computed via: keccak256(b"VaultCreated(address,address,uint8)")
     * = 0xfa5335ec676e96a8eab960528adfb9405f779bd833ec5ef6b4a6c15392666f8d
     */
    private static final String VAULT_CREATED_TOPIC =
        "0xfa5335ec676e96a8eab960528adfb9405f779bd833ec5ef6b4a6c15392666f8d";

    /**
     * Deploys the correct vault contract based on the type of {@link VaultDeploymentParams}
     * passed in. Delegates to the matching DMSFactory method:
     *
     *   Standard      → DMSFactory.createVault(owner, wallets, basisPoints)
     *   TimeLocked    → DMSFactory.createTimeLockVault(owner, unlockTime, wallets, basisPoints)
     *   Conditional   → DMSFactory.createConditionalVault(owner, wallets, basisPoints, mustSurvive)
     *
     * @param userWalletAddress  User's wallet — stored as DMSVault.owner, enabling revoke()
     *                           without any backend involvement.
     * @param params             Typed deployment parameters from VaultTypeRouter.
     */
    public DeployResult deployVault(
            String userWalletAddress,
            VaultDeploymentParams params
    ) throws Exception {

        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);

        String encodedData;
        String vaultTypeName;

        if (params instanceof VaultDeploymentParams.Standard s) {
            encodedData  = encodeCreateVault(userWalletAddress, s.wallets(), s.basisPoints());
            vaultTypeName = "STANDARD";

        } else if (params instanceof VaultDeploymentParams.TimeLocked tl) {
            long unlockTimestamp = Instant.now()
                .plus(tl.timeLockDays(), ChronoUnit.DAYS)
                .getEpochSecond();
            encodedData  = encodeCreateTimeLockVault(userWalletAddress, unlockTimestamp,
                                                     tl.wallets(), tl.basisPoints());
            vaultTypeName = "TIME_LOCKED";

        } else if (params instanceof VaultDeploymentParams.Conditional c) {
            encodedData  = encodeCreateConditionalVault(userWalletAddress,
                                                        c.wallets(), c.basisPoints(),
                                                        c.mustSurviveOwner());
            vaultTypeName = "CONDITIONAL_SURVIVAL";

        } else {
            throw new IllegalArgumentException("Unknown VaultDeploymentParams type: " + params.getClass());
        }

        TransactionReceipt receipt = sendTransaction(web3j, creds, factoryAddress, encodedData);
        return new DeployResult(extractVaultAddress(receipt), receipt.getTransactionHash(), vaultTypeName);
    }

    // ── ABI encoding helpers ──────────────────────────────────────────────────────────────────────

    private String encodeCreateVault(String owner, List<String> wallets, List<Integer> bps) {
        Function fn = new Function(
            "createVault",
            List.of(
                new Address(owner),
                new DynamicArray<>(Address.class, toAddressList(wallets)),
                new DynamicArray<>(Uint16.class, toBpList(bps))
            ),
            List.of(new TypeReference<Address>() {})
        );
        return FunctionEncoder.encode(fn);
    }

    private String encodeCreateTimeLockVault(String owner, long unlockTimestamp,
                                             List<String> wallets, List<Integer> bps) {
        Function fn = new Function(
            "createTimeLockVault",
            List.of(
                new Address(owner),
                new Uint256(BigInteger.valueOf(unlockTimestamp)),
                new DynamicArray<>(Address.class, toAddressList(wallets)),
                new DynamicArray<>(Uint16.class, toBpList(bps))
            ),
            List.of(new TypeReference<Address>() {})
        );
        return FunctionEncoder.encode(fn);
    }

    private String encodeCreateConditionalVault(String owner, List<String> wallets,
                                                List<Integer> bps, List<Boolean> mustSurvive) {
        Function fn = new Function(
            "createConditionalVault",
            List.of(
                new Address(owner),
                new DynamicArray<>(Address.class, toAddressList(wallets)),
                new DynamicArray<>(Uint16.class, toBpList(bps)),
                new DynamicArray<>(Bool.class,
                    mustSurvive.stream().map(Bool::new).toList())
            ),
            List.of(new TypeReference<Address>() {})
        );
        return FunctionEncoder.encode(fn);
    }

    // ── Shared tx sender + helpers ────────────────────────────────────────────────────────────────

    private TransactionReceipt sendTransaction(Web3j web3j, Credentials creds,
                                               String to, String data) throws Exception {
        BigInteger nonce = web3j.ethGetTransactionCount(
            creds.getAddress(), DefaultBlockParameterName.LATEST
        ).send().getTransactionCount();

        // EIP-1559 fee estimation — Base base fees are typically <0.01 gwei
        EthFeeHistory feeHistory = web3j.ethFeeHistory(
            4, DefaultBlockParameterName.LATEST, List.of(50.0)
        ).send();
        BigInteger baseFee = feeHistory.getFeeHistory().getBaseFeePerGas().getLast();
        BigInteger priorityFee = BigInteger.valueOf(1_000_000L);  // 0.001 gwei tip
        BigInteger maxFee      = baseFee.multiply(BigInteger.TWO).add(priorityFee);

        RawTransaction tx = RawTransaction.createTransaction(
            chainId, nonce, BigInteger.valueOf(gasLimit),
            to, BigInteger.ZERO, data, priorityFee, maxFee
        );

        byte[] signed = TransactionEncoder.signMessage(tx, chainId, creds);
        EthSendTransaction sent = web3j.ethSendRawTransaction(Numeric.toHexString(signed)).send();

        if (sent.hasError()) {
            throw new RuntimeException("Factory call failed: " + sent.getError().getMessage());
        }

        PollingTransactionReceiptProcessor processor =
            new PollingTransactionReceiptProcessor(web3j, 2_000, 30);
        return processor.waitForTransactionReceipt(sent.getTransactionHash());
    }

    private List<Address> toAddressList(List<String> wallets) {
        return wallets.stream().map(Address::new).toList();
    }

    private List<Uint16> toBpList(List<Integer> bps) {
        return bps.stream().map(bp -> new Uint16(bp.longValue())).toList();
    }

    // ── Trigger methods — called by GracePeriodWatcherJob ───────────────────────────────────────────

    /**
     * Calls trigger() on a STANDARD or TIME_LOCKED vault.
     */
    public String triggerVault(String contractAddress) throws Exception {
        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);
        String data = FunctionEncoder.encode(new Function("trigger", List.of(), List.of()));
        TransactionReceipt receipt = sendTransaction(web3j, creds, contractAddress, data);
        return receipt.getTransactionHash();
    }

    /**
     * Calls revoke() on the vault.
     */
    public String revokeVault(String contractAddress) throws Exception {
        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);
        String data = FunctionEncoder.encode(new Function("revoke", List.of(), List.of()));
        TransactionReceipt receipt = sendTransaction(web3j, creds, contractAddress, data);
        return receipt.getTransactionHash();
    }

    /**
     * Executes the full CONDITIONAL_SURVIVAL trigger sequence.
     */
    public String triggerConditionalVault(String contractAddress,
                                          List<Integer> conditionalIndexes) throws Exception {
        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);

        String triggerData = FunctionEncoder.encode(
            new Function("trigger", List.of(), List.of()));
        TransactionReceipt triggerReceipt = sendTransaction(web3j, creds, contractAddress, triggerData);
        String txHash = triggerReceipt.getTransactionHash();

        for (int index : conditionalIndexes) {
            String confirmData = FunctionEncoder.encode(new Function(
                "confirmSurvival",
                List.of(new Uint256(BigInteger.valueOf(index))),
                List.of()
            ));
            sendTransaction(web3j, creds, contractAddress, confirmData);

            String releaseData = FunctionEncoder.encode(new Function(
                "releaseTo",
                List.of(new Uint256(BigInteger.valueOf(index))),
                List.of()
            ));
            sendTransaction(web3j, creds, contractAddress, releaseData);
        }

        return txHash;
    }

    /**
     * Parses VaultCreated(address indexed owner, address vault, uint8 vaultType) from receipt.
     *
     * Event layout:
     *   topics[0] = keccak256("VaultCreated(address,address,uint8)")
     *               = 0xfa5335ec676e96a8eab960528adfb9405f779bd833ec5ef6b4a6c15392666f8d
     *   topics[1] = owner (indexed, 32-byte padded address)
     *   data      = abi.encode(address vault, uint8 vaultType)
     *               = 32 bytes for vault address (12 zero bytes + 20 address bytes)
     *               + 32 bytes for vaultType uint8 (31 zero bytes + 1 type byte)
     *
     * The vault address occupies data bytes 0–31; the address itself is in the last 20 bytes
     * (i.e. data[12..31]), which is the final 40 hex chars of the first 64-char hex segment.
     */
    private String extractVaultAddress(TransactionReceipt receipt) {
        return receipt.getLogs().stream()
            .filter(log -> !log.getTopics().isEmpty()
                && log.getTopics().get(0).equalsIgnoreCase(VAULT_CREATED_TOPIC))
            .map(log -> {
                // data = "0x" + 128 hex chars (64 bytes: vault address + vaultType)
                // vault address is the first 32-byte ABI word → last 40 hex chars of first 64
                String data = log.getData();
                // Strip "0x", take first 64 hex chars (32 bytes), then last 40 = the address
                String firstWord = data.substring(2, 66); // 64 hex chars
                return "0x" + firstWord.substring(24);    // skip 24 hex chars (12 zero bytes)
            })
            .findFirst()
            .orElseThrow(() -> new RuntimeException(
                "VaultCreated event not found in receipt. " +
                "Transaction hash: " + receipt.getTransactionHash() + ". " +
                "Logs found: " + receipt.getLogs().size() + ". " +
                "Check that FACTORY_CONTRACT_ADDRESS is correct and the factory was deployed " +
                "with the hot wallet as triggerAuthority."
            ));
    }
}