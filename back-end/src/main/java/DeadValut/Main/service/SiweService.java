// service/SiweService.java
package DeadValut.Main.service;

import org.springframework.stereotype.Service;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SiweService {

    // nonce store — ConcurrentHashMap is fine for a single-node hackathon deployment
    private final Map<String, NonceEntry> nonceStore = new ConcurrentHashMap<>();

    public String generateNonce(String walletAddress) {
        String nonce = UUID.randomUUID().toString();
        nonceStore.put(walletAddress.toLowerCase(),
            new NonceEntry(nonce, Instant.now().plusSeconds(300)));
        return nonce;
    }

    public boolean verifySignature(String walletAddress, String nonce, String signature) {
        NonceEntry entry = nonceStore.remove(walletAddress.toLowerCase());
        if (entry == null || Instant.now().isAfter(entry.expiry()) || !entry.nonce().equals(nonce)) {
            return false;
        }
        return walletAddress.equalsIgnoreCase(recoverAddress(buildMessage(walletAddress, nonce), signature));
    }

    private String buildMessage(String address, String nonce) {
        return "Sign in to Dead Man's Switch\nWallet: " + address + "\nNonce: " + nonce;
    }

    private String recoverAddress(String message, String hexSignature) {
        try {
            byte[] sigBytes = Numeric.hexStringToByteArray(hexSignature);
            byte v = sigBytes[64];
            if (v < 27) v += 27;
            Sign.SignatureData sig = new Sign.SignatureData(
                v,
                java.util.Arrays.copyOfRange(sigBytes, 0, 32),
                java.util.Arrays.copyOfRange(sigBytes, 32, 64)
            );
            byte[] msgHash = Sign.getEthereumMessageHash(message.getBytes(StandardCharsets.UTF_8));
            BigInteger pubKey = Sign.signedMessageHashToKey(msgHash, sig);
            return "0x" + Keys.getAddress(pubKey);
        } catch (Exception e) {
            return "";
        }
    }

    private record NonceEntry(String nonce, Instant expiry) {}
}