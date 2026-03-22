// repository/SecondaryKeyholderRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.SecondaryKeyholder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SecondaryKeyholderRepository extends JpaRepository<SecondaryKeyholder, UUID> {

    List<SecondaryKeyholder> findByUserId(UUID userId);

    Optional<SecondaryKeyholder> findByUserIdAndWalletAddressIgnoreCase(
            UUID userId, String walletAddress);

    boolean existsByUserIdAndWalletAddressIgnoreCase(UUID userId, String walletAddress);

    int countByUserId(UUID userId);

    void deleteByIdAndUserId(UUID id, UUID userId);
}