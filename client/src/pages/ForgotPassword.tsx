import { useState } from 'react';
import { Form, Input, Button, Card, Result, Alert } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [darkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  const isDark = darkMode;
  const bgColor = isDark ? '#0d1117' : '#f5f5f7';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#4096FF' : '#1677FF';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setErrorMsg('');
    try {
      await authAPI.forgotPassword(values.email);
      setSent(true);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
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
          maxWidth: 420,
          overflow: 'hidden',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            padding: '48px 48px 40px',
            textAlign: 'center',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <img
            src="/logo.jpg"
            alt="Logo"
            style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 20, objectFit: 'contain' }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 600, color: textPrimary, margin: 0, letterSpacing: -0.5 }}>
            重置密码
          </h1>
          <p style={{ color: textSecondary, margin: '8px 0 0', fontSize: 14 }}>
            输入注册邮箱，我们会发送重置链接
          </p>
        </div>

        <div style={{ padding: '40px 48px 48px' }}>
          {sent ? (
            <Result
              status="success"
              title={<span style={{ color: textPrimary, fontSize: 16 }}>邮件已发送</span>}
              subTitle={
                <span style={{ color: textSecondary }}>
                  如果该邮箱已注册，您将收到重置链接（有效期 1 小时）
                </span>
              }
              extra={
                <Link to="/login">
                  <Button
                    type="primary"
                    style={{ borderRadius: 10, height: 40, background: accentColor, border: 'none' }}
                  >
                    返回登录
                  </Button>
                </Link>
              }
            />
          ) : (
            <Form name="forgot-password" onFinish={onFinish} layout="vertical" size="large">
              {errorMsg && (
                <Alert
                  message={errorMsg}
                  type="error"
                  showIcon
                  style={{ marginBottom: 16, borderRadius: 8 }}
                />
              )}
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '请输入有效邮箱格式' },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: textSecondary }} />}
                  placeholder="注册邮箱地址"
                  style={{
                    borderRadius: 10,
                    height: 48,
                    background: isDark ? '#21262d' : '#f5f5f7',
                    border: 'none',
                    fontSize: 15,
                  }}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={{
                    height: 48,
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 500,
                    background: accentColor,
                    border: 'none',
                  }}
                >
                  发送重置链接
                </Button>
              </Form.Item>
              <div style={{ textAlign: 'center' }}>
                <Link to="/login" style={{ fontSize: 13, color: textSecondary }}>
                  返回登录
                </Link>
              </div>
            </Form>
          )}
        </div>
      </Card>
    </div>
  );
}
