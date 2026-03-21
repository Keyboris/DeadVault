// repository/SwitchEventRepository.java
package DeadValut.Main.repository;

import DeadValut.Main.model.SwitchEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SwitchEventRepository extends JpaRepository<SwitchEvent, Long> {
    List<SwitchEvent> findByUserIdOrderByCreatedAtDesc(UUID userId);
}