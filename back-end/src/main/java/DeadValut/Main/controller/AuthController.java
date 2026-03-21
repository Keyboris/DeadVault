// controller/AuthController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.NonceResponse;
import DeadValut.Main.model.TokenResponse;
import DeadValut.Main.model.VerifyRequest;
import DeadValut.Main.model.User;
import DeadValut.Main.repository.UserRepository;
import DeadValut.Main.service.JwtService;
import DeadValut.Main.service.SiweService;
import org.springframework.stereotype.Component;

@Component
public class AuthController {

    private final SiweService siweService;
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public AuthController(SiweService siweService,
                          JwtService jwtService,
                          UserRepository userRepository) {
        this.siweService    = siweService;
        this.jwtService     = jwtService;
        this.userRepository = userRepository;
    }

    public NonceResponse nonce(String walletAddress) {
        String nonce = siweService.generateNonce(walletAddress);
        return new NonceResponse(walletAddress, nonce);
    }

    public TokenResponse verify(VerifyRequest request) {
        boolean valid = siweService.verifySignature(
            request.walletAddress(), request.nonce(), request.signature());
        if (!valid) throw new RuntimeException("Invalid SIWE signature");

        // Upsert user — create on first sign-in, return existing on subsequent sign-ins
        User user = userRepository.findByWalletAddress(request.walletAddress().toLowerCase())
            .orElseGet(() -> {
                User u = new User();
                u.setWalletAddress(request.walletAddress().toLowerCase());
                return userRepository.save(u);
            });

        return new TokenResponse(jwtService.generateToken(user.getId(), user.getWalletAddress()));
    }
}