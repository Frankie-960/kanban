import { kanbanGet } from '../api.js';
import type { ToolDef } from './types.js';

export function summaryTools(): ToolDef[] {
  return [
    {
      name: 'kanban_get_summary',
      description:
        '获取整体事项的金额与状态汇总。返回 totals（总数/估算金额/实际金额/逾期数）、byCategory、byStatus、overBudgetItems、monthly（本月聚合）。受 view 与过滤参数影响。',
      inputSchema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['personal', 'department'], default: 'personal' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] },
          priority: { type: 'string', enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] },
          category: { type: 'string' },
          projectId: { type: 'string' },
        },
      },
      handler: (args, ctx) => kanbanGet(ctx, '/items/summary', args),
    },
    {
      name: 'kanban_who_am_i',
      description: '返回当前 token 所属用户的基本信息（id / name / email / role / departmentId）。在 agent 决策前先确认身份很有用。',
      inputSchema: { type: 'object', properties: {} },
      handler: (_args, ctx) => kanbanGet(ctx, '/auth/me'),
    },
  ];
}
