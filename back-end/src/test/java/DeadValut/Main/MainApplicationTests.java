package DeadValut.Main;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.autoconfigure.exclude="
				+ "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
				+ "org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration,"
				+ "org.springframework.session.autoconfigure.SessionAutoConfiguration"
})
class MainApplicationTests {

	@Test
	void contextLoads() {
	}

}
