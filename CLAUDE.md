# 采购工作看板 — Claude Code 上下文

## 项目概述
内部采购部门工作看板 + 合同管理系统。Express.js + TypeScript 后端，SQLite 数据库（Prisma ORM），Vue.js 前端（已构建产物在 dist/）。

## 目录结构
```
contract-generator-deployment/
├── dist/                     # 前端构建产物（生产部署用）
└── server/
    ├── prisma/
    │   ├── schema.prisma     # 数据模型（改完必须 db push）
    │   └── seed.ts           # 种子数据（分类/子状态默认值）
    ├── src/
    │   ├── index.ts          # 入口：helmet/CORS/限流/路由/调度器
    │   ├── middleware/
    │   │   ├── auth.ts       # JWT 验证，注入 req.user (AuthUser)
    │   │   └── errorHandler.ts
    │   ├── routes/
    │   │   ├── auth.ts       # 注册/登录/忘记密码/重置密码/用户管理
    │   │   ├── items.ts      # 任务（含金额汇总 GET /summary）
    │   │   ├── departments.ts # 部门/公告/已读追踪
    │   │   ├── reminders.ts  # 提醒设置
    │   │   ├── experiences.ts # 经验记录
    │   │   ├── reports.ts    # AI 报告生成/导出
    │   │   ├── categories.ts # 分类管理
    │   │   └── subStatus.ts  # 子状态管理
    │   ├── services/
    │   │   ├── emailService.ts      # nodemailer 封装，SMTP 未配置降级为 console 日志
    │   │   ├── reminderScheduler.ts # node-cron 每分钟检查到期提醒
    │   │   ├── aiService.ts         # DeepSeek/Qwen/ChatGLM LLM 调用
    │   │   └── exportService.ts     # Word/Excel 导出
    │   └── utils/
    │       ├── env.ts        # 第一个 import，加载 .env 并验证 JWT_SECRET
    │       ├── crypto.ts     # AES-256-CTR 加密 API Key
    │       └── prisma.ts     # Prisma 单例
    ├── .env.example          # 所有环境变量模板（含 SMTP_* 说明）
    ├── deploy.sh             # 生产部署脚本
    └── package.json
```

## 重要架构约定

### 认证
- `utils/env.ts` 必须是 `index.ts` 的第一个 import（调用 dotenv.config() + 验证 JWT_SECRET）
- `authMiddleware` 注入完整 `AuthUser`（含 `mustChangePassword`）到 `req.user`，所有路由直接用，不再单独查库
- 强制改密流程：管理员 `POST /auth/users/:id/reset-password` → 设置临时密码 + `mustChangePassword=true` → 用户下次改密时自动清除

### 可见性与权限
- `buildItemWhere()` in items.ts 是 S3 安全修复的核心：用 `AND` 嵌套防止 OR 条件泄露全表
- 所有 `/:id` 资源读取都用 `findFirst + userId/deptId filter`，不用 `findUnique`

### 加密
- `encryptApiKey` / `decryptApiKey` in utils/crypto.ts：加密值前缀 `enc:`，未配置 ENCRYPTION_KEY 时透传明文（向后兼容）

### 提醒调度
- `calcNextRemindAt` 使用 do-while 跳过所有已过期时间点，防止服务重启后补发多封邮件
- 先更新 remindAt（状态持久化），再发邮件，防止重启双发

### 公告 JSON 字段
- `targetUserIds / linkedItemIds / confirmations / readBy` 全部用 `parseAnnouncement()` 解析后再响应

## 数据库变更流程
```bash
# 修改 schema.prisma 后执行：
cd server
npx prisma db push          # 应用到本地 SQLite
npx tsc --noEmit            # 验证 TypeScript
```

## 常用开发命令
```bash
cd server
npm run dev                 # tsx watch 热重载开发
npx prisma studio           # 可视化数据库
npx prisma db seed          # 写入默认分类/子状态
```

## 环境变量（参考 server/.env.example）
| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | ✅ | 至少 32 字符，启动时硬校验 |
| `DATABASE_URL` | ✅ | `file:./prisma/dev.db` |
| `ENCRYPTION_KEY` | 推荐 | 32 字节 hex，加密用户 API Key |
| `ALLOWED_ORIGINS` | 生产必填 | CORS 白名单，逗号分隔 |
| `FRONTEND_URL` | 推荐 | 密码重置邮件中的链接前缀 |
| `SMTP_HOST/PORT/USER/PASS` | 可选 | 未配置时邮件降级为 console 日志 |

## 已完成的主要安全修复（不要回退）
- S1: JWT_SECRET 启动硬校验
- S2: 部门接口 IDOR 修复（assertDeptAccess）
- S3: 任务列表 OR 条件泄露修复（buildItemWhere AND 嵌套）
- S4: 公告确认权限验证
- S5: 任务重排 userId 过滤
- S8: LLM API Key 加密存储

## 已实现的功能
- 忘记密码 / 邮件重置 / 管理员强制重置（mustChangePassword 流程）
- 提醒定时触发（node-cron，每分钟，支持 DAILY/WEEKLY/MONTHLY 递推）
- 金额汇总（`GET /api/items/summary`：合计/分类/状态/超预算明细）
- 公告已读追踪（`POST .../read`，`GET .../read-status`）
