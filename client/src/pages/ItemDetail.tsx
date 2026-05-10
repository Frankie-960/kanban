import { useState, useEffect, useRef } from 'react';
import { Form, Input, Select, DatePicker, Button, Card, message, Modal, Tag, Timeline, Space, InputNumber, Row, Col } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, DeleteOutlined, PlusOutlined, SwapOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import type { Item, ItemStatus } from '../types';
import { PRIORITY_LABELS, STATUS_LABELS, CURRENCY_OPTIONS } from '../types';
import { itemsAPI, experiencesAPI, departmentsAPI } from '../services/api';
import type { Experience, StatusHistory, User } from '../types';
import { getTheme } from '../utils/theme';
import dayjs from 'dayjs';

const { TextArea } = Input;

export default function ItemDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addItem, updateItem, deleteItem, updateItemStatus, subStatusOptions, categoryOptions, user, projects, fetchProjects } = useAppStore();
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    if (!projectsLoaded && projects.length === 0) {
      fetchProjects().finally(() => setProjectsLoaded(true));
    } else if (projects.length > 0) {
      setProjectsLoaded(true);
    }
  }, [projectsLoaded, projects.length, fetchProjects]);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [newExperience, setNewExperience] = useState('');
  const [experienceModalVisible, setExperienceModalVisible] = useState(false);
  const [progress, setProgress] = useState('');
  const progressValueRef = useRef('');
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [departmentMembers, setDepartmentMembers] = useState<User[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [costEditing, setCostEditing] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState(false);
  const [tempEstimatedAmount, setTempEstimatedAmount] = useState<number | undefined>();
  const [tempFinalAmount, setTempFinalAmount] = useState<number | undefined>();
  const [tempCurrency, setTempCurrency] = useState('CNY');
  const [tempSupplierName, setTempSupplierName] = useState('');
  const [tempSupplierAmount, setTempSupplierAmount] = useState<number | undefined>();
  const [tempRequesterDept, setTempRequesterDept] = useState('');

  const isNew = !id || id === 'new';
  const theme = getTheme();

  useEffect(() => {
    if (!isNew && id) loadItem(id);
  }, [id, isNew]);

  const loadItem = async (itemId: string) => {
    try {
      const res = await itemsAPI.getById(itemId);
      setItem(res.data);
      setStatusHistory(res.data.statusHistories || []);
      setExperiences(res.data.experiences || []);
      const progressValue = res.data.progress || '';
      setProgress(progressValue);
      progressValueRef.current = progressValue;
      setTempEstimatedAmount(res.data.estimatedAmount);
      setTempFinalAmount(res.data.finalAmount);
      setTempCurrency(res.data.currency || 'CNY');
      setTempSupplierName(res.data.supplierName || '');
      setTempSupplierAmount(res.data.supplierAmount);
      setTempRequesterDept(res.data.requesterDepartment || '');
      form.setFieldsValue({
        title: res.data.title, description: res.data.description, priority: res.data.priority,
        category: res.data.category, status: res.data.status, subStatus: res.data.subStatus,
        dueDate: res.data.dueDate ? dayjs(res.data.dueDate) : null, visibility: res.data.visibility,
        requesterDepartment: res.data.requesterDepartment,
        projectId: res.data.projectId || undefined,
      });
    } catch { message.error('加载事项失败'); navigate('/list'); }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const dueDateValue = values.dueDate ? dayjs(values.dueDate).toISOString() : undefined;
      const data: Partial<Item> = {
        title: values.title, description: values.description ?? undefined, progress: progressValueRef.current ?? undefined,
        priority: values.priority, category: values.category, status: values.status, subStatus: values.subStatus ?? undefined,
        dueDate: dueDateValue, visibility: values.visibility,
        departmentId: values.visibility === 'DEPARTMENT' ? (item?.departmentId || user?.departmentId) : undefined,
        estimatedAmount: tempEstimatedAmount ?? undefined, finalAmount: tempFinalAmount ?? undefined,
        currency: tempCurrency,
        supplierName: tempSupplierName || undefined,
        supplierAmount: tempSupplierAmount ?? undefined,
        requesterDepartment: tempRequesterDept || values.requesterDepartment || undefined,
        projectId: values.projectId || null,
      };

      if (isNew) {
        await addItem(data);
        message.success('创建成功');
        navigate('/list');
      } else if (id) {
        await itemsAPI.update(id, data);
        message.success('保存成功');
        // 自动返回
        const from = sessionStorage.getItem('itemDetailFrom');
        sessionStorage.removeItem('itemDetailFrom');
        navigate(from === 'kanban' ? '/kanban' : '/list');
      }
    } catch (err: any) {
      console.error('[handleSave] error:', err?.response?.data || err);
      if (err?.errorFields) {
        message.warning('请检查表单中红色标记的字段');
      } else {
        message.error(err?.response?.data?.error || err?.message || '保存失败，请重试');
      }
    } finally { setLoading(false); }
  };

  const handleDelete = () => {
    if (!id) return;
    Modal.confirm({ title: '确认删除', content: '确定要删除这个事项吗？此操作不可撤销。', okText: '确认', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => { try { await deleteItem(id); message.success('删除成功'); navigate('/list'); } catch { message.error('删除失败'); } },
    });
  };

  const handleAddExperience = async () => {
    if (!newExperience.trim() || !id) return;
    try { const res = await experiencesAPI.create({ itemId: id, content: newExperience }); setExperiences([res.data, ...experiences]); setNewExperience(''); setExperienceModalVisible(false); message.success('添加成功'); }
    catch { message.error('添加失败'); }
  };

  const handleStatusChange = async (subStatus: string) => {
    if (!id || !item) return;
    try { await updateItemStatus(id, 'IN_PROGRESS', subStatus); setItem((prev) => prev ? { ...prev, status: 'IN_PROGRESS', subStatus } : null); message.success(`状态已更新为"${subStatus}"`); }
    catch { message.error('状态更新失败'); }
  };

  const handleComplete = async () => {
    if (!id) return;
    try { await updateItemStatus(id, 'COMPLETED'); setItem((prev) => prev ? { ...prev, status: 'COMPLETED', completedAt: new Date().toISOString() } : null); message.success('事项已完成'); }
    catch { message.error('操作失败'); }
  };

  const handleProgressUpdate = async () => {
    if (!id) return;
    try { await updateItem(id, { progress: progressValueRef.current } as Partial<Item>); setItem((prev) => prev ? { ...prev, progress: progressValueRef.current } : null); message.success('进展已更新'); }
    catch { message.error('更新失败'); }
  };

  const loadDepartmentMembers = async () => { if (!user?.departmentId) return; try { const res = await departmentsAPI.getMembers(user.departmentId); setDepartmentMembers(res.data.filter((m: User) => m.id !== user.id)); } catch { setDepartmentMembers([]); } };
  const handleTransfer = async () => { if (!id || !selectedMember) return; try { await itemsAPI.transfer(id, selectedMember); message.success('事项已转办'); setTransferModalVisible(false); navigate('/list'); } catch { message.error('转办失败'); } };
  const openTransferModal = async () => { await loadDepartmentMembers(); setTransferModalVisible(true); };

  const getSubStatusOptions = () => (subStatusOptions[form.getFieldValue('category') || item?.category || 'OTHER'] || []).map((s) => ({ value: s, label: s }));

  const savings = tempEstimatedAmount && tempFinalAmount ? tempEstimatedAmount - tempFinalAmount : 0;
  const savingsRate = tempEstimatedAmount && tempFinalAmount && tempEstimatedAmount > 0 ? ((savings / tempEstimatedAmount) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => { const from = sessionStorage.getItem('itemDetailFrom'); sessionStorage.removeItem('itemDetailFrom'); navigate(from === 'kanban' ? '/kanban' : '/list'); }} style={{ borderRadius: 8 }}>返回</Button>
        <Space>
          {!isNew && (<>{item?.status === 'TODO' && <Button type="primary" onClick={() => handleStatusChange(subStatusOptions[form.getFieldValue('category') || item.category]?.[0] || '')} style={{ borderRadius: 8 }}>开始</Button>}
            {item?.status === 'IN_PROGRESS' && (<><Select placeholder="选择子状态" style={{ width: 180 }} value={item.subStatus} onChange={handleStatusChange} options={getSubStatusOptions()} /><Button type="primary" onClick={handleComplete} style={{ borderRadius: 8 }}>完成</Button></>)}
            {user?.departmentId && <Button icon={<SwapOutlined />} onClick={openTransferModal} style={{ borderRadius: 8 }}>转办</Button>}
            <Button danger icon={<DeleteOutlined />} onClick={handleDelete} style={{ borderRadius: 8 }}>删除</Button></>)}
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading} style={{ borderRadius: 8 }}>保存</Button>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        <div>
          <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>事项信息</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
            <Form form={form} layout="vertical">
              <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input placeholder="请输入事项标题" style={{ borderRadius: 8, height: 44 }} /></Form.Item>
              <Form.Item name="description" label="描述"><TextArea rows={3} placeholder="请输入事项描述（背景、目标等）" style={{ borderRadius: 8 }} /></Form.Item>
              <Form.Item label="当前进展">
                <TextArea rows={3} placeholder="记录当前进展、遇到的问题，下一步计划等" value={progress} onChange={(e) => { progressValueRef.current = e.target.value; setProgress(e.target.value); }} style={{ borderRadius: 8 }} />
                {!isNew && <Button type="link" size="small" onClick={handleProgressUpdate} style={{ padding: 0, marginTop: 4 }}>更新进展</Button>}
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="priority" label="优先级" initialValue="MEDIUM"><Select options={[{ value: 'LOW', label: PRIORITY_LABELS.LOW }, { value: 'MEDIUM', label: PRIORITY_LABELS.MEDIUM }, { value: 'HIGH', label: PRIORITY_LABELS.HIGH }, { value: 'URGENT', label: PRIORITY_LABELS.URGENT }]} style={{ borderRadius: 8 }} /></Form.Item>
                <Form.Item name="category" label="分类" initialValue={categoryOptions[0]?.key || 'OTHER'}><Select options={categoryOptions.map((c) => ({ value: c.key, label: c.name }))} onChange={() => form.setFieldsValue({ subStatus: undefined })} style={{ borderRadius: 8 }} /></Form.Item>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="status" label="主状态"><Select disabled options={[{ value: 'TODO', label: '待办' }, { value: 'IN_PROGRESS', label: '进行中' }, { value: 'COMPLETED', label: '已完成' }]} style={{ borderRadius: 8 }} /></Form.Item>
                <Form.Item name="visibility" label="可见性" initialValue="PRIVATE"><Select options={[{ value: 'PRIVATE', label: '仅自己' }, { value: 'DEPARTMENT', label: '部门可见' }, { value: 'SHARED', label: '指定共享' }]} style={{ borderRadius: 8 }} /></Form.Item>
              </div>
              <Form.Item name="projectId" label="归属项目" tooltip="不选则为散任务">
                <Select
                  allowClear
                  showSearch
                  placeholder="散任务（无项目）"
                  optionFilterProp="label"
                  style={{ borderRadius: 8 }}
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.code ? `${p.code} · ${p.name}` : p.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="dueDate" label="截止日期"><DatePicker showTime style={{ width: '100%', borderRadius: 8 }} /></Form.Item>
            </Form>
          </Card>

          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600 }}>💰 成本信息</span>}
            extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={() => setCostEditing(!costEditing)} style={{ padding: 0 }}>{costEditing ? '收起' : '编辑'}</Button>}
            style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
          >
            {costEditing || (tempEstimatedAmount !== undefined || tempFinalAmount !== undefined) ? (
              <>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="预估金额" style={{ marginBottom: 12 }}>
                      <InputNumber
                        style={{ width: '100%', borderRadius: 8 }}
                        placeholder="0.00"
                        min={0}
                        precision={2}
                        value={tempEstimatedAmount}
                        onChange={(v) => setTempEstimatedAmount(v ?? undefined)}
                        formatter={value => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => (value ?? '').replace(/,/g, '') as any}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="实际/目标金额" style={{ marginBottom: 12 }}>
                      <InputNumber
                        style={{ width: '100%', borderRadius: 8 }}
                        placeholder="0.00"
                        min={0}
                        precision={2}
                        value={tempFinalAmount}
                        onChange={(v) => setTempFinalAmount(v ?? undefined)}
                        formatter={value => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => (value ?? '').replace(/,/g, '') as any}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="币种" style={{ marginBottom: 12 }}>
                      <Select value={tempCurrency} onChange={setTempCurrency} options={CURRENCY_OPTIONS} style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                </Row>
                {savings !== 0 && (
                  <div style={{ padding: 12, background: savings >= 0 ? '#f6ffed' : '#fff2f0', borderRadius: 8, fontSize: 14 }}>
                    {savings >= 0 ? (
                      <span style={{ color: '#34c759', fontWeight: 500 }}>✓ 预计节省 ¥{savings.toLocaleString()} ({savingsRate.toFixed(1)}%)</span>
                    ) : (
                      <span style={{ color: '#ff453a', fontWeight: 500 }}>⚠ 预计超支 ¥{Math.abs(savings).toLocaleString()} ({Math.abs(savingsRate).toFixed(1)}%)</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: theme.textSecondary }}>
                点击"编辑"填写成本信息
              </div>
            )}
          </Card>

          <Card
            title={<span style={{ fontSize: 16, fontWeight: 600 }}>🤝 供应商信息</span>}
            extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={() => setSupplierEditing(!supplierEditing)} style={{ padding: 0 }}>{supplierEditing ? '收起' : '编辑'}</Button>}
            style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}
          >
            {supplierEditing || tempSupplierName ? (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="供应商名称" style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="直接填写供应商名称（无需从库选择）"
                        value={tempSupplierName}
                        onChange={(e) => setTempSupplierName(e.target.value)}
                        style={{ borderRadius: 8, height: 44 }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="供应商报价" style={{ marginBottom: 12 }}>
                      <InputNumber
                        style={{ width: '100%', borderRadius: 8 }}
                        placeholder="0.00"
                        min={0}
                        precision={2}
                        value={tempSupplierAmount}
                        onChange={(v) => setTempSupplierAmount(v ?? undefined)}
                        formatter={value => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => (value ?? '').replace(/,/g, '') as any}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="需求部门" style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="如：技术部、市场部"
                        value={tempRequesterDept}
                        onChange={(e) => setTempRequesterDept(e.target.value)}
                        style={{ borderRadius: 8, height: 44 }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: theme.textSecondary }}>
                点击"编辑"填写供应商信息
              </div>
            )}
          </Card>

          {!isNew && (
            <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>💡 心得体会</span>} extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setExperienceModalVisible(true)} style={{ borderRadius: 6 }}>添加</Button>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
              {experiences.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: theme.textSecondary }}>暂无心得体会</div> : experiences.map((exp) => (
                <div key={exp.id} style={{ marginBottom: 12, padding: 12, background: theme.isDark ? '#21262d' : '#f9f9f9', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: theme.textSecondary }}>{dayjs(exp.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                  <div style={{ marginTop: 8 }}>{exp.content}</div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          {!isNew && (<>
            <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>状态变更历史</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16, marginBottom: 20 }}>
              {statusHistory.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: theme.textSecondary }}>暂无变更记录</div> : (
                <Timeline items={statusHistory.map((h) => ({ color: h.toStatus === 'COMPLETED' ? 'green' : h.toStatus === 'IN_PROGRESS' ? 'blue' : 'gray', children: (
                  <div><div>{h.fromSubStatus || h.fromStatus ? `${h.fromSubStatus || STATUS_LABELS[h.fromStatus as ItemStatus]}` : '创建'} → {h.toSubStatus || h.toStatus ? `${h.toSubStatus || STATUS_LABELS[h.toStatus as ItemStatus]}` : ''}</div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>{dayjs(h.createdAt).format('MM/DD HH:mm')} · {h.operator?.name || '未知'}</div></div>
                )}))} />
              )}
            </Card>
            {item?.status === 'IN_PROGRESS' && (subStatusOptions[form.getFieldValue('category') || item.category]?.length || 0) > 0 && (
              <Card title={<span style={{ fontSize: 16, fontWeight: 600 }}>子状态</span>} style={{ background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(subStatusOptions[form.getFieldValue('category') || item.category] || []).map((subStatus) => (
                    <Tag key={subStatus} color={item.subStatus === subStatus ? 'blue' : 'default'} style={{ cursor: 'pointer', borderRadius: 6, padding: '4px 12px', fontSize: 13 }} onClick={() => handleStatusChange(subStatus)}>{subStatus}</Tag>
                  ))}
                </div>
              </Card>
            )}
          </>)}
        </div>
      </div>

      <Modal title="添加心得体会" open={experienceModalVisible} onOk={handleAddExperience} onCancel={() => { setExperienceModalVisible(false); setNewExperience(''); }} okText="添加" cancelText="取消">
        <TextArea rows={6} placeholder="记录您的工作心得、反思或总结..." value={newExperience} onChange={(e) => setNewExperience(e.target.value)} />
      </Modal>

      <Modal title="转办事项" open={transferModalVisible} onOk={handleTransfer} onCancel={() => { setTransferModalVisible(false); setSelectedMember(''); }} okText="确认转办" cancelText="取消">
        <p>选择要转办给的部门成员：</p>
        <Select style={{ width: '100%' }} placeholder="选择成员" value={selectedMember || undefined} onChange={setSelectedMember} options={departmentMembers.map((m) => ({ value: m.id, label: m.name }))} />
      </Modal>
    </div>
  );
}