// repository/UserRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByWalletAddress(String walletAddress);
    boolean existsByWalletAddress(String walletAddress);
}