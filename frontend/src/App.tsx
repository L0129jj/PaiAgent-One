import { useState, useCallback, useEffect } from 'react';
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
};

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
      <div className="node-title">用户输入</div>
      <div className="node-description">输入文本</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const ModelNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node model-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">{data.label || '大模型'}</div>
      <div className="node-description">处理文本</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const AudioNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node audio-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">音频合成</div>
      <div className="node-description">生成音频</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const EndNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node end-node ${getStatusClassName(status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-title">结束</div>
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
        apiEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        temperature: 0.7,
        modelName: 'qwen-max'
      }
    },
  },
  {
    id: '3',
    type: 'audio',
    position: { x: 250, y: 310 },
    data: { label: '音频合成', status: 'idle' },
  },
  {
    id: '4',
    type: 'end',
    position: { x: 250, y: 440 },
    data: { 
      label: '结束', 
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

  /* ---- canvas state ---- */
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<WorkflowCanvasNode | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [recentInputs, setRecentInputs] = useState<TextRecord[]>([]);

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
    const defaultLabel = label || (type === 'model' ? '大模型' : type === 'input' ? '用户输入' : type === 'audio' ? '音频合成' : '结束');
    const newNode: WorkflowCanvasNode = {
      id: Date.now().toString(),
      type,
      position,
      data: { 
        label: defaultLabel, 
        status: 'idle',
        config: type === 'model' ? {
          apiEndpoint: label === '通义千问' ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation' : '',
          temperature: 0.7,
          modelName: label === '通义千问' ? 'qwen-max' : ''
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
    setLogs((prev) => [...prev, text]);
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

      if (eventName === 'node_started' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'running');
        pushLog(`开始: ${payload.nodeType ?? 'unknown'}(${payload.nodeId})`);
      } else if (eventName === 'node_completed' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'success');
        pushLog(`完成: ${payload.nodeType ?? 'unknown'}(${payload.nodeId}) - ${payload.message ?? ''}`);
      } else if (eventName === 'node_failed' && payload.nodeId) {
        setNodeStatus(payload.nodeId, 'error');
        pushLog(`失败: ${payload.nodeType ?? 'unknown'}(${payload.nodeId}) - ${payload.error ?? '未知错误'}`);
      } else if (eventName === 'workflow_result') {
        const nextAudioUrl = (payload as unknown as { audioUrl?: string; data?: Record<string, unknown> }).audioUrl
          ?? (payload.data?.audioUrl as string | undefined)
          ?? '';
        if (nextAudioUrl) {
          setAudioUrl(nextAudioUrl);
        }
        pushLog('工作流执行完成。');
      } else if (eventName === 'workflow_error') {
        pushLog(`工作流失败: ${payload.error ?? '未知错误'}`);
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
      resetNodeStatus();

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
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* 左侧菜单 */}
      <div className="sidebar bg-white border-r border-gray-200 shadow-sm flex flex-col w-64 shrink-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">AI Agent 工作流</h1>
          <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Visual Workflow Designer</p>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* 大模型节点 */}
          <div className="border-b border-gray-50">
            <button 
              onClick={() => setModelCategoryOpen(!modelCategoryOpen)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-gray-700">大模型节点</h2>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${modelCategoryOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${modelCategoryOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-4 pb-4 space-y-2">
                {[
                  { id: 'qwen', label: '通义千问', color: 'bg-green-50 text-green-700 border-green-200' },
                  { id: 'gpt4', label: 'GPT-4', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { id: 'deepseek', label: 'DeepSeek', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
                  { id: 'claude', label: 'Claude 3', color: 'bg-orange-50 text-orange-700 border-orange-200' }
                ].map(m => (
                  <div 
                    key={m.id}
                    className={`p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 ${m.color}`}
                    onClick={() => addNode('model', { x: 100, y: 100 }, m.label)}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* 工具节点 */}
          <div>
            <button 
              onClick={() => setToolCategoryOpen(!toolCategoryOpen)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a2 2 0 11-4 0V4zM18 8a2 2 0 114 0v1a2 2 0 11-4 0V8zM1 8a2 2 0 114 0v1a2 2 0 11-4 0V8zM11 12a2 2 0 114 0v1a2 2 0 11-4 0v-1zM18 16a2 2 0 114 0v1a2 2 0 11-4 0v-1zM1 16a2 2 0 114 0v1a2 2 0 11-4 0v-1z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-gray-700">工具节点</h2>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${toolCategoryOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${toolCategoryOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-4 pb-4 space-y-2">
                {[
                  { id: 'input', label: '用户输入', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { id: 'audio', label: '音频合成', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                  { id: 'end', label: '结束', color: 'bg-red-50 text-red-700 border-red-200' }
                ].map(t => (
                  <div 
                    key={t.id}
                    className={`p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 ${t.color}`}
                    onClick={() => addNode(t.id, { x: 100, y: 100 })}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 画板区域 */}
      <div className="flex-1 relative">
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

        {/* 节点配置面板 */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-10 overflow-hidden flex flex-col max-h-[calc(100%-2rem)]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-gray-800">
                节点配置 - {selectedNode.type === 'input' ? '输入' : selectedNode.type === 'end' ? '输出' : '常规'}
              </h3>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-6 overflow-y-auto">
              {selectedNode.type === 'input' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">变量名</label>
                    <div className="p-2 bg-blue-50 border border-blue-100 rounded text-sm text-blue-700 font-mono">user_input</div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">变量类型</label>
                    <div className="p-2 bg-gray-50 border border-gray-100 rounded text-sm text-gray-700">String</div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">描述</label>
                    <p className="text-sm text-gray-600 leading-relaxed">用户本轮的输入内容</p>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" checked readOnly className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-default" />
                    <label className="ml-2 block text-sm font-medium text-gray-700">必要</label>
                  </div>
                </div>
              ) : selectedNode.type === 'model' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">模型的接口地址</label>
                    <input 
                      className="w-full p-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      value={nodes.find(n => n.id === selectedNode.id)?.data.config?.apiEndpoint ?? ''}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { apiEndpoint: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">API 密钥</label>
                    <input 
                      type="password"
                      className="w-full p-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      value={nodes.find(n => n.id === selectedNode.id)?.data.config?.apiKey ?? ''}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { apiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">温度 (Temperature)</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        className="flex-1"
                        value={nodes.find(n => n.id === selectedNode.id)?.data.config?.temperature ?? 0.7}
                        onChange={(e) => updateNodeConfig(selectedNode.id, { temperature: parseFloat(e.target.value) })}
                      />
                      <span className="text-xs font-mono w-8">{nodes.find(n => n.id === selectedNode.id)?.data.config?.temperature ?? 0.7}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">模型名 (Model)</label>
                    <input 
                      className="w-full p-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      value={nodes.find(n => n.id === selectedNode.id)?.data.config?.modelName ?? ''}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { modelName: e.target.value })}
                      placeholder="e.g. qwen-max"
                    />
                  </div>
                </div>
              ) : selectedNode.type === 'end' ? (
                <>
                  {/* 输出配置 */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">输出配置</label>
                      <button 
                        onClick={() => addOutputParam(selectedNode.id)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        添加
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams ?? []).map((param, idx) => (
                        <div key={idx} className="p-3 border border-gray-100 rounded-md bg-gray-50 space-y-2 relative group">
                          <button 
                            onClick={() => removeOutputParam(selectedNode.id, idx)}
                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <div className="flex gap-2 pr-6">
                            <input 
                              placeholder="参数名"
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                              value={param.name}
                              onChange={(e) => updateOutputParam(selectedNode.id, idx, { name: e.target.value })}
                            />
                            <select 
                              className="p-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none w-20"
                              value={param.type}
                              onChange={(e) => updateOutputParam(selectedNode.id, idx, { type: e.target.value as 'input' | 'ref' })}
                            >
                              <option value="input">输入</option>
                              <option value="ref">引用</option>
                            </select>
                          </div>
                          {param.type === 'input' ? (
                            <input 
                              placeholder="手动输入值..."
                              className="w-full p-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                              value={param.value}
                              onChange={(e) => updateOutputParam(selectedNode.id, idx, { value: e.target.value })}
                            />
                          ) : (
                            <select 
                              className="w-full p-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                              value={param.value}
                              onChange={(e) => updateOutputParam(selectedNode.id, idx, { value: e.target.value })}
                            >
                              <option value="">选择引用变量...</option>
                              <option value="input.user_input">用户输入.user_input</option>
                              <option value="model.output">大模型.output</option>
                              <option value="audio.url">音频合成.url</option>
                            </select>
                          )}
                        </div>
                      ))}
                      {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams?.length ?? 0) === 0 && (
                        <p className="text-center py-4 text-xs text-gray-400 italic">暂无参数，点击添加按钮开始配置</p>
                      )}
                    </div>
                  </div>

                  {/* 回答内容配置 */}
                  <div className="pt-4 border-t border-gray-100">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">回答内容配置</label>
                    <textarea 
                      className="w-full p-3 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                      rows={6}
                      placeholder="输入回答内容，使用 {{参数名}} 引用上方配置的参数"
                      value={nodes.find(n => n.id === selectedNode.id)?.data.config?.answerContent ?? ''}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { answerContent: e.target.value })}
                    />
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-400 mb-1">可用变量 (点击插入):</p>
                      <div className="flex flex-wrap gap-1">
                        {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams ?? [])
                          .filter(p => p.name)
                          .map((p, i) => (
                            <button 
                              key={i}
                              onClick={() => {
                                const currentNode = nodes.find(n => n.id === selectedNode.id);
                                const current = currentNode?.data.config?.answerContent ?? '';
                                updateNodeConfig(selectedNode.id, { answerContent: current + `{{${p.name}}}` });
                              }}
                              className="text-[10px] px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded text-blue-600 font-mono transition-colors"
                            >
                              {p.name}
                            </button>
                          ))
                        }
                        {(nodes.find(n => n.id === selectedNode.id)?.data.config?.outputParams?.filter(p => p.name).length ?? 0) === 0 && (
                          <span className="text-[10px] text-gray-300 italic">请先配置参数名</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <svg className="w-12 h-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.756 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">该节点暂无高级配置项</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 调试抽屉 */}
      {debugOpen && (
        <div className="debug-drawer">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">调试模式</h3>
            <button 
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
              onClick={() => setDebugOpen(false)}
            >
              关闭
            </button>
          </div>

          {/* 登录状态栏 */}
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex justify-between items-center">
            <span className="text-sm text-green-700">已登录：{currentUser}</span>
            <button
              className="px-3 py-1 text-xs bg-white border border-green-300 rounded-md hover:bg-green-50 transition-colors"
              onClick={async () => await logout()}
            >
              退出登录
            </button>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2 text-sm font-medium text-gray-700">输入文本：</label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="请输入测试文本..."
            />
          </div>
          
          <div className="flex gap-2">
            <button
              className="initial-action-btn w-1/3 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors font-medium"
              onClick={async () => await saveInputText()}
              disabled={isLoading}
            >
              保存文本
            </button>

            <button 
              className="initial-action-btn w-2/3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium flex items-center justify-center"
              onClick={async () => await testWorkflow()}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  执行中...
                </>
              ) : (
                '测试工作流'
              )}
            </button>
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3 max-h-40 overflow-auto">
            <h4 className="mb-2 text-sm font-medium text-gray-700">最近输入历史</h4>
            {recentInputs.length === 0 ? (
              <p className="text-xs text-gray-500">暂无历史记录</p>
            ) : (
              <ul className="text-xs text-gray-700 space-y-1">
                {recentInputs.map((record) => (
                  <li
                    key={record.id}
                    className="cursor-pointer hover:text-blue-600"
                    onClick={() => setInputText(record.inputText)}
                  >
                    {record.inputText}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3 max-h-40 overflow-auto">
            <h4 className="mb-2 text-sm font-medium text-gray-700">执行日志</h4>
            {logs.length === 0 ? (
              <p className="text-xs text-gray-500">暂无日志</p>
            ) : (
              <ul className="text-xs text-gray-700 space-y-1">
                {logs.map((log, index) => (
                  <li key={`${log}-${index}`}>{log}</li>
                ))}
              </ul>
            )}
          </div>
          
          {audioUrl && (
            <div className="audio-player mt-6 pt-4 border-t border-gray-100">
              <h4 className="mb-3 text-sm font-medium text-gray-700">音频输出：</h4>
              <div className="bg-gray-50 p-4 rounded-md">
                {audioUrl.startsWith('tts://') ? (
                  <div className="flex items-center text-blue-600 py-2">
                    <svg className="animate-pulse mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                    <span className="text-sm font-medium">正在通过真人语音引擎合成...</span>
                  </div>
                ) : (
                  <audio controls className="w-full" src={audioUrl}>
                    您的浏览器不支持音频播放。
                  </audio>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 调试抽屉切换按钮 */}
      <button
        className="fixed bottom-4 right-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-lg transition-colors font-medium"
        onClick={() => setDebugOpen(!debugOpen)}
      >
        {debugOpen ? '关闭调试' : '开启调试'}
      </button>
    </div>
  );
}

export default App;