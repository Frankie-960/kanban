import { useState } from 'react';
import { Form, Input, Button, Card, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleFilled, MinusCircleFilled } from '@ant-design/icons';

function PasswordStrengthBar({ password, isDark }: { password: string; isDark: boolean }) {
  if (!password) return null;
  const checks = [
    { ok: password.length >= 8, label: '8位以上' },
    { ok: /[A-Z]/.test(password), label: '大写字母' },
    { ok: /[0-9]/.test(password), label: '数字' },
  ];
  const score = checks.filter(c => c.ok).length;
  const cfg = [
    { color: '#ff4d4f', text: '弱' },
    { color: '#ff4d4f', text: '弱' },
    { color: '#faad14', text: '中等' },
    { color: '#52c41a', text: '强' },
  ][score];
  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= score ? cfg.color : (isDark ? '#30363d' : '#e8e8e8'),
            transition: 'background 0.3s',
          }} />
        ))}
        <span style={{ fontSize: 11, color: cfg.color, marginLeft: 4, minWidth: 26, fontWeight: 500 }}>
          {cfg.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? '#52c41a' : (isDark ? '#8b949e' : '#bfbfbf'), display: 'flex', alignItems: 'center', gap: 3 }}>
            {c.ok
              ? <CheckCircleFilled style={{ fontSize: 10 }} />
              : <MinusCircleFilled style={{ fontSize: 10 }} />}
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [darkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const navigate = useNavigate();
  const { login } = useAppStore();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success('登录成功');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const isDark = darkMode;
  const bgColor = isDark ? '#0d1117' : '#f5f5f7';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#4096FF' : '#1677FF';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 60,
        paddingBottom: 40,
        background: bgColor,
        padding: 20,
      }}
    >
      <Card
        style={{
          background: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: 20,
          boxShadow: isDark
            ? '0 32px 80px rgba(0,0,0,0.6)'
            : '0 8px 40px rgba(0,0,0,0.08)',
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
        }}
        styles={{ body: { padding: 0 } }}
      >
        {/* Header with Logo */}
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
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              marginBottom: 20,
              objectFit: 'contain',
            }}
          />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: textPrimary,
              margin: 0,
              letterSpacing: -0.5,
            }}
          >
            采购工作站
          </h1>
          <p
            style={{
              color: textSecondary,
              margin: '8px 0 0',
              fontSize: 14,
            }}
          >
            高效管理采购任务 · 智能生成工作报告
          </p>
        </div>

        {/* Form area */}
        <div style={{ padding: '40px 48px 48px' }}>
          <Tabs
            defaultActiveKey="login"
            centered
            style={{ marginBottom: 24 }}
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Form name="login" onFinish={onFinish} layout="vertical" size="large">
                    <Form.Item
                      name="email"
                      rules={[{ required: true, message: '请输入邮箱' }]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: textSecondary }} />}
                        placeholder="邮箱地址"
                        style={{
                          borderRadius: 10,
                          height: 48,
                          background: isDark ? '#21262d' : '#f5f5f7',
                          border: 'none',
                          fontSize: 15,
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: textSecondary }} />}
                        placeholder="密码"
                        style={{
                          borderRadius: 10,
                          height: 48,
                          background: isDark ? '#21262d' : '#f5f5f7',
                          border: 'none',
                          fontSize: 15,
                        }}
                      />
                    </Form.Item>
                    <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 4 }}>
                      <a href="/forgot-password" style={{ fontSize: 13, color: textSecondary }}>忘记密码？</a>
                    </div>
                    <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
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
                        登 录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: <RegisterForm navigate={navigate} darkMode={darkMode} />,
              },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function RegisterForm({ navigate, darkMode }: { navigate: any; darkMode: boolean }) {
  const [loading, setLoading] = useState(false);
  const [pwValue, setPwValue] = useState('');
  const { register } = useAppStore();

  const onFinish = async (values: { name: string; email: string; password: string }) => {
    setLoading(true);
    try {
      await register(values.name, values.email, values.password);
      message.success('注册成功');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.error || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const isDark = darkMode;
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#4096FF' : '#1677FF';

  const inputStyle = {
    borderRadius: 10,
    height: 48,
    background: isDark ? '#21262d' : '#f5f5f7',
    border: 'none',
    fontSize: 15,
  };

  return (
    <Form name="register" onFinish={onFinish} layout="vertical" size="large" scrollToFirstError>
      <Form.Item
        name="name"
        rules={[{ required: true, message: '请输入姓名' }]}
      >
        <Input placeholder="姓名" style={inputStyle} />
      </Form.Item>
      <Form.Item
        name="email"
        rules={[
          { required: true, message: '请输入邮箱' },
          { type: 'email', message: '请输入有效邮箱' },
        ]}
      >
        <Input
          prefix={<UserOutlined style={{ color: textSecondary }} />}
          placeholder="邮箱地址"
          style={inputStyle}
        />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[
          { required: true, message: '请输入密码' },
          { min: 8, message: '密码至少 8 位' },
          { pattern: /[A-Z]/, message: '需含至少一个大写字母' },
          { pattern: /[0-9]/, message: '需含至少一个数字' },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: textSecondary }} />}
          placeholder="密码（8位以上，含大写字母和数字）"
          style={inputStyle}
          onChange={e => setPwValue(e.target.value)}
        />
      </Form.Item>
      <PasswordStrengthBar password={pwValue} isDark={isDark} />
      <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
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
          注 册
        </Button>
      </Form.Item>
    </Form>
  );
}
