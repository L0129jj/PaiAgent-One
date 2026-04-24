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
  NodeTypes
} from 'reactflow';
// @ts-ignore
import 'reactflow/dist/style.css';

type NodeStatus = 'idle' | 'running' | 'success' | 'error';

type WorkflowNodeData = {
  label?: string;
  status?: NodeStatus;
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

type AuthResponse = {
  success: boolean;
  token?: string;
  username?: string;
  error?: string;
};

type TextRecord = {
  id: number;
  inputText: string;
  createdAt: string;
};

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
    </div>
  );
};

const ModelNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node model-node ${getStatusClassName(status)}`}>
      <div className="node-title">大模型</div>
      <div className="node-description">处理文本</div>
    </div>
  );
};

const AudioNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node audio-node ${getStatusClassName(status)}`}>
      <div className="node-title">音频合成</div>
      <div className="node-description">生成音频</div>
    </div>
  );
};

const EndNode = ({ data }: { data: WorkflowNodeData }) => {
  const status = data?.status ?? 'idle';
  return (
    <div className={`custom-node end-node ${getStatusClassName(status)}`}>
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

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string>(localStorage.getItem('authToken') ?? '');
  const [currentUser, setCurrentUser] = useState<string>(localStorage.getItem('authUsername') ?? '');
  const [recentInputs, setRecentInputs] = useState<TextRecord[]>([]);

  // 添加节点到画布
  const addNode = useCallback((type: string, position: { x: number; y: number }) => {
    const newNode: WorkflowCanvasNode = {
      id: Date.now().toString(),
      type,
      position,
      data: { label: '', status: 'idle' }
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  // 处理边的连接
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

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

    const response = await fetch('/api/text-input/recent?limit=8', {
      headers: {
        'X-Auth-Token': authToken
      }
    });

    const data = await response.json() as { success: boolean; records?: TextRecord[]; error?: string };
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? '获取历史输入失败');
    }

    setRecentInputs(data.records ?? []);
  }, []);

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

  const register = async () => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json() as AuthResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? '注册失败');
      }

      alert('注册成功，请点击登录');
    } catch (error) {
      alert(`注册失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const login = async () => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json() as AuthResponse;
      if (!response.ok || !data.success || !data.token) {
        throw new Error(data.error ?? '登录失败');
      }

      setToken(data.token);
      setCurrentUser(data.username ?? username);
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('authUsername', data.username ?? username);
      alert('登录成功');
    } catch (error) {
      alert(`登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const logout = () => {
    setToken('');
    setCurrentUser('');
    setRecentInputs([]);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUsername');
  };

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
      const response = await fetch('/api/text-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
        },
        body: JSON.stringify({ inputText })
      });

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

      const response = await fetch('/api/workflow/execute/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
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
      });

      if (!response.ok || !response.body) {
        throw new Error(`请求失败: ${response.status}`);
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧菜单 */}
      <div className="sidebar bg-white border-r border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-blue-600">AI Agent 工作流</h1>
          <p className="text-sm text-gray-500 mt-1">可视化工作流设计工具</p>
        </div>
        
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">节点库</h2>
          
          <div className="mb-6">
            <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">大模型节点</h3>
            <div 
              className="node bg-green-100 border border-green-300 hover:bg-green-200 transition-colors"
              onClick={() => addNode('model', { x: 100, y: 100 })}
            >
              大模型
            </div>
          </div>
          
          <div>
            <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">工具节点</h3>
            <div 
              className="node bg-blue-100 border border-blue-300 hover:bg-blue-200 transition-colors"
              onClick={() => addNode('input', { x: 100, y: 50 })}
            >
              用户输入
            </div>
            <div 
              className="node bg-purple-100 border border-purple-300 hover:bg-purple-200 transition-colors"
              onClick={() => addNode('audio', { x: 300, y: 100 })}
            >
              音频合成
            </div>
            <div 
              className="node bg-red-100 border border-red-300 hover:bg-red-200 transition-colors"
              onClick={() => addNode('end', { x: 500, y: 100 })}
            >
              结束
            </div>
          </div>
        </div>
      </div>

      {/* 画板区域 */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
        >
          <Controls />
          <Background />
          <MiniMap />
        </ReactFlow>
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

          {!token ? (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <h4 className="mb-2 text-sm font-semibold text-gray-700">登录后可执行工作流</h4>
              <input
                className="w-full mb-2 p-2 border border-gray-300 rounded-md"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="w-full mb-3 p-2 border border-gray-300 rounded-md"
                placeholder="密码（至少6位）"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
                  onClick={async () => await register()}
                >
                  注册
                </button>
                <button
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                  onClick={async () => await login()}
                >
                  登录
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex justify-between items-center">
              <span className="text-sm text-green-700">已登录：{currentUser}</span>
              <button
                className="px-3 py-1 text-xs bg-white border border-green-300 rounded-md"
                onClick={logout}
              >
                退出登录
              </button>
            </div>
          )}
          
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
              className="w-1/3 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors font-medium"
              onClick={async () => await saveInputText()}
              disabled={isLoading || !token}
            >
              保存文本
            </button>

            <button 
              className="w-2/3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium flex items-center justify-center"
              onClick={async () => await testWorkflow()}
              disabled={isLoading || !token}
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
              <h4 className="mb-3 text-sm font-medium text-gray-700">生成的音频：</h4>
              <div className="bg-gray-50 p-4 rounded-md">
                <audio controls className="w-full">
                  <source src={audioUrl} type="audio/mpeg" />
                  您的浏览器不支持音频播放。
                </audio>
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