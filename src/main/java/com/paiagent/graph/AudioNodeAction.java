package com.paiagent.graph;

import com.paiagent.service.AudioService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 音频合成节点动作 - 封装 AudioService 为 LangGraph4j 节点
 * AudioService 内部使用 DashScope SDK 实现 TTS，此处仅做适配
 */
@Component
public class AudioNodeAction {
    private static final Logger logger = LoggerFactory.getLogger(AudioNodeAction.class);

    private final AudioService audioService;

    public AudioNodeAction(AudioService audioService) {
        this.audioService = audioService;
    }

    /**
     * LangGraph4j 节点动作：语音合成
     * 从 WorkflowState 读取 modelOutput，调用 AudioService 合成语音
     */
    public Map<String, Object> execute(WorkflowState state) {
        try {
            String text = state.modelOutput();
            if (text == null || text.isBlank()) {
                text = state.inputText();
            }

            String voice = (String) state.value(WorkflowState.VOICE).orElse("longxiaochun");

            logger.info("音频节点开始合成，文本长度: {} 字符, 发音人: {}", text.length(), voice);

            String audioUrl = audioService.synthesizeWithConfig(
                    null, null, voice, "Auto", text);

            logger.info("音频合成完成, URL: {}", audioUrl);

            return Map.of(WorkflowState.AUDIO_URL, audioUrl);

        } catch (Exception e) {
            logger.error("音频合成节点执行失败", e);
            return Map.of(WorkflowState.ERROR, "音频合成失败: " + e.getMessage());
        }
    }
}
