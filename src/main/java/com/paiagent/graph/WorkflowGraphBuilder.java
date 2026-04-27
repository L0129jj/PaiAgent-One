package com.paiagent.graph;

import org.bsc.langgraph4j.CompiledGraph;
import org.bsc.langgraph4j.StateGraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

import static org.bsc.langgraph4j.StateGraph.START;
import static org.bsc.langgraph4j.StateGraph.END;
import static org.bsc.langgraph4j.action.AsyncNodeAction.node_async;
import static org.bsc.langgraph4j.action.AsyncEdgeAction.edge_async;

/**
 * 工作流图构建器 - 使用 LangGraph4j StateGraph 构建有状态工作流
 * 替代原 WorkflowService 中手写的拓扑排序和节点遍历逻辑
 */
@Component
public class WorkflowGraphBuilder {
    private static final Logger logger = LoggerFactory.getLogger(WorkflowGraphBuilder.class);

    private final ModelNodeAction modelNodeAction;
    private final AudioNodeAction audioNodeAction;

    public WorkflowGraphBuilder(ModelNodeAction modelNodeAction,
                                 AudioNodeAction audioNodeAction) {
        this.modelNodeAction = modelNodeAction;
        this.audioNodeAction = audioNodeAction;
    }

    /**
     * 构建并编译默认工作流图：
     * START → input → model → [条件路由] → audio → END
     *                                    → END (跳过音频)
     *
     * 使用 LangGraph4j 的 StateGraph 实现：
     * - addNode: 注册节点动作
     * - addEdge: 定义固定路由
     * - addConditionalEdges: 实现条件路由（根据模型输出决定是否合成语音）
     */
    public CompiledGraph<WorkflowState> buildDefaultGraph() throws Exception {
        StateGraph<WorkflowState> graph = new StateGraph<>(WorkflowState.SCHEMA, WorkflowState::new);

        // ========== 注册节点 ==========

        // 输入节点：将用户输入透传到状态中
        graph.addNode("input", node_async(state -> {
            logger.info("【输入节点】用户输入: {}", state.inputText());
            return Map.of();
        }));

        // 大模型节点：通过 Spring AI ChatClient 调用 LLM
        graph.addNode("model", node_async(state -> modelNodeAction.execute(state)));

        // 音频合成节点：通过 DashScope SDK 合成语音
        graph.addNode("audio", node_async(state -> audioNodeAction.execute(state)));

        // ========== 定义边（路由） ==========

        // START → input
        graph.addEdge(START, "input");

        // input → model
        graph.addEdge("input", "model");

        // model → 条件路由（核心亮点：LangGraph4j 条件边）
        // 根据模型输出内容决定是否需要音频合成
        graph.addConditionalEdges("model",
                edge_async(state -> {
                    String output = state.modelOutput();
                    String error = state.error();

                    // 如果有错误，直接结束
                    if (error != null && !error.isBlank()) {
                        logger.warn("模型节点出错，跳过音频合成: {}", error);
                        return "skip";
                    }

                    // 如果模型输出为空，跳过音频
                    if (output == null || output.isBlank()) {
                        logger.warn("模型输出为空，跳过音频合成");
                        return "skip";
                    }

                    // 如果模型输出是 URL（如图片），跳过语音合成
                    if (output.trim().startsWith("http")) {
                        logger.info("模型输出为 URL，跳过语音合成");
                        return "skip";
                    }

                    // 正常文本输出 → 进行语音合成
                    return "synthesize";
                }),
                Map.of(
                        "synthesize", "audio",
                        "skip", END
                )
        );

        // audio → END
        graph.addEdge("audio", END);

        // ========== 编译图 ==========
        logger.info("工作流图编译完成: START → input → model → [条件路由] → audio → END");
        return graph.compile();
    }
}
