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
            // Convert timeLockDays to an absolute Unix timestamp.
            // We add a small buffer (current time + timeLockDays days) so the contract's
            // require(unlockTime > block.timestamp) passes and the immutable value is correct.
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
     *
     * For TIME_LOCKED vaults the on-chain require(block.timestamp >= unlockTime) is the guard —
     * if the time-lock has not yet elapsed the transaction will revert and the exception bubbles
     * up to GracePeriodWatcherJob, which rolls the contract status back to ACTIVE and retries
     * on the next scheduler cycle. No special-casing needed in the Java layer.
     *
     * @param contractAddress  The deployed vault address.
     * @return                 Transaction hash of the trigger() call.
     */
    public String triggerVault(String contractAddress) throws Exception {
        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);
        String data = FunctionEncoder.encode(new Function("trigger", List.of(), List.of()));
        TransactionReceipt receipt = sendTransaction(web3j, creds, contractAddress, data);
        return receipt.getTransactionHash();
    }

    /**
     * Executes the full CONDITIONAL_SURVIVAL trigger sequence for a single user's vault:
     *
     *   1. trigger()                         — releases unconditional shares immediately
     *   2. confirmSurvival(index)             — for each conditional beneficiary
     *   3. releaseTo(index)                   — releases that beneficiary's share
     *
     * In a production system, step 2 would be gated on an oracle attestation (Chainlink
     * Functions, a signed off-chain proof, etc.). For the hackathon the triggerAuthority
     * (the Gnosis Safe / hot wallet) acts as the oracle and confirms all conditional
     * beneficiaries immediately — demonstrating the full flow end to end.
     *
     * @param contractAddress   The deployed DMSConditionalVault address.
     * @param conditionalIndexes Indices (0-based) of beneficiaries with mustSurviveOwner=true.
     * @return                  Transaction hash of the initial trigger() call.
     */
    public String triggerConditionalVault(String contractAddress,
                                          List<Integer> conditionalIndexes) throws Exception {
        Web3j web3j = Web3j.build(new HttpService(rpcUrl));
        Credentials creds = Credentials.create(privateKey);

        // Step 1: trigger() — unconditional shares released on-chain immediately
        String triggerData = FunctionEncoder.encode(
            new Function("trigger", List.of(), List.of()));
        TransactionReceipt triggerReceipt = sendTransaction(web3j, creds, contractAddress, triggerData);
        String txHash = triggerReceipt.getTransactionHash();

        // Steps 2 + 3: for each conditional beneficiary, confirm survival then release
        for (int index : conditionalIndexes) {
            // confirmSurvival(uint256 index)
            String confirmData = FunctionEncoder.encode(new Function(
                "confirmSurvival",
                List.of(new Uint256(BigInteger.valueOf(index))),
                List.of()
            ));
            sendTransaction(web3j, creds, contractAddress, confirmData);

            // releaseTo(uint256 index)
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
     * Parse VaultCreated(address indexed owner, address vault) from the transaction receipt.
     *
     * After compiling the contracts, get the real topic with:
     *   npx hardhat console --network localhost
     *   > ethers.id("VaultCreated(address,address)")
     * or:
     *   cast keccak "VaultCreated(address,address)"
     *
     * Note: 'owner' is indexed → stored as topics[1].
     *       'vault' is NOT indexed → stored in data, padded to 32 bytes.
     *       The vault address occupies data bytes 12–31 (first 12 bytes are zero-padding).
     */
    private String extractVaultAddress(TransactionReceipt receipt) {
        final String VAULT_CREATED_TOPIC =
            "0xYOUR_KECCAK_HERE"; // replace after: cast keccak "VaultCreated(address,address)"
        return receipt.getLogs().stream()
            .filter(log -> !log.getTopics().isEmpty()
                && log.getTopics().get(0).equalsIgnoreCase(VAULT_CREATED_TOPIC))
            .map(log -> {
                // data = 32-byte ABI-encoded address → strip leading 12 zero bytes (24 hex chars)
                String padded = log.getData();  // "0x" + 64 hex chars
                return "0x" + padded.substring(padded.length() - 40);
            })
            .findFirst()
            .orElseThrow(() -> new RuntimeException("VaultCreated event not found in receipt"));
    }
}