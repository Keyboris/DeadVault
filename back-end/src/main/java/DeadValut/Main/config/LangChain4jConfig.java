// config/LangChain4jConfig.java
package DeadValut.Main.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class LangChain4jConfig {

    @Bean
    public ChatLanguageModel chatLanguageModel(
            @Value("${langchain4j.openai.api-key}") String apiKey,
            @Value("${langchain4j.openai.model-name:gpt-4o}") String modelName
    ) {
        return OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                .temperature(0.0)
                .timeout(Duration.ofSeconds(30))
                .build();
    }
}