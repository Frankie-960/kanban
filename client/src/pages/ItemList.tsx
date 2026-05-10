import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Tag, Space, Input, Select, DatePicker, Modal, message, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { itemsAPI } from '../services/api';
import type { Item, Priority, Category, ItemStatus } from '../types';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS, PRIORITY_COLORS, STATUS_COLORS } from '../types';
import { getPriorityWeight } from '../utils/priority';
import { isOverdue } from '../utils/date';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ItemList() {
  const navigate = useNavigate();
  const { items, updateItemStatus, deleteItem, currentView, fetchItems, projects, fetchProjects } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<ItemStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [filterCategory, setFilterCategory] = useState<Category | ''>('');
  // '' = 全部, '__none__' = 无项目, 其他 = 项目 id
  const [filterProject, setFilterProject] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchProjectModal, setBatchProjectModal] = useState(false);
  const [batchProjectId, setBatchProjectId] = useState<string>('__none__');

  useEffect(() => {
    fetchItems();
    fetchProjects();
  }, [currentView, fetchItems, fetchProjects]);

  const isDark = localStorage.getItem('darkMode') === 'true';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const accentColor = isDark ? '#58a6ff' : '#0071e3';

  const filteredItems = useMemo(() => items.filter((item) => {
    if (searchText && !item.title.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterPriority && item.priority !== filterPriority) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterProject) {
      if (filterProject === '__none__') {
        if (item.projectId) return false;
      } else if (item.projectId !== filterProject) {
        return false;
      }
    }
    if (dateRange && item.dueDate) {
      const due = dayjs(item.dueDate);
      if (due.isBefore(dateRange[0]) || due.isAfter(dateRange[1])) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.status !== 'COMPLETED' && b.status !== 'COMPLETED') {
      const aWeight = getPriorityWeight(a.priority);
      const bWeight = getPriorityWeight(b.priority);
      if (aWeight !== bWeight) return aWeight - bWeight;
      return a.order - b.order;
    }
    if (a.status === 'COMPLETED' && b.status === 'COMPLETED') {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.order - b.order;
    }
    return a.status === 'COMPLETED' ? 1 : -1;
  }), [items, searchText, filterStatus, filterPriority, filterCategory, filterProject, dateRange]);

  const handleStatusChange = async (item: Item, status: ItemStatus) => {
    try {
      await updateItemStatus(item.id, status);
      message.success(`状态已更新为${STATUS_LABELS[status]}`);
    } catch { message.error('更新失败'); }
  };

  const handleDelete = async (item: Item) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除事项"${item.title}"吗？`,
      okText: '确认', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => { try { await deleteItem(item.id); message.success('删除成功'); } catch { message.error('删除失败'); } },
    });
  };

  const handleBatchComplete = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要完成的事项'); return; }
    try {
      await Promise.all(selectedRowKeys.map(key => {
        const item = items.find((i) => i.id === key);
        if (item && item.status !== 'COMPLETED') return updateItemStatus(item.id, 'COMPLETED');
        return Promise.resolve();
      }));
      message.success(`已批量完成 ${selectedRowKeys.length} 项事项`);
      setSelectedRowKeys([]);
    } catch { message.error('批量操作失败'); }
  };

  const handleBatchAssignProject = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择事项'); return; }
    setBatchProjectId('__none__');
    setBatchProjectModal(true);
  };

  const confirmBatchAssignProject = async () => {
    try {
      const clearProject = batchProjectId === '__none__';
      await Promise.all(selectedRowKeys.map(key =>
        itemsAPI.update(key as string, { projectId: clearProject ? null as any : batchProjectId })
      ));
      message.success(`已为 ${selectedRowKeys.length} 项事项分配项目`);
      setBatchProjectModal(false);
      setSelectedRowKeys([]);
      fetchItems();
    } catch { message.error('批量分配失败'); }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要删除的事项'); return; }
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 项事项吗？此操作不可撤销。`,
      okText: '确认', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await Promise.all(selectedRowKeys.map(key => deleteItem(key as string)));
          message.success(`已批量删除 ${selectedRowKeys.length} 项事项`);
          setSelectedRowKeys([]);
        } catch { message.error('批量删除失败'); }
      },
    });
  };

  const rowSelection = { selectedRowKeys, onChange: (keys: React.Key[]) => setSelectedRowKeys(keys) };

  const columns = [
    {
      title: '事项',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Item) => (
        <div>
          <a onClick={() => { sessionStorage.setItem('itemDetailFrom', 'list'); navigate(`/items/${record.id}`); }} style={{ fontWeight: 500 }}>{title}</a>
          {record.project && (
            <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
              <Tag color="purple" style={{ fontSize: 10, borderRadius: 4, padding: '0 6px', lineHeight: '16px', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${record.projectId}`); }}>
                📁 {record.project.code ? `${record.project.code} · ` : ''}{record.project.name}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ItemStatus) => (
        <Tag color={STATUS_COLORS[status]} style={{ borderRadius: 6 }}>{STATUS_LABELS[status]}</Tag>
      ),
    },
    {
      title: '子状态',
      dataIndex: 'subStatus',
      key: 'subStatus',
      width: 150,
      render: (subStatus: string) => subStatus ? <Tag color="blue" style={{ borderRadius: 6 }}>{subStatus}</Tag> : '-',
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: Priority) => (
        <Tag color={PRIORITY_COLORS[priority]} style={{ borderRadius: 6 }}>{PRIORITY_LABELS[priority]}</Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: Category) => <Tag style={{ borderRadius: 6 }}>{CATEGORY_LABELS[category]}</Tag>,
    },
    {
      title: '截止日期',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 120,
      render: (dueDate: string) => dueDate ? (
        <span style={{ color: isOverdue({ dueDate, status: '' } as any) ? '#ff453a' : textSecondary }}>
          {dayjs(dueDate).format('YYYY-MM-DD')}
          {isOverdue({ dueDate, status: '' } as any) && ' 已逾期'}
        </span>
      ) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Item) => (
        <Space>
          {record.status === 'TODO' && <Button size="small" type="primary" onClick={() => handleStatusChange(record, 'IN_PROGRESS')} style={{ borderRadius: 6 }}>开始</Button>}
          {record.status === 'IN_PROGRESS' && <Button size="small" type="primary" onClick={() => handleStatusChange(record, 'COMPLETED')} style={{ borderRadius: 6 }}>完成</Button>}
          <Button size="small" danger onClick={() => handleDelete(record)} style={{ borderRadius: 6 }}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: textPrimary }}>列表视图</h2>
        <Button type="primary" icon={<PlusOutlined />} style={{ borderRadius: 10, fontWeight: 500 }} onClick={() => { sessionStorage.setItem('itemDetailFrom', 'list'); navigate('/items/new'); }}>
          新建事项
        </Button>
      </div>

      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: cardBg, border: `1px solid ${accentColor}40`, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: textPrimary, fontWeight: 500 }}>已选择 {selectedRowKeys.length} 项</span>
          <Space>
            <Button size="small" icon={<CheckCircleOutlined />} onClick={handleBatchComplete} style={{ borderRadius: 6 }}>批量完成</Button>
            <Button size="small" onClick={handleBatchAssignProject} style={{ borderRadius: 6 }}>分配项目</Button>
            <Popconfirm title="确定要删除选中的事项吗？" onConfirm={handleBatchDelete} okText="确定" cancelText="取消">
              <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>批量删除</Button>
            </Popconfirm>
            <Button size="small" onClick={() => setSelectedRowKeys([])} style={{ borderRadius: 6 }}>取消选择</Button>
          </Space>
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Input placeholder="搜索事项..." prefix={<SearchOutlined />} style={{ width: 200, borderRadius: 8 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
        <Select placeholder="状态" style={{ width: 120 }} allowClear value={filterStatus} onChange={setFilterStatus}
          options={[{ value: 'TODO', label: '待办' }, { value: 'IN_PROGRESS', label: '进行中' }, { value: 'COMPLETED', label: '已完成' }]} />
        <Select placeholder="优先级" style={{ width: 120 }} allowClear value={filterPriority} onChange={setFilterPriority}
          options={[{ value: 'LOW', label: '低' }, { value: 'MEDIUM', label: '中' }, { value: 'HIGH', label: '高' }, { value: 'URGENT', label: '紧急' }]} />
        <Select placeholder="分类" style={{ width: 140 }} allowClear value={filterCategory} onChange={setFilterCategory}
          options={[{ value: 'PROCUREMENT_SOURCING', label: '招标寻源' }, { value: 'PAYMENT', label: '供应商付款' }, { value: 'OTHER', label: '其他' }]} />
        <Select
          placeholder="所属项目"
          style={{ width: 220 }}
          allowClear
          showSearch
          optionFilterProp="label"
          value={filterProject || undefined}
          onChange={(v) => setFilterProject(v || '')}
          options={[
            { value: '', label: '📋 全部事项' },
            { value: '__none__', label: '🗂 散任务（无项目）' },
            ...projects.map((p) => ({
              value: p.id,
              label: p.code ? `${p.code} · ${p.name}` : p.name,
            })),
          ]}
        />
        <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)} style={{ borderRadius: 8 }} />
      </div>

      <Table columns={columns} dataSource={filteredItems} rowKey="id" rowSelection={rowSelection} pagination={{ pageSize: 10 }} style={{ borderRadius: 12 }} />

      <Modal
        title="批量分配项目"
        open={batchProjectModal}
        onOk={confirmBatchAssignProject}
        onCancel={() => setBatchProjectModal(false)}
        okText="确认分配"
        cancelText="取消"
      >
        <p style={{ marginBottom: 16 }}>为已选择的 {selectedRowKeys.length} 项事项分配项目：</p>
        <Select
          value={batchProjectId}
          onChange={setBatchProjectId}
          style={{ width: '100%' }}
          options={[
            { value: '__none__', label: '🗂 移出项目（散任务）' },
            ...projects.map((p) => ({
              value: p.id,
              label: p.code ? `${p.code} · ${p.name}` : p.name,
            })),
          ]}
        />
      </Modal>
    </div>
  );
}
