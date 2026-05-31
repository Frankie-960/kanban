import { useEffect, useState } from 'react';
import { Button, Card, Result, Spin } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function VerifyEmail() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'noToken'>('loading');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [darkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { checkAuth, isAuthenticated } = useAppStore();

  const isDark = darkMode;
  const bgColor = isDark ? '#0d1117' : '#f5f5f7';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#4096FF' : '#1677FF';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  useEffect(() => {
    if (!token) {
      setStatus('noToken');
      return;
    }
    authAPI.verifyEmail(token)
      .then(async () => {
        await checkAuth();
        setStatus('success');
      })
      .catch(() => setStatus('error'));
  }, [token, checkAuth]);

  const handleResend = async () => {
    setResending(true);
    try {
      await authAPI.resendVerification();
      setResent(true);
    } catch {
      // ignore
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bgColor,
        padding: 20,
      }}
    >
      <Card
        style={{
          background: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: 20,
          boxShadow: isDark ? '0 32px 80px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.08)',
          width: '100%',
          maxWidth: 440,
          padding: '40px',
          textAlign: 'center',
        }}
      >
        {status === 'loading' && (
          <div>
            <Spin size="large" />
            <p style={{ color: textSecondary, marginTop: 20 }}>正在验证邮箱…</p>
          </div>
        )}

        {status === 'success' && (
          <Result
            status="success"
            title="邮箱验证成功"
            subTitle={<span style={{ color: textSecondary }}>您的邮箱已完成验证，现在可以使用全部功能</span>}
            extra={
              <Link to="/">
                <Button type="primary" style={{ borderRadius: 10, background: accentColor, border: 'none' }}>
                  进入系统
                </Button>
              </Link>
            }
          />
        )}

        {status === 'error' && (
          <Result
            status="error"
            title="验证链接无效或已过期"
            subTitle={<span style={{ color: textSecondary }}>链接有效期为 24 小时，请重新发送验证邮件</span>}
            extra={
              isAuthenticated ? (
                <Button
                  type="primary"
                  loading={resending}
                  disabled={resent}
                  onClick={handleResend}
                  style={{ borderRadius: 10, background: accentColor, border: 'none' }}
                >
                  {resent ? '已重新发送' : '重新发送验证邮件'}
                </Button>
              ) : (
                <Link to="/login">
                  <Button type="primary" style={{ borderRadius: 10, background: accentColor, border: 'none' }}>
                    返回登录
                  </Button>
                </Link>
              )
            }
          />
        )}

        {status === 'noToken' && (
          <Result
            status="warning"
            title="邮箱验证"
            subTitle={
              <span style={{ color: textSecondary }}>
                请点击注册邮件中的验证链接完成验证。如未收到邮件，可重新发送。
              </span>
            }
            extra={
              isAuthenticated ? (
                <Button
                  type="primary"
                  loading={resending}
                  disabled={resent}
                  onClick={handleResend}
                  style={{ borderRadius: 10, background: accentColor, border: 'none' }}
                >
                  {resent ? '已重新发送' : '重新发送验证邮件'}
                </Button>
              ) : (
                <Link to="/login">
                  <Button type="primary" style={{ borderRadius: 10, background: accentColor, border: 'none' }}>
                    返回登录
                  </Button>
                </Link>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
