import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, { 
  addEdge, 
  useNodesState, 
  useEdgesState, 
  Controls, 
  Background,
  MiniMap,
  Connection,
  Node, 
  Edge,
  NodeTypes,
  Handle,
  Position,
  MarkerType
} from 'reactflow';
// @ts-ignore
import 'reactflow/dist/style.css';
import LoginPage from './LoginPage';

type NodeStatus = 'idle' | 'running' | 'success' | 'error';

type OutputParam = {
  name: string;
  type: 'input' | 'ref';
  value: string;
};

type WorkflowNodeData = {
  label?: string;
  status?: NodeStatus;
  config?: {
    outputParams?: OutputParam[];
    answerContent?: string;
    // LLM Config
    apiEndpoint?: string;
    apiKey?: string;
    temperature?: number;
    modelName?: string;
    systemPrompt?: string;
    userPrompt?: string;
    inputRef?: string;
    configSaved?: boolean;
    // Audio Config
    textType?: 'input' | 'ref';
    textValue?: string;
    voice?: string;
    languageType?: string;
  };
};

type WorkflowCanvasNode = Node<WorkflowNodeData>;

type StreamEventPayload = {
  eventType?: string;
  nodeId?: string;
  nodeType?: string;
  message?: string;
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
  durationMs?: number;
};

type LogEntry = {
  time: string;
  elapsed: number;
  text: string;
};

type NodeDebugInfo = {
  status: NodeStatus;
  durationMs: number;
  input: string;
  output: string;
  error: string;
};

const emptyNodeDebug = (): NodeDebugInfo => ({ status: 'idle', durationMs: 0, input: '', output: '', error: '' });

type TextRecord = {
  id: number;
  inputText: string;
  createdAt: string;
};

const AUTH_TOKEN_HEADER = 'X-Auth-Token';

const getStatusClassName = (status: NodeStatus | undefined): string => {
  switch (status) {
    case 'running':
      return 'node-status-running';
    case 'success':
      return 'node-status-success';
    case 'error':
      return 'node-status-error';
    default:
      return 'node-status-idle';
  }
};

// 自定义节点类型
const InputNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node input-node ${getStatusClassName(status)}`}>
      <div className="node-title">📥 输入</div>
      <div className="node-description">用户输入文本</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const ModelNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node model-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">🧠 {data.label || '大模型'}</div>
      <div className="node-description">AI 文本生成</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const AudioNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node audio-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">🎙 {data.label || '超拟人音频合成'}</div>
      <div className="node-description">语音合成</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const EndNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node end-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">📤 输出</div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  input: InputNode,
  model: ModelNode,
  audio: AudioNode,
  end: EndNode,
};

const initialNodes: WorkflowCanvasNode[] = [
  {
    id: '1',
    type: 'input',
    position: { x: 250, y: 50 },
    data: { label: '用户输入', status: 'idle' },
  },
  {
    id: '2',
    type: 'model',
    position: { x: 250, y: 180 },
    data: { 
      label: '通义千问', 
      status: 'idle',
      config: {
        apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        temperature: 0.7,
        modelName: 'qwen-plus',
        systemPrompt: '你是一个有用的AI助手。',
        userPrompt: `# 角色\n你是一位专业的广播节目编辑，负责制作一档名为“AI电台”的节目。你的任务是将用户提供的原始内容改编为适合单口相声播客节目的逐字稿。\n# 任务\n将原始内容分解为若干主题或问题，确保每段对话涵盖关键点，并自然过渡。\n# 注意点\n确保对话语言口语化、易懂。\n对于专业术语或复杂概念，使用简单明了的语言进行解释，使听众更易理解。\n保持对话节奏轻松、有趣，并加入适当的幽默和互动，以提高听众的参与感。\n注意：我会直接将你生成的内容朗读出来，不要输出口播稿以外的东西，不要带格式，\n# 示例 \n欢迎收听AI电台，今天咱们的节目一定让你们大开眼界！ \n没错！今天的主题绝对精彩，快搬小板凳听好哦！ \n那么，今天我们要讨论的内容是……\n# 原始内容：{{input}}`,
        inputRef: 'input.user_input'
      }
    },
  },
  {
    id: '3',
    type: 'audio',
    position: { x: 250, y: 310 },
    data: { 
      label: '超拟人音频', 
      status: 'idle',
      config: {
        apiKey: '',
        modelName: 'cosyvoice-v1',
        textType: 'ref',
        textValue: 'model.output',
        voice: 'longxiaochun',
        languageType: 'Auto'
      }
    },
  },
  {
    id: '4',
    type: 'end',
    position: { x: 250, y: 440 },
    data: { 
      label: '输出', 
      status: 'idle',
      config: {
        outputParams: [],
        answerContent: ''
      }
    },
  },
];

const initialEdges: Edge[] = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' } 
  },
  { 
    id: 'e2-3', 
    source: '2', 
    target: '3', 
    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' } 
  },
  { 
    id: 'e3-4', 
    source: '3', 
    target: '4', 
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } 
  },
];

function App() {
  /* ---- auth state ---- */
  const [token, setToken] = useState<string>(localStorage.getItem('authToken') ?? '');
  const [currentUser, setCurrentUser] = useState<string>(localStorage.getItem('authUsername') ?? '');
  const [authChecking, setAuthChecking] = useState(true);

  /* ---- sidebar state ---- */
  const [modelCategoryOpen, setModelCategoryOpen] = useState(true);
  const [toolCategoryOpen, setToolCategoryOpen] = useState(true);
  const [workflowName, setWorkflowName] = useState('我的工作流');

  /* ---- canvas state ---- */
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<WorkflowCanvasNode | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<NodeStatus>('idle');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_workflowStartTime, setWorkflowStartTime] = useState<number>(0);
  const [modelNodeDebug, setModelNodeDebug] = useState<NodeDebugInfo>(emptyNodeDebug());
  const [audioNodeDebug, setAudioNodeDebug] = useState<NodeDebugInfo>(emptyNodeDebug());
  const [recentInputs, setRecentInputs] = useState<TextRecord[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [completedNodesCount, setCompletedNodesCount] = useState(0);

  const logEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动日志到底部
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  /* ---- helpers ---- */
  const clearAuthState = useCallback(() => {
    setToken('');
    setCurrentUser('');
    setRecentInputs([]);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUsername');
  }, []);

  const parseErrorMessage = useCallback(async (response: Response, fallback: string): Promise<string> => {
    try {
      const data = await response.json() as { error?: string };
      return data.error ?? fallback;
    } catch {
      return fallback;
    }
  }, []);

  const protectedFetch = useCallback(async (url: string, init: RequestInit, authToken: string) => {
    const headers = {
      ...(init.headers ?? {}),
      [AUTH_TOKEN_HEADER]: authToken
    };

    const response = await fetch(url, {
      ...init,
      headers
    });

    if (response.status === 401) {
      clearAuthState();
      throw new Error('登录状态已失效，请重新登录');
    }

    return response;
  }, [clearAuthState]);

  /* ---- verify token on mount ---- */
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (!storedToken) {
      setAuthChecking(false);
      return;
    }

    fetch('/api/auth/me', {
      method: 'GET',
      headers: { [AUTH_TOKEN_HEADER]: storedToken },
    })
      .then(async (res) => {
        if (!res.ok) {
          clearAuthState();
          return;
        }
        const data = (await res.json()) as { success: boolean; username?: string };
        if (data.success && data.username) {
          setToken(storedToken);
          setCurrentUser(data.username);
        } else {
          clearAuthState();
        }
      })
      .catch(() => {
        clearAuthState();
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- login success callback (from LoginPage) ---- */
  const handleLoginSuccess = useCallback((newToken: string, username: string) => {
    setToken(newToken);
    setCurrentUser(username);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUsername', username);
  }, []);

  /* ---- logout ---- */
  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { [AUTH_TOKEN_HEADER]: token },
        });
      } catch {
        // ignore network errors on logout
      }
    }
    clearAuthState();
  }, [token, clearAuthState]);

  /* ---- canvas actions ---- */
  const updateNodeConfig = useCallback((nodeId: string, updates: Partial<WorkflowNodeData['config']>) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...(node.data.config ?? {}),
            ...updates
          }
        }
      };
    }));
  }, [setNodes]);

  const addNode = useCallback((type: string, position: { x: number; y: number }, label?: string) => {
    const defaultLabel = label || (type === 'model' ? '大模型' : type === 'input' ? '用户输入' : type === 'audio' ? '超拟人音频' : '结束');
    const newNode: WorkflowCanvasNode = {
      id: Date.now().toString(),
      type,
      position,
      data: { 
        label: defaultLabel, 
        status: 'idle',
        config: type === 'model' ? {
          apiEndpoint: label === 'DeepSeek' ? 'https://api.deepseek.com/chat/completions' :
                       label === '通义千问' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' :
                       label === 'GPT-4' ? 'https://api.openai.com/v1/chat/completions' :
                       label === '智谱' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' : '',
          temperature: 0.7,
          modelName: label === 'DeepSeek' ? 'deepseek-chat' :
                     label === '通义千问' ? 'qwen-plus' :
                     label === 'GPT-4' ? 'gpt-4-turbo' :
                     label === '智谱' ? 'glm-4' : '',
          systemPrompt: '你是一个有用的AI助手。',
          userPrompt: `# 角色\n你是一位专业的广播节目编辑，负责制作一档名为“AI电台”的节目。你的任务是将用户提供的原始内容改编为适合单口相声播客节目的逐字稿。\n# 任务\n将原始内容分解为若干主题或问题，确保每段对话涵盖关键点，并自然过渡。\n# 注意点\n确保对话语言口语化、易懂。\n对于专业术语或复杂概念，使用简单明了的语言进行解释，使听众更易理解。\n保持对话节奏轻松、有趣，并加入适当的幽默和互动，以提高听众的参与感。\n注意：我会直接将你生成的内容朗读出来，不要输出口播稿以外的东西，不要带格式，\n# 示例 \n欢迎收听AI电台，今天咱们的节目一定让你们大开眼界！ \n没错！今天的主题绝对精彩，快搬小板凳听好哦！ \n那么，今天我们要讨论的内容是……\n# 原始内容：{{input}}`,
          inputRef: 'input.user_input'
        } : type === 'audio' ? {
          apiKey: '',
          modelName: 'cosyvoice-v1',
          textType: 'ref',
          textValue: 'model.output',
          voice: 'longxiaochun',
          languageType: 'Auto'
        } : {}
      }
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
    }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as WorkflowCanvasNode);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const resetNodeStatus = useCallback(() => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        status: 'idle'
      }
    })));
  }, [setNodes]);

  const setNodeStatus = useCallback((nodeId: string, status: NodeStatus) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          status
        }
      };
    }));
  }, [setNodes]);

  const pushLog = useCallback((text: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour12: false });
    setWorkflowStartTime((st) => {
      const elapsed = st > 0 ? now.getTime() - st : 0;
      setLogs((prev) => [...prev, { time, elapsed, text }]);
      return st;
    });
  }, []);

  const loadRecentInputs = useCallback(async (authToken: string) => {
    if (!authToken) {
      setRecentInputs([]);
      return;
    }

    const response = await protectedFetch('/api/text-input/recent?limit=8', { method: 'GET' }, authToken);

    const data = await response.json() as { success: boolean; records?: TextRecord[]; error?: string };
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? '获取历史输入失败');
    }

    setRecentInputs(data.records ?? []);
  }, [protectedFetch]);

  useEffect(() => {
    if (!token) {
      setRecentInputs([]);
      return;
    }

    loadRecentInputs(token).catch((error) => {
      console.error(error);
      setRecentInputs([]);
    });
  }, [token, loadRecentInputs]);

  // 处理 Web Speech API (真人语音合成)
  useEffect(() => {
    if (audioUrl.startsWith('tts://')) {
      const textToSpeak = decodeURIComponent(audioUrl.replace('tts://', ''));
      if (textToSpeak) {
        // 停止当前正在进行的朗读
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        // 自动选择中文声音（如果可用）
        const voices = window.speechSynthesis.getVoices();
        const chineseVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
        if (chineseVoice) {
          utterance.voice = chineseVoice;
        }
        utterance.rate = 1.0; // 语速
        utterance.pitch = 1.0; // 音调
        
        window.speechSynthesis.speak(utterance);
        pushLog(`[语音合成] 正在朗读: ${textToSpeak.substring(0, 20)}...`);
      }
    }
  }, [audioUrl, pushLog]);

  const saveInputText = async () => {
    if (!token) {
      alert('请先登录');
      return;
    }

    if (!inputText.trim()) {
      alert('请输入文本');
      return;
    }

    try {
      const response = await protectedFetch('/api/text-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputText })
      }, token);

      const data = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? '保存失败');
      }

      await loadRecentInputs(token);
      alert('输入文本已保存');
    } catch (error) {
      alert(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const parseSseChunk = useCallback((chunk: string) => {
    const blocks = chunk.split('\n\n');

    blocks.forEach((block) => {
      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event:'));
      const dataLine = lines.find((line) => line.startsWith('data:'));

      if (!dataLine) {
        return;
      }

      const eventName = eventLine ? eventLine.replace('event:', '').trim() : 'message';
      const rawData = dataLine.replace('data:', '').trim();

      if (!rawData) {
        return;
      }

      let payload: StreamEventPayload;
      try {
        payload = JSON.parse(rawData) as StreamEventPayload;
      } catch {
        pushLog(`[${eventName}] ${rawData}`);
        return;
      }

      const nType = payload.nodeType ?? 'unknown';
      const dur = payload.durationMs ?? 0;

      if (eventName === 'node_started' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'running');
        pushLog(`▶ 开始: ${nType}(${payload.nodeId})`);
        // 实时更新节点调试卡片
        if (nType === 'model') {
          setModelNodeDebug(prev => ({ ...prev, status: 'running', input: (payload.data?.prompt as string) ?? '', error: '', output: '', durationMs: 0 }));
        } else if (nType === 'audio') {
          setAudioNodeDebug(prev => ({ ...prev, status: 'running', input: (payload.data?.text as string) ?? '', error: '', output: '', durationMs: 0 }));
        }
      } else if (eventName === 'node_progress' && payload.nodeId) {
        // 收到进度更新
        pushLog(`⏳ 进度: ${payload.message ?? '处理中...'}`);
      } else if (eventName === 'node_completed' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'success');
        setCompletedNodesCount((prev) => prev + 1); // 增加进度计数
        pushLog(`✅ 完成: ${nType}(${payload.nodeId}) ${dur}ms`);
        if (nType === 'model') {
          setModelNodeDebug(prev => ({ ...prev, status: 'success', durationMs: dur, output: (payload.data?.modelOutput as string) ?? '' }));
        } else if (nType === 'audio') {
          setAudioNodeDebug(prev => ({ ...prev, status: 'success', durationMs: dur, output: (payload.data?.audioUrl as string) ?? '' }));
        }
      } else if (eventName === 'node_failed' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'error');
        setCompletedNodesCount((prev) => prev + 1); // 失败也计入进度
        const errMsg = payload.error ?? '未知错误';
        pushLog(`❌ 失败: ${nType}(${payload.nodeId}) ${dur}ms - ${errMsg}`);
        if (nType === 'model') {
          setModelNodeDebug(prev => ({ ...prev, status: 'error', durationMs: dur, error: errMsg }));
        } else if (nType === 'audio') {
          setAudioNodeDebug(prev => ({ ...prev, status: 'error', durationMs: dur, error: errMsg }));
        }
      } else if (eventName === 'workflow_result') {
        const nextAudioUrl = (payload as unknown as { audioUrl?: string; data?: Record<string, unknown> }).audioUrl
          ?? (payload.data?.audioUrl as string | undefined)
          ?? '';
        if (nextAudioUrl) {
          setAudioUrl(nextAudioUrl);
        }
        pushLog('🎉 工作流执行完成');
        setWorkflowStatus('success');
      } else if (eventName === 'workflow_error') {
        pushLog(`🔴 工作流失败: ${payload.error ?? '未知错误'}`);
        setWorkflowStatus('error');
      }
    });
  }, [pushLog, setNodeStatus]);

  // 测试工作流（流式）
  const testWorkflow = async () => {
    try {
      if (!inputText.trim()) {
        alert('请输入测试文本');
        return;
      }

      if (!token) {
        alert('请先登录');
        return;
      }

      if (nodes.length === 0) {
        alert('请先在画布上添加节点');
        return;
      }

      setIsLoading(true);
      setAudioUrl('');
      setLogs([]);
      setWorkflowStatus('running');
      setWorkflowStartTime(Date.now());
      setModelNodeDebug(emptyNodeDebug());
      setAudioNodeDebug(emptyNodeDebug());
      resetNodeStatus();
      setCompletedNodesCount(0); // 重置已完成节点计数

      pushLog('开始执行工作流...');

      const response = await protectedFetch('/api/workflow/execute/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workflow: {
            nodes,
            edges
          },
          inputData: {
            inputText
          }
        })
      }, token);

      if (!response.ok || !response.body) {
        const message = await parseErrorMessage(response, `请求失败: ${response.status}`);
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        events.forEach((eventText) => {
          parseSseChunk(eventText + '\n\n');
        });
      }

      if (buffer.trim()) {
        parseSseChunk(buffer);
      }

      await loadRecentInputs(token);
    } catch (error) {
      console.error('测试工作流时出错:', error);
      pushLog(`执行异常: ${error instanceof Error ? error.message : '未知错误'}`);
      setWorkflowStatus('error');
      alert(`测试工作流时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addOutputParam = useCallback((nodeId: string) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id !== nodeId) return node;
      const currentParams = node.data.config?.outputParams ?? [];
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...(node.data.config ?? {}),
            outputParams: [...currentParams, { name: '', type: 'input', value: '' }]
          }
        }
      };
    }));
  }, [setNodes]);

  const updateOutputParam = useCallback((nodeId: string, index: number, updates: Partial<OutputParam>) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id !== nodeId) return node;
      const currentParams = [...(node.data.config?.outputParams ?? [])];
      currentParams[index] = { ...currentParams[index], ...updates };
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...(node.data.config ?? {}),
            outputParams: currentParams
          }
        }
      };
    }));
  }, [setNodes]);

  const removeOutputParam = useCallback((nodeId: string, index: number) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id !== nodeId) return node;
      const currentParams = (node.data.config?.outputParams ?? []).filter((_, i) => i !== index);
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...(node.data.config ?? {}),
            outputParams: currentParams
          }
        }
      };
    }));
  }, [setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [setNodes, setEdges, selectedNode]);


  /* ---- render: auth checking splash ---- */
  if (authChecking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a3e 40%, #24243e 100%)',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
      }}>
        <span className="login-spinner" style={{ marginRight: 10 }} />
        正在验证登录状态…
      </div>
    );
  }

  /* ---- render: login page ---- */
  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  /* ---- render: main app ---- */
  return (
    <div className="app-shell">
      {/* ===== 顶部导航栏 ===== */}
      <header className="app-topbar">
        <div className="topbar-left">
          <span className="topbar-brand">PaiAgent</span>
          <input
            className="topbar-wf-name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="工作流名称"
          />
        </div>
        <div className="topbar-center">
          <button className="btn btn-sm" onClick={() => { setNodes(initialNodes); setEdges(initialEdges); resetNodeStatus(); setLogs([]); setAudioUrl(''); }}>
            + 新建
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setToastType('success'); setToastMessage('工作流已保存'); setTimeout(() => setToastMessage(null), 2000); }}>
            📋 保存
          </button>
          <button className="btn btn-accent btn-sm" onClick={() => setDebugOpen(true)}>
            ⚙ 调试
          </button>
        </div>
        <div className="topbar-right">
          <div className="topbar-user">
            <div className="topbar-user-icon">{currentUser.charAt(0).toUpperCase()}</div>
            {currentUser}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={async () => await logout()}>登出</button>
        </div>
      </header>

      {/* ===== 主体三栏 ===== */}
      <div className="app-body">
        {/* ---- 左侧节点库 ---- */}
        <aside className="node-library">
          <div className="node-library-header">节点库</div>
          <div className="node-library-body custom-scrollbar">
            {/* 大模型节点 */}
            <button className="node-category-toggle" onClick={() => setModelCategoryOpen(!modelCategoryOpen)}>
              <span>🧠</span> 大模型节点
              <svg className={`chevron ${modelCategoryOpen ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`node-category-items ${modelCategoryOpen ? 'expanded' : 'collapsed'}`}>
              {[
                { id: 'deepseek', label: 'DeepSeek', icon: '🔵', bg: '#eff6ff' },
                { id: 'qwen', label: '通义千问', icon: '✨', bg: '#ecfdf5' },
                { id: 'gpt4', label: 'GPT-4', icon: '🟢', bg: '#f0fdf4' },
                { id: 'zhipu', label: '智谱', icon: '🌐', bg: '#faf5ff' },
              ].map(m => (
                <div key={m.id} className="node-lib-item" onClick={() => addNode('model', { x: 200 + Math.random()*100, y: 100 + Math.random()*200 }, m.label)}>
                  <div className="node-lib-icon" style={{ background: m.bg }}>{m.icon}</div>
                  {m.label}
                </div>
              ))}
            </div>

            {/* 工具节点 */}
            <button className="node-category-toggle" onClick={() => setToolCategoryOpen(!toolCategoryOpen)} style={{ marginTop: 8 }}>
              <span>🛠</span> 工具节点
              <svg className={`chevron ${toolCategoryOpen ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`node-category-items ${toolCategoryOpen ? 'expanded' : 'collapsed'}`}>
              <div className="node-lib-item" onClick={() => addNode('audio', { x: 200 + Math.random()*100, y: 250 + Math.random()*100 })}>
                <div className="node-lib-icon" style={{ background: '#faf5ff' }}>🎙</div>
                超拟人音频合成
              </div>
            </div>
          </div>
          <div className="node-library-hint">💡 点击节点添加到画布</div>
        </aside>

        {/* ---- 中间画布 ---- */}
        <main className="canvas-area">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
          >
            <Controls />
            <Background />
            <MiniMap />
          </ReactFlow>
        </main>

        {/* ---- 右侧配置面板 ---- */}
        <aside className="config-panel">
          <div className="config-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>节点配置</span>
            {selectedNode && (
              <button 
                className="btn btn-sm" 
                style={{ color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', padding: '4px 8px', fontSize: 11 }} 
                onClick={() => deleteNode(selectedNode.id)}
              >
                删除节点
              </button>
            )}
          </div>
          <div className="config-panel-body custom-scrollbar">
            {selectedNode ? (
              <>
                {/* 通用信息 */}
                <div className="config-section">
                  <span className="config-label">节点 ID</span>
                  <div className="config-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedNode.id}</div>
                </div>
                <div className="config-section">
                  <span className="config-label">节点类型</span>
                  <div className="config-value">{selectedNode.type}</div>
                </div>
                <div className="config-divider" />

                {/* ==== 输入节点 ==== */}
                {selectedNode.type === 'input' && (
                  <>
                    <div className="config-section">
                      <span className="config-label">变量名</span>
                      <div className="config-value" style={{ color: '#2563eb', background: '#eff6ff' }}>user_input</div>
                    </div>
                    <div className="config-section">
                      <span className="config-label">变量类型</span>
                      <div className="config-value">String</div>
                    </div>
                    <div className="config-section">
                      <span className="config-label">描述</span>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>用户本轮的输入内容</p>
                    </div>
                  </>
                )}

                {/* ==== 模型节点 ==== */}
                {selectedNode.type === 'model' && (() => {
                  const currentLabel = nodes.find(n => n.id === selectedNode.id)?.data.label;
                  let endpointPlaceholder = "https://api.example.com/v1/chat/completions";
                  let modelPlaceholder = "model-name";
                  if (currentLabel === 'DeepSeek') {
                    endpointPlaceholder = "https://api.deepseek.com/chat/completions";
                    modelPlaceholder = "deepseek-chat";
                  } else if (currentLabel === '通义千问') {
                    endpointPlaceholder = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
                    modelPlaceholder = "qwen-plus";
                  } else if (currentLabel === 'GPT-4') {
                    endpointPlaceholder = "https://api.openai.com/v1/chat/completions";
                    modelPlaceholder = "gpt-4-turbo";
                  } else if (currentLabel === '智谱') {
                    endpointPlaceholder = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
                    modelPlaceholder = "glm-4";
                  }

                  return (
                  <>
                    <div className="config-section">
                      <span className="config-label"><span style={{ color: '#ef4444' }}>*</span> 接口地址</span>
                      <input className="config-input" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.apiEndpoint ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { apiEndpoint: e.target.value, configSaved: false })} placeholder={endpointPlaceholder} />
                    </div>
                    <div className="config-section">
                      <span className="config-label"><span style={{ color: '#ef4444' }}>*</span> API 密钥</span>
                      <input type="password" className="config-input" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.apiKey ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { apiKey: e.target.value, configSaved: false })} placeholder="sk-..." />
                    </div>
                    <div className="config-section">
                      <span className="config-label"><span style={{ color: '#ef4444' }}>*</span> 模型名</span>
                      <input className="config-input" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.modelName ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { modelName: e.target.value, configSaved: false })} placeholder={modelPlaceholder} />
                    </div>
                    <div className="config-section">
                      <span className="config-label">温度 ({nodes.find(n => n.id === selectedNode.id)?.data.config?.temperature ?? 0.7})</span>
                      <input type="range" min="0" max="2" step="0.1" style={{ width: '100%', accentColor: '#3b82f6' }} value={nodes.find(n => n.id === selectedNode.id)?.data.config?.temperature ?? 0.7} onChange={(e) => updateNodeConfig(selectedNode.id, { temperature: parseFloat(e.target.value), configSaved: false })} />
                    </div>
                    
                    <div className="config-divider" />
                    <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13, color: '#374151' }}>提示词配置</div>
                    <div className="config-section">
                      <span className="config-label">输入参数引用 ({"{{input}}"})</span>
                      <select className="config-select" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.inputRef ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { inputRef: e.target.value, configSaved: false })}>
                        <option value="">请选择引用来源...</option>
                        <option value="input.user_input">用户输入.user_input</option>
                      </select>
                    </div>
                    <div className="config-section">
                      <span className="config-label">系统提示词</span>
                      <textarea className="config-textarea" rows={3} value={nodes.find(n => n.id === selectedNode.id)?.data.config?.systemPrompt ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { systemPrompt: e.target.value, configSaved: false })} placeholder="你是一个有用的AI助手。" />
                    </div>
                    <div className="config-section">
                      <span className="config-label">用户提示词</span>
                      <textarea className="config-textarea" rows={6} value={nodes.find(n => n.id === selectedNode.id)?.data.config?.userPrompt ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { userPrompt: e.target.value, configSaved: false })} placeholder="在此输入包含 {{input}} 占位符的用户提示词..." />
                    </div>
                    
                    {nodes.find(n => n.id === selectedNode.id)?.data.config?.configSaved && (
                      <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>✅ 配置已保存</div>
                    )}
                    <button className="save-config-btn" onClick={() => {
                      const nd = nodes.find(n => n.id === selectedNode.id)?.data;
                      if (!nd?.config?.apiKey?.trim()) { setToastType('error'); setToastMessage('请填写 API 密钥'); setTimeout(() => setToastMessage(null), 3000); return; }
                      if (!nd?.config?.apiEndpoint?.trim()) { setToastType('error'); setToastMessage('请填写接口地址'); setTimeout(() => setToastMessage(null), 3000); return; }
                      updateNodeConfig(selectedNode.id, { configSaved: true });
                      setToastType('success'); setToastMessage(`「${nd?.label ?? '模型'}」配置已保存`); setTimeout(() => setToastMessage(null), 3000);
                    }}>保存配置</button>
                  </>
                  );
                })()}

                {/* ==== 音频节点 ==== */}
                {selectedNode.type === 'audio' && (
                  <>
                    <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13, color: '#374151' }}>基本信息</div>
                    <div className="config-section">
                      <span className="config-label">API Key <span style={{fontSize: 11, color: '#9ca3af', fontWeight: 'normal', marginLeft: 6}}>(留空则使用系统默认 Key)</span></span>
                      <input className="config-input" type="password" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.apiKey ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { apiKey: e.target.value, configSaved: false })} placeholder="sk-..." />
                    </div>
                    <div className="config-section">
                      <span className="config-label">模型名称</span>
                      <input className="config-input" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.modelName ?? 'cosyvoice-v1'} onChange={(e) => updateNodeConfig(selectedNode.id, { modelName: e.target.value, configSaved: false })} placeholder="cosyvoice-v1" />
                    </div>
                    
                    <div className="config-divider" />
                    <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13, color: '#374151' }}>输入配置</div>
                    <div className="config-section">
                      <span className="config-label">待合成文本 (text)</span>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <select className="config-select" style={{ width: 80, flex: 'none' }} value={nodes.find(n => n.id === selectedNode.id)?.data.config?.textType ?? 'ref'} onChange={(e) => updateNodeConfig(selectedNode.id, { textType: e.target.value as 'input'|'ref', configSaved: false })}>
                          <option value="input">输入</option>
                          <option value="ref">引用</option>
                        </select>
                        {nodes.find(n => n.id === selectedNode.id)?.data.config?.textType === 'input' ? (
                          <input className="config-input" style={{ flex: 1 }} placeholder="输入文本..." value={nodes.find(n => n.id === selectedNode.id)?.data.config?.textValue ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { textValue: e.target.value, configSaved: false })} />
                        ) : (
                          <select className="config-select" style={{ flex: 1 }} value={nodes.find(n => n.id === selectedNode.id)?.data.config?.textValue ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { textValue: e.target.value, configSaved: false })}>
                            <option value="">选择引用...</option>
                            <option value="input.user_input">用户输入.user_input</option>
                            <option value="model.output">大模型.output</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="config-section">
                      <span className="config-label">音色 (voice)</span>
                      <select className="config-select" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.voice ?? 'longxiaochun'} onChange={(e) => updateNodeConfig(selectedNode.id, { voice: e.target.value, configSaved: false })}>
                        <option value="longxiaochun">龙小淳 (longxiaochun)</option>
                        <option value="longwan">龙婉 (longwan)</option>
                        <option value="longcheng">龙橙 (longcheng)</option>
                        <option value="longjian">龙健 (longjian)</option>
                        <option value="longjielun">龙杰伦 (longjielun)</option>
                      </select>
                    </div>
                    <div className="config-section">
                      <span className="config-label">语言代码 (language_type)</span>
                      <select className="config-select" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.languageType ?? 'Auto'} onChange={(e) => updateNodeConfig(selectedNode.id, { languageType: e.target.value, configSaved: false })}>
                        <option value="Auto">Auto</option>
                      </select>
                    </div>

                    <div className="config-divider" />
                    <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13, color: '#374151' }}>输出配置</div>
                    <div className="config-section">
                      <div style={{ padding: 10, border: '1px solid #f3f4f6', borderRadius: 8, background: '#f9fafb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>变量名</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>voice_url</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>变量类型</span>
                          <span style={{ fontSize: 12, color: '#374151' }}>Audio URL</span>
                        </div>
                      </div>
                    </div>

                    {nodes.find(n => n.id === selectedNode.id)?.data.config?.configSaved && (
                      <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>✅ 配置已保存</div>
                    )}
                    <button className="save-config-btn" onClick={() => {
                      const nd = nodes.find(n => n.id === selectedNode.id)?.data;
                      if (nd?.config?.textType === 'input' && !nd?.config?.textValue?.trim()) { setToastType('error'); setToastMessage('请填写待合成文本'); setTimeout(() => setToastMessage(null), 3000); return; }
                      if (nd?.config?.textType === 'ref' && !nd?.config?.textValue) { setToastType('error'); setToastMessage('请选择待合成文本的引用来源'); setTimeout(() => setToastMessage(null), 3000); return; }
                      updateNodeConfig(selectedNode.id, { configSaved: true });
                      setToastType('success'); setToastMessage(`「${nd?.label ?? '音频'}」配置已保存`); setTimeout(() => setToastMessage(null), 3000);
                    }}>保存配置</button>
                  </>
                )}

                {/* ==== 输出节点 ==== */}
                {selectedNode.type === 'end' && (
                  <>
                    <div className="config-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span className="config-label" style={{ margin: 0 }}>输出配置</span>
                        <button className="btn btn-primary btn-sm" onClick={() => addOutputParam(selectedNode.id)}>+ 添加</button>
                      </div>
                      {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams ?? []).map((param, idx) => (
                        <div key={idx} style={{ padding: 10, border: '1px solid #f3f4f6', borderRadius: 8, marginBottom: 6, background: '#f9fafb', position: 'relative' }}>
                          <button onClick={() => removeOutputParam(selectedNode.id, idx)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>✕</button>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, paddingRight: 20 }}>
                            <input className="config-input" style={{ flex: 1 }} placeholder="参数名" value={param.name} onChange={(e) => updateOutputParam(selectedNode.id, idx, { name: e.target.value })} />
                            <select className="config-select" style={{ width: 72, flex: 'none' }} value={param.type} onChange={(e) => updateOutputParam(selectedNode.id, idx, { type: e.target.value as 'input'|'ref' })}>
                              <option value="input">输入</option>
                              <option value="ref">引用</option>
                            </select>
                          </div>
                          {param.type === 'input' ? (
                            <input className="config-input" placeholder="手动输入值..." value={param.value} onChange={(e) => updateOutputParam(selectedNode.id, idx, { value: e.target.value })} />
                          ) : (
                            <select className="config-select" value={param.value} onChange={(e) => updateOutputParam(selectedNode.id, idx, { value: e.target.value })}>
                              <option value="">选择引用变量...</option>
                              <option value="input.user_input">用户输入.user_input</option>
                              <option value="model.output">大模型.output</option>
                              <option value="audio.url">超拟人音频合成.audioUrl</option>
                            </select>
                          )}
                        </div>
                      ))}
                      {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams?.length ?? 0) === 0 && (
                        <p style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>暂无参数，点击添加</p>
                      )}
                    </div>
                    <div className="config-divider" />
                    <div className="config-section">
                      <span className="config-label">回答内容配置</span>
                      <textarea className="config-textarea" rows={5} placeholder="输入回答内容，使用 {{参数名}} 引用参数" value={nodes.find(n => n.id === selectedNode.id)?.data.config?.answerContent ?? ''} onChange={(e) => updateNodeConfig(selectedNode.id, { answerContent: e.target.value })} />
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>💡 提示: 使用 {'{{参数名}}'} 引用上面定义的参数</p>
                    </div>
                    <button className="save-config-btn" onClick={() => {
                      updateNodeConfig(selectedNode.id, { configSaved: true });
                      setToastType('success'); setToastMessage('输出节点配置已保存'); setTimeout(() => setToastMessage(null), 3000);
                    }}>保存配置</button>
                  </>
                )}
              </>
            ) : (
              <div className="config-empty">
                <div className="config-empty-icon">
                  <svg style={{ width: 24, height: 24, color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', margin: '0 0 4px' }}>选择节点查看配置</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>点击画布中的节点</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ===== 调试弹窗 ===== */}
      {debugOpen && (
        <div className="debug-overlay" onClick={(e) => { 
          if (e.target === e.currentTarget) {
            setDebugOpen(false);
            window.speechSynthesis?.cancel();
            document.querySelectorAll('audio').forEach(a => a.pause());
          } 
        }}>
          <div className="debug-modal">
            <div className="debug-modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⚙ 调试面板</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 执行状态 badge */}
                <span className={`debug-status-badge debug-status-${workflowStatus}`}>
                  {workflowStatus === 'idle' ? '⏸ 空闲' : workflowStatus === 'running' ? '⏳ 执行中' : workflowStatus === 'success' ? '✅ 成功' : '❌ 失败'}
                </span>
                <button className="btn btn-sm" onClick={() => {
                  setDebugOpen(false);
                  window.speechSynthesis?.cancel();
                  document.querySelectorAll('audio').forEach(a => a.pause());
                }}>关闭</button>
              </div>
            </div>
            
            {/* 动态进度条 */}
            {workflowStatus !== 'idle' && (
              <div style={{ background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 16px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                  <span>执行进度</span>
                  <span>{Math.round(Math.min(100, (completedNodesCount / nodes.length) * 100))}%</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      background: workflowStatus === 'error' ? '#ef4444' : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                      width: `${Math.min(100, (completedNodesCount / nodes.length) * 100)}%`,
                      transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} 
                  />
                </div>
              </div>
            )}

            <div className="debug-modal-body custom-scrollbar">
              {/* 输入区 */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>输入文本</label>
                <textarea className="config-textarea" rows={3} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="请输入测试文本..." />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={async () => await saveInputText()} disabled={isLoading}>保存文本</button>
                <button className="btn btn-primary btn-sm" style={{ flex: 2 }} onClick={async () => await testWorkflow()} disabled={isLoading}>
                  {isLoading ? '⏳ 执行中...' : '▶ 测试工作流'}
                </button>
              </div>

              {/* 节点执行结果卡片 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* 大模型节点卡片 */}
                <div className={`debug-node-card debug-node-${modelNodeDebug.status}`}>
                  <div className="debug-node-header">
                    <span style={{ fontWeight: 700 }}>🧠 大模型节点</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`debug-status-badge debug-status-${modelNodeDebug.status}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                        {modelNodeDebug.status === 'idle' ? '待执行' : modelNodeDebug.status === 'running' ? '执行中' : modelNodeDebug.status === 'success' ? '成功' : '失败'}
                      </span>
                      {modelNodeDebug.durationMs > 0 && <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{modelNodeDebug.durationMs}ms</span>}
                    </div>
                  </div>
                  <div className="debug-node-body">
                    {modelNodeDebug.input && (
                      <div className="debug-node-data-block">
                        <div className="debug-node-data-label">📥 输入数据</div>
                        <pre className="debug-node-data-pre">{modelNodeDebug.input.length > 300 ? modelNodeDebug.input.substring(0, 300) + '...' : modelNodeDebug.input}</pre>
                      </div>
                    )}
                    {modelNodeDebug.output && (
                      <div className="debug-node-data-block">
                        <div className="debug-node-data-label">📤 输出数据</div>
                        <pre className="debug-node-data-pre">{modelNodeDebug.output.length > 500 ? modelNodeDebug.output.substring(0, 500) + '...' : modelNodeDebug.output}</pre>
                      </div>
                    )}
                    {modelNodeDebug.error && (
                      <div className="debug-node-data-block debug-node-error">
                        <div className="debug-node-data-label">⚠️ 错误信息</div>
                        <pre className="debug-node-data-pre">{modelNodeDebug.error}</pre>
                      </div>
                    )}
                    {modelNodeDebug.status === 'idle' && <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 12 }}>等待执行...</div>}
                    {modelNodeDebug.status === 'running' && <div style={{ fontSize: 11, color: '#3b82f6', textAlign: 'center', padding: 12 }}>⏳ 正在调用大模型...</div>}
                  </div>
                </div>

                {/* 超拟人音频节点卡片 */}
                <div className={`debug-node-card debug-node-${audioNodeDebug.status}`}>
                  <div className="debug-node-header">
                    <span style={{ fontWeight: 700 }}>🎙 超拟人音频节点</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`debug-status-badge debug-status-${audioNodeDebug.status}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                        {audioNodeDebug.status === 'idle' ? '待执行' : audioNodeDebug.status === 'running' ? '执行中' : audioNodeDebug.status === 'success' ? '成功' : '失败'}
                      </span>
                      {audioNodeDebug.durationMs > 0 && <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{audioNodeDebug.durationMs}ms</span>}
                    </div>
                  </div>
                  <div className="debug-node-body">
                    {audioNodeDebug.input && (
                      <div className="debug-node-data-block">
                        <div className="debug-node-data-label">📥 输入数据</div>
                        <pre className="debug-node-data-pre">{audioNodeDebug.input.length > 300 ? audioNodeDebug.input.substring(0, 300) + '...' : audioNodeDebug.input}</pre>
                      </div>
                    )}
                    {audioNodeDebug.output && (
                      <div className="debug-node-data-block">
                        <div className="debug-node-data-label">📤 输出数据</div>
                        <pre className="debug-node-data-pre">{audioNodeDebug.output}</pre>
                      </div>
                    )}
                    {audioNodeDebug.error && (
                      <div className="debug-node-data-block debug-node-error">
                        <div className="debug-node-data-label">⚠️ 错误信息</div>
                        <pre className="debug-node-data-pre">{audioNodeDebug.error}</pre>
                      </div>
                    )}
                    {audioNodeDebug.status === 'idle' && <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 12 }}>等待执行...</div>}
                    {audioNodeDebug.status === 'running' && <div style={{ fontSize: 11, color: '#3b82f6', textAlign: 'center', padding: 12 }}>⏳ 正在合成音频...</div>}
                  </div>
                </div>
              </div>

              {/* 执行日志 & 最近输入 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* 执行日志 */}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, border: '1px solid #f3f4f6', maxHeight: 200, overflowY: 'auto' }} className="custom-scrollbar">
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}>📋 执行日志</h4>
                  {logs.length === 0 ? <p style={{ fontSize: 11, color: '#9ca3af' }}>暂无</p> : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{logs.map((log, i) => (
                      <li key={i} className="debug-log-entry">
                        <span className="debug-log-time">{log.time}</span>
                        <span className="debug-log-elapsed">+{log.elapsed}ms</span>
                        <span className="debug-log-text">{log.text}</span>
                      </li>
                    ))}
                    <div ref={logEndRef} />
                  </ul>
                  )}
                </div>
                {/* 最近输入 */}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, border: '1px solid #f3f4f6', maxHeight: 200, overflowY: 'auto' }} className="custom-scrollbar">
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 8px' }}>📝 最近输入</h4>
                  {recentInputs.length === 0 ? <p style={{ fontSize: 11, color: '#9ca3af' }}>暂无</p> : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{recentInputs.map(r => (
                      <li key={r.id} style={{ fontSize: 11, color: '#374151', padding: '3px 0', cursor: 'pointer' }} onClick={() => setInputText(r.inputText)}>{r.inputText}</li>
                    ))}</ul>
                  )}
                </div>
              </div>

              {/* 音频输出 */}
              {audioUrl && (
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, border: '1px solid #f3f4f6' }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 8px' }}>🔊 音频输出</h4>
                  {audioUrl.startsWith('tts://') ? (
                    <div style={{ display: 'flex', alignItems: 'center', color: '#3b82f6', fontSize: 13 }}>🔊 正在通过语音引擎合成...</div>
                  ) : (
                    <audio controls style={{ width: '100%' }} src={audioUrl}>不支持音频播放</audio>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          background: toastType === 'success' ? '#16a34a' : '#dc2626', color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          animation: 'fadeInDown 0.3s ease-out',
        }}>
          {toastType === 'success' ? '✅' : '⚠️'} {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
