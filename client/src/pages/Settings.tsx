import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Switch, Select, Divider, message, Avatar, Tabs, Tag, Popconfirm, Space } from 'antd';
import { UserOutlined, BellOutlined, ProjectOutlined, DeleteOutlined, HolderOutlined, RobotOutlined, CopyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Alert, InputNumber } from 'antd';
import api from '../services/api';
import axios from 'axios';
import { useAppStore } from '../stores/appStore';
import { authAPI, subStatusAPI, categoriesAPI, reportsAPI } from '../services/api';
import { CATEGORY_LABELS } from '../types';
import type { Category } from '../types';
import { DEFAULT_LLM_PROVIDERS } from '../utils/llm';
import { getTheme } from '../utils/theme';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SubStatusOption {
  id: string;
  category: string;
  name: string;
  order: number;
  isActive: boolean;
}

interface CategoryOption {
  id: string;
  key: string;
  name: string;
  order?: number;
  isActive?: boolean;
}

export default function Settings() {
  const { user, checkAuth, fetchCategories, fetchSubStatusOptions } = useAppStore();
  const [profileForm] = Form.useForm();
  const [notificationForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const [llmProviders, setLlmProviders] = useState(DEFAULT_LLM_PROVIDERS);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [subStatuses, setSubStatuses] = useState<SubStatusOption[]>([]);
  const [newCategory, setNewCategory] = useState({ key: '', name: '' });
  const [newSubStatus, setNewSubStatus] = useState({ category: '', name: '' });
  const [configLoading, setConfigLoading] = useState(false);

  const [agentTokenForm] = Form.useForm();
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [agentTokenMeta, setAgentTokenMeta] = useState<{ days: number; name: string } | null>(null);
  const [agentTokenLoading, setAgentTokenLoading] = useState(false);

  const handleGenerateAgentToken = async (values: { name: string; days: number; scope: string }) => {
    try {
      setAgentTokenLoading(true);
      const res = await api.post('/auth/agent-token', values);
      setAgentToken(res.data.token);
      setAgentTokenMeta({ days: res.data.expiresInDays, name: res.data.agentName });
      message.success('Token 已生成，请立即复制保存');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '生成失败');
    } finally {
      setAgentTokenLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (!agentToken) return;
    try {
      await navigator.clipboard.writeText(agentToken);
      message.success('已复制到剪贴板');
    } catch {
      message.warning('请手动选中并复制');
    }
  };

  const [testing, setTesting] = useState(false);
  const handleTestConnection = async () => {
    if (!agentToken) return;
    setTesting(true);
    try {
      const res = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${agentToken}` },
        timeout: 10000,
      });
      message.success(`✓ 联通成功！识别为 ${res.data.name}（${res.data.email}）`);
    } catch (e: any) {
      const code = e?.response?.status ?? e?.code ?? '?';
      message.error(`✗ 联通失败（${code}）：${e?.response?.data?.error ?? e?.message ?? '未知错误'}`);
    } finally {
      setTesting(false);
    }
  };

  const theme = getTheme();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sortable row component for categories
  const SortableCategoryRow = ({ category, children, ...props }: any) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      background: isDragging ? (theme.isDark ? '#30363d' : '#f0f0f0') : undefined,
      cursor: 'grab',
    };

    return (
      <tr ref={setNodeRef} style={style} {...attributes} {...listeners} {...props}>
        {children}
      </tr>
    );
  };

  // Sortable row component for sub-statuses
  const SortableSubStatusRow = ({ subStatus, children, ...props }: any) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subStatus.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      background: isDragging ? (theme.isDark ? '#30363d' : '#f0f0f0') : undefined,
      cursor: 'grab',
    };

    return (
      <tr ref={setNodeRef} style={style} {...attributes} {...listeners} {...props}>
        {children}
      </tr>
    );
  };

  useEffect(() => {
    Promise.all([loadCategories(), loadSubStatuses(), loadLLMProviders()]);
  }, []);

  const loadCategories = async () => {
    try {
      const res = await categoriesAPI.getAll();
      setCategories(res.data);
    } catch {
      setCategories([]);
    }
  };

  const loadSubStatuses = async () => {
    try {
      const res = await subStatusAPI.getAll();
      setSubStatuses(res.data);
    } catch {
      setSubStatuses([]);
    }
  };

  const loadLLMProviders = async () => {
    try {
      const res = await reportsAPI.getLLMProviders();
      setLlmProviders(res.data.length > 0 ? res.data : DEFAULT_LLM_PROVIDERS);
    } catch {
      setLlmProviders(DEFAULT_LLM_PROVIDERS);
    }
  };

  // Drag handlers for categories
  const handleCategoryDragStart = (_event: DragStartEvent) => {};

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex(c => c.id === active.id);
    const newIndex = categories.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedCategories = [...categories];
    reorderedCategories.splice(oldIndex, 1);
    reorderedCategories.splice(newIndex, 0, categories[oldIndex]);

    // Update order values
    const updatedCategories = reorderedCategories.map((cat, index) => ({
      ...cat,
      order: index,
    }));
    setCategories(updatedCategories);

    // Persist to backend
    try {
      await categoriesAPI.reorder(updatedCategories.map(c => ({ id: c.id, order: c.order })));
      message.success('分类顺序已更新');
      fetchCategories(); // Refresh store
    } catch {
      message.error('更新顺序失败');
      loadCategories(); // Reload on failure
    }
  };

  // Drag handlers for sub-statuses
  const handleSubStatusDragStart = (_event: DragStartEvent) => {};

  const handleSubStatusDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subStatuses.findIndex(s => s.id === active.id);
    const newIndex = subStatuses.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedSubStatuses = [...subStatuses];
    reorderedSubStatuses.splice(oldIndex, 1);
    reorderedSubStatuses.splice(newIndex, 0, subStatuses[oldIndex]);

    // Update order values
    const updatedSubStatuses = reorderedSubStatuses.map((sub, index) => ({
      ...sub,
      order: index,
    }));
    setSubStatuses(updatedSubStatuses);

    // Persist to backend
    try {
      await subStatusAPI.reorder(updatedSubStatuses.map(s => ({ id: s.id, order: s.order })));
      message.success('子状态顺序已更新');
      fetchSubStatusOptions(); // Refresh store
    } catch {
      message.error('更新顺序失败');
      loadSubStatuses(); // Reload on failure
    }
  };

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      setLoading(true);
      await authAPI.updateProfile({
        name: values.name,
        newPassword: values.newPassword || undefined,
        deepseekApiKey: values.deepseekApiKey || undefined,
        llmProvider: values.llmProvider || undefined,
      });
      message.success('个人设置已保存');
      profileForm.resetFields(['newPassword']);
      await checkAuth();
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      const values = await notificationForm.validateFields();
      setLoading(true);
      localStorage.setItem('notificationSettings', JSON.stringify(values));
      message.success('通知设置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.key.trim() || !newCategory.name.trim()) {
      message.warning('请输入分类键和名称');
      return;
    }
    try {
      setConfigLoading(true);
      await categoriesAPI.create({
        key: newCategory.key.trim(),
        name: newCategory.name.trim(),
      });
      message.success('分类添加成功');
      setNewCategory({ key: '', name: '' });
      loadCategories();
      fetchCategories();
    } catch (err: any) {
      message.error(err.response?.data?.error || '添加失败');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await categoriesAPI.delete(id);
      message.success('删除成功');
      loadCategories();
      fetchCategories();
    } catch {
      message.error('删除失败');
    }
  };

  const handleToggleCategory = async (id: string, currentActive: boolean) => {
    try {
      await categoriesAPI.update(id, { isActive: !currentActive });
      loadCategories();
      fetchCategories();
    } catch {
      message.error('更新失败');
    }
  };

  const handleAddSubStatus = async () => {
    if (!newSubStatus.category || !newSubStatus.name.trim()) {
      message.warning('请选择分类并输入子状态名称');
      return;
    }
    try {
      setConfigLoading(true);
      await subStatusAPI.create({
        category: newSubStatus.category,
        name: newSubStatus.name.trim(),
      });
      message.success('子状态添加成功');
      setNewSubStatus({ ...newSubStatus, name: '' });
      loadSubStatuses();
      fetchSubStatusOptions();
    } catch (err: any) {
      message.error(err.response?.data?.error || '添加失败');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleDeleteSubStatus = async (id: string) => {
    try {
      await subStatusAPI.delete(id);
      message.success('删除成功');
      loadSubStatuses();
      fetchSubStatusOptions();
    } catch {
      message.error('删除失败');
    }
  };

  const handleToggleSubStatus = async (id: string, currentActive: boolean) => {
    try {
      await subStatusAPI.update(id, { isActive: !currentActive });
      loadSubStatuses();
      fetchSubStatusOptions();
    } catch {
      message.error('更新失败');
    }
  };

  const tabItems = [
    {
      key: 'profile',
      label: <span style={{ fontSize: 14 }}><UserOutlined /> 个人设置</span>,
      children: (
        <div style={{ maxWidth: 600 }}>
          <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>个人信息</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
              <Avatar size={64} icon={<UserOutlined />} style={{ background: '#1F3D2E' }} />
              <div style={{ marginLeft: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 500, color: theme.textPrimary }}>{user?.name}</div>
                <div style={{ color: theme.textSecondary }}>{user?.email}</div>
                <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                  角色: {user?.role === 'ADMIN' ? '管理员' : user?.role === 'DEPARTMENT_ADMIN' ? '部门负责人' : '成员'}
                </div>
              </div>
            </div>

            <Form form={profileForm} layout="vertical" initialValues={{ name: user?.name, email: user?.email, deepseekApiKey: user?.deepseekApiKey, llmProvider: user?.llmProvider || 'deepseek' }}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input style={{ borderRadius: 8, height: 44 }} />
              </Form.Item>
              <Form.Item name="email" label="邮箱">
                <Input disabled style={{ borderRadius: 8, height: 44 }} />
              </Form.Item>
              <Form.Item name="newPassword" label="新密码" rules={[{ min: 6, message: '密码至少6位' }]}>
                <Input.Password placeholder="留空则不修改密码" style={{ borderRadius: 8, height: 44 }} />
              </Form.Item>
              <Divider style={{ margin: '20px 0' }} />
              <Form.Item label="AI大模型" name="llmProvider">
                <Select placeholder="选择AI大模型" options={llmProviders.map(p => ({ value: p.key, label: p.name }))} />
              </Form.Item>
              <Form.Item
                label="API Key"
                name="deepseekApiKey"
                help={user?.deepseekApiKey?.startsWith('sk-***') ? '已保存，显示为掩码。要更换请直接输入新 Key；保持不变则不会被覆盖。' : undefined}
              >
                <Input.Password placeholder="输入 API Key 用于AI报告生成" style={{ borderRadius: 8, height: 44 }} />
              </Form.Item>
              <Button type="primary" onClick={handleSaveProfile} loading={loading} style={{ borderRadius: 8 }}>
                保存修改
              </Button>
            </Form>
          </Card>

          <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}><BellOutlined /> 通知设置</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
            <Form form={notificationForm} layout="vertical"
              initialValues={{ dueReminder: true, reminderMinutes: '30', dailyDigest: true, digestTime: '9' }}
              onFinish={handleSaveNotifications}
            >
              <Form.Item label="事项截止前提醒" name="dueReminder" valuePropName="checked">
                <Switch /> 开启
              </Form.Item>
              <Form.Item label="提醒时间" name="reminderMinutes">
                <Select options={[
                  { value: '15', label: '15分钟前' },
                  { value: '30', label: '30分钟前' },
                  { value: '60', label: '1小时前' },
                  { value: '1440', label: '1天前' },
                ]} />
              </Form.Item>
              <Divider style={{ margin: '20px 0' }} />
              <Form.Item label="每日工作汇总" name="dailyDigest" valuePropName="checked">
                <Switch /> 开启
              </Form.Item>
              <Form.Item label="汇总时间" name="digestTime">
                <Select options={[
                  { value: '8', label: '08:00' },
                  { value: '9', label: '09:00' },
                  { value: '10', label: '10:00' },
                ]} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} style={{ borderRadius: 8 }}>
                保存设置
              </Button>
            </Form>
          </Card>
        </div>
      ),
    },
    {
      key: 'personalization',
      label: <span style={{ fontSize: 14 }}><ProjectOutlined /> 个性化配置</span>,
      children: (
        <div style={{ maxWidth: 900 }}>
          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600 }}>分类管理</span>}
            extra={<span style={{ color: theme.textSecondary, fontSize: 13 }}>拖动排序，添加、删除、启用/禁用</span>}
            style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
          >
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleCategoryDragStart} onDragEnd={handleCategoryDragEnd}>
              <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {categories.map((cat) => (
                    <SortableCategoryRow key={cat.id} category={cat}>
                      <td style={{ width: 180, padding: '8px 12px' }}>
                        <HolderOutlined style={{ marginRight: 8, color: theme.textSecondary }} />
                        {cat.key}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ color: cat.isActive ? theme.textPrimary : theme.textSecondary }}>{cat.name}</span>
                      </td>
                      <td style={{ width: 80, padding: '8px 12px' }}>
                        <Tag color={cat.isActive ? 'green' : 'default'} style={{ borderRadius: 6 }}>{cat.isActive ? '启用' : '禁用'}</Tag>
                      </td>
                      <td style={{ width: 150, padding: '8px 12px' }}>
                        <Space>
                          <Switch checked={cat.isActive} size="small" onChange={() => handleToggleCategory(cat.id, cat.isActive ?? false)} />
                          <Popconfirm title="确定删除这个分类？" onConfirm={() => handleDeleteCategory(cat.id)} okText="确定" cancelText="取消">
                            <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>删除</Button>
                          </Popconfirm>
                        </Space>
                      </td>
                    </SortableCategoryRow>
                  ))}
                  {categories.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 24, color: theme.textSecondary }}>
                      暂无分类
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>

            <div style={{ marginTop: 16, padding: 16, background: theme.isDark ? '#21262d' : '#f9f9f9', borderRadius: 10 }}>
              <div style={{ marginBottom: 12, fontWeight: 500, color: theme.textPrimary }}>添加新分类</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Input
                  placeholder="分类键（如：PROCUREMENT_SOURCING）"
                  value={newCategory.key}
                  onChange={(e) => setNewCategory({ ...newCategory, key: e.target.value.toUpperCase() })}
                  style={{ width: 240, borderRadius: 8 }}
                />
                <Input
                  placeholder="分类名称（如：招标寻源）"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  style={{ width: 180, borderRadius: 8 }}
                />
                <Button type="primary" onClick={handleAddCategory} loading={configLoading} style={{ borderRadius: 8 }}>
                  添加分类
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600 }}>子状态管理</span>}
            extra={<span style={{ color: theme.textSecondary, fontSize: 13 }}>拖动排序，为不同分类配置子状态选项</span>}
            style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}
          >
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleSubStatusDragStart} onDragEnd={handleSubStatusDragEnd}>
              <SortableContext items={subStatuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {subStatuses.map((sub) => (
                    <SortableSubStatusRow key={sub.id} subStatus={sub}>
                      <td style={{ width: 140, padding: '8px 12px' }}>
                        <HolderOutlined style={{ marginRight: 8, color: theme.textSecondary }} />
                        {CATEGORY_LABELS[sub.category as Category] || sub.category}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ color: sub.isActive ? theme.textPrimary : theme.textSecondary }}>{sub.name}</span>
                      </td>
                      <td style={{ width: 80, padding: '8px 12px' }}>
                        <Tag color={sub.isActive ? 'green' : 'default'} style={{ borderRadius: 6 }}>{sub.isActive ? '启用' : '禁用'}</Tag>
                      </td>
                      <td style={{ width: 150, padding: '8px 12px' }}>
                        <Space>
                          <Switch checked={sub.isActive} size="small" onChange={() => handleToggleSubStatus(sub.id, sub.isActive)} />
                          <Popconfirm title="确定删除这个子状态？" onConfirm={() => handleDeleteSubStatus(sub.id)} okText="确定" cancelText="取消">
                            <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>删除</Button>
                          </Popconfirm>
                        </Space>
                      </td>
                    </SortableSubStatusRow>
                  ))}
                  {subStatuses.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 24, color: theme.textSecondary }}>
                      暂无子状态
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>

            <div style={{ marginTop: 16, padding: 16, background: theme.isDark ? '#21262d' : '#f9f9f9', borderRadius: 10 }}>
              <div style={{ marginBottom: 12, fontWeight: 500, color: theme.textPrimary }}>添加新子状态</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Select
                  placeholder="选择分类"
                  value={newSubStatus.category || undefined}
                  onChange={(v) => setNewSubStatus({ ...newSubStatus, category: v })}
                  style={{ width: 180, borderRadius: 8 }}
                  options={categories.filter(c => c.isActive).map((c) => ({ value: c.key, label: c.name }))}
                />
                <Input
                  placeholder="子状态名称（如：供应商报价中）"
                  value={newSubStatus.name}
                  onChange={(e) => setNewSubStatus({ ...newSubStatus, name: e.target.value })}
                  style={{ width: 220, borderRadius: 8 }}
                />
                <Button type="primary" onClick={handleAddSubStatus} loading={configLoading} style={{ borderRadius: 8 }}>
                  添加子状态
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'agent',
      label: (<span><RobotOutlined /> Agent Token</span>),
      children: (
        <div style={{ maxWidth: 720 }}>
          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600 }}>给 Claude Code / MCP 用的长寿命 Token</span>}
            style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
          >
            <p style={{ color: theme.textSecondary, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
              生成一个长寿命的 JWT，让 AI agent（Claude Code、Claude Desktop 等）通过 MCP server 代表你访问看板。
              Token 复用你的身份与可见范围；只读 + 写（不含删除/转岗/管理操作）。
            </p>
            <Form
              form={agentTokenForm}
              layout="vertical"
              onFinish={handleGenerateAgentToken}
              initialValues={{ name: '我的 Claude Code', days: 365, scope: 'rw' }}
            >
              <Form.Item name="name" label="Token 名称" rules={[{ required: true, message: '请输入便于识别的名称' }]}>
                <Input placeholder="如：我的 Claude Code / 团队 Bot" maxLength={64} />
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="days" label="有效期（天）" tooltip="最长 365 天">
                  <InputNumber min={1} max={365} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="scope" label="权限范围" tooltip="ro 为预留只读（当前版本未强制校验）">
                  <Select options={[
                    { value: 'rw', label: 'rw（读 + 写）' },
                    { value: 'ro', label: 'ro（只读 · 预留）' },
                  ]} />
                </Form.Item>
              </div>
              <Button type="primary" htmlType="submit" loading={agentTokenLoading} style={{ borderRadius: 8 }}>
                生成 Token
              </Button>
            </Form>
            {agentToken && (
              <div style={{ marginTop: 20 }}>
                <Alert
                  type="success"
                  showIcon
                  message={`Token 已生成（名称：${agentTokenMeta?.name}，有效 ${agentTokenMeta?.days} 天）`}
                  description={
                    <div>
                      <div style={{ color: '#7a2e2e', fontSize: 12, marginBottom: 8 }}>
                        ⚠ 请立即复制保存：关闭页面后无法重新查看。撤销靠后端 JWT_SECRET 轮换。
                      </div>
                      <code style={{ display: 'block', wordBreak: 'break-all', background: theme.isDark ? '#0d1117' : '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'SF Mono, Consolas, monospace' }}>
                        {agentToken}
                      </code>
                      <Space style={{ marginTop: 10 }}>
                        <Button icon={<CopyOutlined />} size="small" onClick={handleCopyToken} style={{ borderRadius: 6 }}>
                          复制 Token
                        </Button>
                        <Button icon={<CheckCircleOutlined />} size="small" loading={testing} onClick={handleTestConnection} style={{ borderRadius: 6 }}>
                          测试连接
                        </Button>
                      </Space>
                    </div>
                  }
                />
              </div>
            )}
            <Divider style={{ margin: '20px 0' }} />
            <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: theme.textPrimary }}>接入 Claude Code 的命令：</div>
              <code style={{ display: 'block', background: theme.isDark ? '#0d1117' : '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'SF Mono, Consolas, monospace', whiteSpace: 'pre-wrap' }}>
                {`claude mcp add kanban \\
  -e KANBAN_API_URL=http://localhost:3001 \\
  -e KANBAN_AGENT_TOKEN=<上方生成的 Token> \\
  -- node /absolute/path/to/server/mcp/dist/index.js`}
              </code>
              <div style={{ marginTop: 10 }}>
                OpenAPI 规范浏览器入口：<a href="/api/docs" target="_blank">/api/docs</a>
                ·
                工具清单与示例：<a href="https://github.com/" onClick={(e) => { e.preventDefault(); message.info('详见仓库根目录 AGENTS.md'); }}>AGENTS.md</a>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24, fontSize: 22, fontWeight: 600, color: theme.textPrimary }}>设置</h2>
      <Tabs items={tabItems} />
    </div>
  );
}