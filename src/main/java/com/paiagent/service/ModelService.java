package com.paiagent.service;

import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ParseException;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.http.ContentType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Service
public class ModelService {
    private static final Logger logger = LoggerFactory.getLogger(ModelService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${model.default-vendor:openai}")
    private String defaultVendor;

    @Value("${model.mock.enabled:true}")
    private boolean mockEnabled;

    @Value("${model.openai.api-key:}")
    private String openAiApiKey;

    @Value("${model.deepseek.api-key:}")
    private String deepSeekApiKey;

    @Value("${model.tongyi.api-key:}")
    private String tongyiApiKey;

    public String callDefaultModel(String prompt) throws IOException, ParseException {
        if (mockEnabled) {
            return "[MockModel] " + prompt;
        }

        String vendor = defaultVendor == null ? "openai" : defaultVendor.toLowerCase();
        String apiKey = resolveApiKey(vendor);
        return callModel(vendor, prompt, apiKey);
    }

    /**
     * 使用前端节点配置的参数调用大模型。
     * 此方法会绕过 mock 模式，直接使用前端提供的 API Key 和端点。
     */
    public String callModelWithConfig(String apiEndpoint, String apiKey,
                                       String modelName, double temperature,
                                       String systemPrompt, String userPrompt) throws IOException {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("模型 API Key 未配置");
        }
        if (apiEndpoint == null || apiEndpoint.isBlank()) {
            throw new IllegalArgumentException("模型接口地址未配置");
        }

        String model = (modelName == null || modelName.isBlank()) ? "qwen-plus" : modelName;
        String sysPrompt = (systemPrompt == null || systemPrompt.isBlank()) ? "你是一个有用的AI助手。" : systemPrompt;

        logger.info("调用大模型: endpoint={}, model={}, temperature={}", apiEndpoint, model, temperature);

        String requestBody = objectMapper.writeValueAsString(Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", sysPrompt),
                        Map.of("role", "user", "content", userPrompt)
                ),
                "temperature", temperature
        ));

        return sendRequest(apiEndpoint, requestBody, apiKey);
    }

    // 调用大模型API
    public String callModel(String vendor, String prompt, String apiKey) throws IOException, ParseException {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("模型 API Key 未配置: " + vendor);
        }

        switch (vendor.toLowerCase()) {
            case "openai":
                return callOpenAI(prompt, apiKey);
            case "deepseek":
                return callDeepSeek(prompt, apiKey);
            case "tongyi":
                return callTongyi(prompt, apiKey);
            default:
                throw new IllegalArgumentException("不支持的模型厂商: " + vendor);
        }
    }

    private String resolveApiKey(String vendor) {
        switch (vendor.toLowerCase()) {
            case "openai":
                return openAiApiKey;
            case "deepseek":
                return deepSeekApiKey;
            case "tongyi":
                return tongyiApiKey;
            default:
                throw new IllegalArgumentException("不支持的模型厂商: " + vendor);
        }
    }

    // 调用OpenAI API
    private String callOpenAI(String prompt, String apiKey) throws IOException {
        String url = "https://api.openai.com/v1/chat/completions";
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "model", "gpt-3.5-turbo",
                "messages", List.of(
                        Map.of("role", "system", "content", "你是一个AI助手"),
                        Map.of("role", "user", "content", prompt)
                ),
                "temperature", 0.7
        ));
        return sendRequest(url, requestBody, apiKey);
    }

    // 调用DeepSeek API
    private String callDeepSeek(String prompt, String apiKey) throws IOException {
        String url = "https://api.deepseek.com/v1/chat/completions";
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "model", "deepseek-chat",
                "messages", List.of(
                        Map.of("role", "system", "content", "你是一个AI助手"),
                        Map.of("role", "user", "content", prompt)
                ),
                "temperature", 0.7
        ));
        return sendRequest(url, requestBody, apiKey);
    }

    // 调用通义千问API（阿里云百炼 OpenAI 兼容模式）
    private String callTongyi(String prompt, String apiKey) throws IOException {
        String url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "model", "qwen-turbo",
                "messages", List.of(
                        Map.of("role", "system", "content", "你是一个AI助手"),
                        Map.of("role", "user", "content", prompt)
                ),
                "temperature", 0.7
        ));
        return sendRequest(url, requestBody, apiKey);
    }

    // 发送HTTP请求
    private String sendRequest(String url, String requestBody, String apiKey) throws IOException {
        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost httpPost = new HttpPost(url);
            httpPost.setHeader("Content-Type", "application/json");
            httpPost.setHeader("Authorization", "Bearer " + apiKey);
            httpPost.setEntity(new StringEntity(requestBody, ContentType.APPLICATION_JSON));

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                String responseBody = new String(response.getEntity().getContent().readAllBytes());
                logger.info("模型API响应: {}", responseBody);

                JsonNode rootNode = objectMapper.readTree(responseBody);

                // 1. 检查 OpenAI 兼容错误格式
                if (rootNode.has("error")) {
                    String errorMsg = rootNode.path("error").path("message").asText(
                            rootNode.path("error").asText("未知API错误"));
                    throw new IOException("模型API错误: " + errorMsg);
                }
                
                // 2. 检查阿里云原生错误格式 (code 和 message 在根节点)
                if (rootNode.has("code") && !rootNode.has("choices") && !rootNode.has("output")) {
                    String code = rootNode.path("code").asText();
                    String message = rootNode.path("message").asText();
                    throw new IOException("阿里云 API 错误: [" + code + "] " + message);
                }

                // 3. 解析 OpenAI 兼容格式 (如: 阿里云 compatible-mode)
                if (rootNode.has("choices")) {
                    JsonNode choices = rootNode.path("choices");
                    if (choices.isArray() && !choices.isEmpty()) {
                        return choices.get(0).path("message").path("content").asText();
                    }
                }

                // 4. 解析阿里云原生格式 (如: DashScope v1/services/...)
                if (rootNode.has("output")) {
                    JsonNode output = rootNode.path("output");
                    if (output.has("text")) {
                        return output.path("text").asText();
                    } else if (output.has("choices")) { // 原生 API 如果带了 result_format: message
                        return output.path("choices").get(0).path("message").path("content").asText();
                    }
                }

                throw new IOException("模型API返回异常: 无法解析的响应结构。响应: " + responseBody);
            }
        }
    }
}