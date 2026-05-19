import { useState, useEffect, useMemo } from 'react';
import { Button, Modal, message, Tag, Badge, Segmented, Select, DatePicker, Dropdown, Popconfirm } from 'antd';
import { PlusOutlined, CheckSquareOutlined } from '@ant-design/icons';
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
import dayjs, { Dayjs } from 'dayjs';
import { useAppStore } from '../stores/appStore';
import type { Item, ItemStatus, Category, Priority, Visibility } from '../types';
import { CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_QUADRANT, STATUS_CONFIG } from '../types';
import { getPriorityWeight } from '../utils/priority';
import { isOverdue } from '../utils/date';
import { isStale, staleDays } from '../utils/sla';
import { getMilestone, MILESTONES } from '../utils/milestone';
import { itemsAPI } from '../services/api';
import { VisibilityPill } from '../components/VisibilityPill';

type LayoutMode = 'columns' | 'project' | 'subStatus' | 'category' | 'matrix';

const STATUS_COLUMNS = [
  { status: 'TODO' as ItemStatus, ...STATUS_CONFIG.TODO },
  { status: 'IN_PROGRESS' as ItemStatus, ...STATUS_CONFIG.IN_PROGRESS },
  { status: 'COMPLETED' as ItemStatus, ...STATUS_CONFIG.COMPLETED },
];

const QUADRANTS = ['IU', 'I', 'U', 'N'] as const;
const QUADRANT_AXIS: Record<(typeof QUADRANTS)[number], string> = {
  IU: '重要 · 紧急',
  I: '重要 · 不急',
  U: '紧急 · 不重要',
  N: '不重要 · 不急',
};

interface SortableCardProps {
  item: Item;
  currentView: 'personal' | 'department';
  selectMode: boolean;
  selected: boolean;
  onCardClick: () => void;
  onSelectToggle: (id: string) => void;
  onStartClick: () => void;
  onCompleteClick: () => void;
  onDeleteClick: () => void;
  onVisibilityChange: (v: Visibility) => void;
}

function PriorityPill({ priority }: { priority: Priority }) {
  const { quadrant, label } = PRIORITY_QUADRANT[priority];
  return <span className={`priority-pill q-${quadrant}`}>{label}</span>;
}

function MilestoneStepper({ item }: { item: Item }) {
  const idx = getMilestone(item);
  return (
    <div className="milestone-stepper" title={`阶段：${MILESTONES[idx]}`}>
      {MILESTONES.map((_, i) => (
        <span
          key={i}
          className={`milestone-seg ${i < idx ? 'past' : i === idx ? 'current' : 'future'}`}
        />
      ))}
    </div>
  );
}

function SortableCard({
  item, currentView, selectMode, selected,
  onCardClick, onSelectToggle, onStartClick, onCompleteClick, onDeleteClick, onVisibilityChange,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: selectMode,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isDark = localStorage.getItem('darkMode') === 'true';
  const stale = isStale(item);

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.stopPropagation();
      onSelectToggle(item.id);
    } else {
      onCardClick();
    }
  };

  const cardClassName = [
    'kanban-card',
    `priority-${item.priority.toLowerCase()}`,
    stale ? 'stale' : '',
    selectMode ? 'select-mode' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const dragProps = selectMode ? {} : { ...attributes, ...listeners };

  return (
    <div ref={setNodeRef} style={style} className={cardClassName} onClick={handleClick} {...dragProps}>
      {selectMode && (
        <span className="card-checkbox">{selected ? '✓' : ''}</span>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontWeight: 500, flex: 1, fontSize: 14, lineHeight: 1.4 }}>{item.title}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <PriorityPill priority={item.priority} />
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Tag style={{ fontSize: 11, borderRadius: 6 }}>{CATEGORY_LABELS[item.category]}</Tag>
        {item.subStatus && <Tag color="blue" style={{ fontSize: 11, borderRadius: 6 }}>{item.subStatus}</Tag>}
        {item.project && (
          <Tag color="purple" style={{ fontSize: 11, borderRadius: 6 }}>
            📁 {item.project.code || item.project.name}
          </Tag>
        )}
        <VisibilityPill value={item.visibility} compact onChange={onVisibilityChange} />
      </div>
      {item.dueDate && (
        <div style={{ marginTop: 8, fontSize: 12, color: isOverdue(item) ? '#ff453a' : (isDark ? '#8b949e' : '#666') }}>
          截止: {dayjs(item.dueDate).format('MM/DD HH:mm')}{isOverdue(item) && ' · 已逾期'}
        </div>
      )}
      {item.progress && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-primary)' }}>进度: {item.progress}</div>}
      {currentView === 'department' && item.user && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>负责人: {item.user.name}</div>
      )}
      {stale && <div className="stale-flag">⚠ 已呆滞 {staleDays(item)} 天</div>}
      <MilestoneStepper item={item} />
      {!selectMode && (
        <div className="card-actions" style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          {item.status === 'TODO' && (
            <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onStartClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>开始</Button>
          )}
          {item.status === 'IN_PROGRESS' && (
            <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); onCompleteClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>完成</Button>
          )}
          <Button size="small" danger onClick={(e) => { e.stopPropagation(); onDeleteClick(); }} style={{ borderRadius: 6, fontSize: 12 }}>删除</Button>
        </div>
      )}
    </div>
  );
}

function DragCard({ item }: { item: Item }) {
  return (
    <div className={`kanban-card priority-${item.priority.toLowerCase()}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontWeight: 500, flex: 1, fontSize: 14 }}>{item.title}</span>
        <PriorityPill priority={item.priority} />
      </div>
      <div style={{ marginTop: 6 }}>
        <Tag style={{ fontSize: 11, borderRadius: 6 }}>{CATEGORY_LABELS[item.category]}</Tag>
      </div>
    </div>
  );
}

type Group = { key: string; label: string; items: Item[] };

function groupItemsByMode(
  items: Item[],
  mode: Exclude<LayoutMode, 'columns' | 'matrix'>,
  projects: { id: string; name: string; code?: string | null }[],
): Group[] {
  const buckets = new Map<string, Item[]>();
  for (const it of items) {
    let key: string;
    if (mode === 'project') key = it.projectId || '__none__';
    else if (mode === 'subStatus') key = it.subStatus || '__none__';
    else key = it.category || 'OTHER';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  const labelOf = (k: string): string => {
    if (mode === 'project') {
      if (k === '__none__') return '🗂 散任务（无项目）';
      const p = projects.find((x) => x.id === k);
      return p ? (p.code ? `${p.code} · ${p.name}` : p.name) : '未命名项目';
    }
    if (mode === 'subStatus') return k === '__none__' ? '未设子状态' : k;
    return CATEGORY_LABELS[k as Category] || '其他';
  };
  return [...buckets.entries()]
    .map(([key, items]) => ({ key, label: labelOf(key), items }))
    .sort((a, b) => {
      if (a.key === '__none__' && b.key !== '__none__') return 1;
      if (b.key === '__none__' && a.key !== '__none__') return -1;
      return a.label.localeCompare(b.label, 'zh');
    });
}

function getCellKey(item: Item, mode: LayoutMode): string {
  if (mode === 'columns') return item.status;
  if (mode === 'matrix') return PRIORITY_QUADRANT[item.priority].quadrant;
  if (mode === 'project') return `${item.projectId || '__none__'}::${item.status}`;
  if (mode === 'subStatus') return `${item.subStatus || '__none__'}::${item.status}`;
  return `${item.category || 'OTHER'}::${item.status}`;
}

function sortItemsForColumn(arr: Item[], status: ItemStatus): Item[] {
  return [...arr].sort((a, b) => {
    if (status === 'COMPLETED') {
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

function sortItemsForQuadrant(arr: Item[]): Item[] {
  return [...arr].sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return a.order - b.order;
  });
}

export default function Kanban() {
  const navigate = useNavigate();
  const { items, updateItem, updateItemStatus, deleteItem, reorderItems, currentView, fetchItems, projects, fetchProjects } = useAppStore();
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; item: Item | null; action: 'start' | 'complete' | 'delete' }>({ visible: false, item: null, action: 'start' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('columns');
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterOwnerId, setFilterOwnerId] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [collapsedCompleted, setCollapsedCompleted] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const COMPLETED_PAGE_SIZE = 20;

  useEffect(() => {
    fetchItems();
    fetchProjects();
  }, [currentView, fetchItems, fetchProjects]);

  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set());
  }, [selectMode]);

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) if (it.user) seen.set(it.user.id, it.user.name);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (filterProject === '__none__' && i.projectId) return false;
      if (filterProject && filterProject !== '__none__' && i.projectId !== filterProject) return false;
      if (filterOwnerId && i.userId !== filterOwnerId) return false;
      if (dateRange && i.dueDate) {
        const d = dayjs(i.dueDate);
        if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
      }
      return true;
    });
  }, [items, filterProject, filterOwnerId, dateRange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnItemsMap = useMemo(() => {
    const map = {} as Record<ItemStatus, Item[]>;
    for (const col of STATUS_COLUMNS) {
      map[col.status] = sortItemsForColumn(filteredItems.filter((i) => i.status === col.status), col.status);
    }
    return map;
  }, [filteredItems]);

  const swimlaneGroups = useMemo<Group[]>(() => {
    if (layoutMode === 'columns' || layoutMode === 'matrix') return [];
    return groupItemsByMode(filteredItems, layoutMode, projects);
  }, [filteredItems, layoutMode, projects]);

  const quadrantMap = useMemo(() => {
    const map: Record<(typeof QUADRANTS)[number], Item[]> = { IU: [], I: [], U: [], N: [] };
    if (layoutMode !== 'matrix') return map;
    for (const it of filteredItems) {
      if (it.status === 'COMPLETED') continue;
      const q = PRIORITY_QUADRANT[it.priority].quadrant;
      map[q].push(it);
    }
    for (const q of QUADRANTS) map[q] = sortItemsForQuadrant(map[q]);
    return map;
  }, [filteredItems, layoutMode]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || selectMode) return;
    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!activeItem || !overItem || activeItem.id === overItem.id) return;
    if (getCellKey(activeItem, layoutMode) !== getCellKey(overItem, layoutMode)) return;

    let cellItems: Item[];
    if (layoutMode === 'columns') {
      cellItems = columnItemsMap[activeItem.status];
    } else if (layoutMode === 'matrix') {
      const q = PRIORITY_QUADRANT[activeItem.priority].quadrant;
      cellItems = quadrantMap[q];
    } else {
      const groupKey = getCellKey(activeItem, layoutMode).split('::')[0];
      const group = swimlaneGroups.find((g) => g.key === groupKey);
      if (!group) return;
      cellItems = sortItemsForColumn(group.items.filter((i) => i.status === activeItem.status), activeItem.status);
    }

    const oldIndex = cellItems.findIndex((i) => i.id === activeItem.id);
    const newIndex = cellItems.findIndex((i) => i.id === overItem.id);
    if (oldIndex === newIndex) return;

    const reordered = [...cellItems];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, activeItem);
    const orderUpdates = reordered.map((item, index) => ({ id: item.id, order: index }));
    try {
      await itemsAPI.reorder(orderUpdates);
      reorderItems(orderUpdates);
      message.success('顺序已更新');
    } catch { message.error('更新顺序失败'); }
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

  const handleVisibilityChange = async (item: Item, v: Visibility) => {
    try {
      await updateItem(item.id, { visibility: v });
      message.success(`可见范围已改为${v === 'PRIVATE' ? '私有' : v === 'DEPARTMENT' ? '部门' : '公开'}`);
    } catch { message.error('修改可见性失败'); }
  };

  const handleBatchPriority = async (p: Priority) => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => itemsAPI.update(id, { priority: p })));
      message.success(`已为 ${ids.length} 项改优先级`);
      setSelectedIds(new Set());
      fetchItems();
    } catch { message.error('批量操作失败'); }
  };

  const handleBatchVisibility = async (v: Visibility) => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => itemsAPI.update(id, { visibility: v })));
      message.success(`已为 ${ids.length} 项改可见性`);
      setSelectedIds(new Set());
      fetchItems();
    } catch { message.error('批量操作失败'); }
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => deleteItem(id)));
      message.success(`已删除 ${ids.length} 项`);
      setSelectedIds(new Set());
    } catch { message.error('批量删除失败'); }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const isDark = localStorage.getItem('darkMode') === 'true';
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  const renderCard = (item: Item) => (
    <SortableCard
      key={item.id}
      item={item}
      currentView={currentView}
      selectMode={selectMode}
      selected={selectedIds.has(item.id)}
      onCardClick={() => { sessionStorage.setItem('itemDetailFrom', 'kanban'); navigate(`/items/${item.id}`); }}
      onSelectToggle={toggleSelect}
      onStartClick={() => handleStatusChange(item, 'start')}
      onCompleteClick={() => handleStatusChange(item, 'complete')}
      onDeleteClick={() => setConfirmModal({ visible: true, item, action: 'delete' })}
      onVisibilityChange={(v) => handleVisibilityChange(item, v)}
    />
  );

  const priorityMenu = (['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => ({
    key: p, label: PRIORITY_LABELS[p],
  }));
  const visMenu = (['DEPARTMENT', 'PRIVATE', 'SHARED'] as Visibility[]).map((v) => ({
    key: v, label: v === 'PRIVATE' ? '私有' : v === 'DEPARTMENT' ? '部门' : '公开',
  }));

  return (
    <div>
      <div className="kanban-toolbar">
        <Segmented
          value={layoutMode}
          onChange={(value) => setLayoutMode(value as LayoutMode)}
          options={[
            { label: '状态三列', value: 'columns' },
            { label: '按项目', value: 'project' },
            { label: '按子状态', value: 'subStatus' },
            { label: '按分类', value: 'category' },
            { label: '四象限矩阵', value: 'matrix' },
          ]}
        />
        <Select
          placeholder="所属项目"
          style={{ width: 200 }}
          allowClear
          showSearch
          optionFilterProp="label"
          value={filterProject || undefined}
          onChange={(v) => setFilterProject(v || '')}
          options={[
            { value: '__none__', label: '🗂 散任务' },
            ...projects.map((p) => ({ value: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name })),
          ]}
        />
        {currentView === 'department' && (
          <Select
            placeholder="采购员"
            style={{ width: 140 }}
            allowClear
            showSearch
            optionFilterProp="label"
            value={filterOwnerId || undefined}
            onChange={(v) => setFilterOwnerId(v || '')}
            options={ownerOptions}
          />
        )}
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
          placeholder={['截止起', '截止止']}
          style={{ width: 240 }}
          allowClear
        />
        <div className="toolbar-spacer" />
        <Button
          icon={<CheckSquareOutlined />}
          type={selectMode ? 'primary' : 'default'}
          onClick={() => setSelectMode(!selectMode)}
        >
          {selectMode ? '退出多选' : '多选'}
        </Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { sessionStorage.setItem('itemDetailFrom', 'kanban'); navigate('/items/new'); }}
        >
          新建事项
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {layoutMode === 'columns' ? (
          <div className="kanban-board">
            {STATUS_COLUMNS.map((col) => {
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
                    <div onClick={() => setCollapsedCompleted(false)} style={{ textAlign: 'center', padding: '40px 20px', color: '#86868b', cursor: 'pointer' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                      <div style={{ fontSize: 13 }}>{colItems.length} 项已完成事项</div>
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--color-primary)' }}>点击展开查看</div>
                    </div>
                  ) : (
                    <SortableContext items={colItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                      <div className="kanban-cards">
                        {colItems.slice(0, COMPLETED_PAGE_SIZE).map(renderCard)}
                        {colItems.length > COMPLETED_PAGE_SIZE && (
                          <div style={{ textAlign: 'center', padding: '12px', color: '#86868b', fontSize: 12 }}>
                            仅展示最近 {COMPLETED_PAGE_SIZE} 条，共 {colItems.length} 项
                          </div>
                        )}
                        {colItems.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#86868b' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                            <div style={{ fontSize: 13 }}>暂无{col.label}事项</div>
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  )}
                </div>
              );
            })}
          </div>
        ) : layoutMode === 'matrix' ? (
          <div className="quadrant-grid">
            {QUADRANTS.map((q) => {
              const cell = quadrantMap[q];
              return (
                <div key={q} className={`quadrant-cell quadrant-${q}`}>
                  <div className="quadrant-title">
                    <span>{QUADRANT_AXIS[q]}</span>
                    <span className="quadrant-count">{cell.length} 项</span>
                  </div>
                  <SortableContext items={cell.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {cell.length === 0 ? (
                      <div className="quadrant-empty">—</div>
                    ) : cell.map(renderCard)}
                  </SortableContext>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="swimlane-board">
            <div className="swimlane-header-row">
              <div style={{ color: 'var(--ink)' }}>
                {layoutMode === 'project' ? '项目' : layoutMode === 'subStatus' ? '子状态' : '分类'}
              </div>
              {STATUS_COLUMNS.map((c) => (
                <div key={c.status} style={{ color: c.color }}>{c.label}</div>
              ))}
            </div>
            {swimlaneGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#86868b' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                <div>暂无事项</div>
              </div>
            ) : swimlaneGroups.map((g) => {
              const collapsed = collapsedGroups.has(g.key);
              return (
                <div key={g.key} className="swimlane-row">
                  <div className="swimlane-group-title" onClick={() => toggleGroup(g.key)}>
                    <span className="group-caret">{collapsed ? '▶' : '▼'}</span>
                    <span className="group-label">{g.label}</span>
                    <Badge count={g.items.length} style={{ backgroundColor: '#86868b' }} />
                  </div>
                  {collapsed ? (
                    <div className="swimlane-collapsed-body">已折叠 · {g.items.length} 项</div>
                  ) : (
                    STATUS_COLUMNS.map((c) => {
                      const cellItems = sortItemsForColumn(g.items.filter((i) => i.status === c.status), c.status);
                      return (
                        <div key={c.status} className="swimlane-cell">
                          <SortableContext items={cellItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                            {cellItems.length === 0 ? (
                              <div className="swimlane-cell-empty">—</div>
                            ) : cellItems.map(renderCard)}
                          </SortableContext>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
        <DragOverlay>{activeItem && <DragCard item={activeItem} />}</DragOverlay>
      </DndContext>

      {selectMode && selectedIds.size > 0 && (
        <div className="action-bar">
          <span className="action-count">已选 {selectedIds.size} 项</span>
          <Dropdown menu={{ items: priorityMenu, onClick: ({ key }) => handleBatchPriority(key as Priority) }}>
            <Button size="small">改优先级</Button>
          </Dropdown>
          <Dropdown menu={{ items: visMenu, onClick: ({ key }) => handleBatchVisibility(key as Visibility) }}>
            <Button size="small">改可见性</Button>
          </Dropdown>
          <Popconfirm title={`确定删除选中的 ${selectedIds.size} 项？`} onConfirm={handleBatchDelete}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
          <Button size="small" type="text" onClick={() => setSelectedIds(new Set())}>清空</Button>
        </div>
      )}

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
