import { useState, useCallback } from 'react';

type AuthTab = 'login' | 'register';

type Props = {
  onLoginSuccess: (token: string, username: string) => void;
};

export default function LoginPage({ onLoginSuccess }: Props) {
  const [tab, setTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* ---- field-level validation ---- */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const usernameError = touched.username && !username.trim() ? '用户名不能为空' : '';
  const passwordError = touched.password && password.length < 6 ? '密码至少需要 6 位' : '';
  const confirmError =
    tab === 'register' && touched.confirmPassword && password !== confirmPassword
      ? '两次密码不一致'
      : '';

  const canSubmit =
    username.trim() !== '' &&
    password.length >= 6 &&
    (tab === 'login' || password === confirmPassword);

  /* ---- switch tab ---- */
  const switchTab = useCallback((next: AuthTab) => {
    setTab(next);
    setMessage(null);
    setTouched({});
    setConfirmPassword('');
  }, []);

  /* ---- submit ---- */
  const handleSubmit = async () => {
    if (!canSubmit || loading) return;

    setLoading(true);
    setMessage(null);

    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      let data: {
        success: boolean;
        token?: string;
        username?: string;
        error?: string;
      };

      try {
        data = await res.json();
      } catch {
        throw new Error('服务器无响应，请确认后端已启动');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? (tab === 'login' ? '登录失败' : '注册失败'));
      }

      if (tab === 'register') {
        setMessage({ type: 'success', text: '注册成功！请切换到登录' });
        setPassword('');
        setConfirmPassword('');
        setTouched({});
      } else {
        onLoginSuccess(data.token!, data.username ?? username.trim());
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '未知错误',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="login-page" onKeyDown={handleKeyDown}>
      {/* floating particles (decorative) */}
      <div className="login-particles">
        <span /><span /><span /><span /><span />
      </div>

      <div className="login-card">
        {/* ---- brand ---- */}
        <div className="login-brand">
          <div className="login-logo">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="login-title">PaiAgent-One</h1>
          <p className="login-subtitle">AI Agent 可视化编排平台</p>
        </div>

        {/* ---- tabs ---- */}
        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            登 录
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            注 册
          </button>
          <div
            className="login-tab-indicator"
            style={{ transform: tab === 'login' ? 'translateX(0)' : 'translateX(100%)' }}
          />
        </div>

        {/* ---- message toast ---- */}
        {message && (
          <div className={`login-message ${message.type}`}>
            {message.type === 'success' ? '✓ ' : '✕ '}
            {message.text}
          </div>
        )}

        {/* ---- form ---- */}
        <div className="login-form">
          <div className="login-field">
            <input
              id="login-username"
              className={`login-input ${usernameError ? 'has-error' : ''}`}
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => markTouched('username')}
              autoComplete="username"
            />
            {usernameError && <span className="login-field-error">{usernameError}</span>}
          </div>

          <div className="login-field">
            <input
              id="login-password"
              className={`login-input ${passwordError ? 'has-error' : ''}`}
              type="password"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => markTouched('password')}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
            {passwordError && <span className="login-field-error">{passwordError}</span>}
          </div>

          {tab === 'register' && (
            <div className="login-field">
              <input
                id="login-confirm-password"
                className={`login-input ${confirmError ? 'has-error' : ''}`}
                type="password"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => markTouched('confirmPassword')}
                autoComplete="new-password"
              />
              {confirmError && <span className="login-field-error">{confirmError}</span>}
            </div>
          )}

          <button
            id="login-submit"
            className="login-submit"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : tab === 'login' ? (
              '登 录'
            ) : (
              '注 册'
            )}
          </button>
        </div>

        <p className="login-footer">
          {tab === 'login' ? '没有账号？' : '已有账号？'}
          <button
            className="login-footer-link"
            onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
          >
            {tab === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  );
}
