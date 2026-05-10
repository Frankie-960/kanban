import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Input, List, Avatar, message, Tabs, Popconfirm, Space, Select, Checkbox, Divider } from 'antd';
import { TeamOutlined, PlusOutlined, FileTextOutlined, DeleteOutlined, CheckOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { departmentsAPI } from '../services/api';
import { useAppStore } from '../stores/appStore';
import type { Department, User, Item, Announcement } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import { getRoleLabel, getRoleTagColor } from '../utils/role';
import { getTheme } from '../utils/theme';
import dayjs from 'dayjs';

export default function Department() {
  const { user, departments, fetchDepartments, items } = useAppStore();
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [departmentMembers, setDepartmentMembers] = useState<User[]>([]);
  const [departmentItems, setDepartmentItems] = useState<Item[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [myDeptAnnouncements, setMyDeptAnnouncements] = useState<Announcement[]>([]);
  const [myDeptId, setMyDeptId] = useState<string | null>(null);
  const [myDeptMembers, setMyDeptMembers] = useState<User[]>([]);
  const [myDeptItems, setMyDeptItems] = useState<Item[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [announcementForm] = Form.useForm();
  const [form] = Form.useForm();
  const [addMemberForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [targetAll, setTargetAll] = useState(true);
  const [selectedTargetUsers, setSelectedTargetUsers] = useState<string[]>([]);
  const [selectedLinkedItems, setSelectedLinkedItems] = useState<string[]>([]);
  const [createTaskForTargets, setCreateTaskForTargets] = useState(false);
  const [createAnnouncementModalVisible, setCreateAnnouncementModalVisible] = useState(false);

  const theme = getTheme();

  useEffect(() => {
    fetchDepartments();
    if (user?.departmentId) {
      Promise.all([
        departmentsAPI.getById(user.departmentId),
        departmentsAPI.getItems(user.departmentId),
      ]).then(([deptRes, itemsRes]) => {
        setMyDeptAnnouncements(deptRes.data.announcements || []);
        setMyDeptId(user.departmentId || null);
        setMyDeptMembers(deptRes.data.members || []);
        setMyDeptItems(itemsRes.data);
      }).catch(() => {});
    }
  }, [fetchDepartments, user?.departmentId]);

  const loadDepartmentDetails = async (dept: Department) => {
    setSelectedDepartment(dept);
    try {
      const [res, itemsRes] = await Promise.all([
        departmentsAPI.getById(dept.id),
        departmentsAPI.getItems(dept.id),
      ]);
      setSelectedDepartment(res.data);
      setDepartmentMembers(res.data.members || []);
      setDepartmentItems(itemsRes.data);
      setAnnouncements(res.data.announcements || []);
      if (dept.id === user?.departmentId) {
        setMyDeptAnnouncements(res.data.announcements || []);
        setMyDeptId(user.departmentId || null);
        setMyDeptMembers(res.data.members || []);
        setMyDeptItems(itemsRes.data);
      }
    } catch {
      message.error('加载部门详情失败');
    }
  };

  const handleCreateDepartment = async () => {
    try {
      const values = await form.validateFields();
      await departmentsAPI.create(values);
      message.success('部门创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchDepartments();
    } catch {
      message.error('创建失败');
    }
  };

  const handleAddMember = async () => {
    if (!selectedDepartment) return;
    try {
      const values = await addMemberForm.validateFields();
      setLoading(true);
      await departmentsAPI.addMember(selectedDepartment.id, values);
      message.success('成员添加成功');
      setAddMemberModalVisible(false);
      addMemberForm.resetFields();
      loadDepartmentDetails(selectedDepartment);
    } catch (err: any) {
      message.error(err.response?.data?.error || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedDepartment) return;
    try {
      await departmentsAPI.removeMember(selectedDepartment.id, userId);
      message.success('成员已移除');
      loadDepartmentDetails(selectedDepartment);
    } catch (err: any) {
      message.error(err.response?.data?.error || '移除失败');
    }
  };

  const handleUpdateMemberRole = async (userId: string, role: string) => {
    if (!selectedDepartment) return;
    try {
      await departmentsAPI.updateMemberRole(selectedDepartment.id, userId, role);
      message.success('角色已更新');
      loadDepartmentDetails(selectedDepartment);
    } catch (err: any) {
      message.error(err.response?.data?.error || '更新失败');
    }
  };

  const handleCreateAnnouncement = async () => {
    const deptId = selectedDepartment?.id || myDeptId;
    if (!deptId) return;
    try {
      const values = await announcementForm.validateFields();
      setAnnouncementLoading(true);
      await departmentsAPI.createAnnouncement(deptId, {
        title: values.title,
        content: values.content,
        targetAll,
        targetUserIds: targetAll ? [] : selectedTargetUsers,
        linkedItemIds: selectedLinkedItems,
        createTaskForTargets,
      });
      message.success('公告发布成功');
      setCreateAnnouncementModalVisible(false);
      announcementForm.resetFields();
      setTargetAll(true);
      setSelectedTargetUsers([]);
      setSelectedLinkedItems([]);
      setCreateTaskForTargets(false);
      if (selectedDepartment) {
        loadDepartmentDetails(selectedDepartment);
      } else if (myDeptId) {
        departmentsAPI.getById(myDeptId).then(res => setMyDeptAnnouncements(res.data.announcements || []));
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '发布失败');
    } finally {
      setAnnouncementLoading(false);
    }
  };

  const getCurrentDeptId = () => selectedDepartment?.id || myDeptId;

  const handleConfirmAnnouncement = async (announcementId: string, confirmed: boolean) => {
    const deptId = getCurrentDeptId();
    if (!deptId) return;
    try {
      await departmentsAPI.confirmAnnouncement(deptId, announcementId, confirmed);
      message.success(confirmed ? '已确认' : '已取消确认');
      if (selectedDepartment) {
        loadDepartmentDetails(selectedDepartment);
      } else if (myDeptId) {
        departmentsAPI.getById(myDeptId).then(res => setMyDeptAnnouncements(res.data.announcements || []));
      }
    } catch {
      message.error('操作失败');
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    const deptId = getCurrentDeptId();
    if (!deptId) return;
    try {
      await departmentsAPI.expireAnnouncement(deptId, announcementId);
      message.success('公告已删除');
      if (selectedDepartment) {
        loadDepartmentDetails(selectedDepartment);
      } else if (myDeptId) {
        departmentsAPI.getById(myDeptId).then(res => setMyDeptAnnouncements(res.data.announcements || []));
      }
    } catch {
      message.error('删除失败');
    }
  };

  const canManageMembers = () => {
    if (!user || !selectedDepartment) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId === selectedDepartment.id) return true;
    return false;
  };

  const canPublishAnnouncement = () => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (user.departmentId) return true;
    return false;
  };

  const columns = [
    { title: '部门名称', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '描述', dataIndex: 'description', key: 'description', render: (v: string) => <span style={{ color: theme.textSecondary }}>{v || '-'}</span> },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Department) => (
        <Button type="link" onClick={() => loadDepartmentDetails(record)} style={{ padding: 0 }}>
          查看详情
        </Button>
      ),
    },
  ];

  const memberColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => <span style={{ color: theme.textSecondary }}>{v}</span> },
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
      render: (_: any, record: User) => (
        <Space>
          {canManageMembers() && record.id !== user?.id && (
            <>
              {user?.role === 'ADMIN' && (
                <Button
                  size="small"
                  type="link"
                  onClick={() => handleUpdateMemberRole(record.id, record.role === 'DEPARTMENT_ADMIN' ? 'MEMBER' : 'DEPARTMENT_ADMIN')}
                  style={{ padding: '4px 8px' }}
                >
                  {record.role === 'DEPARTMENT_ADMIN' ? '降为成员' : '升为负责人'}
                </Button>
              )}
              <Popconfirm
                title="确定要移除该成员吗？"
                onConfirm={() => handleRemoveMember(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>
                  移除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns = [
    { title: '任务', dataIndex: 'title', key: 'title', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '负责人', dataIndex: 'user', key: 'user', render: (u: User) => <span>{u?.name || '-'}</span> },
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
      render: (date: string) => <span style={{ color: theme.textSecondary }}>{date ? dayjs(date).format('MM/DD') : '-'}</span>,
    },
  ];

  // 过滤活跃公告（未撤回且未过期）
  const activeAnnouncements = (anns: Announcement[]) => anns.filter(a => !a.isExpired && !a.isWithdrawn);

  const renderAnnouncementCard = (ann: Announcement, members: User[] = [], compact = false) => {
    const isPublisher = user?.id === ann.publishedById;
    const myConfirmation = ann.confirmations?.find(c => c.userId === user?.id);
    const confirmedCount = ann.confirmations?.filter(c => c.confirmed).length || 0;

    // 确定目标用户列表
    const targetUserIds = ann.targetAll
      ? members.map(m => m.id)
      : (ann.targetUserIds || []);

    const active = !ann.isExpired && !ann.isWithdrawn;

    return (
      <Card
        key={ann.id}
        size="small"
        style={{ marginBottom: 12, background: theme.isDark ? '#21262d' : '#fafafa', border: `1px solid ${theme.borderColor}` }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FileTextOutlined style={{ color: '#0071e3' }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>{ann.title}</span>
              {ann.isWithdrawn && <Tag color="default" style={{ borderRadius: 4 }}>已撤回</Tag>}
              {ann.isExpired && <Tag color="orange" style={{ borderRadius: 4 }}>已过期</Tag>}
              {ann.targetAll && <Tag color="blue" style={{ borderRadius: 4 }}>全员</Tag>}
              {!ann.targetAll && ann.targetUserIds && ann.targetUserIds.length > 0 && (
                <Tag color="purple" style={{ borderRadius: 4 }}>指定 {ann.targetUserIds.length} 人</Tag>
              )}
            </div>
            <div style={{
              background: theme.isDark ? '#30363d' : '#f5f5f5',
              padding: '12px',
              borderRadius: 8,
              marginBottom: 12,
              color: theme.textPrimary,
              lineHeight: 1.6,
              fontSize: 14,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {ann.content || '（无内容）'}
            </div>
            {ann.linkedItemIds && ann.linkedItemIds.length > 0 && (
              <div style={{ marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: theme.textSecondary }}>关联事项: </span>
                {ann.linkedItemIds.map(itemId => {
                  const linkedItem = items.find(i => i.id === itemId);
                  return linkedItem ? (
                    <Tag key={itemId} style={{ borderRadius: 4, marginRight: 4 }}>{linkedItem.title}</Tag>
                  ) : null;
                })}
              </div>
            )}
            <div style={{ fontSize: 12, color: theme.textSecondary }}>
              发布于 {dayjs(ann.createdAt).format('YYYY-MM-DD HH:mm')} by {ann.publishedBy?.name}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            {isPublisher && (
              <Space direction="vertical" align="end">
                <div style={{ fontSize: 12, color: theme.textSecondary }}>
                  已确认: {confirmedCount}/{targetUserIds.length}
                </div>
                <Popconfirm
                  title="确定删除此公告？"
                  onConfirm={() => handleDeleteAnnouncement(ann.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button size="small" danger style={{ borderRadius: 6 }}>删除</Button>
                </Popconfirm>
              </Space>
            )}
            {!isPublisher && (
              <Space>
                {myConfirmation?.confirmed ? (
                  <Button size="small" icon={<CheckOutlined />} style={{ borderRadius: 6 }} onClick={() => handleConfirmAnnouncement(ann.id, false)}>
                    已确认
                  </Button>
                ) : (
                  <Button size="small" type="primary" icon={<ExclamationCircleOutlined />} style={{ borderRadius: 6 }} onClick={() => handleConfirmAnnouncement(ann.id, true)}>
                    确认收到
                  </Button>
                )}
              </Space>
            )}
          </div>
        </div>
        {!compact && active && targetUserIds.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.borderColor}` }}>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 8 }}>确认状态:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {targetUserIds.map(targetUserId => {
                const confirmation = ann.confirmations?.find(c => c.userId === targetUserId);
                const targetMember = members.find(m => m.id === targetUserId);
                return (
                  <Tag
                    key={targetUserId}
                    color={confirmation?.confirmed ? 'green' : 'red'}
                    style={{ borderRadius: 4 }}
                  >
                    {targetMember?.name || '未知'} {confirmation?.confirmed ? '✓' : '✗'}
                    {confirmation?.confirmedAt && ` (${dayjs(confirmation.confirmedAt).format('MM/DD HH:mm')})`}
                  </Tag>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.textPrimary }}>部门管理</h2>
        {user?.role === 'ADMIN' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)} style={{ borderRadius: 8 }}>
            创建部门
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>我的部门</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
          {departments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: theme.textSecondary }}>
              暂未加入任何部门
            </div>
          ) : (
            <List
              dataSource={departments}
              renderItem={(dept) => (
                <List.Item style={{ cursor: 'pointer', padding: '12px 0' }} onClick={() => loadDepartmentDetails(dept)}>
                  <List.Item.Meta
                    avatar={<Avatar icon={<TeamOutlined />} style={{ background: selectedDepartment?.id === dept.id ? '#34c759' : '#0071e3' }} />}
                    title={<span style={{ fontWeight: 500 }}>{dept.name}</span>}
                    description={<span style={{ color: theme.textSecondary, fontSize: 13 }}>{dept.description || '暂无描述'}</span>}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>所有部门</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
          <Table dataSource={departments} columns={columns} rowKey="id" size="small" pagination={false} />
        </Card>
      </div>

      {/* 我的部门公告区域 - 用户已加入部门时始终显示 */}
      {user?.departmentId && !selectedDepartment && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}>📢 我的部门公告</span>}
          extra={
            canPublishAnnouncement() && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateAnnouncementModalVisible(true)} style={{ borderRadius: 6 }}>
                发布公告
              </Button>
            )
          }
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginTop: 20 }}
        >
          {myDeptAnnouncements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>
              {canPublishAnnouncement() ? '暂无公告，点击上方"发布公告"创建' : '暂无公告'}
            </div>
          ) : (
            activeAnnouncements(myDeptAnnouncements).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>
                暂无公告 {canPublishAnnouncement() && '，点击上方"发布公告"创建'}
              </div>
            ) : (
              activeAnnouncements(myDeptAnnouncements).map(ann => renderAnnouncementCard(ann, myDeptMembers))
            )
          )}
        </Card>
      )}

      {/* 选中部门的公告区域 */}
      {selectedDepartment && (
        <Card
          title={<span style={{ fontSize: 16, fontWeight: 600 }}>📢 {selectedDepartment.name} - 部门公告</span>}
          extra={
            <Space>
              {canPublishAnnouncement() && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateAnnouncementModalVisible(true)} style={{ borderRadius: 6 }}>
                  发布公告
                </Button>
              )}
              <Button onClick={() => setSelectedDepartment(null)} style={{ borderRadius: 6 }}>
                关闭
              </Button>
            </Space>
          }
          style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginTop: 20 }}
        >
          {announcements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>
              暂无公告
            </div>
          ) : (
            activeAnnouncements(announcements).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>
                暂无公告 {canPublishAnnouncement() && '，点击上方"发布公告"创建'}
              </div>
            ) : (
              activeAnnouncements(announcements).map(ann => renderAnnouncementCard(ann, departmentMembers))
            )
          )}
        </Card>
      )}

      {selectedDepartment && (
        <Modal
          title={<span style={{ fontSize: 18, fontWeight: 600 }}>{selectedDepartment.name}</span>}
          open={!!selectedDepartment}
          onCancel={() => setSelectedDepartment(null)}
          footer={[<Button key="close" onClick={() => setSelectedDepartment(null)} style={{ borderRadius: 8 }}>关闭</Button>]}
          width={800}
        >
          <Tabs
            items={[
              {
                key: 'members',
                label: '成员列表',
                children: (
                  <div>
                    {canManageMembers() && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberModalVisible(true)} style={{ marginBottom: 16, borderRadius: 8 }}>
                        添加成员
                      </Button>
                    )}
                    <Table dataSource={departmentMembers} columns={memberColumns} rowKey="id" size="small" pagination={false} />
                  </div>
                ),
              },
              {
                key: 'items',
                label: '部门任务',
                children: (
                  <Table dataSource={departmentItems} columns={itemColumns} rowKey="id" size="small" pagination={false} />
                ),
              },
            ]}
          />
        </Modal>
      )}

      <Modal
        title="创建部门"
        open={createModalVisible}
        onOk={handleCreateDepartment}
        onCancel={() => { setCreateModalVisible(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input placeholder="请输入部门名称" style={{ borderRadius: 8, height: 44 }} />
          </Form.Item>
          <Form.Item name="description" label="部门描述">
            <Input.TextArea rows={3} placeholder="请输入部门描述" style={{ borderRadius: 8 }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加成员"
        open={addMemberModalVisible}
        onOk={handleAddMember}
        onCancel={() => { setAddMemberModalVisible(false); addMemberForm.resetFields(); }}
        okText="添加"
        cancelText="取消"
        confirmLoading={loading}
      >
        <Form form={addMemberForm} layout="vertical">
          <Form.Item
            name="email"
            label="成员邮箱"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入要添加成员的邮箱" style={{ borderRadius: 8, height: 44 }} />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="MEMBER">
            <Select options={[
              { value: 'MEMBER', label: '成员' },
              { value: 'DEPARTMENT_ADMIN', label: '部门负责人' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发布公告"
        open={createAnnouncementModalVisible}
        onOk={handleCreateAnnouncement}
        onCancel={() => {
          setCreateAnnouncementModalVisible(false);
          announcementForm.resetFields();
          setTargetAll(true);
          setSelectedTargetUsers([]);
          setSelectedLinkedItems([]);
          setCreateTaskForTargets(false);
        }}
        okText="发布"
        cancelText="取消"
        confirmLoading={announcementLoading}
        width={600}
      >
        <Form form={announcementForm} layout="vertical">
          <Form.Item name="title" label="公告标题" rules={[{ required: true, message: '请输入公告标题' }]}>
            <Input placeholder="请输入公告标题" style={{ borderRadius: 8, height: 44 }} />
          </Form.Item>
          <Form.Item name="content" label="公告内容" rules={[{ required: true, message: '请输入公告内容' }]}>
            <Input.TextArea rows={4} placeholder="请输入公告内容" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Divider style={{ margin: '16px 0' }} />
          <Form.Item label="发送范围">
            <Checkbox checked={targetAll} onChange={(e) => setTargetAll(e.target.checked)}>
              发送给全体成员
            </Checkbox>
            {!targetAll && (
              <div style={{ marginTop: 12 }}>
                <Select
                  mode="multiple"
                  placeholder="选择要通知的成员"
                  value={selectedTargetUsers}
                  onChange={setSelectedTargetUsers}
                  style={{ width: '100%' }}
                  options={(selectedDepartment ? departmentMembers : myDeptMembers).map(m => ({ value: m.id, label: m.name }))}
                />
              </div>
            )}
          </Form.Item>
          <Divider style={{ margin: '16px 0' }} />
          <Form.Item label="关联事项">
            <Select
              mode="multiple"
              placeholder="选择要关联的事项（可选）"
              value={selectedLinkedItems}
              onChange={setSelectedLinkedItems}
              style={{ width: '100%' }}
              options={(selectedDepartment ? departmentItems : myDeptItems).map(item => ({ value: item.id, label: item.title }))}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Checkbox checked={createTaskForTargets} onChange={(e) => setCreateTaskForTargets(e.target.checked)}>
              为相关方创建待办任务
            </Checkbox>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
              勾选后，接收公告的成员将收到一个待办任务提醒
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}