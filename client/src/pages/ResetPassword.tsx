import { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ResetPassword() {
  const [loading, setLoading] = useState(false);
  const [darkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const isDark = darkMode;
  const bgColor = isDark ? '#0d1117' : '#f5f5f7';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#4096FF' : '#1677FF';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  const inputStyle = {
    borderRadius: 10,
    height: 48,
    background: isDark ? '#21262d' : '#f5f5f7',
    border: 'none',
    fontSize: 15,
  };

  const passwordRules = [
    { required: true, message: '请输入新密码' },
    { min: 8, message: '密码至少 8 位' },
    { pattern: /[A-Z]/, message: '需含至少一个大写字母' },
    { pattern: /[0-9]/, message: '需含至少一个数字' },
  ];

  const onFinish = async (values: { newPassword: string }) => {
    setLoading(true);
    try {
      await authAPI.resetPassword(token, values.newPassword);
      message.success('密码已重置，请重新登录');
      navigate('/login');
    } catch (err: any) {
      const errMsg: string = err.response?.data?.error || '';
      if (errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('invalid')) {
        message.error('重置链接已失效，请重新申请');
      } else {
        message.error(errMsg || '重置失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
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
            width: '100%',
            maxWidth: 420,
            textAlign: 'center',
            padding: '48px 40px',
          }}
        >
          <p style={{ color: textSecondary, marginBottom: 24, fontSize: 15 }}>重置链接无效或已失效</p>
          <Link to="/forgot-password">
            <Button type="primary" style={{ borderRadius: 10, background: accentColor, border: 'none' }}>
              重新申请重置
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

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
            设置新密码
          </h1>
          <p style={{ color: textSecondary, margin: '8px 0 0', fontSize: 14 }}>
            8 位以上，包含大写字母和数字
          </p>
        </div>

        <div style={{ padding: '40px 48px 48px' }}>
          <Form name="reset-password" onFinish={onFinish} layout="vertical" size="large">
            <Form.Item name="newPassword" rules={passwordRules}>
              <Input.Password
                prefix={<LockOutlined style={{ color: textSecondary }} />}
                placeholder="新密码"
                style={inputStyle}
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: textSecondary }} />}
                placeholder="确认新密码"
                style={inputStyle}
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
                确认重置
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link to="/login" style={{ fontSize: 13, color: textSecondary }}>
                返回登录
              </Link>
            </div>
          </Form>
        </div>
      </Card>
    </div>
  );
}
