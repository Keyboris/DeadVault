// service/IntentExtractionService.java
package DeadValut.Main.service;

import DeadValut.Main.model.IntentExtractionResult;
import DeadValut.Main.model.ResolvedBeneficiary;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.model.chat.ChatLanguageModel;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class IntentExtractionService {

    private static final String EXTRACTION_PROMPT = """
            You are a smart contract configuration assistant for a crypto inheritance protocol.
            The user has written a will describing how they want their crypto assets distributed after death.

            TEMPLATE TYPE RULES — choose exactly one:
            - EQUAL_SPLIT           All beneficiaries receive equal shares. No time lock. No survival conditions.
            - PERCENTAGE_SPLIT      Beneficiaries receive specific percentages. No time lock. No survival conditions.
            - TIME_LOCKED           Funds are locked for a period after death before anyone can claim.
                                    Set top-level timeLockDays to the number of days mentioned
                                    (e.g. "6 months" = 180, "1 year" = 365). Every beneficiary gets condition "ALWAYS".
            - CONDITIONAL_SURVIVAL  At least one beneficiary must prove they are still alive before they can claim.
                                    Set condition = "CONDITIONAL_SURVIVAL" for those beneficiaries and "ALWAYS" for
                                    unconditional ones. timeLockDays = 0.
            - MULTISIG_DEADMAN      A self-sovereign multisig wallet where multiple owners must check in.
                                    Required if the user mentions "multisig", "multiple owners", "2-of-3", etc.
                                    Set threshold, inactivitySeconds (default 2592000 / 30 days),
                                    and graceSeconds (default 604800 / 7 days).

            BASIS POINTS RULES:
            - All basisPoints values MUST sum to exactly 10000 (10000 = 100 percent).
            - For equal splits between N people, each gets floor(10000 / N).
              Give the rounding remainder to the first person so the total is exactly 10000.

            WALLET RULES:
            - If a 0x... address appears in the text next to a name, capture it in walletAddress.
            - Otherwise set walletAddress to null (the user will supply it in the UI).
            - For MULTISIG_DEADMAN, distinguish between OWNERS (who manage the vault) and BENEFICIARIES (who receive funds).

            Respond ONLY with a JSON object in this exact shape — no markdown, no preamble:
            {
              "templateType": "EQUAL_SPLIT | PERCENTAGE_SPLIT | TIME_LOCKED | CONDITIONAL_SURVIVAL | MULTISIG_DEADMAN",
              "timeLockDays": 0,
              "threshold": 0,
              "inactivitySeconds": 0,
              "graceSeconds": 0,
              "owners": ["0x..."],
              "resolvedBeneficiaries": [
                {
                  "name": "Alice",
                  "walletAddress": "0x...",
                  "basisPoints": 5000,
                  "condition": "ALWAYS | CONDITIONAL_SURVIVAL",
                  "timeLockDays": 0
                }
              ],
              "pendingResolution": [],
              "validationErrors": [],
              "confidenceScore": 0.97
            }


            NOTE: timeLockDays at the top level mirrors the value for all beneficiaries in a
            TIME_LOCKED vault. Individual beneficiary timeLockDays should match the top-level value.
            For all other vault types set both to 0.

            User will:
            <user_input>
            %s
            </user_input>
            """;

    private final ChatLanguageModel chatLanguageModel;
    private final ObjectMapper objectMapper;

    public IntentExtractionService(ChatLanguageModel chatLanguageModel, ObjectMapper objectMapper) {
        this.chatLanguageModel = chatLanguageModel;
        this.objectMapper = objectMapper;
    }

    public IntentExtractionResult extract(String willText) {
        String prompt = EXTRACTION_PROMPT.formatted(willText);
        String response = chatLanguageModel.generate(prompt);

        try {
            String clean = response.trim()
                .replaceAll("(?s)^```(?:json)?\\s*", "")
                .replaceAll("```\\s*$", "")
                .trim();

            IntentExtractionResult result = objectMapper.readValue(clean, IntentExtractionResult.class);

            // Deterministic post-validation — never trust the LLM for arithmetic or consistency
            List<String> errors = new ArrayList<>(result.validationErrors());
            boolean hasBeneficiaries = !result.resolvedBeneficiaries().isEmpty();
            boolean hasAddressLikeText = willText != null && willText.matches("(?is).*(0x[a-f0-9]{40}).*");

            if (!hasBeneficiaries) {
                if (hasAddressLikeText) {
                    errors.add("No beneficiaries could be extracted from the will");
                } else {
                    errors.add("No beneficiaries could be extracted from the will — include beneficiary names and 0x wallet addresses");
                }
            }

            if (hasBeneficiaries) {
                int total = result.resolvedBeneficiaries().stream()
                    .mapToInt(ResolvedBeneficiary::basisPoints).sum();
                if (total != 10000) {
                    errors.add("Basis points sum to " + total + ", must be 10000");
                }
            }

            long nullAddresses = result.resolvedBeneficiaries().stream()
                .filter(b -> b.walletAddress() == null || b.walletAddress().isBlank())
                .count();
            if (nullAddresses > 0) {
                errors.add(nullAddresses + " beneficiary wallet address(es) are missing — "
                    + "include 0x addresses in your will text");
            }

            // TIME_LOCKED: top-level timeLockDays must be positive
            if ("TIME_LOCKED".equals(result.templateType()) && result.timeLockDays() <= 0) {
                errors.add("TIME_LOCKED vault requires a positive timeLockDays value");
            }

            // CONDITIONAL_SURVIVAL: at least one beneficiary must carry the condition
            if ("CONDITIONAL_SURVIVAL".equals(result.templateType())) {
                boolean hasConditional = result.resolvedBeneficiaries().stream()
                    .anyMatch(b -> "CONDITIONAL_SURVIVAL".equals(b.condition()));
                if (!hasConditional) {
                    errors.add("CONDITIONAL_SURVIVAL vault must have at least one conditional beneficiary");
                }
            }

            return new IntentExtractionResult(
                result.templateType(),
                result.timeLockDays(),
                result.threshold(),
                result.inactivitySeconds(),
                result.graceSeconds(),
                result.owners(),
                result.resolvedBeneficiaries(),
                result.pendingResolution(),
                errors,
                result.confidenceScore()
            );

        } catch (Exception e) {
            return new IntentExtractionResult(
                "UNKNOWN", 0, 0, 0, 0, List.of(), List.of(), List.of(),
                List.of("Failed to parse LLM response: " + e.getMessage()), 0.0
            );
        }

    }
}