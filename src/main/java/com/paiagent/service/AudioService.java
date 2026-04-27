package com.paiagent.service;

import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesisParam;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class AudioService {
    private static final Logger logger = LoggerFactory.getLogger(AudioService.class);

    @Autowired
    private MinioService minioService;

    private final ConcurrentHashMap<String, byte[]> audioCache = new ConcurrentHashMap<>();

    @Value("${model.tongyi.api-key:}")
    private String tongyiApiKey;

    /** 单次调用 TTS API 的推荐最大字符数 */
    private static final int MAX_CHUNK_LENGTH = 1000;

    /**
     * 带配置的合成音频入口，支持【并发】分段处理。
     */
    public String synthesizeWithConfig(String apiKey, String model, String voice, String languageType, String text, Consumer<String> progressConsumer) throws IOException {
        String effectiveApiKey = (apiKey != null && !apiKey.isBlank()) ? apiKey : tongyiApiKey;
        String effectiveModel = (model != null && !model.isBlank()) ? model : "cosyvoice-v1";
        String effectiveVoice = (voice != null && !voice.isBlank()) ? voice : "longxiaochun";

        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("待合成文本不能为空");
        }

        logger.info(">>> 【并发语音合成】开始。模型: {}, 发音人: {}, 总长度: {} 字符", effectiveModel, effectiveVoice, text.length());

        if (effectiveApiKey == null || effectiveApiKey.isBlank() || effectiveApiKey.startsWith("mock-")) {
            logger.warn(">>> 【警告】未配置有效 Key，回退到浏览器合成模式");
            return "tts://" + URLEncoder.encode(text, StandardCharsets.UTF_8);
        }

        try {
            // 1. 文本切割
            List<String> chunks = splitText(text, MAX_CHUNK_LENGTH);
            int totalChunks = chunks.size();
            if (progressConsumer != null) {
                progressConsumer.accept("文本已切分为 " + totalChunks + " 段，正在并发启动合成任务...");
            }

            // 2. 创建并发任务
            AtomicInteger finishedCount = new AtomicInteger(0);
            List<CompletableFuture<byte[]>> futures = new ArrayList<>();

            for (int i = 0; i < totalChunks; i++) {
                final int index = i;
                final String chunkText = chunks.get(i);

                CompletableFuture<byte[]> future = CompletableFuture.supplyAsync(() -> {
                    try {
                        logger.info(">>> [线程-{}] 正在合成第 {}/{} 段 (长度: {})", Thread.currentThread().getName(), index + 1, totalChunks, chunkText.length());
                        byte[] data = callDashScopeTTSWithSdk(effectiveApiKey, effectiveModel, effectiveVoice, chunkText);
                        
                        int completed = finishedCount.incrementAndGet();
                        if (progressConsumer != null) {
                            progressConsumer.accept(String.format("分段合成进度: %d/%d 已就绪", completed, totalChunks));
                        }
                        return data;
                    } catch (Exception e) {
                        throw new RuntimeException("第 " + (index + 1) + " 段合成失败: " + e.getMessage(), e);
                    }
                });
                futures.add(future);
            }

            // 3. 等待所有任务完成
            CompletableFuture<Void> allDone = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));
            allDone.join(); // 如果有任何任务抛出异常，这里会抛出 CompletionException

            // 4. 按顺序提取结果并合并
            ByteArrayOutputStream finalBaos = new ByteArrayOutputStream();
            for (int i = 0; i < totalChunks; i++) {
                byte[] chunkAudio = futures.get(i).get(); // get() 是非阻塞特性的，因为 join() 已经确保完成了
                finalBaos.write(chunkAudio);
            }

            byte[] fullAudioBytes = finalBaos.toByteArray();
            if (progressConsumer != null) {
                progressConsumer.accept("所有分段并发合成完成，共 " + fullAudioBytes.length + " 字节，正在上传 MinIO...");
            }

            // 5. 上传
            String minioUrl = minioService.uploadAudio(fullAudioBytes);
            logger.info(">>> 【语音合成】并发处理完成，最终 URL: {}", minioUrl);
            return minioUrl;

        } catch (Exception e) {
            logger.error("!!! 【并发合成失败】{}", e.getMessage(), e);
            throw new IOException("并发音频合成失败: " + e.getMessage());
        }
    }

    public String synthesizeWithConfig(String apiKey, String model, String voice, String languageType, String text) throws IOException {
        return synthesizeWithConfig(apiKey, model, voice, languageType, text, null);
    }

    /**
     * 智能切割文本
     */
    private List<String> splitText(String text, int maxLength) {
        List<String> chunks = new ArrayList<>();
        Pattern pattern = Pattern.compile("([^。！？；.!?;]+[。！？；.!?;]*)");
        Matcher matcher = pattern.matcher(text);

        StringBuilder currentChunk = new StringBuilder();
        while (matcher.find()) {
            String sentence = matcher.group(1);
            if (sentence.length() > maxLength) {
                if (currentChunk.length() > 0) {
                    chunks.add(currentChunk.toString());
                    currentChunk.setLength(0);
                }
                for (int i = 0; i < sentence.length(); i += maxLength) {
                    chunks.add(sentence.substring(i, Math.min(i + maxLength, sentence.length())));
                }
            } else if (currentChunk.length() + sentence.length() > maxLength) {
                chunks.add(currentChunk.toString());
                currentChunk = new StringBuilder(sentence);
            } else {
                currentChunk.append(sentence);
            }
        }
        if (currentChunk.length() > 0) {
            chunks.add(currentChunk.toString());
        }
        if (chunks.isEmpty() && text.length() > 0) {
            for (int i = 0; i < text.length(); i += maxLength) {
                chunks.add(text.substring(i, Math.min(i + maxLength, text.length())));
            }
        }
        return chunks;
    }

    /**
     * 调用 DashScope SDK (保持单段合成逻辑不变)
     */
    private byte[] callDashScopeTTSWithSdk(String apiKey, String model, String voice, String text) throws Exception {
        SpeechSynthesisParam param = SpeechSynthesisParam.builder()
                .apiKey(apiKey)
                .model(model)
                .voice(voice)
                .build();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        CountDownLatch latch = new CountDownLatch(1);
        final String[] errorMsg = new String[1];

        SpeechSynthesizer synthesizer = new SpeechSynthesizer(param, new com.alibaba.dashscope.common.ResultCallback<com.alibaba.dashscope.audio.tts.SpeechSynthesisResult>() {
            @Override
            public void onEvent(com.alibaba.dashscope.audio.tts.SpeechSynthesisResult result) {
                if (result.getAudioFrame() != null) {
                    ByteBuffer frame = result.getAudioFrame();
                    byte[] data = new byte[frame.remaining()];
                    frame.get(data);
                    try {
                        baos.write(data);
                    } catch (Exception ignored) {}
                }
            }
            @Override
            public void onComplete() { latch.countDown(); }
            @Override
            public void onError(Exception e) {
                errorMsg[0] = e.getMessage();
                latch.countDown();
            }
        });

        synthesizer.streamingCall(text);
        synthesizer.streamingComplete();
        latch.await();

        if (errorMsg[0] != null) {
            throw new IOException("DashScope 内部错误: " + errorMsg[0]);
        }
        return baos.toByteArray();
    }

    public byte[] getCachedAudio(String audioId) { return audioCache.get(audioId); }
    public void removeCachedAudio(String audioId) { audioCache.remove(audioId); }
}
