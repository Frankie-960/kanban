import { kanbanGet, kanbanPost } from '../api.js';
import type { ToolDef } from './types.js';

export function experienceTools(): ToolDef[] {
  return [
    {
      name: 'kanban_list_experiences',
      description: '列出某个事项的所有经验/复盘记录（按时间倒序）。',
      inputSchema: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId'],
      },
      handler: (args, ctx) => kanbanGet(ctx, '/experiences', { itemId: args.itemId }),
    },
    {
      name: 'kanban_add_experience',
      description: '为某个事项添加一条经验/复盘记录。建议在事项推进到关键节点或完成后调用。',
      inputSchema: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          content: { type: 'string', description: '正文 Markdown 或纯文本' },
        },
        required: ['itemId', 'content'],
      },
      handler: (args, ctx) => kanbanPost(ctx, '/experiences', args),
    },
  ];
}
