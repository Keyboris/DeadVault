// service/SmartContractGeneratorService.java
package DeadValut.Main.service;

import DeadValut.Main.model.SmartContractResponse;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class SmartContractGeneratorService {

    private static final String SMART_CONTRACT_TEMPLATE = """
            You are a senior Solidity smart contract engineer targeting the Base L2 network.
            Generate ONLY valid Solidity code — no markdown fences, no explanation, no comments outside the code.
            Use pragma solidity ^0.8.20.
            Import OpenZeppelin contracts where appropriate (ReentrancyGuard, Ownable, IERC20).
            Ensure the contract compiles and follows basic security practices.
            The contract will be deployed on Base (EVM-equivalent, chain ID 84532 testnet / 8453 mainnet).

            User requirements:
            <user_input>
            %s
            </user_input>
            """;

    private final ChatLanguageModel chatLanguageModel;
    private final String modelName;

    public SmartContractGeneratorService(
            @Value("${langchain4j.openai.api-key}") String apiKey,
            @Value("${langchain4j.openai.model-name:gpt-4o}") String modelName
    ) {
        this.modelName = modelName;
        this.chatLanguageModel = OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                .temperature(0.0)
                .timeout(Duration.ofSeconds(30))
                .build();
    }

    public SmartContractResponse generateFromPrompt(String userPrompt) {
        String compiledPrompt = SMART_CONTRACT_TEMPLATE.formatted(userPrompt);
        String generatedContract = chatLanguageModel.generate(compiledPrompt);

        if (generatedContract == null || generatedContract.isBlank()) {
            throw new IllegalStateException("Empty response from OpenAI");
        }

        // Strip accidental markdown fences the model may add despite instructions
        String clean = generatedContract.trim()
                .replaceAll("(?s)^```(?:solidity)?\\s*", "")
                .replaceAll("```\\s*$", "")
                .trim();

        return new SmartContractResponse(modelName, clean);
    }
}