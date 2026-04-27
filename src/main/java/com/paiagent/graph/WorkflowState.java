package com.paiagent.graph;

import org.bsc.langgraph4j.state.AgentState;
import org.bsc.langgraph4j.state.Channel;
import org.bsc.langgraph4j.state.Channels;

import java.util.Map;

/**
 * 工作流状态 - LangGraph4j AgentState 实现
 * 在节点间传递和共享的状态容器
 */
public class WorkflowState extends AgentState {

    // ========== 状态 Key 常量 ==========
    public static final String INPUT_TEXT = "inputText";
    public static final String MODEL_OUTPUT = "modelOutput";
    public static final String AUDIO_URL = "audioUrl";
    public static final String SYSTEM_PROMPT = "systemPrompt";
    public static final String USER_PROMPT = "userPrompt";
    public static final String MODEL_NAME = "modelName";
    public static final String API_KEY = "apiKey";
    public static final String API_ENDPOINT = "apiEndpoint";
    public static final String TEMPERATURE = "temperature";
    public static final String VOICE = "voice";
    public static final String ERROR = "error";

    /**
     * 状态 Schema 定义 - 使用 Channels.base() 定义各字段的默认值
     * Channels.base(Supplier): 新值覆盖旧值（最后写入者胜出）
     */
    public static final Map<String, Channel<?>> SCHEMA = Map.ofEntries(
            Map.entry(INPUT_TEXT, Channels.<String>base(() -> "")),
            Map.entry(MODEL_OUTPUT, Channels.<String>base(() -> "")),
            Map.entry(AUDIO_URL, Channels.<String>base(() -> "")),
            Map.entry(SYSTEM_PROMPT, Channels.<String>base(() -> "你是一个有用的AI助手。")),
            Map.entry(USER_PROMPT, Channels.<String>base(() -> "")),
            Map.entry(MODEL_NAME, Channels.<String>base(() -> "")),
            Map.entry(API_KEY, Channels.<String>base(() -> "")),
            Map.entry(API_ENDPOINT, Channels.<String>base(() -> "")),
            Map.entry(TEMPERATURE, Channels.<Double>base(() -> 0.7)),
            Map.entry(VOICE, Channels.<String>base(() -> "longxiaochun")),
            Map.entry(ERROR, Channels.<String>base(() -> ""))
    );

    public WorkflowState(Map<String, Object> initData) {
        super(initData);
    }

    // ========== 便捷 Getter ==========

    public String inputText() {
        Object val = value(INPUT_TEXT).orElse("");
        return val instanceof String ? (String) val : "";
    }

    public String modelOutput() {
        Object val = value(MODEL_OUTPUT).orElse("");
        return val instanceof String ? (String) val : "";
    }

    public String audioUrl() {
        Object val = value(AUDIO_URL).orElse("");
        return val instanceof String ? (String) val : "";
    }

    public String error() {
        Object val = value(ERROR).orElse(null);
        return val instanceof String && !((String) val).isBlank() ? (String) val : null;
    }
}
