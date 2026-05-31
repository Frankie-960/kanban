import axios from 'axios';
import type {
  Item,
  Reminder,
  Experience,
  Report,
  Department,
  User,
  StatusHistory,
  Supplier,
  SubStatus,
  Project,
  ProjectSummary,
} from '../types';

interface CategoryResponse {
  id: string;
  key: string;
  name: string;
  order?: number;
  isActive?: boolean;
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to requests
api.interceptors.request.use((config: any) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/register', { name, email, password }),
  getMe: () => api.get<User>('/auth/me'),
  updateProfile: (data: { name?: string; newPassword?: string; deepseekApiKey?: string; llmProvider?: string }) =>
    api.put<User>('/auth/profile', data),
  getUsers: () => api.get<User[]>('/auth/users'),
  updateUserRole: (id: string, role: string) =>
    api.put<User>(`/auth/users/${id}/role`, { role }),
  resetUserPassword: (id: string) =>
    api.post<{ tempPassword: string; message: string }>(`/auth/users/${id}/reset-password`),
  verifyEmail: (token: string) =>
    api.post<{ message: string }>('/auth/verify-email', { token }),
  resendVerification: () =>
    api.post<{ message: string }>('/auth/resend-verification'),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, newPassword }),
};

// Items API
export const itemsAPI = {
  getAll: (params?: Record<string, string>) =>
    api.get<Item[]>('/items', { params }),
  getById: (id: string) => api.get<Item>(`/items/${id}`),
  create: (data: Partial<Item>) => api.post<Item>('/items', data),
  update: (id: string, data: Partial<Item>) => api.put<Item>(`/items/${id}`, data),
  delete: (id: string) => api.delete(`/items/${id}`),
  updateStatus: (id: string, status: string, subStatus?: string) =>
    api.patch<Item>(`/items/${id}/status`, { status, subStatus }),
  getHistory: (id: string) => api.get<StatusHistory[]>(`/items/${id}/history`),
  reorder: (items: { id: string; order: number }[]) =>
    api.patch('/items/reorder', { items }),
  transfer: (id: string, targetUserId: string) =>
    api.post<Item>(`/items/${id}/transfer`, { targetUserId }),
};

// Reminders API
export const remindersAPI = {
  getAll: () => api.get<Reminder[]>('/reminders'),
  create: (data: Partial<Reminder>) => api.post<Reminder>('/reminders', data),
  update: (id: string, data: Partial<Reminder>) =>
    api.put<Reminder>(`/reminders/${id}`, data),
  delete: (id: string) => api.delete(`/reminders/${id}`),
};

// Experiences API
export const experiencesAPI = {
  getAll: (params?: Record<string, string>) =>
    api.get<Experience[]>('/experiences', { params }),
  getById: (id: string) => api.get<Experience>(`/experiences/${id}`),
  create: (data: { itemId: string; content: string }) =>
    api.post<Experience>('/experiences', data),
  update: (id: string, content: string) =>
    api.put<Experience>(`/experiences/${id}`, { content }),
  delete: (id: string) => api.delete(`/experiences/${id}`),
};

// Reports API
export const reportsAPI = {
  getAll: () => api.get<Report[]>('/reports'),
  getById: (id: string) => api.get<Report>(`/reports/${id}`),
  generate: (data: {
    type: string;
    periodStart: string;
    periodEnd: string;
    departmentId?: string;
    customRequirements?: string;
    llmProvider?: string;
    reportScope?: 'personal' | 'department';
  }) => api.post<Report>('/reports/generate', data),
  getLLMProviders: () => api.get<{ key: string; name: string }[]>('/reports/llm-providers'),
  delete: (id: string) => api.delete(`/reports/${id}`),
  export: async (id: string, format: 'word' | 'excel') => {
    const response = await api.post(`/reports/${id}/export`, { format }, {
      responseType: 'blob',
    });
    return response;
  },
  exportAi: async (id: string) => {
    const response = await api.post(`/reports/${id}/export-ai`, {}, {
      responseType: 'blob',
    });
    return response;
  },
};

// SubStatus API
export const subStatusAPI = {
  getAll: () => api.get<SubStatus[]>('/sub-status'),
  create: (data: { category: string; name: string; order?: number }) =>
    api.post<SubStatus>('/sub-status', data),
  update: (id: string, data: { name?: string; order?: number; isActive?: boolean }) =>
    api.put<SubStatus>(`/sub-status/${id}`, data),
  delete: (id: string) => api.delete(`/sub-status/${id}`),
  reorder: (items: { id: string; order: number }[]) =>
    api.patch('/sub-status/reorder', { items }),
};

// Departments API
export const departmentsAPI = {
  getAll: () => api.get<Department[]>('/departments'),
  getById: (id: string) => api.get<Department>(`/departments/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post<Department>('/departments', data),
  getItems: (id: string) => api.get<Item[]>(`/departments/${id}/items`),
  getMembers: (id: string) => api.get<User[]>(`/departments/${id}/members`),
  addMember: (id: string, data: { email: string; role?: string }) =>
    api.post(`/departments/${id}/members`, data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/departments/${id}/members/${userId}`),
  updateMemberRole: (id: string, userId: string, role: string) =>
    api.put(`/departments/${id}/members/${userId}`, { role }),
  createAnnouncement: (id: string, data: {
    title: string;
    content: string;
    targetAll?: boolean;
    targetUserIds?: string[];
    linkedItemIds?: string[];
    createTaskForTargets?: boolean;
  }) => api.post(`/departments/${id}/announcements`, data),
  getAnnouncements: (id: string) => api.get(`/departments/${id}/announcements`),
  confirmAnnouncement: (departmentId: string, announcementId: string, confirmed: boolean) =>
    api.post(`/departments/${departmentId}/announcements/${announcementId}/confirm`, { confirmed }),
  withdrawAnnouncement: (departmentId: string, announcementId: string) =>
    api.post(`/departments/${departmentId}/announcements/${announcementId}/withdraw`),
  expireAnnouncement: (departmentId: string, announcementId: string) =>
    api.post(`/departments/${departmentId}/announcements/${announcementId}/expire`),
  join: (id: string) => api.post(`/departments/${id}/join`),
};

// Suppliers API
export const suppliersAPI = {
  getAll: (params?: { search?: string; level?: string; isActive?: boolean }) =>
    api.get<Supplier[]>('/suppliers', { params }),
  getById: (id: string) => api.get<Supplier>(`/suppliers/${id}`),
  create: (data: {
    name: string;
    code?: string;
    contact?: string;
    phone?: string;
    email?: string;
    address?: string;
    category?: string;
    level?: 'A' | 'B' | 'C';
    performance?: number;
  }) => api.post<Supplier>('/suppliers', data),
  update: (id: string, data: Partial<Supplier>) =>
    api.put<Supplier>(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
  updatePerformance: (id: string, performance: number) =>
    api.patch<Supplier>(`/suppliers/${id}/performance`, { performance }),
  getStats: () => api.get<{
    totalSuppliers: number;
    levelStats: { level: string; count: number }[];
    avgPerformance: number;
    topSuppliers: Supplier[];
    totalPurchaseAmount: number;
  }>('/suppliers/stats/summary'),
  getItems: (supplierId: string) => api.get<Item[]>(`/items/supplier/${supplierId}`),
};

// Projects API
export const projectsAPI = {
  getAll: (params?: { status?: string; search?: string }) =>
    api.get<Project[]>('/projects', { params }),
  getById: (id: string) => api.get<Project>(`/projects/${id}`),
  getSummary: (id: string) => api.get<ProjectSummary>(`/projects/${id}/summary`),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get<CategoryResponse[]>('/categories'),
  create: (data: { key: string; name: string; order?: number }) =>
    api.post<CategoryResponse>('/categories', data),
  update: (id: string, data: { name?: string; order?: number; isActive?: boolean }) =>
    api.put<CategoryResponse>(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
  reorder: (items: { id: string; order: number }[]) =>
    api.patch('/categories/reorder', { items }),
};

export default api;
