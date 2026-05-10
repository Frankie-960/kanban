import { useState, useEffect } from 'react';
import { Card, Button, List, Tag, Modal, Form, Select, DatePicker, message, Spin, Popconfirm, Input } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import type { Report } from '../types';
import { getReportTypeLabel } from '../utils/report';
import { DEFAULT_LLM_PROVIDERS } from '../utils/llm';
import { getTheme } from '../utils/theme';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [llmProviders, setLlmProviders] = useState(DEFAULT_LLM_PROVIDERS);
  const [form] = Form.useForm();

  const theme = getTheme();

  useEffect(() => {
    loadReports();
    loadLLMProviders();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await reportsAPI.getAll();
      setReports(res.data);
    } catch {
      message.error('加载报告失败');
    } finally {
      setLoading(false);
    }
  };

  const loadLLMProviders = async () => {
    try {
      const res = await reportsAPI.getLLMProviders();
      setLlmProviders(res.data.length > 0 ? res.data : DEFAULT_LLM_PROVIDERS);
      if (res.data.length > 0 && !form.getFieldValue('llmProvider')) {
        form.setFieldsValue({ llmProvider: res.data[0].key });
      }
    } catch {
      setLlmProviders(DEFAULT_LLM_PROVIDERS);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await reportsAPI.delete(id);
      setReports(reports.filter(r => r.id !== id));
      message.success('报告已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setGenerating(true);

      const [start, end] = values.period;
      const res = await reportsAPI.generate({
        type: values.type,
        periodStart: start.startOf('day').toISOString(),
        periodEnd: end.endOf('day').toISOString(),
        customRequirements: values.customRequirements,
        llmProvider: values.llmProvider,
        reportScope: values.reportScope || 'personal',
      });

      message.success('报告生成成功');
      setModalVisible(false);
      form.resetFields();
      navigate(`/reports/${res.data.id}`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const getPeriodDisplay = (report: Report) => {
    const start = dayjs(report.periodStart).format('MM/DD');
    const end = dayjs(report.periodEnd).format('MM/DD');
    return `${start} - ${end}`;
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.textPrimary }}>报告中心</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
          style={{ borderRadius: 8 }}
        >
          生成报告
        </Button>
      </div>

      <Spin spinning={loading}>
        <List
          grid={{ gutter: 16, xs: 1, sm: 2, lg: 3 }}
          dataSource={reports}
          renderItem={(report) => (
            <List.Item>
              <Card
                hoverable
                onClick={() => navigate(`/reports/${report.id}`)}
                style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 12 }}
                cover={
                  <div style={{
                    height: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: theme.isDark ? '#21262d' : '#f9f9f9',
                    borderRadius: '12px 12px 0 0',
                    color: '#0071e3',
                    fontSize: 40,
                  }}>
                    <FileTextOutlined />
                  </div>
                }
                actions={[
                  <Button type="link" onClick={(e) => { e.stopPropagation(); navigate(`/reports/${report.id}`); }}>
                    查看详情
                  </Button>,
                  <Popconfirm
                    title="确定删除这个报告？"
                    onConfirm={(e) => { e?.stopPropagation(); handleDelete(report.id); }}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="link" danger onClick={(e) => e?.stopPropagation()}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <Card.Meta
                  title={
                    <span>
                      {getReportTypeLabel(report.type)}
                      <Tag color="blue" style={{ marginLeft: 8, borderRadius: 6 }}>
                        {getPeriodDisplay(report)}
                      </Tag>
                    </span>
                  }
                  description={
                    <span style={{ fontSize: 12, color: theme.textSecondary }}>
                      {dayjs(report.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  }
                />
              </Card>
            </List.Item>
          )}
          locale={{ emptyText: '暂无报告，点击上方按钮生成' }}
        />
      </Spin>

      <Modal
        title="生成报告"
        open={modalVisible}
        onOk={handleGenerate}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        confirmLoading={generating}
        okText="生成"
        cancelText="取消"
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'WEEKLY', llmProvider: 'deepseek' }}
        >
          <Form.Item
            name="type"
            label="报告类型"
            rules={[{ required: true, message: '请选择报告类型' }]}
          >
            <Select
              options={[
                { value: 'WEEKLY', label: '周报' },
                { value: 'BIWEEKLY', label: '双周报' },
                { value: 'MONTHLY', label: '月报' },
                { value: 'QUARTERLY', label: '季报' },
                { value: 'YEARLY', label: '年报' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="period"
            label="报告周期"
            rules={[{ required: true, message: '请选择报告周期' }]}
          >
            <RangePicker style={{ width: '100%', borderRadius: 8 }} />
          </Form.Item>

          <Form.Item
            name="reportScope"
            label="报告范围"
            tooltip="选择个人报告只包含您创建的事项，选择部门报告包含部门所有共享事项"
          >
            <Select
              options={[
                { value: 'personal', label: '个人报告' },
                { value: 'department', label: '部门报告' },
              ]}
            />
          </Form.Item>

          <Form.Item name="llmProvider" label="选择AI大模型">
            <Select
              options={llmProviders.map(p => ({ value: p.key, label: p.name }))}
            />
          </Form.Item>

          <Form.Item
            name="customRequirements"
            label="报告特殊要求（可选）"
            tooltip="输入你对报告的特殊要求，例如：'重点突出招标进度'、'强调付款完成情况'、'CEO汇报风格'等"
          >
            <TextArea
              rows={3}
              placeholder="例如：1. 重点突出招标寻源进度&#10;2. 强调供应商付款完成情况&#10;3. CEO汇报风格，简洁有力"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}