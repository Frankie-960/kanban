import { useState, useEffect } from 'react';
import { Card, Button, Tag, message, Spin, Modal, Select, Row, Col, Progress, Divider, Statistic, Table, Badge, Space } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, FileMarkdownOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, RobotOutlined, ManOutlined, DollarOutlined, ShoppingOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import type { Report, ReportContent } from '../types';
import { getReportTypeLabel } from '../utils/report';
import { getTheme } from '../utils/theme';
import dayjs from 'dayjs';

export default function ReportDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [content, setContent] = useState<ReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<'word' | 'excel'>('word');
  const [exportingAi, setExportingAi] = useState(false);

  const theme = getTheme();

  useEffect(() => {
    if (id) {
      loadReport(id);
    }
  }, [id]);

  const loadReport = async (reportId: string) => {
    try {
      setLoading(true);
      const res = await reportsAPI.getById(reportId);
      setReport(res.data);

      const reportContent = typeof res.data.content === 'string'
        ? JSON.parse(res.data.content)
        : res.data.content;
      setContent(reportContent);
    } catch {
      message.error('加载报告失败');
      navigate('/reports');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!id) return;
    try {
      setExporting(true);
      const response = await reportsAPI.export(id, exportFormat);

      const blob = new Blob([response.data], {
        type: exportFormat === 'word'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = exportFormat === 'word'
        ? `${getReportTypeLabel(report!.type)}_${dayjs().format('YYYY-MM-DD')}.docx`
        : `${getReportTypeLabel(report!.type)}_${dayjs().format('YYYY-MM-DD')}.xlsx`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(`报告已导出为 ${exportFormat === 'word' ? 'Word' : 'Excel'} 格式`);
      setExportModalVisible(false);
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAi = async () => {
    if (!id) return;
    try {
      setExportingAi(true);
      const response = await reportsAPI.exportAi(id);
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getReportTypeLabel(report!.type)}_${dayjs().format('YYYY-MM-DD')}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('AI材料已导出（.md），可用 Claude Code / Coze 等工具转为 HTML');
    } catch {
      message.error('导出失败');
    } finally {
      setExportingAi(false);
    }
  };

  const isAIReport = content?.periodProgress && content.periodProgress.length > 100;

  // 供应商表格列
  const supplierColumns = [
    { title: '供应商', dataIndex: 'name', key: 'name' },
    { title: '级别', dataIndex: 'level', key: 'level', render: (level: string) => <Tag color={level === 'A' ? 'green' : level === 'B' ? 'orange' : 'default'}>{level}</Tag> },
    { title: '项目数', dataIndex: 'itemCount', key: 'itemCount' },
    { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number) => v?.toLocaleString() || '-' },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!report || !content) {
    return null;
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')} style={{ borderRadius: 8 }}>
          返回报告列表
        </Button>
        <Space>
          <Button icon={<FileMarkdownOutlined />} loading={exportingAi} onClick={handleExportAi} style={{ borderRadius: 8 }}>
            导出AI材料
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => setExportModalVisible(true)} style={{ borderRadius: 8 }}>
            导出报告
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 24, background: theme.isDark ? '#21262d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ color: 'white', fontSize: 28, margin: 0 }}>
              采购部门{getReportTypeLabel(report.type)}
            </h1>
            <Tag
              icon={isAIReport ? <RobotOutlined /> : <ManOutlined />}
              color={isAIReport ? 'green' : 'default'}
              style={{ margin: 0, borderRadius: 6, background: isAIReport ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {isAIReport ? 'AI智能分析' : '数据汇总'}
            </Tag>
          </div>
          <p style={{ opacity: 0.9, margin: 0 }}>
            报告周期: {dayjs(report.periodStart).format('YYYY年MM月DD日')} - {dayjs(report.periodEnd).format('MM月DD日')}
          </p>
          <p style={{ opacity: 0.7, fontSize: 12, margin: '8px 0 0' }}>
            生成时间: {dayjs(report.createdAt).format('YYYY-MM-DD HH:mm')}
          </p>
        </div>
      </Card>

      {content.summary && (
        <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>执行摘要</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0, color: theme.textPrimary }}>{content.summary}</p>
        </Card>
      )}

      {/* 成本分析区域 */}
      {(content.totalEstimatedAmount > 0 || content.totalFinalAmount > 0) && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}><DollarOutlined /> 成本分析</span>}
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
        >
          <Row gutter={24}>
            <Col span={6}>
              <Statistic
                title="预估总成本"
                value={content.totalEstimatedAmount}
                precision={2}
                prefix="¥"
                suffix={content.currency !== 'CNY' ? content.currency : ''}
                valueStyle={{ color: theme.textSecondary }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="实际/目标总成本"
                value={content.totalFinalAmount}
                precision={2}
                prefix="¥"
                suffix={content.currency !== 'CNY' ? content.currency : ''}
                valueStyle={{ color: theme.textPrimary }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="节省金额"
                value={content.totalSavings}
                precision={2}
                prefix={content.totalSavings >= 0 ? <FallOutlined /> : <RiseOutlined />}
                suffix={content.currency !== 'CNY' ? content.currency : ''}
                valueStyle={{ color: content.totalSavings >= 0 ? '#34c759' : '#ff453a' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="节省率"
                value={content.savingsRate}
                precision={1}
                suffix="%"
                valueStyle={{ color: content.savingsRate >= 0 ? '#34c759' : '#ff453a' }}
              />
            </Col>
          </Row>
          {content.costAnalysis && (
            <div style={{ marginTop: 16, padding: 12, background: theme.isDark ? '#21262d' : '#f9f9f9', borderRadius: 8 }}>
              <p style={{ margin: 0, color: theme.textPrimary, lineHeight: 1.6 }}>{content.costAnalysis}</p>
            </div>
          )}
        </Card>
      )}

      {/* 供应商分析区域 */}
      {content.supplierStats && content.supplierStats.length > 0 && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}><ShoppingOutlined /> 供应商分析</span>}
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
        >
          <Row gutter={24}>
            <Col span={8}>
              <Statistic
                title="合作供应商数"
                value={content.supplierStats.length}
                valueStyle={{ color: theme.textPrimary }}
              />
            </Col>
            {content.topSupplier && (
              <Col span={8}>
                <Statistic
                  title="最大供应商"
                  value={content.topSupplier.name}
                  valueStyle={{ color: theme.textPrimary, fontSize: 18 }}
                />
                <div style={{ color: theme.textSecondary, marginTop: 4 }}>项目数: {content.topSupplier.itemCount}</div>
              </Col>
            )}
            <Col span={8}>
              <Statistic
                title="供应商平均绩效"
                value={content.supplierPerformance}
                precision={1}
                suffix="分"
                valueStyle={{ color: content.supplierPerformance >= 80 ? '#34c759' : content.supplierPerformance >= 60 ? '#ff9f0a' : '#ff453a' }}
              />
            </Col>
          </Row>
          <Table
            dataSource={content.supplierStats.slice(0, 5)}
            columns={supplierColumns}
            rowKey="name"
            size="small"
            pagination={false}
            style={{ marginTop: 16 }}
          />
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <CheckCircleOutlined style={{ fontSize: 32, color: '#34c759' }} />
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#34c759', marginTop: 8 }}>{content.completedTasks}</div>
              <div style={{ color: theme.textSecondary, marginTop: 4 }}>已完成</div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <ClockCircleOutlined style={{ fontSize: 32, color: '#1677FF' }} />
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1677FF', marginTop: 8 }}>{content.inProgressTasks}</div>
              <div style={{ color: theme.textSecondary, marginTop: 4 }}>进行中</div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <ExclamationCircleOutlined style={{ fontSize: 32, color: '#ff9f0a' }} />
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff9f0a', marginTop: 8 }}>{content.pendingTasks}</div>
              <div style={{ color: theme.textSecondary, marginTop: 4 }}>待处理</div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#722ed1' }}>{content.completionRate}%</div>
              <div style={{ color: theme.textSecondary, marginTop: 4 }}>完成率</div>
              <Progress percent={content.completionRate} showInfo={false} strokeColor="#722ed1" style={{ marginTop: 8 }} />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} lg={12}>
          {content.highlights && content.highlights.length > 0 && (
            <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>工作亮点</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {content.highlights.map((highlight, index) => (
                  <li key={index} style={{ marginBottom: 12, lineHeight: 1.6, color: theme.textPrimary }}>{highlight}</li>
                ))}
              </ul>
            </Card>
          )}

          {content.risks && content.risks.length > 0 && (
            <Card title={<span style={{ fontSize: 16, fontWeight: 600, color: '#ff453a' }}>风险与问题</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {content.risks.map((risk, index) => (
                  <li key={index} style={{ marginBottom: 12, lineHeight: 1.6, color: '#ff453a' }}>{risk}</li>
                ))}
              </ul>
            </Card>
          )}

          {content.nextSteps && content.nextSteps.length > 0 && (
            <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>下阶段计划</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {content.nextSteps.map((step, index) => (
                  <li key={index} style={{ marginBottom: 12, lineHeight: 1.6, color: theme.textPrimary }}>{step}</li>
                ))}
              </ul>
            </Card>
          )}

          {content.insights && content.insights.length > 0 && (
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 600 }}><RobotOutlined /> AI洞察</span>}
              style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
            >
              {isAIReport ? (
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {content.insights.map((insight, index) => (
                    <li key={index} style={{ marginBottom: 12, lineHeight: 1.6, color: theme.textPrimary }}>{insight}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: theme.textSecondary, fontStyle: 'italic' }}>
                  当前为数据汇总模式，启用AI分析后可获得智能洞察
                </div>
              )}
            </Card>
          )}
        </Col>

        <Col xs={24} lg={12}>
          {content.categories && content.categories.length > 0 && (
            <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>任务详情</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
              {content.categories.map((cat, catIndex) => (
                <div key={catIndex} style={{ marginBottom: catIndex < content.categories.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: theme.textPrimary }}>{cat.name}</strong>
                    <Badge
                      count={`${cat.tasks.filter(t => t.status === 'COMPLETED').length}/${cat.tasks.length}`}
                      style={{ backgroundColor: '#34c759' }}
                    />
                  </div>
                  <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13 }}>
                    {cat.tasks.slice(0, 5).map((task, taskIndex) => (
                      <li key={taskIndex} style={{ marginBottom: 6, lineHeight: 1.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {task.status === 'COMPLETED' ? (
                            <CheckCircleOutlined style={{ color: '#34c759', fontSize: 12 }} />
                          ) : task.status === 'IN_PROGRESS' ? (
                            <ClockCircleOutlined style={{ color: '#1677FF', fontSize: 12 }} />
                          ) : (
                            <ExclamationCircleOutlined style={{ color: '#ff9f0a', fontSize: 12 }} />
                          )}
                          <span style={{
                            textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
                            color: task.status === 'COMPLETED' ? theme.textSecondary : theme.textPrimary,
                          }}>
                            {task.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2, marginLeft: 18 }}>
                          {task.subStatus && (
                            <Tag color="blue" style={{ fontSize: 10, borderRadius: 4, marginRight: 4 }}>{task.subStatus}</Tag>
                          )}
                          {task.supplierName && (
                            <Tag style={{ fontSize: 10, borderRadius: 4, marginRight: 4 }}>{task.supplierName}</Tag>
                          )}
                          {task.estimatedAmount && (
                            <Tag style={{ fontSize: 10, borderRadius: 4 }}>¥{task.estimatedAmount.toLocaleString()}</Tag>
                          )}
                          {task.progress && (
                            <span style={{ fontSize: 10, color: '#1677FF' }}>{task.progress}</span>
                          )}
                        </div>
                      </li>
                    ))}
                    {cat.tasks.length > 5 && (
                      <li style={{ color: theme.textSecondary }}>...还有 {cat.tasks.length - 5} 项</li>
                    )}
                  </ul>
                  {catIndex < content.categories.length - 1 && <Divider style={{ margin: '16px 0' }} />}
                </div>
              ))}
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title="导出报告"
        open={exportModalVisible}
        onOk={handleExport}
        onCancel={() => setExportModalVisible(false)}
        confirmLoading={exporting}
        okText="导出"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: theme.textPrimary }}>选择导出格式：</p>
        </div>
        <Select
          value={exportFormat}
          onChange={setExportFormat}
          style={{ width: 200, borderRadius: 8 }}
          options={[
            { value: 'word', label: 'Word 文档 (.docx)' },
            { value: 'excel', label: 'Excel 工作簿 (.xlsx)' },
          ]}
        />
      </Modal>
    </div>
  );
}