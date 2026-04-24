package com.paiagent.service;

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
    private ModelService modelService;

    @Autowired
    private AudioService audioService;

    // 执行工作流
    public WorkflowResult execute(Workflow workflow, Map<String, Object> inputData) throws Exception {
        return executeWithEvents(workflow, inputData, null);
    }

    // 执行工作流（带节点事件）
    public WorkflowResult executeWithEvents(
            Workflow workflow,
            Map<String, Object> inputData,
            Consumer<NodeExecutionEvent> eventConsumer) {
        try {
            // 1. 构建节点依赖图
            Map<String, List<String>> dependencyGraph = buildDependencyGraph(workflow);

            // 2. 拓扑排序
            List<String> executionOrder = topologicalSort(dependencyGraph);

            // 3. 执行节点
            Map<String, Object> context = new HashMap<>(inputData == null ? Map.of() : inputData);
            executeNodes(executionOrder, workflow, context, eventConsumer);

            // 4. 返回结果
            WorkflowResult result = new WorkflowResult();
            result.setSuccess(true);
            result.setData(context);
            result.setAudioUrl((String) context.get("audioUrl"));

            emitEvent(eventConsumer, NodeExecutionEvent.completed("workflow", "workflow", "工作流执行完成", Map.of(
                    "audioUrl", context.get("audioUrl")
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

    // 构建节点依赖图
    private Map<String, List<String>> buildDependencyGraph(Workflow workflow) {
        Map<String, List<String>> graph = new HashMap<>();
        
        // 初始化所有节点
        for (Node node : workflow.getNodes()) {
            graph.put(node.getId(), new ArrayList<>());
        }
        
        // 添加依赖关系
        for (Edge edge : workflow.getEdges()) {
            List<String> dependencies = graph.get(edge.getTarget());
            dependencies.add(edge.getSource());
            graph.put(edge.getTarget(), dependencies);
        }
        
        return graph;
    }

    // 拓扑排序
    private List<String> topologicalSort(Map<String, List<String>> graph) throws Exception {
        Map<String, Integer> inDegree = new HashMap<>();
        List<String> result = new ArrayList<>();
        Queue<String> queue = new LinkedList<>();
        
        // 计算入度
        for (Map.Entry<String, List<String>> entry : graph.entrySet()) {
            inDegree.put(entry.getKey(), entry.getValue().size());
            if (entry.getValue().size() == 0) {
                queue.add(entry.getKey());
            }
        }
        
        // 执行拓扑排序
        while (!queue.isEmpty()) {
            String node = queue.poll();
            result.add(node);
            
            // 更新依赖此节点的其他节点的入度
            for (Map.Entry<String, List<String>> entry : graph.entrySet()) {
                if (entry.getValue().contains(node)) {
                    int newInDegree = inDegree.get(entry.getKey()) - 1;
                    inDegree.put(entry.getKey(), newInDegree);
                    if (newInDegree == 0) {
                        queue.add(entry.getKey());
                    }
                }
            }
        }
        
        // 检查是否有环
        if (result.size() != graph.size()) {
            throw new Exception("工作流图中存在环，无法执行");
        }
        
        return result;
    }

    // 执行节点
    private void executeNodes(
            List<String> executionOrder,
            Workflow workflow,
            Map<String, Object> context,
            Consumer<NodeExecutionEvent> eventConsumer) throws Exception {
        for (String nodeId : executionOrder) {
            Node node = findNodeById(workflow.getNodes(), nodeId);
            if (node == null) continue;

            emitEvent(eventConsumer, NodeExecutionEvent.started(node.getId(), node.getType(), "节点开始执行"));
            
            switch (node.getType()) {
                case "input":
                    // 输入节点，已经在inputData中
                    emitEvent(eventConsumer, NodeExecutionEvent.completed(node.getId(), node.getType(), "输入节点就绪", Map.of(
                            "inputText", context.getOrDefault("inputText", "")
                    )));
                    break;
                case "model":
                    executeModelNode(node, context);
                    emitEvent(eventConsumer, NodeExecutionEvent.completed(node.getId(), node.getType(), "大模型节点执行完成", Map.of(
                            "modelOutput", context.getOrDefault("modelOutput", "")
                    )));
                    break;
                case "audio":
                    executeAudioNode(node, context);
                    emitEvent(eventConsumer, NodeExecutionEvent.completed(node.getId(), node.getType(), "音频节点执行完成", Map.of(
                            "audioUrl", context.getOrDefault("audioUrl", "")
                    )));
                    break;
                case "end":
                    // 结束节点，不需要执行
                    emitEvent(eventConsumer, NodeExecutionEvent.completed(node.getId(), node.getType(), "工作流结束", Map.of()));
                    break;
                default:
                    emitEvent(eventConsumer, NodeExecutionEvent.failed(node.getId(), node.getType(), "未知节点类型", "未知节点类型: " + node.getType()));
                    throw new Exception("未知节点类型: " + node.getType());
            }
        }
    }

    // 执行大模型节点
    private void executeModelNode(Node node, Map<String, Object> context) throws Exception {
        String prompt = (String) context.getOrDefault("inputText", "你好");
        String result = modelService.callDefaultModel(prompt);
        context.put("modelOutput", result);
    }

    // 执行音频合成节点
    private void executeAudioNode(Node node, Map<String, Object> context) throws Exception {
        String text = (String) context.getOrDefault("modelOutput", context.getOrDefault("inputText", "你好"));
        String audioUrl = audioService.synthesize(text);
        context.put("audioUrl", audioUrl);
    }

    private void emitEvent(Consumer<NodeExecutionEvent> eventConsumer, NodeExecutionEvent event) {
        if (eventConsumer != null) {
            eventConsumer.accept(event);
        }
    }

    // 根据ID查找节点
    private Node findNodeById(List<Node> nodes, String nodeId) {
        for (Node node : nodes) {
            if (node.getId().equals(nodeId)) {
                return node;
            }
        }
        return null;
    }

    // 验证工作流
    public WorkflowValidationResult validateWorkflow(Workflow workflow) {
        WorkflowValidationResult result = new WorkflowValidationResult();
        List<String> errors = new ArrayList<>();
        
        // 检查是否有输入节点
        boolean hasInputNode = workflow.getNodes().stream().anyMatch(node -> "input".equals(node.getType()));
        if (!hasInputNode) {
            errors.add("工作流必须包含至少一个输入节点");
        }
        
        // 检查是否有结束节点
        boolean hasEndNode = workflow.getNodes().stream().anyMatch(node -> "end".equals(node.getType()));
        if (!hasEndNode) {
            errors.add("工作流必须包含至少一个结束节点");
        }
        
        // 检查是否有环
        try {
            Map<String, List<String>> dependencyGraph = buildDependencyGraph(workflow);
            topologicalSort(dependencyGraph);
        } catch (Exception e) {
            errors.add("工作流图中存在环");
        }
        
        result.setValid(errors.isEmpty());
        result.setErrors(errors);
        return result;
    }

    // 工作流类
    public static class Workflow {
        private List<Node> nodes;
        private List<Edge> edges;

        // getters and setters
        public List<Node> getNodes() {
            return nodes;
        }

        public void setNodes(List<Node> nodes) {
            this.nodes = nodes;
        }

        public List<Edge> getEdges() {
            return edges;
        }

        public void setEdges(List<Edge> edges) {
            this.edges = edges;
        }
    }

    // 节点类
    public static class Node {
        private String id;
        private String type;
        private Map<String, Object> data;
        private Position position;

        // getters and setters
        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public Map<String, Object> getData() {
            return data;
        }

        public void setData(Map<String, Object> data) {
            this.data = data;
        }

        public Position getPosition() {
            return position;
        }

        public void setPosition(Position position) {
            this.position = position;
        }
    }

    // 边类
    public static class Edge {
        private String id;
        private String source;
        private String target;
        private String label;

        // getters and setters
        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public String getTarget() {
            return target;
        }

        public void setTarget(String target) {
            this.target = target;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }
    }

    // 位置类
    public static class Position {
        private double x;
        private double y;

        // getters and setters
        public double getX() {
            return x;
        }

        public void setX(double x) {
            this.x = x;
        }

        public double getY() {
            return y;
        }

        public void setY(double y) {
            this.y = y;
        }
    }

    // 工作流执行结果类
    public static class WorkflowResult {
        private boolean success;
        private Map<String, Object> data;
        private String error;
        private String audioUrl;

        // getters and setters
        public boolean isSuccess() {
            return success;
        }

        public void setSuccess(boolean success) {
            this.success = success;
        }

        public Map<String, Object> getData() {
            return data;
        }

        public void setData(Map<String, Object> data) {
            this.data = data;
        }

        public String getError() {
            return error;
        }

        public void setError(String error) {
            this.error = error;
        }

        public String getAudioUrl() {
            return audioUrl;
        }

        public void setAudioUrl(String audioUrl) {
            this.audioUrl = audioUrl;
        }
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

        public String getEventType() {
            return eventType;
        }

        public void setEventType(String eventType) {
            this.eventType = eventType;
        }

        public String getNodeId() {
            return nodeId;
        }

        public void setNodeId(String nodeId) {
            this.nodeId = nodeId;
        }

        public String getNodeType() {
            return nodeType;
        }

        public void setNodeType(String nodeType) {
            this.nodeType = nodeType;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public boolean isSuccess() {
            return success;
        }

        public void setSuccess(boolean success) {
            this.success = success;
        }

        public String getError() {
            return error;
        }

        public void setError(String error) {
            this.error = error;
        }

        public Map<String, Object> getData() {
            return data;
        }

        public void setData(Map<String, Object> data) {
            this.data = data;
        }

        public long getTimestamp() {
            return timestamp;
        }

        public void setTimestamp(long timestamp) {
            this.timestamp = timestamp;
        }
    }

    // 工作流验证结果类
    public static class WorkflowValidationResult {
        private boolean valid;
        private List<String> errors;

        // getters and setters
        public boolean isValid() {
            return valid;
        }

        public void setValid(boolean valid) {
            this.valid = valid;
        }

        public List<String> getErrors() {
            return errors;
        }

        public void setErrors(List<String> errors) {
            this.errors = errors;
        }
    }
}