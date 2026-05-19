import { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Tag, Modal, Form, Select, DatePicker, Switch, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, BellOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { remindersAPI, itemsAPI } from '../services/api';
import type { Reminder, Item, ReminderType } from '../types';
import { REMINDER_TYPE_LABELS, REMINDER_TYPE_COLORS } from '../types';
import { getTheme } from '../utils/theme';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function Reminders() {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const theme = getTheme();

  const loadReminders = async () => {
    setLoading(true);
    try {
      const res = await remindersAPI.getAll();
      setReminders(res.data);
    } catch {
      message.error('加载提醒失败');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const res = await itemsAPI.getAll();
      setItems(res.data.filter((item: Item) => item.status !== 'COMPLETED'));
    } catch {
      message.error('加载事项失败');
    }
  };

  useEffect(() => {
    Promise.all([loadReminders(), loadItems()]);
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const [start] = values.remindTime || [];
      const data = {
        itemId: values.itemId,
        type: values.type,
        remindAt: start?.toISOString(),
        isRecurring: values.isRecurring || false,
        recurringPattern: values.recurringPattern,
      };
      await remindersAPI.create(data);
      message.success('提醒创建成功');
      setModalVisible(false);
      form.resetFields();
      loadReminders();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    try {
      await remindersAPI.update(reminder.id, { isEnabled: !reminder.isEnabled });
      message.success(`提醒已${!reminder.isEnabled ? '启用' : '禁用'}`);
      loadReminders();
    } catch {
      message.error('更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remindersAPI.delete(id);
      message.success('删除成功');
      loadReminders();
    } catch {
      message.error('删除失败');
    }
  };

  const enabledReminders = useMemo(() => reminders.filter((r) => r.isEnabled), [reminders]);
  const disabledReminders = useMemo(() => reminders.filter((r) => !r.isEnabled), [reminders]);

  const columns = [
    {
      title: '事项',
      dataIndex: ['item', 'title'],
      key: 'item',
      render: (title: string, record: Reminder) => (
        <a onClick={() => navigate(`/items/${record.itemId}`)} style={{ fontWeight: 500 }}>{title}</a>
      ),
    },
    {
      title: '提醒类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: ReminderType) => (
        <Tag color={REMINDER_TYPE_COLORS[type]} style={{ borderRadius: 6 }}>{REMINDER_TYPE_LABELS[type]}</Tag>
      ),
    },
    {
      title: '提醒时间',
      dataIndex: 'remindAt',
      key: 'remindAt',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '重复',
      dataIndex: 'isRecurring',
      key: 'isRecurring',
      width: 80,
      render: (isRecurring: boolean) => (
        isRecurring ? <Tag color="purple" style={{ borderRadius: 6 }}>是</Tag> : <Tag style={{ borderRadius: 6 }}>否</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (isEnabled: boolean) => (
        <Tag color={isEnabled ? 'green' : 'default'} style={{ borderRadius: 6 }}>
          {isEnabled ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Reminder) => (
        <Space>
          <Switch checked={record.isEnabled} onChange={() => handleToggle(record)} size="small" />
          <Popconfirm
            title="确定删除这个提醒？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.textPrimary }}>提醒管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)} style={{ borderRadius: 8 }}>
          添加提醒
        </Button>
      </div>

      {enabledReminders.length > 0 && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}><BellOutlined /> 启用的提醒 ({enabledReminders.length})</span>}
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
        >
          <Table dataSource={enabledReminders} columns={columns} rowKey="id" pagination={false} loading={loading} />
        </Card>
      )}

      {disabledReminders.length > 0 && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}><BellOutlined /> 禁用的提醒 ({disabledReminders.length})</span>}
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
        >
          <Table dataSource={disabledReminders} columns={columns} rowKey="id" pagination={false} loading={loading} />
        </Card>
      )}

      {reminders.length === 0 && !loading && (
        <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
          <div style={{ textAlign: 'center', padding: 48, color: theme.textSecondary }}>
            <BellOutlined style={{ fontSize: 48, marginBottom: 16, color: '#1F3D2E' }} />
            <p style={{ fontSize: 15 }}>暂无提醒设置</p>
            <Button type="primary" onClick={() => setModalVisible(true)} style={{ borderRadius: 8 }}>
              添加第一个提醒
            </Button>
          </div>
        </Card>
      )}

      <Modal
        title="添加提醒"
        open={modalVisible}
        onOk={handleCreate}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="itemId"
            label="关联事项"
            rules={[{ required: true, message: '请选择关联的事项' }]}
          >
            <Select
              placeholder="选择事项"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={items.map((item) => ({
                value: item.id,
                label: item.title,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="type"
            label="提醒类型"
            rules={[{ required: true, message: '请选择提醒类型' }]}
            initialValue="BEFORE_DUE"
          >
            <Select
              options={[
                { value: 'BEFORE_DUE', label: '截止前提醒' },
                { value: 'DAILY_DIGEST', label: '每日摘要' },
                { value: 'CUSTOM', label: '自定义时间' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="remindTime"
            label="提醒时间"
            rules={[{ required: true, message: '请选择提醒时间' }]}
          >
            <RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%', borderRadius: 8 }} />
          </Form.Item>

          <Form.Item name="isRecurring" label="重复提醒" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.isRecurring !== currentValues.isRecurring
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('isRecurring') && (
                <Form.Item name="recurringPattern" label="重复模式">
                  <Select
                    placeholder="选择重复模式"
                    options={[
                      { value: 'DAILY', label: '每天' },
                      { value: 'WEEKLY', label: '每周' },
                      { value: 'MONTHLY', label: '每月' },
                    ]}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}