package com.paiagent.graph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 大模型节点动作 - 使用 Spring AI ChatClient 统一调用大模型
 * 替代原 ModelService 中手写的 HttpClient + JSON 解析逻辑
 */
@Component
public class ModelNodeAction {
    private static final Logger logger = LoggerFactory.getLogger(ModelNodeAction.class);

    private final ChatClient defaultChatClient;

    public ModelNodeAction(ChatClient.Builder chatClientBuilder) {
        this.defaultChatClient = chatClientBuilder.build();
    }

    /**
     * LangGraph4j 节点动作：调用大模型
     * 从 WorkflowState 读取输入，通过 Spring AI ChatClient 调用 LLM，
     * 将响应写回 state
     */
    public Map<String, Object> execute(WorkflowState state) {
        try {
            String input = state.inputText();
            String systemPrompt = (String) state.value(WorkflowState.SYSTEM_PROMPT)
                    .orElse("你是一个有用的AI助手。");
            String userPromptTemplate = (String) state.value(WorkflowState.USER_PROMPT)
                    .orElse(null);

            // 如果有用户提示词模板，替换 {{input}} 占位符
            String finalUserMessage = input;
            if (userPromptTemplate != null && !userPromptTemplate.isBlank()) {
                finalUserMessage = userPromptTemplate.replace("{{input}}", input != null ? input : "");
            }

            // 检查是否有前端动态配置的 API Key 和 Endpoint
            String apiKey = (String) state.value(WorkflowState.API_KEY).orElse(null);
            String apiEndpoint = (String) state.value(WorkflowState.API_ENDPOINT).orElse(null);

            ChatClient chatClient;

            if (apiKey != null && !apiKey.isBlank() && apiEndpoint != null && !apiEndpoint.isBlank()) {
                // 使用前端动态配置 → 通过 Spring AI Builder 模式动态构建 ChatClient
                String modelName = (String) state.value(WorkflowState.MODEL_NAME).orElse("qwen-plus");
                double temperature = ((Number) state.value(WorkflowState.TEMPERATURE).orElse(0.7)).doubleValue();

                logger.info("使用动态配置调用大模型: endpoint={}, model={}", apiEndpoint, modelName);

                OpenAiApi api = OpenAiApi.builder()
                        .baseUrl(apiEndpoint)
                        .apiKey(apiKey)
                        .build();

                OpenAiChatModel dynamicModel = OpenAiChatModel.builder()
                        .openAiApi(api)
                        .defaultOptions(OpenAiChatOptions.builder()
                                .model(modelName)
                                .temperature(temperature)
                                .build())
                        .build();

                chatClient = ChatClient.builder(dynamicModel).build();
            } else {
                // 使用 Spring 配置的默认 ChatClient
                logger.info("使用默认 Spring AI ChatClient 调用大模型");
                chatClient = defaultChatClient;
            }

            // 通过 Spring AI ChatClient 调用大模型（一行代码替代原来 50+ 行的 HTTP 调用）
            String response = chatClient.prompt()
                    .system(systemPrompt)
                    .user(finalUserMessage)
                    .call()
                    .content();

            logger.info("大模型返回: {}", response);

            return Map.of(WorkflowState.MODEL_OUTPUT, response != null ? response : "");

        } catch (Exception e) {
            logger.error("大模型节点执行失败", e);
            return Map.of(
                    WorkflowState.MODEL_OUTPUT, "",
                    WorkflowState.ERROR, "大模型调用失败: " + e.getMessage()
            );
        }
    }
}
