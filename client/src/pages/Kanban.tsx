import { useState, useEffect, useMemo } from 'react';
import { Button, Modal, message, Tag, Badge, Segmented, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../stores/appStore';
import type { Item, ItemStatus } from '../types';
import { CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, STATUS_CONFIG, CATEGORY_CONFIG } from '../types';
import { getPriorityWeight } from '../utils/priority';
import { isOverdue } from '../utils/date';
import { itemsAPI } from '../services/api';
import dayjs from 'dayjs';

type ViewMode = 'status' | 'category';
type CategoryView = 'PROCUREMENT_SOURCING' | 'PAYMENT' | 'OTHER' | 'all';

const STATUS_COLUMNS = [
  { status: 'TODO' as ItemStatus, ...STATUS_CONFIG.TODO },
  { status: 'IN_PROGRESS' as ItemStatus, ...STATUS_CONFIG.IN_PROGRESS },
  { status: 'COMPLETED' as ItemStatus, ...STATUS_CONFIG.COMPLETED },
];

const CATEGORY_COLUMNS = [
  { category: 'PROCUREMENT_SOURCING' as CategoryView, ...CATEGORY_CONFIG.PROCUREMENT_SOURCING },
  { category: 'PAYMENT' as CategoryView, ...CATEGORY_CONFIG.PAYMENT },
  { category: 'OTHER' as CategoryView, ...CATEGORY_CONFIG.OTHER },
];

interface SortableCardProps {
  item: Item;
  currentView: 'personal' | 'department';
  onCardClick: () => void;
  onStartClick: () => void;
  onCompleteClick: () => void;
  onDeleteClick: () => void;
}

function SortableCard({ item, currentView, onCardClick, onStartClick, onCompleteClick, onDeleteClick }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isDark = localStorage.getItem('darkMode') === 'true';

  return (
    <div ref={setNodeRef} style={style} className={`kanban-card priority-${item.priority.toLowerCase()}`} onClick={onCardClick} {...attributes} {...listeners}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 500, flex: 1, fontSize: 14 }}>{item.title}</span>
        <Tag color={PRIORITY_COLORS[item.priority]} style={{ fontSize: 11, borderRadius: 6 }}>{PRIORITY_LABELS[item.priority]}</Tag>
      </div>
      <div style={{ marginTop: 6 }}>
        <Tag style={{ fontSize: 11, borderRadius: 6 }}>{CATEGORY_LABELS[item.category]}</Tag>
        {item.subStatus && <Tag color="blue" style={{ fontSize: 11, borderRadius: 6 }}>{item.subStatus}</Tag>}
        {item.project && (
          <Tag color="purple" style={{ fontSize: 11, borderRadius: 6 }}>
            📁 {item.project.code || item.project.name}
          </Tag>
        )}
      </div>
      {item.dueDate && (
        <div style={{ marginTop: 6, fontSize: 12, color: isOverdue(item) ? '#ff453a' : (isDark ? '#8b949e' : '#666') }}>
          截止: {dayjs(item.dueDate).format('MM/DD HH:mm')}{isOverdue(item) && ' 已逾期'}
        </div>
      )}
      {item.progress && <div style={{ marginTop: 6, fontSize: 11, color: '#0071e3' }}>进度: {item.progress}</div>}
      {currentView === 'department' && item.user && <div style={{ marginTop: 6, fontSize: 11, color: '#34c759' }}>负责人: {item.user.name}</div>}
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        {item.status === 'TODO' && <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onStartClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>开始</Button>}
        {item.status === 'IN_PROGRESS' && <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onCompleteClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>完成</Button>}
        <Button size="small" danger onClick={(e) => { e.stopPropagation(); onDeleteClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>删除</Button>
      </div>
    </div>
  );
}

function Card({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div className={`kanban-card priority-${item.priority.toLowerCase()}`} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 500, flex: 1, fontSize: 14 }}>{item.title}</span>
        <Tag color={PRIORITY_COLORS[item.priority]} style={{ fontSize: 11, borderRadius: 6 }}>{PRIORITY_LABELS[item.priority]}</Tag>
      </div>
      <div style={{ marginTop: 6 }}>
        <Tag style={{ fontSize: 11, borderRadius: 6 }}>{CATEGORY_LABELS[item.category]}</Tag>
        {item.subStatus && <Tag color="blue" style={{ fontSize: 11, borderRadius: 6 }}>{item.subStatus}</Tag>}
      </div>
      {item.dueDate && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>截止: {dayjs(item.dueDate).format('MM/DD HH:mm')}</div>
      )}
    </div>
  );
}

export default function Kanban() {
  const navigate = useNavigate();
  const { items, updateItemStatus, deleteItem, reorderItems, currentView, fetchItems, projects, fetchProjects } = useAppStore();
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; item: Item | null; action: 'start' | 'complete' | 'delete' }>({ visible: false, item: null, action: 'start' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('status');
  const [filterCategory, setFilterCategory] = useState<CategoryView>('all');
  // '' = 全部, '__none__' = 无项目, 其他 = 项目 id
  const [filterProject, setFilterProject] = useState<string>('');
  // 已完成列折叠状态（默认折叠）
  const [collapsedCompleted, setCollapsedCompleted] = useState(true);
  // 已完成展开后每批次加载数
  const COMPLETED_PAGE_SIZE = 20;

  useEffect(() => {
    fetchItems();
    fetchProjects();
  }, [currentView, fetchItems, fetchProjects]);

  // 项目过滤后的事项（看板各列再基于此分组）
  const projectFilteredItems = useMemo(() => {
    if (!filterProject) return items;
    if (filterProject === '__none__') return items.filter((i) => !i.projectId);
    return items.filter((i) => i.projectId === filterProject);
  }, [items, filterProject]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnItemsMap = useMemo(() => {
    const map = {} as Record<ItemStatus, Item[]>;
    for (const col of STATUS_COLUMNS) {
      const filtered = projectFilteredItems.filter((i) => i.status === col.status);
      map[col.status] = filtered.sort((a, b) => {
        if (col.status === 'COMPLETED') {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
        } else {
          const aWeight = getPriorityWeight(a.priority);
          const bWeight = getPriorityWeight(b.priority);
          if (aWeight !== bWeight) return aWeight - bWeight;
        }
        return a.order - b.order;
      });
    }
    return map;
  }, [projectFilteredItems]);

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!activeItem || !overItem || activeItem.id === overItem.id) return;
    if (activeItem.status === overItem.status) {
      const columnItems = columnItemsMap[activeItem.status];
      const oldIndex = columnItems.findIndex((i) => i.id === activeItem.id);
      const newIndex = columnItems.findIndex((i) => i.id === overItem.id);
      if (oldIndex !== newIndex) {
        const reorderedItems = [...columnItems];
        reorderedItems.splice(oldIndex, 1);
        reorderedItems.splice(newIndex, 0, activeItem);
        const orderUpdates = reorderedItems.map((item, index) => ({ id: item.id, order: index }));
        try {
          await itemsAPI.reorder(orderUpdates);
          reorderItems(orderUpdates);
          message.success('顺序已更新');
        } catch { message.error('更新顺序失败'); }
      }
    }
  };

  const handleStatusChange = async (item: Item, action: 'start' | 'complete') => {
    const newStatus = action === 'start' ? 'IN_PROGRESS' : 'COMPLETED';
    try {
      await updateItemStatus(item.id, newStatus);
      message.success(`事项已${action === 'start' ? '开始' : '完成'}`);
      setConfirmModal({ visible: false, item: null, action });
    } catch { message.error('操作失败'); }
  };

  const handleDelete = async () => {
    if (!confirmModal.item) return;
    try {
      await deleteItem(confirmModal.item.id);
      message.success('删除成功');
      setConfirmModal({ visible: false, item: null, action: 'delete' });
    } catch { message.error('删除失败'); }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const isDark = localStorage.getItem('darkMode') === 'true';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: textPrimary }}>📋 看板视图</h2>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as ViewMode)}
            options={[{ label: '状态视图', value: 'status' }, { label: '分类视图', value: 'category' }]}
          />
          <Select
            placeholder="所属项目"
            style={{ width: 240 }}
            allowClear
            showSearch
            optionFilterProp="label"
            value={filterProject || undefined}
            onChange={(v) => setFilterProject(v || '')}
            options={[
              { value: '', label: '📋 全部事项' },
              { value: '__none__', label: '🗂 散任务（无项目）' },
              ...projects.map((p) => ({ value: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name })),
            ]}
          />
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" style={{ borderRadius: 10, fontWeight: 500 }} onClick={() => { sessionStorage.setItem('itemDetailFrom', 'kanban'); navigate('/items/new'); }}>
          新建事项
        </Button>
      </div>

      {viewMode === 'category' && (
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={filterCategory}
            onChange={(value) => setFilterCategory(value as CategoryView)}
            options={[
              { label: '全部', value: 'all' },
              { label: '招标寻源', value: 'PROCUREMENT_SOURCING' },
              { label: '供应商付款', value: 'PAYMENT' },
              { label: '其他', value: 'OTHER' },
            ]}
          />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {viewMode === 'status' ? STATUS_COLUMNS.map((col) => {
            const colItems = columnItemsMap[col.status];
            const isCompleted = col.status === 'COMPLETED';
            const isCollapsed = isCompleted && collapsedCompleted;
            return (
              <div key={col.status} className="kanban-column" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                <div
                  className={`kanban-column-header ${col.status.toLowerCase().replace('_', '-')}`}
                  style={{ borderColor: col.color, cursor: isCompleted ? 'pointer' : undefined }}
                  onClick={() => { if (isCompleted) setCollapsedCompleted(!collapsedCompleted); }}
                >
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{col.label}</span>
                  <Badge count={colItems.length} style={{ backgroundColor: col.color }} />
                  {isCompleted && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#86868b' }}>
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  )}
                </div>
                {isCollapsed ? (
                  <div
                    onClick={() => setCollapsedCompleted(false)}
                    style={{ textAlign: 'center', padding: '40px 20px', color: '#86868b', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                    <div style={{ fontSize: 13 }}>{colItems.length} 项已完成事项</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#0071e3' }}>点击展开查看</div>
                  </div>
                ) : (
                  <SortableContext items={colItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="kanban-cards">
                      {colItems.slice(0, COMPLETED_PAGE_SIZE).map((item) => (
                        <SortableCard key={item.id} item={item} currentView={currentView}
                          onCardClick={() => { sessionStorage.setItem('itemDetailFrom', 'kanban'); navigate(`/items/${item.id}`); }}
                          onStartClick={() => handleStatusChange(item, 'start')}
                          onCompleteClick={() => handleStatusChange(item, 'complete')}
                          onDeleteClick={() => setConfirmModal({ visible: true, item, action: 'delete' })}
                        />
                      ))}
                      {colItems.length > COMPLETED_PAGE_SIZE && (
                        <div style={{ textAlign: 'center', padding: '12px', color: '#86868b', fontSize: 12 }}>
                          仅展示最近 {COMPLETED_PAGE_SIZE} 条，共 {colItems.length} 项
                        </div>
                      )}
                      {colItems.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#86868b' }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                          <div style={{ fontSize: 13 }}>暂无已完成事项</div>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                )}
              </div>
            );
          }) : (filterCategory === 'all' ? CATEGORY_COLUMNS : CATEGORY_COLUMNS.filter(c => c.category === filterCategory)).map((col) => {
            const colItems = projectFilteredItems.filter((i) => i.category === col.category);
            const statusGroups = { TODO: colItems.filter(i => i.status === 'TODO'), IN_PROGRESS: colItems.filter(i => i.status === 'IN_PROGRESS'), COMPLETED: colItems.filter(i => i.status === 'COMPLETED') };
            return (
              <div key={col.category} className="kanban-column" style={{ maxWidth: 480, background: cardBg, border: `1px solid ${borderColor}` }}>
                <div className="kanban-column-header" style={{ borderColor: col.color }}>
                  <span style={{ fontWeight: 600 }}>{col.name}</span>
                  <Badge count={colItems.length} style={{ backgroundColor: col.color }} />
                </div>
                <div className="kanban-cards">
                  {colItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#86868b' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                      <div style={{ fontSize: 13 }}>暂无{col.name}事项</div>
                    </div>
                  ) : (
                    Object.entries(statusGroups).map(([status, statusItems]) => (
                      statusItems.length > 0 && (
                        <div key={status} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: '#86868b', marginBottom: 6 }}>
                            {status === 'TODO' ? '待办' : status === 'IN_PROGRESS' ? '进行中' : '已完成'} ({statusItems.length})
                          </div>
                          {statusItems.map((item) => (
                            <div key={item.id} style={{ marginBottom: 8 }}>
                              <SortableCard item={item} currentView={currentView}
                                onCardClick={() => { sessionStorage.setItem('itemDetailFrom', 'kanban'); navigate(`/items/${item.id}`); }}
                                onStartClick={() => handleStatusChange(item, 'start')}
                                onCompleteClick={() => handleStatusChange(item, 'complete')}
                                onDeleteClick={() => setConfirmModal({ visible: true, item, action: 'delete' })}
                              />
                            </div>
                          ))}
                        </div>
                      )
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DragOverlay>{activeItem && <Card item={activeItem} onClick={() => {}} />}</DragOverlay>
      </DndContext>

      <Modal
        title="确认操作"
        open={confirmModal.visible}
        onOk={() => {
          if (confirmModal.action === 'delete') handleDelete();
          else if (confirmModal.action === 'start') handleStatusChange(confirmModal.item!, 'start');
          else handleStatusChange(confirmModal.item!, 'complete');
        }}
        onCancel={() => setConfirmModal({ visible: false, item: null, action: 'start' })}
        okText="确认" cancelText="取消"
        okButtonProps={{ danger: confirmModal.action === 'delete' }}
      >
        <p>{confirmModal.action === 'delete' && `确定要删除事项"${confirmModal.item?.title}"吗？此操作不可撤销。`}{confirmModal.action === 'start' && `确定要开始事项"${confirmModal.item?.title}"吗？`}{confirmModal.action === 'complete' && `确定要完成事项"${confirmModal.item?.title}"吗？`}</p>
        {confirmModal.action === 'start' && confirmModal.item && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 500 }}>选择子状态（可选）：</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(['供应商报价中', '待发起采购评审', '采购评审中'] as string[]).map((subStatus) => (
                <Tag key={subStatus} style={{ cursor: 'pointer', borderRadius: 6 }} onClick={() => handleStatusChange(confirmModal.item!, 'start')}>{subStatus}</Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
