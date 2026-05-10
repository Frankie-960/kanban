export type ItemStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type Category = 'PROCUREMENT_SOURCING' | 'PAYMENT' | 'OTHER';
export type Visibility = 'PRIVATE' | 'DEPARTMENT' | 'SHARED';
export type ReminderType = 'BEFORE_DUE' | 'DAILY_DIGEST' | 'CUSTOM';
export type ReportType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type Role = 'ADMIN' | 'DEPARTMENT_ADMIN' | 'MEMBER';
export type SupplierLevel = 'A' | 'B' | 'C';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string;
  department?: Department;
  deepseekApiKey?: string;
  llmProvider?: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  members?: User[];
  announcements?: Announcement[];
}

export interface Supplier {
  id: string;
  name: string;
  code?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  level: SupplierLevel;
  performance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  totalAmount?: number;
}

export interface Item {
  id: string;
  title: string;
  description?: string;
  progress?: string;
  status: ItemStatus;
  subStatus?: string;
  priority: Priority;
  category: Category;
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  visibility: Visibility;
  order: number;
  userId: string;
  departmentId?: string;
  user?: User;
  createdAt: string;
  updatedAt: string;
  // 成本相关
  estimatedAmount?: number;
  finalAmount?: number;
  currency?: string;
  // 供应商关联
  supplierId?: string;
  supplier?: { id: string; name: string; code: string | null; level: string } | null;
  // 自由文本供应商信息（不需要关联数据库）
  supplierName?: string;
  supplierAmount?: number;
  // 需求部门
  requesterDepartment?: string;
  // 关联公告ID
  announcementId?: string;
  // 关联项目
  projectId?: string;
  project?: { id: string; name: string; code?: string | null };
  experiences?: Experience[];
  reminders?: Reminder[];
  statusHistories?: StatusHistory[];
}

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  ownerId: string;
  owner?: { id: string; name: string };
  departmentId?: string | null;
  totalBudget?: number | null;
  currency?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  // 列表接口附加的统计字段
  itemCount?: number;
  completedCount?: number;
  estimatedAmount?: number;
  finalAmount?: number;
  items?: Item[];
}

export interface ProjectSummary {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  todoCount: number;
  overdueCount: number;
  progress: number;
  estimatedAmount: number;
  finalAmount: number;
  budget: number | null;
  budgetRemaining: number | null;
  budgetUsedPercent: number | null;
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  PLANNING:  { label: '规划中', color: '#8c8c8a' },
  ACTIVE:    { label: '进行中', color: '#1890ff' },
  ON_HOLD:   { label: '已暂停', color: '#faad14' },
  COMPLETED: { label: '已完成', color: '#52c41a' },
  CANCELLED: { label: '已取消', color: '#f5222d' },
};

export interface StatusHistory {
  id: string;
  itemId: string;
  fromStatus?: ItemStatus;
  toStatus?: ItemStatus;
  fromSubStatus?: string;
  toSubStatus?: string;
  operatorId: string;
  operator?: User;
  createdAt: string;
}

export interface Reminder {
  id: string;
  itemId: string;
  type: ReminderType;
  remindAt: string;
  isRecurring: boolean;
  recurringPattern?: string;
  isEnabled: boolean;
  item?: Item;
}

export interface Experience {
  id: string;
  itemId: string;
  userId: string;
  content: string;
  item?: Item;
  user?: User;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  userId?: string;
  departmentId?: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  content: string | ReportContent;
  exportedFile?: string;
  createdAt: string;
}

export interface SupplierStats {
  name: string;
  code: string | null;
  level: string;
  itemCount: number;
  totalAmount: number;
  performance: number;
}

export interface ReportContent {
  summary: string;
  periodProgress: string;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  totalTasks: number;
  completionRate: number;
  // 成本分析
  totalEstimatedAmount: number;
  totalFinalAmount: number;
  totalSavings: number;
  savingsRate: number;
  currency: string;
  costAnalysis: string;
  // 供应商
  supplierStats: SupplierStats[];
  topSupplier: SupplierStats | null;
  supplierPerformance: number;
  categories: {
    name: string;
    tasks: {
      title: string;
      status: string;
      subStatus?: string;
      progress?: string;
      completedAt?: string;
      estimatedAmount?: number;
      finalAmount?: number;
      supplierName?: string;
    }[];
  }[];
  insights: string[];
  nextSteps: string[];
  highlights: string[];
  risks: string[];
}

export interface Announcement {
  id: string;
  departmentId: string;
  title: string;
  content: string;
  publishedById: string;
  publishedBy?: User;
  createdAt: string;
  // 新增：目标范围
  targetAll?: boolean; // true = 全体成员
  targetUserIds?: string[]; // 指定成员
  // 新增：关联事项
  linkedItemIds?: string[];
  // 新增：确认状态追踪
  confirmations?: AnnouncementConfirmation[];
  // 新增：状态管理
  isExpired?: boolean;
  expiredAt?: string;
  isWithdrawn?: boolean;
  withdrawnAt?: string;
  // 新增：创建待办任务
  createTaskForTargets?: boolean;
}

export interface AnnouncementConfirmation {
  userId: string;
  user?: User;
  confirmed: boolean;
  confirmedAt?: string;
}

export interface SubStatus {
  id: string;
  category: Category;
  name: string;
  order: number;
  isActive: boolean;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  PROCUREMENT_SOURCING: '招标寻源',
  PAYMENT: '供应商付款',
  OTHER: '其他',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
};

export const SUB_STATUS_OPTIONS: Record<Category, string[]> = {
  PROCUREMENT_SOURCING: ['供应商报价中', '待发起采购评审', '采购评审中'],
  PAYMENT: ['待供应商发起请款申请', '内部验收确认中', '付款流程已发起'],
  OTHER: [],
};

export const SUPPLIER_LEVEL_LABELS: Record<SupplierLevel, string> = {
  A: '战略供应商',
  B: '合格供应商',
  C: '观察供应商',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  URGENT: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'default',
};

export const STATUS_COLORS: Record<ItemStatus, string> = {
  COMPLETED: 'green',
  IN_PROGRESS: 'blue',
  TODO: 'default',
};

export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  TODO: { label: '待办', color: '#faad14' },
  IN_PROGRESS: { label: '进行中', color: '#1890ff' },
  COMPLETED: { label: '已完成', color: '#52c41a' },
};

export const CATEGORY_CONFIG: Record<Category, { name: string; color: string }> = {
  PROCUREMENT_SOURCING: { name: '招标寻源', color: '#722ed1' },
  PAYMENT: { name: '供应商付款', color: '#eb2f96' },
  OTHER: { name: '其他', color: '#8c8c8a' },
};

export const CURRENCY_OPTIONS = [
  { value: 'CNY', label: '人民币 (CNY)' },
  { value: 'USD', label: '美元 (USD)' },
  { value: 'EUR', label: '欧元 (EUR)' },
  { value: 'HKD', label: '港币 (HKD)' },
];

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  BEFORE_DUE: '截止前提醒',
  DAILY_DIGEST: '每日摘要',
  CUSTOM: '自定义',
};

export const REMINDER_TYPE_COLORS: Record<ReminderType, string> = {
  BEFORE_DUE: 'red',
  DAILY_DIGEST: 'blue',
  CUSTOM: 'green',
};
