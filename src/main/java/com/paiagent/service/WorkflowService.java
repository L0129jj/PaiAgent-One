package com.paiagent.service;

import com.paiagent.graph.WorkflowGraphBuilder;
import com.paiagent.graph.WorkflowState;
import org.bsc.langgraph4j.CompiledGraph;
import org.bsc.langgraph4j.NodeOutput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Consumer;

@Service
public class WorkflowService {
    private static final Logger logger = LoggerFactory.getLogger(WorkflowService.class);

    @Autowired
    private WorkflowGraphBuilder graphBuilder;

    @Autowired
    private MinioService minioService;

    // 执行工作流
    public WorkflowResult execute(Workflow workflow, Map<String, Object> inputData) throws Exception {
        return executeWithEvents(workflow, inputData, null);
    }

    // 执行工作流（带节点事件）- 使用 LangGraph4j 驱动
    public WorkflowResult executeWithEvents(
            Workflow workflow,
            Map<String, Object> inputData,
            Consumer<NodeExecutionEvent> eventConsumer) {
        try {
            // 1. 构建 LangGraph4j 编译图
            CompiledGraph<WorkflowState> compiledGraph = graphBuilder.buildDefaultGraph();

            // 2. 构建初始状态，从前端工作流节点配置中提取参数
            Map<String, Object> initialState = buildInitialState(workflow, inputData);

            // 3. 使用 LangGraph4j stream() 驱动执行，逐节点发射 SSE 事件
            emitEvent(eventConsumer, NodeExecutionEvent.started("workflow", "workflow", "工作流开始执行"));

            WorkflowState finalState = null;

            // LangGraph4j 流式执行：每个节点完成后产出一个 NodeOutput
            for (NodeOutput<WorkflowState> nodeOutput : compiledGraph.stream(initialState)) {
                String nodeName = nodeOutput.node();
                WorkflowState state = nodeOutput.state();
                finalState = state;

                // 将 LangGraph4j 的节点输出转换为 SSE 事件
                String nodeType = mapNodeNameToType(nodeName);
                Map<String, Object> eventData = new HashMap<>();

                switch (nodeType) {
                    case "input":
                        eventData.put("inputText", state.inputText());
                        emitEvent(eventConsumer, NodeExecutionEvent.completed(
                                nodeName, nodeType, "输入节点就绪", eventData));
                        break;
                    case "model":
                        eventData.put("modelOutput", state.modelOutput());
                        String error = state.error();
                        if (error != null && !error.isBlank()) {
                            emitEvent(eventConsumer, NodeExecutionEvent.failed(
                                    nodeName, nodeType, "大模型节点执行失败", error));
                        } else {
                            emitEvent(eventConsumer, NodeExecutionEvent.completed(
                                    nodeName, nodeType, "大模型节点执行完成", eventData));
                        }
                        break;
                    case "audio":
                        eventData.put("audioUrl", state.audioUrl());
                        emitEvent(eventConsumer, NodeExecutionEvent.completed(
                                nodeName, nodeType, "音频节点执行完成", eventData));
                        break;
                    default:
                        emitEvent(eventConsumer, NodeExecutionEvent.completed(
                                nodeName, nodeType, "节点执行完成", eventData));
                        break;
                }
            }

            // 4. 构建并返回结果
            WorkflowResult result = new WorkflowResult();
            result.setSuccess(true);
            result.setData(finalState != null ? finalState.data() : Map.of());

            String audioUrl = finalState != null ? finalState.audioUrl() : "";

            // 如果模型输出是远程 URL，尝试转存到 MinIO
            if (finalState != null) {
                String modelOutput = finalState.modelOutput();
                if (modelOutput != null && modelOutput.trim().startsWith("http") && !modelOutput.contains("mock")) {
                    try {
                        String minioUrl = minioService.uploadFromUrl(modelOutput.trim());
                        result.getData().put("modelOutput", minioUrl);
                    } catch (Exception e) {
                        logger.warn("MinIO 转存失败，使用原始 URL", e);
                    }
                }
            }

            result.setAudioUrl(audioUrl != null ? audioUrl : "");

            emitEvent(eventConsumer, NodeExecutionEvent.completed("workflow", "workflow", "工作流执行完成", Map.of(
                    "audioUrl", result.getAudioUrl()
            )));

            return result;

        } catch (Exception e) {
            logger.error("工作流执行失败", e);
            emitEvent(eventConsumer, NodeExecutionEvent.failed("workflow", "workflow", "工作流执行失败", e.getMessage()));
            WorkflowResult result = new WorkflowResult();
            result.setSuccess(false);
            result.setError(e.getMessage());
            return result;
        }
    }

    /**
     * 从前端工作流定义中提取节点配置，构建 LangGraph4j 初始状态
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildInitialState(Workflow workflow, Map<String, Object> inputData) {
        Map<String, Object> state = new HashMap<>();

        // 基础输入
        state.put(WorkflowState.INPUT_TEXT, inputData != null ?
                inputData.getOrDefault("inputText", "") : "");

        // 从前端节点配置中提取参数
        if (workflow != null && workflow.getNodes() != null) {
            for (Node node : workflow.getNodes()) {
                Map<String, Object> data = node.getData();
                if (data == null) continue;
                Map<String, Object> config = null;
                if (data.get("config") instanceof Map) {
                    config = (Map<String, Object>) data.get("config");
                }
                if (config == null) continue;

                if ("model".equals(node.getType())) {
                    // 提取大模型节点配置
                    putIfPresent(state, WorkflowState.API_KEY, config.get("apiKey"));
                    putIfPresent(state, WorkflowState.API_ENDPOINT, config.get("apiEndpoint"));
                    putIfPresent(state, WorkflowState.MODEL_NAME, config.get("modelName"));
                    putIfPresent(state, WorkflowState.SYSTEM_PROMPT, config.get("systemPrompt"));
                    putIfPresent(state, WorkflowState.USER_PROMPT, config.get("userPrompt"));
                    if (config.get("temperature") instanceof Number) {
                        state.put(WorkflowState.TEMPERATURE, ((Number) config.get("temperature")).doubleValue());
                    }

                    // 处理输入引用
                    String inputRef = (String) config.get("inputRef");
                    if (inputRef != null && !inputRef.isBlank()) {
                        state.put("input.user_input", state.getOrDefault(WorkflowState.INPUT_TEXT, ""));
                    }
                }

                if ("audio".equals(node.getType())) {
                    // 提取音频节点配置
                    putIfPresent(state, WorkflowState.VOICE, config.get("voice"));
                }
            }
        }

        return state;
    }

    private void putIfPresent(Map<String, Object> map, String key, Object value) {
        if (value instanceof String && !((String) value).isBlank()) {
            map.put(key, value);
        }
    }

    private String mapNodeNameToType(String nodeName) {
        // LangGraph4j 节点名即为类型名
        return switch (nodeName) {
            case "input" -> "input";
            case "model" -> "model";
            case "audio" -> "audio";
            default -> nodeName;
        };
    }

    private void emitEvent(Consumer<NodeExecutionEvent> eventConsumer, NodeExecutionEvent event) {
        if (eventConsumer != null) {
            eventConsumer.accept(event);
        }
    }

    // 验证工作流
    public WorkflowValidationResult validateWorkflow(Workflow workflow) {
        WorkflowValidationResult result = new WorkflowValidationResult();
        List<String> errors = new ArrayList<>();

        if (workflow.getNodes() == null || workflow.getNodes().isEmpty()) {
            errors.add("工作流节点不能为空");
        } else {
            boolean hasInputNode = workflow.getNodes().stream().anyMatch(node -> "input".equals(node.getType()));
            if (!hasInputNode) {
                errors.add("工作流必须包含至少一个输入节点");
            }
            boolean hasEndNode = workflow.getNodes().stream().anyMatch(node -> "end".equals(node.getType()));
            if (!hasEndNode) {
                errors.add("工作流必须包含至少一个结束节点");
            }
        }

        // LangGraph4j 在 compile() 时会自动检测环和孤立节点
        try {
            graphBuilder.buildDefaultGraph();
        } catch (Exception e) {
            errors.add("工作流图结构异常: " + e.getMessage());
        }

        result.setValid(errors.isEmpty());
        result.setErrors(errors);
        return result;
    }

    // ========== 内部数据类（保持不变，维持 API 兼容性） ==========

    public static class Workflow {
        private List<Node> nodes;
        private List<Edge> edges;
        public List<Node> getNodes() { return nodes; }
        public void setNodes(List<Node> nodes) { this.nodes = nodes; }
        public List<Edge> getEdges() { return edges; }
        public void setEdges(List<Edge> edges) { this.edges = edges; }
    }

    public static class Node {
        private String id;
        private String type;
        private Map<String, Object> data;
        private Position position;
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }
        public Position getPosition() { return position; }
        public void setPosition(Position position) { this.position = position; }
    }

    public static class Edge {
        private String id;
        private String source;
        private String target;
        private String label;
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public String getTarget() { return target; }
        public void setTarget(String target) { this.target = target; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
    }

    public static class Position {
        private double x;
        private double y;
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
    }

    public static class WorkflowResult {
        private boolean success;
        private Map<String, Object> data;
        private String error;
        private String audioUrl;
        public boolean isSuccess() { return success; }
        public void setSuccess(boolean success) { this.success = success; }
        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }
        public String getError() { return error; }
        public void setError(String error) { this.error = error; }
        public String getAudioUrl() { return audioUrl; }
        public void setAudioUrl(String audioUrl) { this.audioUrl = audioUrl; }
    }

    public static class NodeExecutionEvent {
        private String eventType;
        private String nodeId;
        private String nodeType;
        private String message;
        private boolean success;
        private String error;
        private Map<String, Object> data;
        private long timestamp;

        public static NodeExecutionEvent started(String nodeId, String nodeType, String message) {
            NodeExecutionEvent event = new NodeExecutionEvent();
            event.eventType = "node_started";
            event.nodeId = nodeId;
            event.nodeType = nodeType;
            event.message = message;
            event.success = true;
            event.timestamp = System.currentTimeMillis();
            event.data = Map.of();
            return event;
        }

        public static NodeExecutionEvent progress(String nodeId, String nodeType, String message) {
            NodeExecutionEvent event = new NodeExecutionEvent();
            event.eventType = "node_progress";
            event.nodeId = nodeId;
            event.nodeType = nodeType;
            event.message = message;
            event.success = true;
            event.timestamp = System.currentTimeMillis();
            event.data = Map.of();
            return event;
        }

        public static NodeExecutionEvent completed(String nodeId, String nodeType, String message, Map<String, Object> data) {
            NodeExecutionEvent event = new NodeExecutionEvent();
            event.eventType = "node_completed";
            event.nodeId = nodeId;
            event.nodeType = nodeType;
            event.message = message;
            event.success = true;
            event.timestamp = System.currentTimeMillis();
            event.data = data == null ? Map.of() : data;
            return event;
        }

        public static NodeExecutionEvent failed(String nodeId, String nodeType, String message, String error) {
            NodeExecutionEvent event = new NodeExecutionEvent();
            event.eventType = "node_failed";
            event.nodeId = nodeId;
            event.nodeType = nodeType;
            event.message = message;
            event.success = false;
            event.error = error;
            event.timestamp = System.currentTimeMillis();
            event.data = Map.of();
            return event;
        }

        // Getters and setters
        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }
        public String getNodeId() { return nodeId; }
        public void setNodeId(String nodeId) { this.nodeId = nodeId; }
        public String getNodeType() { return nodeType; }
        public void setNodeType(String nodeType) { this.nodeType = nodeType; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public boolean isSuccess() { return success; }
        public void setSuccess(boolean success) { this.success = success; }
        public String getError() { return error; }
        public void setError(String error) { this.error = error; }
        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    }

    public static class WorkflowValidationResult {
        private boolean valid;
        private List<String> errors;
        public boolean isValid() { return valid; }
        public void setValid(boolean valid) { this.valid = valid; }
        public List<String> getErrors() { return errors; }
        public void setErrors(List<String> errors) { this.errors = errors; }
    }
}
