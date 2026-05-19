import { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Button, Table, Avatar, Space, Radio, Skeleton } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Label, CartesianGrid } from 'recharts';
import { useAppStore } from '../stores/appStore';
import { CATEGORY_LABELS, STATUS_LABELS, PRIORITY_QUADRANT, STATUS_COLORS, CATEGORY_CONFIG } from '../types';
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
      <div style={{ marginBottom: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-heading">
            {getGreeting()}，{user?.name}
          </h1>
          <p className="page-subhead">
            {dayjs().format('YYYY 年 MM 月 DD 日')} · 本周完成率 {completionRate}%
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

      <Row gutter={[24, 24]} style={{ marginBottom: 56 }}>
        {initialLoading ? (
          <>
            <Col xs={24} lg={12}>
              <div className="surface" style={{ minHeight: 200 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            </Col>
            {[1, 2, 3].map((i) => (
              <Col xs={8} lg={4} key={i}>
                <Skeleton active paragraph={{ rows: 1 }} />
              </Col>
            ))}
          </>
        ) : (
          <>
            <Col xs={24} lg={12}>
              <div
                className="surface"
                style={{
                  padding: '32px 36px',
                  minHeight: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div className="section-title">本周完成</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--ink)', lineHeight: 1 }}>
                    {completedItems.length}
                  </span>
                  <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>事项</span>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <span>完成率</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{completionRate}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-softer)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${completionRate}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              </div>
            </Col>

            {[
              { label: '待办', value: todoItems.length, accent: '#ff9f43' },
              { label: '进行中', value: inProgressItems.length, accent: 'var(--color-primary)' },
              { label: '已逾期', value: overdueItems.length, accent: '#ff5252' },
            ].map((s) => (
              <Col xs={8} lg={4} key={s.label}>
                <div style={{ padding: '12px 4px' }}>
                  <div className="section-title" style={{ marginBottom: 10 }}>{s.label}</div>
                  <div style={{ fontSize: 44, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ width: 28, height: 2, background: s.accent, marginTop: 14 }} />
                </div>
              </Col>
            ))}
          </>
        )}
      </Row>

      <Row gutter={[40, 48]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 className="section-heading">我的任务</h2>
              <Radio.Group
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
              </Radio.Group>
            </div>
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
              <>
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
                            <span className={`priority-pill q-${PRIORITY_QUADRANT[item.priority].quadrant}`}>
                              {PRIORITY_QUADRANT[item.priority].label}
                            </span>
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
                  <Button type="link" onClick={() => navigate('/list')} style={{ padding: 0, marginTop: 12 }}>
                    查看全部 ({filteredListItems.length})
                  </Button>
                )}
              </>
            )}
          </div>

          {overdueItems.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <h2 className="section-heading" style={{ color: '#ff5252', marginBottom: 18 }}>
                已逾期事项
              </h2>
              <List
                size="small"
                dataSource={overdueItems.slice(0, 3)}
                renderItem={(item) => (
                  <List.Item style={{ borderBottom: '1px solid var(--bg-soft)' }}>
                    <List.Item.Meta
                      title={<span style={{ color: '#ff5252', fontWeight: 500 }}>{item.title}</span>}
                      description={`逾期 ${dayjs().diff(dayjs(item.dueDate), 'day')} 天`}
                    />
                    <Tag color="red" style={{ borderRadius: 6 }}>紧急处理</Tag>
                  </List.Item>
                )}
              />
            </div>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <div style={{ marginBottom: 48 }}>
            <h2 className="section-heading" style={{ marginBottom: 18 }}>分类统计</h2>
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="38%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    <Label
                      position="center"
                      content={({ viewBox }: any) => {
                        const cx = viewBox?.cx ?? 0;
                        const cy = viewBox?.cy ?? 0;
                        return (
                          <g>
                            <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 24, fontWeight: 600, fill: textPrimary }}>
                              {displayItems.length}
                            </text>
                            <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 11, fill: textSecondary }}>
                              总任务
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Pie>
                  <Tooltip />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string, entry: any) => (
                      <span style={{ color: textSecondary, fontSize: 12 }}>
                        {value} <span style={{ color: textPrimary, fontWeight: 500 }}>({entry?.payload?.value ?? 0})</span>
                      </span>
                    )}
                    wrapperStyle={{ fontSize: 12, paddingLeft: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ color: textSecondary }}>暂无分类数据</div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 48 }}>
            <h2 className="section-heading" style={{ marginBottom: 18 }}>本周完成趋势</h2>
            {initialLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weekData} barCategoryGap="35%" margin={{ top: 12, right: 8, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--bg-soft)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: textSecondary }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: textSecondary }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip cursor={{ fill: 'var(--bg-soft)' }} />
                    <Bar
                      dataKey="completed"
                      fill="var(--color-primary)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                      background={{ fill: 'var(--bg-soft)', radius: 6 }}
                    />
                  </BarChart>
                </ResponsiveContainer>
                {!weekData.some((d) => d.completed > 0) && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: textSecondary, fontSize: 12, pointerEvents: 'none', opacity: 0.7,
                  }}>
                    本周暂无完成事项
                  </div>
                )}
              </div>
            )}
          </div>
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
                      avatar={<Avatar style={{ background: '#1F3D2E' }}>{member.name?.[0] || '?'}</Avatar>}
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
                : (isDark ? '#5A9170' : '#1F3D2E'),
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
