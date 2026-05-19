#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { itemTools } from './tools/items.js';
import { projectTools } from './tools/projects.js';
import { summaryTools } from './tools/summary.js';
import { experienceTools } from './tools/experiences.js';
import type { ToolDef } from './tools/types.js';

const baseUrl = process.env.KANBAN_API_URL || 'http://localhost:3001';
const token = process.env.KANBAN_AGENT_TOKEN;

if (!token) {
  console.error(
    '[kanban-mcp] Missing KANBAN_AGENT_TOKEN env var.\n' +
      'Generate one in the web UI (Settings → Agent Token) and pass it via env.'
  );
  process.exit(1);
}

const tools: ToolDef[] = [
  ...itemTools(),
  ...projectTools(),
  ...summaryTools(),
  ...experienceTools(),
];

const server = new Server(
  { name: 'kanban-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as any,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {}, { baseUrl, token: token! });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Tool error: ${e?.message ?? String(e)}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[kanban-mcp] connected. ${tools.length} tools registered. base=${baseUrl}`);
