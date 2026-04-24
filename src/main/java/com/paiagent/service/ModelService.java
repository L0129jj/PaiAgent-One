package com.paiagent.service;

import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ParseException;
import org.apache.hc.core5.http.io.entity.StringEntity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

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
    private String callOpenAI(String prompt, String apiKey) throws IOException, ParseException {
        String url = "https://api.openai.com/v1/chat/completions";
        String requestBody = "{\"model\": \"gpt-3.5-turbo\", \"messages\": [{\"role\": \"system\", \"content\": \"你是一个AI助手\"}, {\"role\": \"user\", \"content\": \"" + prompt + "\"}], \"temperature\": 0.7}";

        return sendRequest(url, requestBody, apiKey);
    }

    // 调用DeepSeek API
    private String callDeepSeek(String prompt, String apiKey) throws IOException, ParseException {
        String url = "https://api.deepseek.com/v1/chat/completions";
        String requestBody = "{\"model\": \"deepseek-chat\", \"messages\": [{\"role\": \"system\", \"content\": \"你是一个AI助手\"}, {\"role\": \"user\", \"content\": \"" + prompt + "\"}], \"temperature\": 0.7}";

        return sendRequest(url, requestBody, apiKey);
    }

    // 调用通义千问API
    private String callTongyi(String prompt, String apiKey) throws IOException, ParseException {
        String url = "https://dashscope.aliyuncs.com/api/v1/chat/completions";
        String requestBody = "{\"model\": \"qwen-turbo\", \"messages\": [{\"role\": \"system\", \"content\": \"你是一个AI助手\"}, {\"role\": \"user\", \"content\": \"" + prompt + "\"}], \"temperature\": 0.7}";

        return sendRequest(url, requestBody, apiKey);
    }

    // 发送HTTP请求
    private String sendRequest(String url, String requestBody, String apiKey) throws IOException, ParseException {
        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost httpPost = new HttpPost(url);
            httpPost.setHeader("Content-Type", "application/json");
            httpPost.setHeader("Authorization", "Bearer " + apiKey);
            httpPost.setEntity(new StringEntity(requestBody));

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                String responseBody = new String(response.getEntity().getContent().readAllBytes());
                logger.info("模型API响应: {}", responseBody);

                JsonNode rootNode = objectMapper.readTree(responseBody);
                return rootNode.path("choices").get(0).path("message").path("content").asText();
            }
        }
    }
}