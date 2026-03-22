package DeadValut.Main.repository;
 
import DeadValut.Main.model.KeyholderVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
 
import java.util.UUID;
 
@Repository
public interface KeyholderVoteRepository extends JpaRepository<KeyholderVote, UUID> {
 
    boolean existsByRoundIdAndKeyholderID(UUID roundId, UUID keyholderID);
 
    int countByRoundId(UUID roundId);
}
 