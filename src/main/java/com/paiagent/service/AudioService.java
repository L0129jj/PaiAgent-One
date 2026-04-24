package com.paiagent.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Service
public class AudioService {
    private static final Logger logger = LoggerFactory.getLogger(AudioService.class);

    @Value("${audio.mock.enabled:true}")
    private boolean mockEnabled;

    @Value("${audio.mock.url:https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3}")
    private String mockAudioUrl;

    @Value("${audio.api-key:}")
    private String defaultApiKey;

    // 配置化合成接口
    public String synthesize(String text) throws IOException {
        return synthesize(text, defaultApiKey);
    }

    // 合成音频
    public String synthesize(String text, String apiKey) throws IOException {
        logger.info("合成音频: {}", text);

        if (mockEnabled) {
            // 附加文本参数，方便前端和日志追踪当前音频来源。
            return mockAudioUrl + "?text=" + URLEncoder.encode(text, StandardCharsets.UTF_8);
        }

        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("音频 API Key 未配置");
        }

        // 这里预留真实 TTS 接入点，当前版本先保持 Mock 主链路可用。
        return mockAudioUrl;
    }

    // 批量合成音频
    public String[] batchSynthesize(String[] texts, String apiKey) throws IOException {
        String[] audioUrls = new String[texts.length];
        for (int i = 0; i < texts.length; i++) {
            audioUrls[i] = synthesize(texts[i], apiKey);
        }
        return audioUrls;
    }
}