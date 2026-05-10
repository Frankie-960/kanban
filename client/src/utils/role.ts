export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理员',
  DEPARTMENT_ADMIN: '部门负责人',
  MEMBER: '成员',
};

export const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'red',
  DEPARTMENT_ADMIN: 'orange',
  MEMBER: 'default',
};

export const getRoleLabel = (role: string): string => {
  return ROLE_LABELS[role] || '成员';
};

export const getRoleTagColor = (role: string): string => {
  return ROLE_COLORS[role] || 'default';
};