package quack;

import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class QuackApplication {

    public static void main(String[] args) {
        SpringApplication.run(QuackApplication.class, args);
    }

    @Bean
    ToolCallbackProvider mcpTools(ItemTools tools) {
        return MethodToolCallbackProvider.builder().toolObjects(tools).build();
    }
}
