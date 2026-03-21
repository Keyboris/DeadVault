package DeadValut.Main;

import org.junit.jupiter.api.Test;

// This class intentionally does NOT use @SpringBootTest.
// The full application context requires a running PostgreSQL instance (via Docker).
// Unit tests are in the service/, controller/, and scheduler/ sub-packages — no DB needed.
class MainApplicationTests {

    @Test
    void placeholder() {
        // No-op — keeps the test runner happy without needing a live database.
    }
}