# 迭代变更记录

---

## [2026-05-31] 登录/注册/认证模块安全加固

### 背景
审查发现三类问题：
1. 登录页「忘记密码？」链接是死链（后端接口已有，前端页面从未创建）
2. 密码强度仅要求 6 位纯长度，无复杂度要求
3. 邮箱验证为软模式，未验证用户可正常使用所有功能

### P0 · 修复死链

**新建文件：**
- `client/src/pages/ForgotPassword.tsx`：邮件发送表单，成功后显示提示（防枚举：无论邮箱是否存在都返回成功）
- `client/src/pages/ResetPassword.tsx`：读取 URL `?token=` 参数，验证后设置新密码，成功跳转 `/login`
- `client/src/pages/VerifyEmail.tsx`：处理邮箱验证链接点击，支持重新发送

**修改文件：**
- `client/src/App.tsx`：新增三条路由 `/forgot-password`、`/reset-password`、`/verify-email`
- `client/src/services/api.ts`：新增 `authAPI.forgotPassword()` 和 `authAPI.resetPassword()`

### P1 · 密码强度增强

- `server/src/routes/auth.ts`：抽取 `passwordSchema`（8位 + 大写字母 + 数字），应用于注册、修改密码、重置密码
- `client/src/pages/Login.tsx`（RegisterForm）：同步前端校验规则
- `client/src/pages/Register.tsx`：同步前端校验规则

### P2 · 邮箱验证强制化（当 EMAIL_VERIFICATION_ENABLED=true 时生效）

- `server/src/middleware/auth.ts`：未验证用户访问受保护接口返回 `403 { code: 'emailNotVerified' }`，豁免 `/auth/me`、`/auth/resend-verification`、`/auth/verify-email`
- `client/src/components/Layout.tsx`：`emailVerified=false` 时用全内容区阻断提示替代原顶部 banner，用户必须验证邮箱后才能看到 `<Outlet />`

---

> **用途**：记录每次 Claude Code 协作迭代的改动内容，供下次迭代快速恢复上下文，避免重复读码或引入冲突。
> 每次迭代结束后由 Claude 更新此文件。

---

## [2026-05-31] 看板布局优化 · 消除顶底空白

### 背景
看板视图（状态三列模式）内容区域顶部和底部各有一条约 30~70px 的空白，挤占了卡片展示区域。

### 根因
- 顶部：`.kanban-toolbar` 的 `margin-bottom: 20px` + `.kanban-board` 的 `padding-top: 16px` = 36px 间隙
- 底部：`.kanban-board` 使用硬编码 `height: calc(100vh - 240px)`，计算值偏大约 72px，导致底部空白
- 根本原因：内层 `<AntLayout>` 和 `<Content>` 未建立 flex 高度链，看板必须靠 calc() 硬算

### 改动文件

**`client/src/components/Layout.tsx`**
- 内层 `<AntLayout>`（Sider 右侧）加 `height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'`
- `<Content>` 加 `flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'`

**`client/src/pages/Kanban.tsx`**
- 第 497 行根 `<div>` 加 `style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}`

**`client/src/index.css`**
- `.kanban-board`：移除 `height: calc(100vh - 240px)`，改为 `flex: 1; min-height: 0`；顶底 padding 16px → 8px
- `.kanban-toolbar`：`margin-bottom` 20px → 8px
- `.quadrant-grid`：移除 `height: calc(100vh - 180px)`，改为 `flex: 1; min-height: 0`
- 移动端媒体查询：对应更新 kanban-board 和 quadrant-grid

### 预期收益
顶部节省约 28px，底部空白完全消除，卡片展示区域总计增加约 100px 纵向空间。

---

## 历史功能清单（截至 2026-05-31）

> 摘自 CLAUDE.md，便于快速检索现有能力边界

| 功能模块 | 说明 |
|---------|------|
| 认证 | 注册/登录/忘记密码/邮件重置/管理员强制重置（mustChangePassword） |
| 提醒调度 | node-cron 每分钟触发，支持 DAILY/WEEKLY/MONTHLY 递推 |
| 金额汇总 | `GET /api/items/summary`，SQL 聚合（非内存过滤） |
| 公告系统 | 已读追踪，targetUserIds/confirmations JSON 字段 |
| 项目管理 | Project 模型，CRUD + summary，看板/列表支持 projectId 筛选 |
| 分类/子状态 | 动态 Category 校验，SubStatus 管理 |
| LLM 报告 | DeepSeek/Qwen/ChatGLM，API Key 加密存储（AES-256-CTR） |
| Word/Excel 导出 | exportService.ts |
| 安全修复 | S1~S5/S8（详见 CLAUDE.md） |
| 看板视图 | 状态三列/按项目/按子状态/按分类/四象限矩阵，DnD 拖拽排序 |
| 部署 | 已部署阿里云，前端构建产物在 dist/，后端 Express.js |
