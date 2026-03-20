package DeadValut.Main.service;

import DeadValut.Main.model.SmartContractResponse;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SmartContractGeneratorService {

    private static final String SMART_CONTRACT_TEMPLATE = """
            You are a senior Solidity smart contract engineer.
            Generate ONLY valid Solidity code and no markdown fences.
            Use Solidity version pragma ^0.8.20.
            Ensure the contract compiles and follows basic security practices.

            User requirements:
            %s
            """;

    private final ChatLanguageModel chatLanguageModel;
    private final String ollamaBaseUrl;
    private final String ollamaModel;

    public SmartContractGeneratorService(
            @Value("${ollama.base-url}") String ollamaBaseUrl,
            @Value("${ollama.model}") String ollamaModel
    ) {
        this.ollamaBaseUrl = ollamaBaseUrl;
        this.ollamaModel = ollamaModel;
        this.chatLanguageModel = OllamaChatModel.builder()
                .baseUrl(ollamaBaseUrl)
                .modelName(ollamaModel)
                .build();
    }

    public SmartContractResponse generateFromPrompt(String userPrompt) {
        String compiledPrompt = SMART_CONTRACT_TEMPLATE.formatted(userPrompt);

        String generatedContract = chatLanguageModel.generate(compiledPrompt);

        if (generatedContract == null || generatedContract.isBlank()) {
            throw new IllegalStateException("Empty response received from Ollama");
        }

        return new SmartContractResponse(ollamaModel, generatedContract.trim());
    }
}
