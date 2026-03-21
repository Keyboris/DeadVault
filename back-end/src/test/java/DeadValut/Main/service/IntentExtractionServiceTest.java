package DeadValut.Main.service;
 
import DeadValut.Main.model.IntentExtractionResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.model.chat.ChatLanguageModel;
import org.junit.jupiter.api.*;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
 
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
 
@DisplayName("IntentExtractionService")
public class IntentExtractionServiceTest {
 
    @Mock
    private ChatLanguageModel mockLlm;
 
    private IntentExtractionService service;
 
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new IntentExtractionService(mockLlm, new ObjectMapper());
    }
 
    private static final String VALID_JSON = """
        {
          "templateType": "PERCENTAGE_SPLIT",
          "timeLockDays": 0,
          "resolvedBeneficiaries": [
            { "name": "Alice", "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
              "basisPoints": 7000, "condition": "ALWAYS", "timeLockDays": 0 },
            { "name": "Jack",  "walletAddress": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
              "basisPoints": 3000, "condition": "ALWAYS", "timeLockDays": 0 }
          ],
          "pendingResolution": [],
          "validationErrors": [],
          "confidenceScore": 0.98
        }
        """;
 
    @Test
    @DisplayName("valid LLM JSON is parsed into IntentExtractionResult")
    void extract_validJson_parsed() {
        when(mockLlm.generate(anyString())).thenReturn(VALID_JSON);
 
        IntentExtractionResult result = service.extract("Give 70% to Alice and 30% to Jack");
 
        assertEquals("PERCENTAGE_SPLIT", result.templateType());
        assertEquals(2, result.resolvedBeneficiaries().size());
        assertEquals(7000, result.resolvedBeneficiaries().get(0).basisPoints());
        assertEquals(3000, result.resolvedBeneficiaries().get(1).basisPoints());
        assertTrue(result.validationErrors().isEmpty());
    }
 
    @Test
    @DisplayName("basis points not summing to 10000 adds a validation error")
    void extract_basisPointsSumWrong_addsError() {
        String badJson = """
            {
              "templateType": "PERCENTAGE_SPLIT",
              "timeLockDays": 0,
              "resolvedBeneficiaries": [
                { "name": "Alice", "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                  "basisPoints": 5000, "condition": "ALWAYS", "timeLockDays": 0 }
              ],
              "pendingResolution": [],
              "validationErrors": [],
              "confidenceScore": 0.5
            }
            """;
        when(mockLlm.generate(anyString())).thenReturn(badJson);
 
        IntentExtractionResult result = service.extract("Give half to Alice");
 
        assertFalse(result.validationErrors().isEmpty());
        assertTrue(result.validationErrors().stream()
            .anyMatch(e -> e.contains("5000") && e.contains("10000")));
    }
 
    @Test
    @DisplayName("null wallet address adds a validation error")
    void extract_nullWalletAddress_addsError() {
        String jsonNullWallet = """
            {
              "templateType": "PERCENTAGE_SPLIT",
              "timeLockDays": 0,
              "resolvedBeneficiaries": [
                { "name": "Alice", "walletAddress": null,
                  "basisPoints": 10000, "condition": "ALWAYS", "timeLockDays": 0 }
              ],
              "pendingResolution": ["Alice"],
              "validationErrors": [],
              "confidenceScore": 0.6
            }
            """;
        when(mockLlm.generate(anyString())).thenReturn(jsonNullWallet);
 
        IntentExtractionResult result = service.extract("Give everything to Alice");
 
        assertTrue(result.validationErrors().stream()
            .anyMatch(e -> e.contains("wallet address")));
    }
 
    @Test
    @DisplayName("TIME_LOCKED with timeLockDays=0 adds a validation error")
    void extract_timeLockedZeroDays_addsError() {
        String json = """
            {
              "templateType": "TIME_LOCKED",
              "timeLockDays": 0,
              "resolvedBeneficiaries": [
                { "name": "Alice", "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                  "basisPoints": 10000, "condition": "ALWAYS", "timeLockDays": 0 }
              ],
              "pendingResolution": [],
              "validationErrors": [],
              "confidenceScore": 0.7
            }
            """;
        when(mockLlm.generate(anyString())).thenReturn(json);
 
        IntentExtractionResult result = service.extract("Lock funds for Alice");
 
        assertTrue(result.validationErrors().stream()
            .anyMatch(e -> e.contains("timeLockDays")));
    }
 
    @Test
    @DisplayName("CONDITIONAL_SURVIVAL with no conditional beneficiary adds a validation error")
    void extract_conditionalSurvivalNoConditionalBeneficiary_addsError() {
        String json = """
            {
              "templateType": "CONDITIONAL_SURVIVAL",
              "timeLockDays": 0,
              "resolvedBeneficiaries": [
                { "name": "Alice", "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                  "basisPoints": 10000, "condition": "ALWAYS", "timeLockDays": 0 }
              ],
              "pendingResolution": [],
              "validationErrors": [],
              "confidenceScore": 0.6
            }
            """;
        when(mockLlm.generate(anyString())).thenReturn(json);
 
        IntentExtractionResult result = service.extract("Something conditional");
 
        assertTrue(result.validationErrors().stream()
            .anyMatch(e -> e.contains("CONDITIONAL_SURVIVAL")));
    }
 
    @Test
    @DisplayName("unparseable LLM response returns an error result without throwing")
    void extract_malformedJson_returnsErrorResult() {
        when(mockLlm.generate(anyString())).thenReturn("this is not JSON at all");
 
        IntentExtractionResult result = service.extract("some text");
 
        assertEquals("UNKNOWN", result.templateType());
        assertFalse(result.validationErrors().isEmpty());
        assertTrue(result.validationErrors().get(0).contains("Failed to parse"));
    }
 
    @Test
    @DisplayName("LLM response wrapped in markdown code fences is still parsed")
    void extract_markdownFencedJson_parsed() {
        String fenced = "```json\n" + VALID_JSON + "\n```";
        when(mockLlm.generate(anyString())).thenReturn(fenced);
 
        IntentExtractionResult result = service.extract("Give 70% to Alice and 30% to Jack");
 
        assertTrue(result.validationErrors().isEmpty());
        assertEquals(2, result.resolvedBeneficiaries().size());
    }
}