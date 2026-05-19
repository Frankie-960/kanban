# Agent 接入指南（云端版）

让任意桌面 agent（**龙虾 / Claude Code / Claude Desktop / Cherry Studio / LobeChat / 自制 Python 脚本**）连到云端的 **采购看板**，5 分钟跑通。

> 后端地址：**https://sfmap-online.cn**
> 后端代码与本仓库一致，含 Round 4 的 `/api/auth/agent-token` 与 `/api/openapi.json`、`/api/docs`。

---

## 三步接入

### 步骤 1 — 让管理员发你 `kanban-mcp` 安装包

管理员一次性操作（在自己开发机执行）：

```powershell
# Windows
cd <repo>\server\mcp
.\scripts\pack.ps1

# Mac/Linux
cd <repo>/server/mcp
./scripts/pack.sh
```

产物 `kanban-mcp-0.1.0.tgz` 通过钉钉/网盘/U 盘发给同事。

同事电脑（任意目录，需要 Node.js 18+）：

```bash
npm i -g ./kanban-mcp-0.1.0.tgz
kanban-mcp --help    # 验证已经在 PATH 上
```

### 步骤 2 — 在 Settings 生成你的 Agent Token

浏览器打开 `https://sfmap-online.cn` → 登录 → 设置 → 「Agent Token」标签 → 起个名（如 *我的 Claude Code*）→ 默认 365 天 → **生成 Token**。

⚠ **立即复制保存**：页面关闭后无法再看。

旁边的「测试连接」按钮可以直接验证 token 是否有效（应弹出 "✓ 联通成功！识别为 你的名字"）。

### 步骤 3 — 把 token 配进你的桌面 agent

按你用的 agent 选一栏：

#### Claude Code（Anthropic 官方 CLI）

```bash
claude mcp add kanban \
  -e KANBAN_API_URL=https://sfmap-online.cn \
  -e KANBAN_AGENT_TOKEN=eyJhbGc...你的token \
  -- kanban-mcp
```

重启 Claude Code → 输入 `/mcp` → 应看到 `kanban` server 且 14 个工具就绪。

#### Claude Desktop

编辑配置文件（Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`，Windows: `%APPDATA%\Claude\claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "kanban": {
      "command": "kanban-mcp",
      "env": {
        "KANBAN_API_URL": "https://sfmap-online.cn",
        "KANBAN_AGENT_TOKEN": "eyJhbGc...你的token"
      }
    }
  }
}
```

重启 Claude Desktop。

#### 龙虾 / Cherry Studio / LobeChat / 其他支持 MCP 的客户端

进设置 → MCP servers → 新增 server：

| 字段 | 值 |
|---|---|
| Name | `kanban` |
| Type | `stdio` |
| Command | `kanban-mcp` |
| Env `KANBAN_API_URL` | `https://sfmap-online.cn` |
| Env `KANBAN_AGENT_TOKEN` | `eyJhbGc...你的token` |

保存 → 重新加载客户端。

#### 不支持 MCP？走 OpenAPI / Function Calling（见下方独立章节）

---

## 14 个 MCP 工具速查

| 工具 | 作用 |
|---|---|
| `kanban_who_am_i` | 当前 token 所属 user / dept |
| `kanban_list_items` | 列事项（personal/department + 任意过滤） |
| `kanban_get_item` | 单条事项详情（含 history） |
| `kanban_create_item` | 新建事项（默认部门可见） |
| `kanban_update_item` | 编辑事项任意字段 |
| `kanban_update_status` | 推进主状态 + 自动审计 |
| `kanban_get_history` | 状态变更历史 |
| `kanban_get_summary` | 金额/状态/超预算汇总 |
| `kanban_list_projects` | 项目列表 |
| `kanban_get_project` | 项目详情 + 子事项 |
| `kanban_get_project_summary` | 项目预算/进度 |
| `kanban_create_project` | 创建项目（默认部门可见） |
| `kanban_list_experiences` | 事项经验记录 |
| `kanban_add_experience` | 追加经验记录 |

**不暴露**：删除、转岗、管理员动作、重排序、公告、语音。

---

## 示例 prompt（在 Claude Code 等 agent 里直接说）

```
帮我看下个人视图下所有 IU 象限（重要紧急）的事项，按截止日期排序。

把事项 "P2026-001 招标评审" 推进到 IN_PROGRESS，子状态选「采购评审中」。

本月部门里呆滞超 3 天的高优先级事项有哪些？

给项目 P2026-001 写一份本月简报。

我刚完成了一个询价对比，把这条经验记到事项 abc123：
  "对比了 5 家供应商，A 家 90 万，性价比最高，但交期需协调"
```

---

## 非 MCP agent 接入（OpenAPI / Function Calling）

如果你的 agent 不支持 MCP（如自制 Python 脚本、LangChain、通义千问 agent、OpenAI Function Calling），直接走 REST。

**OpenAPI 完整规格**：
- Swagger UI：[https://sfmap-online.cn/api/docs](https://sfmap-online.cn/api/docs)
- JSON：[https://sfmap-online.cn/api/openapi.json](https://sfmap-online.cn/api/openapi.json)

**5 个核心工具的 JSON Schema 模板**（直接贴到任何支持 function calling 的 LLM 配置里）：

```json
[
  {
    "type": "function",
    "function": {
      "name": "kanban_list_items",
      "description": "列出我的待办事项，可按状态/优先级/项目过滤",
      "parameters": {
        "type": "object",
        "properties": {
          "view":     { "type": "string", "enum": ["personal", "department"] },
          "status":   { "type": "string", "enum": ["TODO", "IN_PROGRESS", "COMPLETED"] },
          "priority": { "type": "string", "enum": ["URGENT", "HIGH", "MEDIUM", "LOW"] },
          "projectId":{ "type": "string", "description": "\"null\" 表示散任务" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "kanban_create_item",
      "description": "创建新事项（默认部门可见）",
      "parameters": {
        "type": "object",
        "required": ["title"],
        "properties": {
          "title":      { "type": "string" },
          "description":{ "type": "string" },
          "priority":   { "type": "string", "enum": ["URGENT", "HIGH", "MEDIUM", "LOW"] },
          "category":   { "type": "string" },
          "dueDate":    { "type": "string", "format": "date-time" },
          "visibility": { "type": "string", "enum": ["PRIVATE", "DEPARTMENT", "SHARED"] }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "kanban_update_status",
      "description": "推进事项主状态（自动写审计）",
      "parameters": {
        "type": "object",
        "required": ["id", "status"],
        "properties": {
          "id":        { "type": "string" },
          "status":    { "type": "string", "enum": ["TODO", "IN_PROGRESS", "COMPLETED"] },
          "subStatus": { "type": "string" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "kanban_get_summary",
      "description": "金额 / 状态 / 超预算汇总，含本月聚合",
      "parameters": {
        "type": "object",
        "properties": {
          "view":     { "type": "string", "enum": ["personal", "department"] },
          "projectId":{ "type": "string" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "kanban_who_am_i",
      "description": "当前身份（id / name / email / role / departmentId）",
      "parameters": { "type": "object", "properties": {} }
    }
  }
]
```

**Python 示例**（每个 tool 函数实现长这样）：

```python
import requests
BASE = "https://sfmap-online.cn/api"
TOKEN = "eyJhbGc...你的token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def kanban_list_items(**params):
    return requests.get(f"{BASE}/items", headers=HEADERS, params=params).json()

def kanban_create_item(**body):
    return requests.post(f"{BASE}/items", headers=HEADERS, json=body).json()

def kanban_update_status(id, **body):
    return requests.patch(f"{BASE}/items/{id}/status", headers=HEADERS, json=body).json()

def kanban_get_summary(**params):
    return requests.get(f"{BASE}/items/summary", headers=HEADERS, params=params).json()

def kanban_who_am_i():
    return requests.get(f"{BASE}/auth/me", headers=HEADERS).json()
```

**Node 原生 fetch 示例**：

```js
const BASE = 'https://sfmap-online.cn/api';
const TOKEN = process.env.KANBAN_AGENT_TOKEN;
const auth = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const items = await fetch(`${BASE}/items?view=personal&status=TODO`, { headers: auth }).then(r => r.json());
const created = await fetch(`${BASE}/items`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ title: '联系 A 供应商', priority: 'HIGH' }),
}).then(r => r.json());
```

---

## 故障排查

| 现象 | 检查 |
|---|---|
| `kanban-mcp` 命令找不到 | `npm i -g ./kanban-mcp-0.1.0.tgz` 是否成功？`where.exe kanban-mcp`（Win）或 `which kanban-mcp`（Mac/Linux）能定位吗？Node 版本 >= 18？ |
| 401 Unauthorized | Token 过期（默认 365d）/ 后端 JWT_SECRET 被轮换 → 回 Settings 重生成 |
| `Missing KANBAN_AGENT_TOKEN` | env 没传进 agent。Claude Code 用 `claude mcp add ... -e KEY=val` ；Claude Desktop / 龙虾 编辑配置文件加 `env` 字段 |
| `ECONNREFUSED` / `ENOTFOUND` | 域名 / 网络问题。手动 `curl -i https://sfmap-online.cn/api/health` 看是不是 200 |
| 证书报错 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | 公司代理拦截 HTTPS 中间人。导入公司根证书到 Node：`NODE_EXTRA_CA_CERTS=path/to/corp.pem` |
| 看不到别人的事项 | 默认 `view=personal`，明确传 `view=department` 才会包括部门可见的事项 |
| 工具列表为空 | MCP server 没正常启动。手动跑：`echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \| kanban-mcp` 看输出 |

---

## 安全模型

- **Token 寿命**：最长 365 天。claim 含 `{ agent: true, scope, agentName, userId }`，将来 audit 日志能区分人类 vs agent 行为。
- **撤销**（v1）：唯一方式是后端轮换 `JWT_SECRET`（所有 token，包括人类登录的，一起失效）。等 v2 加 `AgentToken` 表后才能条目级撤销。
- **可见范围**：agent 看到的事项 = token 所属用户能看到的。默认 `view=personal`，需要看部门就显式传 `view=department`。
- **写操作**：可以改优先级、可见性、金额、项目归属、追加经验。**不会**触发删除/转岗/管理操作（这些根本没暴露）。

---

## 升级与维护

- 后端升级（管理员）：ssh 到阿里云 → `git pull && npm install && pm2 restart`。Round 4 的 endpoint 上线后所有 agent 立刻可用。
- MCP 客户端升级（同事）：管理员发新的 `.tgz` → 同事 `npm i -g ./kanban-mcp-X.Y.Z.tgz` 覆盖旧版本。
- Token 轮换：每 365 天到期，Settings 重生成一次即可。
