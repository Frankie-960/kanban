import { kanbanGet, kanbanPost } from '../api.js';
import type { ToolDef } from './types.js';

export function projectTools(): ToolDef[] {
  return [
    {
      name: 'kanban_list_projects',
      description: '列出当前用户可见的项目（含 item 计数 / 完成数 / 累计金额）。',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
          },
          search: { type: 'string' },
        },
      },
      handler: (args, ctx) => kanbanGet(ctx, '/projects', args),
    },
    {
      name: 'kanban_get_project',
      description: '获取单个项目详情，包含所有子事项。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: (args, ctx) => kanbanGet(ctx, `/projects/${args.id}`),
    },
    {
      name: 'kanban_get_project_summary',
      description: '项目进度 + 预算 summary（任务计数、完成率、预算使用、逾期数）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: (args, ctx) => kanbanGet(ctx, `/projects/${args.id}/summary`),
    },
    {
      name: 'kanban_create_project',
      description: '创建新项目。visibility 不传时默认 DEPARTMENT。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          code: { type: 'string', description: '全局唯一项目编号（可选）' },
          description: { type: 'string' },
          status: {
            type: 'string',
            enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
            default: 'PLANNING',
          },
          totalBudget: { type: 'number' },
          currency: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          dueDate: { type: 'string', format: 'date-time' },
          visibility: {
            type: 'string',
            enum: ['PRIVATE', 'DEPARTMENT', 'SHARED'],
            default: 'DEPARTMENT',
          },
        },
        required: ['name'],
      },
      handler: (args, ctx) => kanbanPost(ctx, '/projects', { visibility: 'DEPARTMENT', ...args }),
    },
  ];
}
