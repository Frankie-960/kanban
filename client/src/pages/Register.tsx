import { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleFilled, MinusCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

function PasswordStrengthBar({ password }: { password: string }) {
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
            background: i <= score ? cfg.color : '#e8e8e8',
            transition: 'background 0.3s',
          }} />
        ))}
        <span style={{ fontSize: 11, color: cfg.color, marginLeft: 4, minWidth: 26, fontWeight: 500 }}>
          {cfg.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? '#52c41a' : '#bfbfbf', display: 'flex', alignItems: 'center', gap: 3 }}>
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

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [pwValue, setPwValue] = useState('');
  const navigate = useNavigate();
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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 60,
        paddingBottom: 40,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff', margin: 0 }}>
            注册账号
          </h1>
          <p style={{ color: '#666', marginTop: 8 }}>创建您的采购工作站账号</p>
        </div>
        <Form name="register" onFinish={onFinish} layout="vertical" scrollToFirstError>
          <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input prefix={<UserOutlined />} placeholder="姓名" size="large" />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效邮箱' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="邮箱" size="large" />
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
              prefix={<LockOutlined />}
              placeholder="密码（8位以上，含大写字母和数字）"
              size="large"
              onChange={e => setPwValue(e.target.value)}
            />
          </Form.Item>
          <PasswordStrengthBar password={pwValue} />
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              注册
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
