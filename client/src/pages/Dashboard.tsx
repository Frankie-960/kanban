import { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Progress, Button, Table, Avatar, Space, Radio, Skeleton } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  AlertOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../stores/appStore';
import { PRIORITY_LABELS, CATEGORY_LABELS, STATUS_LABELS, PRIORITY_COLORS, STATUS_COLORS, CATEGORY_CONFIG } from '../types';
import { departmentsAPI } from '../services/api';
import { isOverdue } from '../utils/date';
import type { User } from '../types';
import dayjs from 'dayjs';

type StatusFilter = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'COMPLETED';

export default function Dashboard() {
  const navigate = useNavigate();
  const { items, user, departments, currentView, setCurrentView, fetchDepartments, fetchItems } = useAppStore();
  const [departmentMembers, setDepartmentMembers] = useState<User[]>([]);
  const [taskFilter, setTaskFilter] = useState<StatusFilter>('ALL');
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    fetchItems().finally(() => setInitialLoading(false));
  }, [currentView, fetchItems]);

  useEffect(() => {
    if (currentView === 'department' && user?.departmentId) {
      departmentsAPI.getMembers(user.departmentId)
        .then(res => setDepartmentMembers(res.data))
        .catch(() => setDepartmentMembers([]));
    }
  }, [currentView, user?.departmentId]);

  const displayItems = items;
  const todoItems = useMemo(() => displayItems.filter((i) => i.status === 'TODO'), [displayItems]);
  const inProgressItems = useMemo(() => displayItems.filter((i) => i.status === 'IN_PROGRESS'), [displayItems]);
  const completedItems = useMemo(() => displayItems.filter((i) => i.status === 'COMPLETED'), [displayItems]);
  const overdueItems = useMemo(() => displayItems.filter(isOverdue), [displayItems]);

  const filteredListItems = taskFilter === 'ALL'
    ? displayItems.filter((i) => i.status !== 'COMPLETED')
    : displayItems.filter((i) => i.status === taskFilter);

  const completionRate = useMemo(() => displayItems.length > 0
    ? Math.round((completedItems.length / displayItems.length) * 100)
    : 0, [displayItems, completedItems]);

  const categoryData = useMemo(() => [
    { name: CATEGORY_CONFIG.PROCUREMENT_SOURCING.name, value: displayItems.filter((i) => i.category === 'PROCUREMENT_SOURCING').length, color: CATEGORY_CONFIG.PROCUREMENT_SOURCING.color },
    { name: CATEGORY_CONFIG.PAYMENT.name, value: displayItems.filter((i) => i.category === 'PAYMENT').length, color: CATEGORY_CONFIG.PAYMENT.color },
    { name: CATEGORY_CONFIG.OTHER.name, value: displayItems.filter((i) => i.category === 'OTHER').length, color: CATEGORY_CONFIG.OTHER.color },
  ].filter(d => d.value > 0), [displayItems]);

  const weekData = useMemo(() => {
    const data: { day: string; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day');
      const count = completedItems.filter(item =>
        item.completedAt && dayjs(item.completedAt).isSame(date, 'day')
      ).length;
      data.push({ day: date.format('MM/DD'), completed: count });
    }
    return data;
  }, [completedItems]);

  const isManager = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_ADMIN';
  const isDark = localStorage.getItem('darkMode') === 'true';

  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const textSecondary = isDark ? '#8b949e' : '#86868b';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  const getGreeting = () => {
    const hour = dayjs().hour();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const renderPersonalDashboard = () => (
    <div>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: textPrimary, letterSpacing: -0.5 }}>
            {getGreeting()}，{user?.name}
          </h2>
          <p style={{ color: textSecondary, margin: '8px 0 0', fontSize: 14 }}>
            {dayjs().format('YYYY年MM月DD日')} · 本周完成率 {completionRate}%
          </p>
        </div>
        <Space size={12}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            style={{ borderRadius: 10, fontWeight: 500 }}
            onClick={() => { sessionStorage.setItem('itemDetailFrom', 'dashboard'); navigate('/items/new'); }}
          >
            新建事项
          </Button>
          <Button
            icon={<FileTextOutlined />}
            size="large"
            style={{ borderRadius: 10 }}
            onClick={() => navigate('/reports')}
          >
            生成周报
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {initialLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Col xs={12} sm={12} lg={6} key={i}>
                <Card style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}>
                  <Skeleton active paragraph={{ rows: 1 }} />
                </Card>
              </Col>
            ))}
          </>
        ) : (
          [
            { title: '待办事项', value: todoItems.length, color: '#ff9f43', icon: <ClockCircleOutlined /> },
            { title: '进行中', value: inProgressItems.length, color: '#0abde3', icon: <ExclamationCircleOutlined /> },
            { title: '已完成', value: completedItems.length, color: '#10b341', icon: <CheckCircleOutlined /> },
            { title: '已逾期', value: overdueItems.length, color: '#ff5252', icon: <AlertOutlined /> },
          ].map((stat, index) => (
            <Col xs={12} sm={12} lg={6} key={index}>
              <Card
                style={{
                  background: cardBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 16,
                  boxShadow: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: `${stat.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: 22, color: stat.color }}>{stat.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: textSecondary }}>{stat.title}</div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: textPrimary }}>{stat.value}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))
        )}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>📝 我的任务</span>}
            style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}
            extra={<Radio.Group
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="ALL">全部</Radio.Button>
              <Radio.Button value="TODO">待办</Radio.Button>
              <Radio.Button value="IN_PROGRESS">进行中</Radio.Button>
              <Radio.Button value="COMPLETED">已完成</Radio.Button>
            </Radio.Group>}
          >
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <span style={{ color: textSecondary, marginRight: 12 }}>本周完成率</span>
                  <Progress percent={completionRate} status="active" style={{ width: 200, display: 'inline-block' }} />
                </div>
                <List
                  size="small"
                  dataSource={filteredListItems.slice(0, 5)}
                  renderItem={(item) => (
                    <List.Item
                      style={{ cursor: 'pointer', borderRadius: 12, marginBottom: 8, padding: '12px 16px', border: `1px solid ${borderColor}` }}
                      onClick={() => navigate(`/items/${item.id}`)}
                    >
                      <List.Item.Meta
                        title={
                          <span style={{ fontWeight: 500, color: textPrimary }}>
                            {item.title}
                          </span>
                        }
                        description={
                          <Space size={4}>
                            <Tag color={PRIORITY_COLORS[item.priority]} style={{ borderRadius: 6 }}>
                              {PRIORITY_LABELS[item.priority]}
                            </Tag>
                            <Tag style={{ borderRadius: 6 }}>{CATEGORY_LABELS[item.category]}</Tag>
                            {item.dueDate && (
                              <span style={{ color: isOverdue(item) ? '#ff5252' : textSecondary, fontSize: 12 }}>
                                {isOverdue(item) ? '已逾期' : '截止:'} {dayjs(item.dueDate).format('MM/DD')}
                              </span>
                            )}
                          </Space>
                        }
                      />
                      <Tag color={STATUS_COLORS[item.status]} style={{ borderRadius: 6 }}>
                        {STATUS_LABELS[item.status]}
                      </Tag>
                    </List.Item>
                  )}
                  locale={{
                    emptyText: (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                        <div style={{ color: textSecondary }}>暂无任务</div>
                      </div>
                    )
                  }}
                />
                {filteredListItems.length > 5 && (
                  <Button type="link" onClick={() => navigate('/list')} style={{ padding: 0, marginTop: 8 }}>
                    查看全部 ({filteredListItems.length})
                  </Button>
                )}
              </>
            )}
          </Card>

          {overdueItems.length > 0 && (
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 600, color: '#ff5252' }}>⚠️ 已逾期事项</span>}
              style={{ background: cardBg, border: `1px solid #ff525230`, borderRadius: 16, marginTop: 16 }}
            >
              <List
                size="small"
                dataSource={overdueItems.slice(0, 3)}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<span style={{ color: '#ff5252', fontWeight: 500 }}>{item.title}</span>}
                      description={`逾期 ${dayjs().diff(dayjs(item.dueDate), 'day')} 天`}
                    />
                    <Tag color="red" style={{ borderRadius: 6 }}>紧急处理</Tag>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>📊 分类统计</span>}
            style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}
          >
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : categoryData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {categoryData.map((cat) => (
                    <Tag key={cat.name} color={cat.color} style={{ padding: '4px 12px', borderRadius: 6 }}>{cat.name} ({cat.value})</Tag>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ color: textSecondary }}>暂无分类数据</div>
              </div>
            )}
          </Card>

          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>📈 本周完成趋势</span>}
            style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16, marginTop: 16 }}
          >
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weekData}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="completed" fill="#10b341" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );

  const renderDepartmentDashboard = () => {
    const currentDept = departments.find(d => d.id === user?.departmentId);

    return (
      <div>
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: textPrimary, letterSpacing: -0.5 }}>
              🏢 {currentDept?.name || '采购部'} 工作概览
            </h2>
            <p style={{ color: textSecondary, margin: '8px 0 0', fontSize: 14 }}>
              {dayjs().format('YYYY年MM月DD日')} · 部门成员 {departmentMembers.length} 人
            </p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            style={{ borderRadius: 10 }}
            onClick={() => { sessionStorage.setItem('itemDetailFrom', 'dashboard'); navigate('/items/new'); }}
          >
            新建事项
          </Button>
        </div>

        <Row gutter={[16, 16]}>
          {[
            { title: '部门待办', value: todoItems.length, color: '#ff9f43' },
            { title: '部门进行中', value: inProgressItems.length, color: '#0abde3' },
            { title: '部门已完成', value: completedItems.length, color: '#10b341' },
            { title: '部门完成率', value: displayItems.length > 0 ? Math.round((completedItems.length / displayItems.length) * 100) : 0, suffix: '%', color: '#10b341' },
          ].map((stat, index) => (
            <Col xs={12} sm={6} key={index}>
              <Card style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}>
                <Statistic
                  title={<span style={{ fontSize: 13, color: textSecondary }}>{stat.title}</span>}
                  value={stat.value}
                  suffix={stat.suffix}
                  valueStyle={{ color: stat.color, fontSize: 28, fontWeight: 600 }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={24} lg={14}>
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>📋 部门任务进度</span>}
              style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}
            >
              <Table
                dataSource={displayItems.slice(0, 8)}
                rowKey="id"
                size="small"
                pagination={false}
                style={{ borderRadius: 12 }}
                columns={[
                  {
                    title: '任务',
                    dataIndex: 'title',
                    key: 'title',
                    render: (title: string, record: any) => (
                      <a onClick={() => navigate(`/items/${record.id}`)} style={{ fontWeight: 500 }}>{title}</a>
                    ),
                  },
                  {
                    title: '负责人',
                    dataIndex: ['user', 'name'],
                    key: 'user',
                    render: (name: string) => name || '-',
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status: string) => (
                      <Tag color={STATUS_COLORS[status as keyof typeof STATUS_COLORS]} style={{ borderRadius: 6 }}>
                        {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                      </Tag>
                    ),
                  },
                  {
                    title: '截止日期',
                    dataIndex: 'dueDate',
                    key: 'dueDate',
                    render: (date: string) => date ? (
                      <span style={{ color: isOverdue({ dueDate: date, status: '' } as any) ? '#ff5252' : textSecondary }}>
                        {dayjs(date).format('MM/DD')}
                      </span>
                    ) : '-',
                  },
                ]}
              />
              {displayItems.length > 8 && (
                <Button type="link" onClick={() => navigate('/department')} style={{ padding: 0, marginTop: 8 }}>
                  查看全部 ({displayItems.length})
                </Button>
              )}
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>👥 部门成员</span>}
              style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16 }}
            >
              <List
                dataSource={departmentMembers}
                renderItem={(member: User) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar style={{ background: '#0071e3' }}>{member.name?.[0] || '?'}</Avatar>}
                      title={member.name}
                      description={member.email}
                    />
                    <Tag
                      color={member.role === 'ADMIN' ? 'red' : member.role === 'DEPARTMENT_ADMIN' ? 'orange' : 'default'}
                      style={{ borderRadius: 6 }}
                    >
                      {member.role === 'ADMIN' ? '管理员' : member.role === 'DEPARTMENT_ADMIN' ? '部门负责人' : '成员'}
                    </Tag>
                  </List.Item>
                )}
              />
            </Card>

            <Card
              title={<span style={{ fontSize: 16, fontWeight: 600, color: '#ff5252' }}>🚨 紧急事项</span>}
              style={{ background: cardBg, border: `1px solid #ff525230`, borderRadius: 16, marginTop: 16 }}
            >
              <List
                size="small"
                dataSource={displayItems.filter((i: any) => i.priority === 'URGENT' && i.status !== 'COMPLETED').slice(0, 5)}
                renderItem={(item: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<span style={{ color: '#ff5252', fontWeight: 500 }}>{item.title}</span>}
                      description={`截止: ${dayjs(item.dueDate).format('MM/DD HH:mm')}`}
                    />
                    <Tag color="red" style={{ borderRadius: 6 }}>紧急</Tag>
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                      <div style={{ color: textSecondary }}>暂无紧急事项</div>
                    </div>
                  )
                }}
              />
            </Card>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <div>
      {isManager && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setCurrentView(currentView === 'personal' ? 'department' : 'personal')}
            style={{
              background: currentView === 'personal'
                ? (isDark ? '#238636' : '#34c759')
                : (isDark ? '#1f6feb' : '#0071e3'),
              color: '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            切换到 {currentView === 'personal' ? '部门' : '个人'}视图
          </button>
        </div>
      )}

      {currentView === 'personal' || !isManager ? renderPersonalDashboard() : renderDepartmentDashboard()}
    </div>
  );
}
