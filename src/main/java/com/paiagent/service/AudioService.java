package com.paiagent.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AudioService {
    private static final Logger logger = LoggerFactory.getLogger(AudioService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 内存音频缓存：audioId -> 音频字节 */
    private final ConcurrentHashMap<String, byte[]> audioCache = new ConcurrentHashMap<>();

    @Value("${audio.mock.enabled:true}")
    private boolean mockEnabled;

    @Value("${model.tongyi.api-key:}")
    private String tongyiApiKey;

    // DashScope 语音合成 API 地址
    private static final String DASHSCOPE_TTS_URL =
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation";

    /**
     * 合成音频入口。
     * - 有真实 API Key 时：调用 DashScope CosyVoice 生成真人语音
     * - 无 API Key（mock模式）时：返回 tts:// 协议供前端浏览器朗读
     */
    public String synthesize(String text) throws IOException {
        logger.info("语音合成请求, 文本: {}", text);

        // 判断是否有可用的 API Key
        boolean hasRealKey = tongyiApiKey != null
                && !tongyiApiKey.isBlank()
                && !tongyiApiKey.startsWith("mock-");

        if (!hasRealKey) {
            // 无真实 Key，回退到浏览器语音引擎
            logger.info("无可用TTS API Key，使用浏览器Web Speech API");
            return "tts://" + URLEncoder.encode(text, StandardCharsets.UTF_8);
        }

        // 调用 DashScope CosyVoice API
        try {
            byte[] audioBytes = callDashScopeTTS(text);
            String audioId = UUID.randomUUID().toString();
            audioCache.put(audioId, audioBytes);
            logger.info("语音合成成功, audioId={}, 大小={}bytes", audioId, audioBytes.length);
            return "/api/audio/play/" + audioId;
        } catch (Exception e) {
            logger.error("DashScope TTS 调用失败，回退到浏览器语音", e);
            return "tts://" + URLEncoder.encode(text, StandardCharsets.UTF_8);
        }
    }

    /**
     * 调用阿里云 DashScope sambert 语音合成 API。
     * 该 API 直接返回音频二进制流（WAV格式）。
     */
    private byte[] callDashScopeTTS(String text) throws IOException {
        // 限制文本长度（API 限制）
        if (text.length() > 500) {
            text = text.substring(0, 500);
        }

        String requestBody = objectMapper.writeValueAsString(Map.of(
                "model", "sambert-zhichu-v1",
                "input", Map.of("text", text)
        ));

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost httpPost = new HttpPost(DASHSCOPE_TTS_URL);
            httpPost.setHeader("Authorization", "Bearer " + tongyiApiKey);
            httpPost.setHeader("Content-Type", "application/json");
            httpPost.setEntity(new StringEntity(requestBody, ContentType.APPLICATION_JSON));

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                byte[] responseBytes = response.getEntity().getContent().readAllBytes();
                String contentType = response.getEntity().getContentType();

                // DashScope TTS 成功时直接返回 audio/* 二进制流
                if (contentType != null && contentType.contains("audio")) {
                    return responseBytes;
                }

                // 非音频响应，可能是 JSON 错误信息
                String bodyStr = new String(responseBytes, StandardCharsets.UTF_8);
                logger.error("DashScope TTS 返回非音频响应: {}", bodyStr);

                // 尝试从 JSON 中提取错误信息
                try {
                    JsonNode root = objectMapper.readTree(bodyStr);
                    String errorMsg = root.path("message").asText(
                            root.path("output").path("message").asText("未知错误"));
                    throw new IOException("DashScope TTS 失败: " + errorMsg);
                } catch (IOException ex) {
                    throw ex;
                } catch (Exception ex) {
                    throw new IOException("DashScope TTS 返回异常: " + bodyStr);
                }
            }
        }
    }

    /** 根据 audioId 获取缓存的音频字节。 */
    public byte[] getCachedAudio(String audioId) {
        return audioCache.get(audioId);
    }

    /** 清理指定的音频缓存。 */
    public void removeCachedAudio(String audioId) {
        audioCache.remove(audioId);
    }
}