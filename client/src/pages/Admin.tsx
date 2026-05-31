import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Select, message, Space } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authAPI } from '../services/api';
import { useAppStore } from '../stores/appStore';
import { getRoleLabel, getRoleTagColor } from '../utils/role';
import { getTheme } from '../utils/theme';
import UserAvatar from '../components/UserAvatar';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string;
  department?: { id: string; name: string };
}

export default function Admin() {
  const { user: currentUser } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  const theme = getTheme();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await authAPI.getUsers();
      setUsers(res.data);
    } catch (err: any) {
      if (err.response?.status === 403) {
        message.error('只有管理员才能访问此页面');
      } else {
        message.error('获取用户列表失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({ role: user.role });
    setEditModalVisible(true);
  };

  const handleUpdateRole = async () => {
    if (!editingUser) return;
    try {
      const values = await form.validateFields();
      await authAPI.updateUserRole(editingUser.id, values.role);
      message.success('角色更新成功');
      setEditModalVisible(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '更新失败');
    }
  };

  const handleResetPassword = (user: User) => {
    Modal.confirm({
      title: '强制重置密码',
      content: `确认要重置 ${user.name} 的密码吗？该操作会生成一个新的临时密码，并要求该用户下次登录时强制修改。`,
      okText: '确认重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await authAPI.resetUserPassword(user.id);
          const tmp = res.data.tempPassword;
          Modal.success({
            title: '密码已重置',
            content: (
              <div>
                <p style={{ marginBottom: 8 }}>临时密码（请复制并告知该用户）：</p>
                <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600, padding: 12, background: '#f5f5f7', borderRadius: 8, marginBottom: 12, wordBreak: 'break-all' }}>{tmp}</div>
                <Button size="small" onClick={() => { navigator.clipboard.writeText(tmp); message.success('已复制到剪贴板'); }}>复制密码</Button>
                <p style={{ marginTop: 12, fontSize: 12, color: '#999' }}>用户下次登录将被强制要求修改密码。</p>
              </div>
            ),
            width: 460,
          });
        } catch (err: any) {
          message.error(err.response?.data?.error || '重置失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: User) => (
        <Space>
          <UserAvatar name={record.name} size={36} />
          <div>
            <div style={{ fontWeight: 500, color: theme.textPrimary }}>{record.name}</div>
            <div style={{ fontSize: 12, color: theme.textSecondary }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '部门',
      dataIndex: ['department', 'name'],
      key: 'department',
      render: (name: string) => <span style={{ color: name ? theme.textPrimary : theme.textSecondary }}>{name || '-'}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={getRoleTagColor(role)} style={{ borderRadius: 6 }}>{getRoleLabel(role)}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: User) => (
        record.id !== currentUser?.id && (
          <Space size="small">
            <Button type="link" icon={<LockOutlined />} onClick={() => handleEditRole(record)} style={{ padding: 0 }}>
              修改角色
            </Button>
            <Button type="link" danger onClick={() => handleResetPassword(record)} style={{ padding: 0 }}>
              重置密码
            </Button>
          </Space>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.textPrimary }}>用户管理</h2>
        <p style={{ color: theme.textSecondary, margin: '8px 0 0', fontSize: 14 }}>
          管理系统用户和角色（仅管理员可见）
        </p>
      </div>

      <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
        <Table dataSource={users} columns={columns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title="修改用户角色"
        open={editModalVisible}
        onOk={handleUpdateRole}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        {editingUser && (
          <div style={{ marginBottom: 16, padding: 12, background: theme.isDark ? '#21262d' : '#f9f9f9', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <UserAvatar name={editingUser.name} size={40} />
              <div>
                <div style={{ fontWeight: 500 }}>{editingUser.name}</div>
                <div style={{ fontSize: 12, color: theme.textSecondary }}>{editingUser.email}</div>
              </div>
            </div>
          </div>
        )}
        <Form form={form} layout="vertical">
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { value: 'ADMIN', label: '管理员 - 拥有全部权限' },
                { value: 'DEPARTMENT_ADMIN', label: '部门负责人 - 可管理本部门' },
                { value: 'MEMBER', label: '成员 - 普通用户' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}