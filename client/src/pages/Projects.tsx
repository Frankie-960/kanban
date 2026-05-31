import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Tag, Progress, message, Space, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, FolderOpenOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { projectsAPI } from '../services/api';
import type { Project, ProjectStatus } from '../types';
import { PROJECT_STATUS_CONFIG } from '../types';

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await projectsAPI.getAll();
      setProjects(data);
    } catch (e) {
      console.error(e);
      message.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'PLANNING', visibility: 'DEPARTMENT', currency: 'CNY' });
    setModalOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    form.setFieldsValue({
      ...p,
      startDate: p.startDate ? dayjs(p.startDate) : null,
      dueDate: p.dueDate ? dayjs(p.dueDate) : null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const raw: Record<string, unknown> = {
        ...values,
        startDate: values.startDate ? values.startDate.toISOString() : undefined,
        dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
      };
      // 剔除 null/undefined：后端可选字段不接受 null（openEdit 用 {...p} 会带入数据库的 null 空字段）。
      // 注意：文本框清空得到的是 ""，仍会保留发送，以支持把字段清空。
      const payload = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== null && v !== undefined)
      ) as Partial<Project>;
      if (editing) {
        await projectsAPI.update(editing.id, payload);
        message.success('已更新');
      } else {
        await projectsAPI.create(payload);
        message.success('已创建');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      const msg = e?.response?.data?.error;
      message.error(typeof msg === 'string' ? msg : '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await projectsAPI.delete(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'code',
      width: 140,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      minWidth: 220,
      ellipsis: { showTitle: false },
      render: (v: string, r: Project) => (
        <Tooltip title={v} placement="topLeft" mouseEnterDelay={0.3}>
          <a
            onClick={() => navigate(`/projects/${r.id}`)}
            style={{
              fontWeight: 500,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}
          >
            {v}
          </a>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: ProjectStatus) => {
        const cfg = PROJECT_STATUS_CONFIG[s];
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '负责人',
      dataIndex: 'owner',
      width: 120,
      render: (o: Project['owner']) => o?.name || '—',
    },
    {
      title: '进度',
      width: 160,
      render: (_: unknown, r: Project) => {
        const total = r.itemCount ?? 0;
        const done = r.completedCount ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div>
            <Progress percent={pct} size="small" />
            <div style={{ fontSize: 11, color: '#888' }}>{done} / {total} 子任务</div>
          </div>
        );
      },
    },
    {
      title: '预算 / 已花费',
      width: 180,
      render: (_: unknown, r: Project) => {
        if (!r.totalBudget) return <span style={{ color: '#bbb' }}>—</span>;
        const spent = r.finalAmount ?? 0;
        const pct = (spent / r.totalBudget) * 100;
        return (
          <div>
            <div style={{ fontSize: 12 }}>
              {spent.toLocaleString()} / {r.totalBudget.toLocaleString()} {r.currency || ''}
            </div>
            <Progress percent={Math.min(pct, 100)} size="small" status={pct > 100 ? 'exception' : pct > 80 ? 'active' : 'normal'} showInfo={false} />
          </div>
        );
      },
    },
    {
      title: '截止',
      dataIndex: 'dueDate',
      width: 110,
      render: (d: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : '—',
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, r: Project) => (
        <Space size="small" className="row-actions">
          <Button type="link" size="small" icon={<FolderOpenOutlined />} onClick={() => navigate(`/projects/${r.id}`)}>打开</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？子任务的项目关联会被解除" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-heading">项目管理</h1>
          <p className="page-subhead">{projects.length} 个项目 · 按更新时间排序</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openCreate}>新建项目</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={projects}
        columns={columns}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editing ? '编辑项目' : '新建项目'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="如：丰图2026年Q1供应链改造" />
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
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
            </Form.Item>
            <Form.Item label="币种" name="currency" style={{ flex: 1 }}>
              <Select options={[
                { value: 'CNY', label: 'CNY 人民币' },
                { value: 'USD', label: 'USD 美元' },
                { value: 'EUR', label: 'EUR 欧元' },
                { value: 'HKD', label: 'HKD 港币' },
              ]} allowClear />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
