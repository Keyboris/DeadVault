// repository/BeneficiaryConfigRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.BeneficiaryConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BeneficiaryConfigRepository extends JpaRepository<BeneficiaryConfig, UUID> {
    List<BeneficiaryConfig> findByUserId(UUID userId);
    Optional<BeneficiaryConfig> findTopByUserIdOrderByCreatedAtDesc(UUID userId);
}