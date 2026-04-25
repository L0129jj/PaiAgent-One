package com.paiagent.controller;

import com.paiagent.entity.User;
import com.paiagent.exception.UnauthorizedException;
import com.paiagent.interceptor.AuthInterceptor;
import com.paiagent.service.TextInputService;
import com.paiagent.service.WorkflowService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/workflow")
public class WorkflowController {
    private static final Logger logger = LoggerFactory.getLogger(WorkflowController.class);

    @Autowired
    private WorkflowService workflowService;

    @Autowired
    private TextInputService textInputService;

    // 执行工作流
    @PostMapping("/execute")
    public ResponseEntity<WorkflowService.WorkflowResult> executeWorkflow(
            HttpServletRequest servletRequest,
            @RequestBody ExecuteWorkflowRequest request) {
        try {
            User user = getCurrentUser(servletRequest);
            WorkflowService.Workflow workflow = ensureWorkflow(request.getWorkflow());
            Map<String, Object> inputData = request.getInputData() == null ? Map.of() : request.getInputData();
            persistInputText(user, inputData);
            WorkflowService.WorkflowResult result = workflowService.execute(workflow, inputData);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("执行工作流失败", e);
            WorkflowService.WorkflowResult result = new WorkflowService.WorkflowResult();
            result.setSuccess(false);
            result.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
        }
    }

    @PostMapping(value = "/execute/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter executeWorkflowStream(
            HttpServletRequest servletRequest,
            @RequestBody ExecuteWorkflowRequest request) {
        SseEmitter emitter = new SseEmitter(120000L);
        User user = getCurrentUser(servletRequest);

        CompletableFuture.runAsync(() -> {
            try {
                WorkflowService.Workflow workflow = ensureWorkflow(request.getWorkflow());
                Map<String, Object> inputData = request.getInputData() == null ? Map.of() : request.getInputData();
                persistInputText(user, inputData);

                WorkflowService.WorkflowResult result = workflowService.executeWithEvents(workflow, inputData, event -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name(event.getEventType())
                                .data(event));
                    } catch (IOException ioException) {
                        throw new RuntimeException(ioException);
                    }
                });

                emitter.send(SseEmitter.event().name("workflow_result").data(result));
                emitter.complete();
            } catch (Exception e) {
                logger.error("流式执行工作流失败", e);
                try {
                    Map<String, Object> errorPayload = Map.of(
                            "success", false,
                            "message", "流式执行失败",
                            "error", e.getMessage()
                    );
                    emitter.send(SseEmitter.event().name("workflow_error").data(errorPayload));
                } catch (IOException ignored) {
                    logger.warn("发送错误事件失败", ignored);
                }
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }

    // 验证工作流
    @PostMapping("/validate")
    public ResponseEntity<WorkflowService.WorkflowValidationResult> validateWorkflow(
            @RequestBody WorkflowService.Workflow workflow) {
        try {
            WorkflowService.WorkflowValidationResult result = workflowService.validateWorkflow(workflow);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("验证工作流失败", e);
            WorkflowService.WorkflowValidationResult result = new WorkflowService.WorkflowValidationResult();
            result.setValid(false);
            result.setErrors(List.of(e.getMessage()));
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
        }
    }

    private void persistInputText(User user, Map<String, Object> inputData) {
        if (inputData == null) {
            return;
        }

        Object rawInput = inputData.get("inputText");
        if (!(rawInput instanceof String)) {
            return;
        }

        String inputText = ((String) rawInput).trim();
        if (inputText.isEmpty()) {
            return;
        }

        textInputService.saveInput(user, inputText);
    }

    private User getCurrentUser(HttpServletRequest servletRequest) {
        Object user = servletRequest.getAttribute(AuthInterceptor.AUTH_USER_ATTR);
        if (!(user instanceof User)) {
            throw new UnauthorizedException("登录状态已失效，请重新登录");
        }
        return (User) user;
    }

    // 测试工作流
    @PostMapping("/test")
    public ResponseEntity<WorkflowService.WorkflowResult> testWorkflow(
            @RequestBody Map<String, Object> request) {
        try {
            String inputText = (String) request.get("inputText");
            
            // 构建测试工作流
            WorkflowService.Workflow workflow = new WorkflowService.Workflow();
            
            // 创建节点
            WorkflowService.Node inputNode = new WorkflowService.Node();
            inputNode.setId("1");
            inputNode.setType("input");
            
            WorkflowService.Node modelNode = new WorkflowService.Node();
            modelNode.setId("2");
            modelNode.setType("model");
            
            WorkflowService.Node audioNode = new WorkflowService.Node();
            audioNode.setId("3");
            audioNode.setType("audio");
            
            WorkflowService.Node endNode = new WorkflowService.Node();
            endNode.setId("4");
            endNode.setType("end");
            
            // 创建边
            WorkflowService.Edge edge1 = new WorkflowService.Edge();
            edge1.setId("1");
            edge1.setSource("1");
            edge1.setTarget("2");
            
            WorkflowService.Edge edge2 = new WorkflowService.Edge();
            edge2.setId("2");
            edge2.setSource("2");
            edge2.setTarget("3");
            
            WorkflowService.Edge edge3 = new WorkflowService.Edge();
            edge3.setId("3");
            edge3.setSource("3");
            edge3.setTarget("4");
            
            // 设置工作流
            workflow.setNodes(List.of(inputNode, modelNode, audioNode, endNode));
            workflow.setEdges(List.of(edge1, edge2, edge3));
            
            // 执行工作流
            Map<String, Object> inputData = Map.of("inputText", inputText);
            WorkflowService.WorkflowResult result = workflowService.execute(workflow, inputData);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("测试工作流失败", e);
            WorkflowService.WorkflowResult result = new WorkflowService.WorkflowResult();
            result.setSuccess(false);
            result.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
        }
    }

    private WorkflowService.Workflow ensureWorkflow(WorkflowService.Workflow workflow) {
        if (workflow == null || workflow.getNodes() == null || workflow.getNodes().isEmpty()) {
            return buildDefaultWorkflow();
        }

        if (workflow.getEdges() == null) {
            workflow.setEdges(new ArrayList<>());
        }
        return workflow;
    }

    private WorkflowService.Workflow buildDefaultWorkflow() {
        WorkflowService.Workflow workflow = new WorkflowService.Workflow();

        WorkflowService.Node inputNode = new WorkflowService.Node();
        inputNode.setId("1");
        inputNode.setType("input");

        WorkflowService.Node modelNode = new WorkflowService.Node();
        modelNode.setId("2");
        modelNode.setType("model");

        WorkflowService.Node audioNode = new WorkflowService.Node();
        audioNode.setId("3");
        audioNode.setType("audio");

        WorkflowService.Node endNode = new WorkflowService.Node();
        endNode.setId("4");
        endNode.setType("end");

        WorkflowService.Edge edge1 = new WorkflowService.Edge();
        edge1.setId("1");
        edge1.setSource("1");
        edge1.setTarget("2");

        WorkflowService.Edge edge2 = new WorkflowService.Edge();
        edge2.setId("2");
        edge2.setSource("2");
        edge2.setTarget("3");

        WorkflowService.Edge edge3 = new WorkflowService.Edge();
        edge3.setId("3");
        edge3.setSource("3");
        edge3.setTarget("4");

        workflow.setNodes(List.of(inputNode, modelNode, audioNode, endNode));
        workflow.setEdges(List.of(edge1, edge2, edge3));
        return workflow;
    }

    public static class ExecuteWorkflowRequest {
        private WorkflowService.Workflow workflow;
        private Map<String, Object> inputData = new HashMap<>();

        public WorkflowService.Workflow getWorkflow() {
            return workflow;
        }

        public void setWorkflow(WorkflowService.Workflow workflow) {
            this.workflow = workflow;
        }

        public Map<String, Object> getInputData() {
            return inputData;
        }

        public void setInputData(Map<String, Object> inputData) {
            this.inputData = inputData;
        }
    }
}