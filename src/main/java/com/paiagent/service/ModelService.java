package com.paiagent.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Service;

/**
 * 大模型服务 - 使用 Spring AI ChatClient 统一调用
 *
 * 改造说明：
 * - 之前：手动用 HttpClient5 构建 HTTP 请求，为每个厂商(OpenAI/DeepSeek/通义)
 *          分别编写调用方法，手动解析 JSON 响应（200+ 行代码）
 * - 现在：通过 Spring AI 的 ChatClient 抽象，一行代码调用任何兼容模型
 *          厂商切换只需修改 application.yml 配置
 *
 * 注意：工作流的主要模型调用已迁移到 ModelNodeAction（LangGraph4j 节点），
 * 此 Service 保留为独立的工具服务，供非工作流场景使用。
 */
@Service
public class ModelService {
    private static final Logger logger = LoggerFactory.getLogger(ModelService.class);

    private final ChatClient chatClient;

    public ModelService(ChatClient.Builder chatClientBuilder) {
        this.chatClient = chatClientBuilder.build();
    }

    /**
     * 使用 Spring AI ChatClient 调用默认模型
     */
    public String callDefaultModel(String prompt) {
        logger.info("通过 Spring AI ChatClient 调用默认模型");

        String response = chatClient.prompt()
                .system("你是一个有用的AI助手。")
                .user(prompt)
                .call()
                .content();

        logger.info("模型返回: {}", response);
        return response;
    }

    /**
     * 使用指定配置调用模型（兼容前端动态配置场景）
     * 通过 Spring AI 的 OpenAI Builder 模式动态创建 ChatClient
     */
    public String callModelWithConfig(String apiEndpoint, String apiKey,
                                       String modelName, double temperature,
                                       String systemPrompt, String userPrompt) {
        logger.info("通过 Spring AI 动态配置调用大模型: endpoint={}, model={}", apiEndpoint, modelName);

        OpenAiApi api = OpenAiApi.builder()
                .baseUrl(apiEndpoint)
                .apiKey(apiKey)
                .build();

        OpenAiChatModel dynamicModel = OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model(modelName != null ? modelName : "qwen-plus")
                        .temperature(temperature)
                        .build())
                .build();

        var dynamicClient = ChatClient.builder(dynamicModel).build();

        String sysPrompt = (systemPrompt == null || systemPrompt.isBlank())
                ? "你是一个有用的AI助手。" : systemPrompt;

        String response = dynamicClient.prompt()
                .system(sysPrompt)
                .user(userPrompt)
                .call()
                .content();

        logger.info("动态模型返回: {}", response);
        return response;
    }
}