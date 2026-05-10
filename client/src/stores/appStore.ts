import { create } from 'zustand';
import type { User, Item, Department, Project } from '../types';
import { authAPI, itemsAPI, departmentsAPI, subStatusAPI, categoriesAPI, projectsAPI } from '../services/api';
import { CATEGORY_LABELS, SUB_STATUS_OPTIONS } from '../types';

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  initialized: boolean;
  items: Item[];
  departments: Department[];
  projects: Project[];
  currentView: 'personal' | 'department';
  loading: boolean;
  error: string | null;
  subStatusOptions: Record<string, string[]>;
  categoryOptions: { key: string; name: string }[];

  // Auth actions
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;

  // Items actions
  fetchItems: (params?: Record<string, string>) => Promise<void>;
  addItem: (data: Partial<Item>) => Promise<Item>;
  updateItem: (id: string, data: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateItemStatus: (id: string, status: string, subStatus?: string) => Promise<void>;
  reorderItems: (items: { id: string; order: number }[]) => void;

  // Department actions
  fetchDepartments: () => Promise<void>;
  setCurrentView: (view: 'personal' | 'department') => void;

  // Project actions
  fetchProjects: () => Promise<void>;

  // SubStatus actions
  fetchSubStatusOptions: () => Promise<void>;

  // Category actions
  fetchCategories: () => Promise<void>;

  // UI state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const DEFAULT_CATEGORY_OPTIONS = [
  { key: 'PROCUREMENT_SOURCING', name: CATEGORY_LABELS.PROCUREMENT_SOURCING },
  { key: 'PAYMENT', name: CATEGORY_LABELS.PAYMENT },
  { key: 'OTHER', name: CATEGORY_LABELS.OTHER },
];

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  initialized: false,
  items: [],
  departments: [],
  projects: [],
  currentView: 'personal',
  loading: false,
  error: null,
  subStatusOptions: SUB_STATUS_OPTIONS,
  categoryOptions: DEFAULT_CATEGORY_OPTIONS,

  login: async (email, password) => {
    try {
      set({ loading: true, error: null });
      const res = await authAPI.login(email, password);
      localStorage.setItem('token', res.data.token);
      set({ user: res.data.user, isAuthenticated: true });
      await Promise.all([
        get().fetchItems(),
        get().fetchDepartments(),
        get().fetchCategories(),
        get().fetchSubStatusOptions(),
        get().fetchProjects(),
      ]);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Login failed' });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  register: async (name, email, password) => {
    try {
      set({ loading: true, error: null });
      const res = await authAPI.register(name, email, password);
      localStorage.setItem('token', res.data.token);
      set({ user: res.data.user, isAuthenticated: true });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Registration failed' });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({
      user: null,
      isAuthenticated: false,
      initialized: true,
      items: [],
      departments: [],
      projects: [],
      subStatusOptions: SUB_STATUS_OPTIONS,
      categoryOptions: DEFAULT_CATEGORY_OPTIONS,
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false, initialized: true });
      return;
    }
    try {
      const res = await authAPI.getMe();
      set({ user: res.data, isAuthenticated: true });
      await Promise.all([
        get().fetchItems(),
        get().fetchDepartments(),
        get().fetchCategories(),
        get().fetchSubStatusOptions(),
        get().fetchProjects(),
      ]);
    } catch {
      localStorage.removeItem('token');
      set({ isAuthenticated: false, user: null });
    } finally {
      set({ initialized: true });
    }
  },

  fetchItems: async (params) => {
    try {
      set({ loading: true });
      const { currentView } = get();
      const queryParams = { ...params };
      if (currentView === 'department') {
        queryParams.view = 'department';
      }
      const res = await itemsAPI.getAll(queryParams);
      // Handle paginated response { items, total, page, pageSize } or array response
      const resData = res.data as Item[] | { items: Item[]; total: number; page: number; pageSize: number };
      const itemsData = Array.isArray(resData) ? resData : resData.items || [];
      set({ items: itemsData });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch items' });
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (data) => {
    const res = await itemsAPI.create(data);
    set((state) => ({ items: [res.data, ...state.items] }));
    return res.data;
  },

  updateItem: async (id, data) => {
    const res = await itemsAPI.update(id, data);
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? res.data : item)),
    }));
  },

  deleteItem: async (id) => {
    await itemsAPI.delete(id);
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  updateItemStatus: async (id, status, subStatus) => {
    const res = await itemsAPI.updateStatus(id, status, subStatus);
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? res.data : item)),
    }));
  },

  reorderItems: (reorderedItems) => {
    set((state) => ({
      items: state.items.map((item) => {
        const reordered = reorderedItems.find((r) => r.id === item.id);
        return reordered ? { ...item, order: reordered.order } : item;
      }),
    }));
  },

  fetchDepartments: async () => {
    try {
      const res = await departmentsAPI.getAll();
      set({ departments: res.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch departments' });
    }
  },

  fetchProjects: async () => {
    try {
      const res = await projectsAPI.getAll();
      set({ projects: res.data });
    } catch {
      set({ projects: [] });
    }
  },

  fetchCategories: async () => {
    try {
      const res = await categoriesAPI.getAll();
      const activeCategories = res.data
        .filter((c: any) => c.isActive)
        .map((c: any) => ({ key: c.key, name: c.name }));
      if (activeCategories.length > 0) {
        set({ categoryOptions: activeCategories });
      }
    } catch {
      set({ categoryOptions: DEFAULT_CATEGORY_OPTIONS });
    }
  },

  fetchSubStatusOptions: async () => {
    try {
      const res = await subStatusAPI.getAll();
      const options: Record<string, string[]> = {};
      for (const sub of res.data) {
        if (sub.isActive) {
          if (!options[sub.category]) {
            options[sub.category] = [];
          }
          options[sub.category].push(sub.name);
        }
      }
      set({ subStatusOptions: options });
    } catch {
      set({ subStatusOptions: SUB_STATUS_OPTIONS });
    }
  },

  setCurrentView: (view) => set({ currentView: view }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));