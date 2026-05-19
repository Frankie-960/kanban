import { kanbanGet, kanbanPost, kanbanPut, kanbanPatch } from '../api.js';
import type { ToolDef } from './types.js';

export function itemTools(): ToolDef[] {
  return [
    {
      name: 'kanban_list_items',
      description:
        '列出当前用户可见的事项。默认 personal 视图（仅本人创建）；view=department 时还包含本部门 DEPARTMENT 可见事项。可按 status / priority / category / projectId / search 过滤。projectId="null" 表示散任务（无项目）。',
      inputSchema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['personal', 'department'], default: 'personal' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] },
          priority: {
            type: 'string',
            enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
            description: '艾森豪威尔映射：URGENT=重要紧急 / HIGH=重要不急 / MEDIUM=紧急不重要 / LOW=不重要不急',
          },
          category: { type: 'string' },
          projectId: { type: 'string', description: '"null" 表示散任务' },
          search: { type: 'string' },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
      handler: (args, ctx) => kanbanGet(ctx, '/items', args),
    },
    {
      name: 'kanban_get_item',
      description: '获取单个事项的完整信息（包含 statusHistories / reminders / project）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: (args, ctx) => kanbanGet(ctx, `/items/${args.id}`),
    },
    {
      name: 'kanban_create_item',
      description: '创建新事项。visibility 不传时默认 DEPARTMENT 部门可见，便于团队协同。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },
          category: { type: 'string', default: 'OTHER' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'], default: 'TODO' },
          subStatus: { type: 'string' },
          projectId: { type: 'string' },
          dueDate: { type: 'string', format: 'date-time' },
          visibility: { type: 'string', enum: ['PRIVATE', 'DEPARTMENT', 'SHARED'], default: 'DEPARTMENT' },
          estimatedAmount: { type: 'number' },
          currency: { type: 'string' },
          supplierName: { type: 'string' },
        },
        required: ['title'],
      },
      handler: (args, ctx) => kanbanPost(ctx, '/items', { visibility: 'DEPARTMENT', ...args }),
    },
    {
      name: 'kanban_update_item',
      description:
        '更新事项字段（标题/描述/进展/优先级/分类/截止/金额/项目/可见性等）。只能更新自己拥有的事项。删除/转岗不开放给 agent。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          patch: {
            type: 'object',
            description: '仅传需要更新的字段，字段名与 ItemCreate 一致',
          },
        },
        required: ['id', 'patch'],
      },
      handler: (args, ctx) => kanbanPut(ctx, `/items/${args.id}`, args.patch),
    },
    {
      name: 'kanban_update_status',
      description: '更新事项的主状态（TODO/IN_PROGRESS/COMPLETED）。自动写入 StatusHistory 审计。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] },
          subStatus: { type: 'string', description: '可选；常见值见 SUB_STATUS_OPTIONS' },
        },
        required: ['id', 'status'],
      },
      handler: (args, ctx) =>
        kanbanPatch(ctx, `/items/${args.id}/status`, { status: args.status, subStatus: args.subStatus }),
    },
    {
      name: 'kanban_get_history',
      description: '查询事项的状态变更历史（按时间倒序），用于回放谁在什么时候推动到了哪一步。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: (args, ctx) => kanbanGet(ctx, `/items/${args.id}/history`),
    },
  ];
}
