# kanban-mcp

MCP server exposing 采购看板 to Claude Code, Claude Desktop, OpenCode, and other MCP-compatible agents.

## Architecture

```
agent ──stdio──> kanban-mcp ──HTTPS+JWT──> kanban Express /api/*
```

All calls go through the existing REST API with a long-lived agent JWT — so:

- visibility filtering (`buildItemWhere` AND-nested) is honored
- StatusHistory.operatorId is set to the token's user
- rate limits, validation, error handling all reuse the existing code path

## Setup

```bash
cd server/mcp
npm install
npm run build
```

## Configuration

Two env vars:

- `KANBAN_API_URL` — base URL of the kanban backend (default `http://localhost:3001`)
- `KANBAN_AGENT_TOKEN` — long-lived JWT issued by `POST /api/auth/agent-token`. Generate one in the web UI under Settings → Agent Token.

## Register with Claude Code

```bash
claude mcp add kanban \
  -e KANBAN_API_URL=http://localhost:3001 \
  -e KANBAN_AGENT_TOKEN=eyJ... \
  -- node /absolute/path/to/server/mcp/dist/index.js
```

Restart Claude Code. Inside Claude Code, type `/mcp` to verify `kanban` shows up with ~14 tools.

## Tool catalog

| Tool | Endpoint | Purpose |
|---|---|---|
| `kanban_who_am_i` | GET /auth/me | Identify current user/dept |
| `kanban_list_items` | GET /items | List items (filterable, view-aware) |
| `kanban_get_item` | GET /items/:id | Full item w/ histories |
| `kanban_create_item` | POST /items | Create (DEPARTMENT-vis default) |
| `kanban_update_item` | PUT /items/:id | Patch item fields |
| `kanban_update_status` | PATCH /items/:id/status | Move status + history |
| `kanban_get_history` | GET /items/:id/history | Replay status changes |
| `kanban_get_summary` | GET /items/summary | Totals + monthly aggregate |
| `kanban_list_projects` | GET /projects | Projects + item counts |
| `kanban_get_project` | GET /projects/:id | Project + sub-items |
| `kanban_get_project_summary` | GET /projects/:id/summary | Project budget/progress |
| `kanban_create_project` | POST /projects | Create project |
| `kanban_list_experiences` | GET /experiences | Item experience log |
| `kanban_add_experience` | POST /experiences | Append experience entry |

**Not exposed (intentionally)**: delete item, transfer item, admin operations, reorder, announcements, voice — keep agent surface narrow.

## Security

- Token = JWT with `{ agent: true, scope, agentName }` claims, expires in up to 365 days
- v1 revocation = rotate JWT_SECRET (all tokens invalidate)
- No per-token DB record (lightweight)
