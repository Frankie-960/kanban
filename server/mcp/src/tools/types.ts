import type { Ctx } from '../api.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, any>, ctx: Ctx) => Promise<unknown>;
}
