import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, Button, Table, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Popconfirm, Empty } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { projectsAPI, itemsAPI } from '../services/api';
import type { Project, ProjectSummary, Item, ItemStatus, Priority } from '../types';
import { PROJECT_STATUS_CONFIG, STATUS_CONFIG, PRIORITY_LABELS, PRIORITY_COLORS } from '../types';
import { useAppStore } from '../stores/appStore';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categoryOptions } = useAppStore();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Item | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [taskForm] = Form.useForm();
  const [projectForm] = Form.useForm();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: p }, { data: s }] = await Promise.all([
        projectsAPI.getById(id),
        projectsAPI.getSummary(id),
      ]);
      setProject(p);
      setSummary(s);
    } catch (e) {
      console.error(e);
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskModalOpen(true);
  };

  const openEditTask = (item: Item) => {
    setEditingTask(item);
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = async () => {
    try {
      const values = await taskForm.validateFields();
      const payload: Partial<Item> = {
        ...values,
        projectId: id,
        dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
        estimatedAmount: values.estimatedAmount ?? undefined,
        finalAmount: values.finalAmount ?? undefined,
        supplierAmount: values.supplierAmount ?? undefined,
      };
      if (editingTask) {
        await itemsAPI.update(editingTask.id, payload);
        message.success('已更新');
      } else {
        await itemsAPI.create(payload);
        message.success('已创建');
      }
      setTaskModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || '保存失败');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await itemsAPI.delete(taskId);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  // Project edit
  const openEditProject = () => {
    if (!project) return;
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const handleProjectSubmit = async () => {
    if (!project) return;
    try {
      setSaving(true);
      const values = await projectForm.validateFields();
      const payload: Partial<Project> = {
        ...values,
        startDate: values.startDate ? values.startDate.toISOString() : undefined,
        dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
      };
      await projectsAPI.update(project.id, payload);
      message.success('项目已更新');
      setProjectModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    Modal.confirm({
      title: '确认删除项目',
      content: `确定要删除项目"${project.name}"吗？子任务的项目关联会被解除，此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await projectsAPI.delete(project.id);
          message.success('项目已删除');
          navigate('/projects');
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  // On project modal open, freshen initial values from project state
  const projectFormInitialValues = editingProject ? (() => {
    const p = editingProject;
    const vals: Record<string, unknown> = { ...p };
    if (p.startDate) vals.startDate = dayjs(p.startDate);
    if (p.dueDate) vals.dueDate = dayjs(p.dueDate);
    return vals;
  })() : undefined;

  // Task form initial values
  const taskFormInitialValues = editingTask ? (() => {
    const t = editingTask;
    const vals: Record<string, unknown> = { ...t };
    if (t.dueDate) vals.dueDate = dayjs(t.dueDate);
    return vals;
  })() : undefined;

  if (!project) return <Card loading={loading} />;

  const cfg = PROJECT_STATUS_CONFIG[project.status];

  const columns = [
    {
      title: '任务',
      dataIndex: 'title',
      render: (v: string, r: Item) => (
        <a onClick={() => navigate(`/items/${r.id}`)}>{v}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: ItemStatus) => {
        const c = STATUS_CONFIG[s];
        return <Tag color={c.color}>{c.label}</Tag>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (p: Priority) => <Tag color={PRIORITY_COLORS[p]}>{PRIORITY_LABELS[p]}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'user',
      width: 100,
      render: (u: Item['user']) => u?.name || '—',
    },
    {
      title: '金额',
      width: 130,
      render: (_: unknown, r: Item) => {
        const est = r.estimatedAmount;
        const fin = r.finalAmount;
        if (!est && !fin) return <span style={{ color: '#bbb' }}>—</span>;
        return (
          <div style={{ fontSize: 12 }}>
            {fin !== undefined && fin !== null ? `成交 ${fin.toLocaleString()}` : ''}
            {est !== undefined && est !== null ? <div style={{ color: '#888' }}>预估 {est.toLocaleString()}</div> : ''}
          </div>
        );
      },
    },
    {
      title: '截止',
      dataIndex: 'dueDate',
      width: 110,
      render: (d: string | undefined) => d ? dayjs(d).format('YYYY-MM-DD') : '—',
    },
    {
      title: '操作',
      width: 110,
      render: (_: unknown, r: Item) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditTask(r)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTask(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} style={{ marginBottom: 8 }}>
              返回项目列表
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {project.code && <Tag>{project.code}</Tag>}
              <h2 style={{ margin: 0 }}>{project.name}</h2>
              <Tag color={cfg.color}>{cfg.label}</Tag>
            </div>
            {project.description && <p style={{ marginTop: 8, color: '#666' }}>{project.description}</p>}
            <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
              负责人：{project.owner?.name || '—'}
              {project.startDate && <span style={{ marginLeft: 16 }}>开始：{dayjs(project.startDate).format('YYYY-MM-DD')}</span>}
              {project.dueDate && <span style={{ marginLeft: 16 }}>截止：{dayjs(project.dueDate).format('YYYY-MM-DD')}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<EditOutlined />} onClick={openEditProject}>编辑项目</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTask}>添加子任务</Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic title="子任务总数" value={summary.totalCount} />
              <Progress percent={summary.progress} size="small" style={{ marginTop: 8 }} />
              <div style={{ fontSize: 12, color: '#888' }}>已完成 {summary.completedCount}, 进行中 {summary.inProgressCount}</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="已逾期"
                value={summary.overdueCount}
                valueStyle={{ color: summary.overdueCount > 0 ? '#cf1322' : undefined }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="预估金额" value={summary.estimatedAmount} suffix={project.currency || ''} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>实际成交 {summary.finalAmount.toLocaleString()}</div>
            </Card>
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card>
              {(() => {
                const saved = summary.estimatedAmount - summary.finalAmount;
                const hasSavings = saved > 0;
                return (
                  <>
                    <Statistic
                      title="降本金额"
                      value={hasSavings ? saved : 0}
                      suffix={project.currency || ''}
                      valueStyle={{ color: hasSavings ? '#52c41a' : '#bbb' }}
                    />
                    <div style={{ fontSize: 12, color: hasSavings ? '#52c41a' : '#888', marginTop: 4 }}>
                      {hasSavings
                        ? `预估 vs 成交 节约 ${(saved / summary.estimatedAmount * 100).toFixed(1)}%`
                        : '暂无降本'}
                    </div>
                  </>
                );
              })()}
            </Card>
          </Col>
          <Col span={12}>
            <Card>
              {summary.budget !== null ? (
                <>
                  <Statistic title="预算使用" value={summary.budgetUsedPercent ?? 0} suffix="%" />
                  <Progress
                    percent={Math.min(summary.budgetUsedPercent ?? 0, 100)}
                    size="small"
                    status={(summary.budgetUsedPercent ?? 0) > 100 ? 'exception' : 'normal'}
                    style={{ marginTop: 8 }}
                  />
                  <div style={{ fontSize: 12, color: '#888' }}>剩余 {(summary.budgetRemaining ?? 0).toLocaleString()} {project.currency || ''}</div>
                </>
              ) : (
                <Statistic title="预算" value="未设定" valueStyle={{ fontSize: 16, color: '#aaa' }} />
              )}
            </Card>
          </Col>
        </Row>
        </>
      )}

      {/* Items */}
      <Card title={`子任务 (${project.items?.length ?? 0})`} loading={loading}>
        {project.items && project.items.length > 0 ? (
          <Table rowKey="id" dataSource={project.items} columns={columns} pagination={false} />
        ) : (
          <Empty description="暂无子任务" />
        )}
      </Card>

      <Modal
        title={editingTask ? '编辑子任务' : '新建子任务'}
        open={taskModalOpen}
        onOk={handleTaskSubmit}
        onCancel={() => setTaskModalOpen(false)}
        width={720}
        destroyOnClose
      >
        <Form form={taskForm} layout="vertical" preserve={false}
          initialValues={{ status: 'TODO', priority: 'MEDIUM', ...taskFormInitialValues }}
        >
          <Form.Item label="任务标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Form.Item>
            <Form.Item label="优先级" name="priority" style={{ flex: 1 }}>
              <Select options={Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item>
            <Form.Item label="截止日期" name="dueDate" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="分类" name="category" style={{ flex: 1 }}>
              <Select allowClear options={categoryOptions.map((c) => ({ value: c.key, label: c.name }))} />
            </Form.Item>
            <Form.Item label="子状态" name="subStatus" style={{ flex: 1 }}>
              <Select allowClear options={[{ value: '供应商报价中', label: '供应商报价中' }, { value: '待发起采购评审', label: '待发起采购评审' }, { value: '采购评审中', label: '采购评审中' }]} />
            </Form.Item>
            <Form.Item label="进度" name="progress" style={{ flex: 1 }}>
              <Input placeholder="如：30%" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="预估金额" name="estimatedAmount" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item label="成交金额" name="finalAmount" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item label="币种" name="currency" style={{ flex: 1 }}>
              <Select allowClear options={[
                { value: 'CNY', label: 'CNY 人民币' },
                { value: 'USD', label: 'USD 美元' },
                { value: 'EUR', label: 'EUR 欧元' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="供应商名称" name="supplierName" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item label="供应商金额" name="supplierAmount" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item label="需求部门" name="requesterDepartment" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Project edit modal */}
      <Modal
        title="编辑项目"
        open={projectModalOpen}
        onOk={handleProjectSubmit}
        onCancel={() => setProjectModalOpen(false)}
        width={680}
        confirmLoading={saving}
        destroyOnClose
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space>
            <Popconfirm
              title="确认删除项目？"
              description="子任务的项目关联会被解除，此操作不可撤销。"
              onConfirm={handleDeleteProject}
            >
              <Button danger style={{ float: 'left' }}>删除项目</Button>
            </Popconfirm>
            <CancelBtn />
            <OkBtn />
          </Space>
        )}
      >
        <Form form={projectForm} layout="vertical" preserve={false}
          initialValues={projectFormInitialValues}
        >
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="项目编号" name="code" tooltip="可选，全局唯一">
            <Input placeholder="如：P2026-001" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select options={Object.entries(PROJECT_STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Form.Item>
            <Form.Item label="可见范围" name="visibility" style={{ flex: 1 }}>
              <Select options={[
                { value: 'PRIVATE', label: '仅自己' },
                { value: 'DEPARTMENT', label: '本部门' },
                { value: 'SHARED', label: '全员可见' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="开始日期" name="startDate" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="截止日期" name="dueDate" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="总预算" name="totalBudget" style={{ flex: 2 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item label="币种" name="currency" style={{ flex: 1 }}>
              <Select allowClear options={[
                { value: 'CNY', label: 'CNY 人民币' },
                { value: 'USD', label: 'USD 美元' },
                { value: 'EUR', label: 'EUR 欧元' },
                { value: 'HKD', label: 'HKD 港币' },
              ]} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
