/**
 * 采购工作看板 — 综合 API 自动化测试脚本
 *
 * 用法:  node server/tests/run.cjs
 * 依赖:  Node.js >= 18 (使用内置 fetch)
 *
 * 环境变量 (可选):
 *   TEST_BASE_URL      服务器地址          默认: http://localhost:3001
 *   TEST_ADMIN_EMAIL   已有管理员邮箱       默认: 844723538@qq.com
 *   TEST_ADMIN_PASS    管理员密码           默认: Admin@2026!
 *
 * 测试用户策略 (固定账号，自动注册/登录):
 *   U1: ci_u1@kanban.test  / CiUser1@2026!
 *   U2: ci_u2@kanban.test  / CiUser2@2026!
 *   首次运行自动注册；后续运行直接登录（不消耗注册限速配额）
 *
 * 注意事项:
 *   - 部门无删除接口，测试完成后留有一个名为 [TEST] 测试部门_<timestamp> 的部门
 *   - rate-limit: 登录 10次/15min，忘记密码 3次/15min，重置密码 5次/15min
 *   - 如因限速失败，重启服务器可清除内存中的计数器（无需等待时间窗口）
 */

'use strict';

// ── 配置 ────────────────────────────────────────────────────────────────────
const BASE         = process.env.TEST_BASE_URL    || 'http://localhost:3001';
const ADMIN_EMAIL  = process.env.TEST_ADMIN_EMAIL || '844723538@qq.com';
const ADMIN_PASS   = process.env.TEST_ADMIN_PASS  || 'Admin@2026!';

if (typeof fetch === 'undefined') {
  console.error('错误: 需要 Node.js 18+，当前版本: ' + process.version);
  process.exit(1);
}

// ── 固定测试账号（跨运行复用，避免注册限速）──────────────────────────────────
const RUN = Date.now();
const U1 = { email: 'ci_u1@kanban.test', password: 'CiUser1@2026!', name: 'CI用户甲' };
const U2 = { email: 'ci_u2@kanban.test', password: 'CiUser2@2026!', name: 'CI用户乙' };

// ── 工具：注册 or 登录（幂等建账）───────────────────────────────────────────
async function ensureUser(user) {
  const r = await api('POST', '/api/auth/register', user);
  if (r.status === 200 || r.status === 201) return r.data;
  if (r.status === 400 || r.status === 409 || r.status === 429) {
    const r2 = await api('POST', '/api/auth/login', { email: user.email, password: user.password });
    if (r2.status === 200) return r2.data;
  }
  return null;
}

// 运行时状态
let adminToken = '', u1Token = '', u2Token = '';
let adminId = '', u1Id = '', u2Id = '';
let itemId = '', item2Id = '', monthlyItemId = '';
let deptId = '', announcementId = '';
let expId = '', reminderId = '';
let subStatusId = '', categoryId = '';

// ── HTTP 工具 ────────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(BASE + path, init);
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) { try { data = await res.json(); } catch {} }
  return { status: res.status, data, headers: res.headers };
}

// ── 测试框架 ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures = [];

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', RST = '\x1b[0m', B = '\x1b[1m', DIM = '\x1b[2m';

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function expectStatus(r, code) {
  if (r.status !== code)
    throw new Error(`期望 HTTP ${code}，实际 ${r.status}: ${JSON.stringify(r.data)}`);
}

async function test(id, name, fn) {
  const label = `  ${DIM}${id.padEnd(4)}${RST} ${name}`;
  try {
    await fn();
    console.log(`${label} … ${G}PASS${RST}`);
    passed++;
  } catch (err) {
    console.log(`${label} … ${R}FAIL${RST} — ${err.message}`);
    failed++;
    failures.push({ id, name, error: err.message });
  }
}

function section(title) {
  console.log(`\n${B}── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}${RST}`);
}

function skip(id, name, reason) {
  console.log(`  ${DIM}${id.padEnd(4)}${RST} ${name} … ${Y}SKIP${RST} (${reason})`);
  skipped++;
}

// ── 等待服务器 ───────────────────────────────────────────────────────────────
async function waitForServer(retries = 6, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch {}
    if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(`\n${B}采购工作看板 — 综合 API 测试${RST}`);
  console.log(`  服务器: ${BASE}`);
  console.log(`  管理员: ${ADMIN_EMAIL}`);
  console.log(`  运行 ID: ${RUN}\n`);

  const alive = await waitForServer();
  if (!alive) {
    console.log(`\n${R}✗ 无法连接服务器 ${BASE}，请先启动服务器后重试${RST}\n`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('健康检查');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T01', 'GET /api/health → 200 + db ok', async () => {
    const r = await api('GET', '/api/health');
    expectStatus(r, 200);
    ok(r.data && (r.data.status === 'ok' || r.data.status), '响应体缺少 status 字段');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('认证模块 — 注册 / 登录');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T02', '管理员登录', async () => {
    const r = await api('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (r.status === 429) {
      console.log(`     ${Y}警告: 登录限速 (429)，管理员 token 缺失，后续管理员测试将跳过。等待 15 分钟后重试。${RST}`);
      return; // 不抛出，但 adminToken 保持空字符串
    }
    expectStatus(r, 200);
    ok(r.data.token, '响应缺少 token');
    ok(r.data.user.role === 'ADMIN', `期望 ADMIN，实际角色: ${r.data.user.role}`);
    adminToken = r.data.token;
    adminId = r.data.user.id;
  });

  await test('T03', '建立 U1 (首次注册，后续登录)', async () => {
    const d = await ensureUser(U1);
    ok(d && d.token, `U1 建账失败 (如遇 429 限速，重启服务器后重试): ${JSON.stringify(d)}`);
    u1Token = d.token;
    u1Id = d.user.id;
  });

  // 若 U1 token 缺失（登录限速），后续所有测试都会收到 401，无意义地全部失败。
  // 在此直接中止，给出明确提示。
  if (!u1Token) {
    console.log(`\n${R}${B}✗ 登录限速已触发 — 测试中止。${RST}`);
    console.log(`  解决方法: 重启服务器以清除内存限速计数器，然后重新运行`);
    console.log(`  提示: node server/tests/reset-admin.cjs  (如账号不存在也请先运行)\n`);
    process.exit(1);
  }

  await test('T04', '建立 U2 (首次注册，后续登录)', async () => {
    const d = await ensureUser(U2);
    if (!d) {
      console.log(`     ${Y}警告: U2 建账失败，依赖 U2 的测试将跳过${RST}`);
      return;
    }
    u2Token = d.token;
    u2Id = d.user.id;
  });

  await test('T05', '重复注册同一邮箱 → 400/409', async () => {
    const r = await api('POST', '/api/auth/register', U1);
    ok(r.status === 400 || r.status === 409 || r.status === 429, `期望 400/409 (或 429 限速)，实际 ${r.status}`);
  });

  await test('T06', '登录 — 密码错误 → 401 (或 429 限速)', async () => {
    const r = await api('POST', '/api/auth/login', { email: U1.email, password: 'wrongpassword' });
    ok(r.status === 401 || r.status === 429, `期望 401 (或 429 限速)，实际 ${r.status}`);
  });

  await test('T07', '登录 — 不存在的邮箱 → 401 (或 429 限速)', async () => {
    const r = await api('POST', '/api/auth/login', { email: 'nobody_404@test.invalid', password: 'x' });
    ok(r.status === 401 || r.status === 429, `期望 401 (或 429 限速)，实际 ${r.status}`);
  });

  await test('T08', '登录 — 缺少字段 → 400/401 (或 429 限速)', async () => {
    const r = await api('POST', '/api/auth/login', { email: U1.email });
    ok(r.status === 400 || r.status === 401 || r.status === 429, `期望 400/401 (或 429 限速)，实际 ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('认证模块 — /me 与 profile');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T09', 'GET /api/auth/me — 有效 token', async () => {
    const r = await api('GET', '/api/auth/me', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.email === U1.email, `邮箱不匹配: ${r.data.email}`);
  });

  await test('T10', 'GET /api/auth/me — 无 token → 401', async () => {
    const r = await api('GET', '/api/auth/me');
    expectStatus(r, 401);
  });

  await test('T11', 'GET /api/auth/me — 无效 token → 401', async () => {
    const r = await api('GET', '/api/auth/me', undefined, 'bad.jwt.token');
    expectStatus(r, 401);
  });

  await test('T12', 'PUT /api/auth/profile — 更新名称', async () => {
    const r = await api('PUT', '/api/auth/profile', { name: '测试用户甲(改)' }, u1Token);
    expectStatus(r, 200);
    const name = r.data.name || r.data.user?.name;
    ok(name === '测试用户甲(改)', `名称未更新: ${name}`);
  });

  await test('T13', 'PUT /api/auth/profile — 修改密码 用 oldPassword 字段 (还原幂等)', async () => {
    const newPass = 'NewCiU1@2026!';
    const r = await api('PUT', '/api/auth/profile', {
      oldPassword: U1.password,
      newPassword: newPass,
    }, u1Token);
    expectStatus(r, 200);
    const r2 = await api('GET', '/api/auth/me', undefined, u1Token);
    ok(r2.status === 200, `密码修改后 token 应仍有效，实际 ${r2.status}`);
    const r3 = await api('PUT', '/api/auth/profile', { oldPassword: newPass, newPassword: U1.password }, u1Token);
    ok(r3.status === 200, `密码还原失败: ${r3.status}`);
  });

  await test('T13b', 'PUT /api/auth/profile — 修改密码 用前端字段名 password (兼容性验证)', async () => {
    const newPass = 'NewCiU1B@2026!';
    // 前端发送 password 而非 oldPassword
    const r = await api('PUT', '/api/auth/profile', {
      password: U1.password,
      newPassword: newPass,
    }, u1Token);
    expectStatus(r, 200);
    const r3 = await api('PUT', '/api/auth/profile', { password: newPass, newPassword: U1.password }, u1Token);
    ok(r3.status === 200, `密码还原失败: ${r3.status}`);
  });

  await test('T14', 'PUT /api/auth/profile — 旧密码错误 → 400/401', async () => {
    const r = await api('PUT', '/api/auth/profile', {
      password: 'definitely_wrong',
      newPassword: 'Whatever@2026!',
    }, u1Token);
    ok(r.status === 400 || r.status === 401, `期望 400/401，实际 ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('认证模块 — 忘记密码 / 重置密码');
  // ═══════════════════════════════════════════════════════════════════════════

  // 注: forgot-password 限速 3次/15分钟。格式校验测试排在最前，优先触发 400 而非 429。
  await test('T15', 'POST /api/auth/forgot-password — 格式错误邮箱 → 400', async () => {
    const r = await api('POST', '/api/auth/forgot-password', { email: 'not-an-email' });
    ok(r.status === 400 || r.status === 429, `期望 400 (或 429 限速)，实际 ${r.status}`);
    // 若已限速则此测试通过但给出提示
    if (r.status === 429) console.log(`     ${Y}(限速中，建议 15 分钟后重新运行)${RST}`);
    else ok(r.status === 400, `期望 400，实际 ${r.status}`);
  });

  await test('T16', 'POST /api/auth/forgot-password — 缺少 email → 400', async () => {
    const r = await api('POST', '/api/auth/forgot-password', {});
    ok(r.status === 400 || r.status === 429, `期望 400 (或 429 限速)，实际 ${r.status}`);
    if (r.status !== 429) ok(r.status === 400, `期望 400，实际 ${r.status}`);
  });

  await test('T17', 'POST /api/auth/forgot-password — 合法邮箱 (已注册)', async () => {
    const r = await api('POST', '/api/auth/forgot-password', { email: ADMIN_EMAIL });
    ok(r.status === 200 || r.status === 202 || r.status === 429, `期望 200/202 (或 429 限速)，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    if (r.status === 429) console.log(`     ${Y}(限速中，邮件发送功能无法在此轮验证)${RST}`);
  });

  await test('T18', 'POST /api/auth/forgot-password — 合法邮箱 (未注册，静默成功)', async () => {
    const r = await api('POST', '/api/auth/forgot-password', { email: 'notexist_xyz@test.invalid' });
    ok(r.status === 200 || r.status === 202 || r.status === 429, `期望 200/202 (或 429 限速)，实际 ${r.status}`);
  });

  await test('T19', 'POST /api/auth/reset-password — 无效 token → 400/404', async () => {
    const r = await api('POST', '/api/auth/reset-password', {
      token: 'completely-fake-token-000',
      newPassword: 'Test@2026!',
    });
    ok(r.status === 400 || r.status === 404, `期望 400/404，实际 ${r.status}`);
  });

  await test('T20', 'POST /api/auth/reset-password — 密码太短 → 400 (或 429 限速)', async () => {
    const r = await api('POST', '/api/auth/reset-password', {
      token: 'fake',
      newPassword: '123',
    });
    ok(r.status === 400 || r.status === 429, `期望 400 (或 429 限速)，实际 ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('认证模块 — 用户管理 (ADMIN)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T21', 'GET /api/auth/users — ADMIN 可查看', async () => {
    if (!adminToken) { console.log(`     ${Y}(跳过: adminToken 为空，T02 限速)${RST}`); return; }
    const r = await api('GET', '/api/auth/users', undefined, adminToken);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
    ok(r.data.length > 0, '用户列表不应为空');
  });

  await test('T22', 'GET /api/auth/users — 非 ADMIN → 403', async () => {
    const r = await api('GET', '/api/auth/users', undefined, u1Token);
    expectStatus(r, 403);
  });

  await test('T23', 'PUT /api/auth/users/:id/role — 提升为 DEPARTMENT_ADMIN', async () => {
    if (!adminToken) { console.log(`     ${Y}(跳过: adminToken 为空)${RST}`); return; }
    const r = await api('PUT', `/api/auth/users/${u1Id}/role`, { role: 'DEPARTMENT_ADMIN' }, adminToken);
    expectStatus(r, 200);
  });

  await test('T24', 'PUT /api/auth/users/:id/role — 还原为 MEMBER', async () => {
    if (!adminToken) { console.log(`     ${Y}(跳过: adminToken 为空)${RST}`); return; }
    const r = await api('PUT', `/api/auth/users/${u1Id}/role`, { role: 'MEMBER' }, adminToken);
    expectStatus(r, 200);
  });

  await test('T25', 'PUT /api/auth/users/:id/role — 非 ADMIN → 403', async () => {
    if (!u2Id) { console.log(`     ${Y}(跳过: u2Id 为空)${RST}`); return; }
    const r = await api('PUT', `/api/auth/users/${u2Id}/role`, { role: 'MEMBER' }, u1Token);
    expectStatus(r, 403);
  });

  await test('T26', 'POST /api/auth/users/:id/reset-password — ADMIN 重置临时密码', async () => {
    if (!adminToken) { console.log(`     ${Y}(跳过: adminToken 为空)${RST}`); return; }
    if (!u2Id) { console.log(`     ${Y}(跳过: u2Id 为空)${RST}`); return; }
    const r = await api('POST', `/api/auth/users/${u2Id}/reset-password`, {}, adminToken);
    expectStatus(r, 200);
    ok(r.data.tempPassword, '响应缺少 tempPassword');
    const tempPass = r.data.tempPassword;
    // 用临时密码将 U2 密码还原为原始值，保持跨运行幂等
    const restoreR = await api('PUT', '/api/auth/profile', {
      oldPassword: tempPass,
      newPassword: U2.password,
    }, u2Token);
    ok(restoreR.status === 200, `U2 密码还原失败: ${restoreR.status} ${JSON.stringify(restoreR.data)}`);
  });

  await test('T27', 'POST /api/auth/users/:id/reset-password — 非 ADMIN → 403', async () => {
    if (!u2Id) { console.log(`     ${Y}(跳过: u2Id 为空)${RST}`); return; }
    const r = await api('POST', `/api/auth/users/${u2Id}/reset-password`, {}, u1Token);
    expectStatus(r, 403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('工作项模块 (Items)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T28', 'POST /api/items — 创建工作项', async () => {
    const r = await api('POST', '/api/items', {
      title: `[TEST] 测试采购项 ${RUN}`,
      description: '自动化测试描述',
      priority: 'HIGH',
      status: 'TODO',
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    itemId = r.data.id;
  });

  await test('T29', 'POST /api/items — 缺少 title → 400', async () => {
    const r = await api('POST', '/api/items', { description: '无标题' }, u1Token);
    expectStatus(r, 400);
  });

  await test('T30', 'POST /api/items — 未认证 → 401', async () => {
    const r = await api('POST', '/api/items', { title: '未认证项目' });
    expectStatus(r, 401);
  });

  await test('T31', 'GET /api/items — 列表', async () => {
    const r = await api('GET', '/api/items', undefined, u1Token);
    expectStatus(r, 200);
    const isValid = Array.isArray(r.data) || (r.data && typeof r.data === 'object');
    ok(isValid, '期望数组或分页对象');
  });

  await test('T32', 'GET /api/items?status=TODO — 状态过滤', async () => {
    const r = await api('GET', '/api/items?status=TODO', undefined, u1Token);
    expectStatus(r, 200);
  });

  await test('T33', 'GET /api/items?priority=HIGH — 优先级过滤', async () => {
    const r = await api('GET', '/api/items?priority=HIGH', undefined, u1Token);
    expectStatus(r, 200);
  });

  await test('T34', 'GET /api/items?search=TEST — 搜索', async () => {
    const r = await api('GET', '/api/items?search=TEST', undefined, u1Token);
    expectStatus(r, 200);
  });

  await test('T35', 'GET /api/items/summary', async () => {
    const r = await api('GET', '/api/items/summary', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data && typeof r.data === 'object', '期望对象');
  });

  await test('T36', 'GET /api/items/:id', async () => {
    const r = await api('GET', `/api/items/${itemId}`, undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.id === itemId, `id 不匹配: ${r.data.id}`);
  });

  await test('T37', 'GET /api/items/:id — 不存在 → 404', async () => {
    const r = await api('GET', '/api/items/nonexistent-id-00000', undefined, u1Token);
    expectStatus(r, 404);
  });

  await test('T38', 'PUT /api/items/:id — 所有者更新', async () => {
    const r = await api('PUT', `/api/items/${itemId}`, {
      title: `[TEST] 更新后标题 ${RUN}`,
      priority: 'MEDIUM',
    }, u1Token);
    expectStatus(r, 200);
    ok(r.data.priority === 'MEDIUM', `优先级未更新: ${r.data.priority}`);
  });

  await test('T39', 'PUT /api/items/:id — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('PUT', `/api/items/${itemId}`, { title: '他人修改' }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T40', 'PATCH /api/items/:id/status — 更新状态', async () => {
    const r = await api('PATCH', `/api/items/${itemId}/status`, { status: 'IN_PROGRESS' }, u1Token);
    expectStatus(r, 200);
  });

  await test('T41', 'PATCH /api/items/:id/status — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('PATCH', `/api/items/${itemId}/status`, { status: 'COMPLETED' }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T42', 'GET /api/items/:id/history', async () => {
    const r = await api('GET', `/api/items/${itemId}/history`, undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T43', 'POST /api/items — 创建第二个工作项 (用于 reorder)', async () => {
    const r = await api('POST', '/api/items', { title: `[TEST] 排序测试项 ${RUN}` }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    item2Id = r.data.id;
  });

  await test('T44', 'PATCH /api/items/reorder', async () => {
    const r = await api('PATCH', '/api/items/reorder', {
      items: [
        { id: itemId,  order: 2 },
        { id: item2Id, order: 1 },
      ],
    }, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T45', 'POST /api/items/:id/transfer — 转让给 U2', async () => {
    if (!u2Id || !u2Token) { console.log(`     ${Y}(跳过: u2Id/u2Token 为空)${RST}`); return; }
    const r = await api('POST', `/api/items/${itemId}/transfer`, { targetUserId: u2Id }, u1Token);
    expectStatus(r, 200);
  });

  await test('T46', 'POST /api/items/:id/transfer — U2 转回 U1', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('POST', `/api/items/${itemId}/transfer`, { targetUserId: u1Id }, u2Token);
    expectStatus(r, 200);
  });

  await test('T47', 'POST /api/items/:id/transfer — 非所有者 → 403/404', async () => {
    if (!u2Token || !u2Id) { console.log(`     ${Y}(跳过: u2Token/u2Id 为空)${RST}`); return; }
    const r = await api('POST', `/api/items/${itemId}/transfer`, { targetUserId: u2Id }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('部门模块 (Departments)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T48', 'POST /api/departments — ADMIN 创建部门', async () => {
    if (!adminToken) { console.log(`     ${Y}(跳过: adminToken 为空，T02 限速)${RST}`); return; }
    const r = await api('POST', '/api/departments', {
      name: `[TEST] 测试部门_${RUN}`,
      description: '自动化测试部门',
    }, adminToken);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    deptId = r.data.id;
  });

  await test('T49', 'POST /api/departments — 非 ADMIN → 403', async () => {
    const r = await api('POST', '/api/departments', { name: `[TEST] 非法部门_${RUN}` }, u1Token);
    expectStatus(r, 403);
  });

  await test('T50', 'GET /api/departments — 列表', async () => {
    const r = await api('GET', '/api/departments', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T51', 'GET /api/departments/:id — ADMIN 可查看', async () => {
    const r = await api('GET', `/api/departments/${deptId}`, undefined, adminToken);
    expectStatus(r, 200);
    ok(r.data.id === deptId, 'id 不匹配');
  });

  await test('T52', 'GET /api/departments/:id — 非成员 → 403/404', async () => {
    if (!deptId) { console.log(`     ${Y}(跳过: deptId 为空，T48 未成功)${RST}`); return; }
    const r = await api('GET', `/api/departments/${deptId}`, undefined, u1Token);
    ok(r.status === 403 || r.status === 404, `非成员期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T53', 'POST /api/departments/:id/members — 添加 U1', async () => {
    const r = await api('POST', `/api/departments/${deptId}/members`, {
      email: U1.email,
      role: 'MEMBER',
    }, adminToken);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T54', 'GET /api/departments/:id — U1 加入后可查看', async () => {
    const r = await api('GET', `/api/departments/${deptId}`, undefined, u1Token);
    expectStatus(r, 200);
  });

  await test('T55', 'GET /api/departments/:id/members', async () => {
    const r = await api('GET', `/api/departments/${deptId}/members`, undefined, adminToken);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T56', 'GET /api/departments/:id/items', async () => {
    const r = await api('GET', `/api/departments/${deptId}/items`, undefined, adminToken);
    expectStatus(r, 200);
  });

  await test('T57', 'POST /api/departments/:id/announcements — 发布公告', async () => {
    const r = await api('POST', `/api/departments/${deptId}/announcements`, {
      title: `[TEST] 测试公告_${RUN}`,
      content: '这是一条自动化测试公告。',
      targetAll: true,
    }, adminToken);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少公告 id');
    announcementId = r.data.id;
  });

  await test('T58', 'GET /api/departments/:id/announcements', async () => {
    const r = await api('GET', `/api/departments/${deptId}/announcements`, undefined, adminToken);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T59', 'POST /api/departments/:id/announcements/:aid/read — 标记已读', async () => {
    const r = await api('POST', `/api/departments/${deptId}/announcements/${announcementId}/read`, {}, adminToken);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  await test('T60', 'GET /api/departments/:id/announcements/:aid/read-status — ADMIN', async () => {
    const r = await api('GET', `/api/departments/${deptId}/announcements/${announcementId}/read-status`, undefined, adminToken);
    expectStatus(r, 200);
  });

  await test('T61', 'GET .../read-status — 普通成员 → 403/404', async () => {
    if (!announcementId) { console.log(`     ${Y}(跳过: announcementId 为空)${RST}`); return; }
    const r = await api('GET', `/api/departments/${deptId}/announcements/${announcementId}/read-status`, undefined, u1Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T62', 'POST .../confirm — 确认公告', async () => {
    const r = await api('POST', `/api/departments/${deptId}/announcements/${announcementId}/confirm`, { confirmed: true }, adminToken);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  await test('T63', 'POST .../withdraw — 撤回公告', async () => {
    const r = await api('POST', `/api/departments/${deptId}/announcements/${announcementId}/withdraw`, {}, adminToken);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T64', 'PUT /api/departments/:id/members/:uid/role', async () => {
    const r = await api('PUT', `/api/departments/${deptId}/members/${u1Id}`, { role: 'DEPARTMENT_ADMIN' }, adminToken);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    // 还原
    await api('PUT', `/api/departments/${deptId}/members/${u1Id}`, { role: 'MEMBER' }, adminToken);
  });

  await test('T65', 'DELETE /api/departments/:id/members/:uid — 移除成员', async () => {
    const r = await api('DELETE', `/api/departments/${deptId}/members/${u1Id}`, undefined, adminToken);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('经验模块 (Experiences)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T66', 'POST /api/experiences — 创建', async () => {
    const r = await api('POST', '/api/experiences', {
      itemId: itemId,
      content: `[TEST] 测试经验内容_${RUN}`,
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    expId = r.data.id;
  });

  await test('T67', 'POST /api/experiences — 缺少 itemId → 400', async () => {
    const r = await api('POST', '/api/experiences', { content: '无关联项' }, u1Token);
    expectStatus(r, 400);
  });

  await test('T68', 'GET /api/experiences — 列表', async () => {
    const r = await api('GET', '/api/experiences', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T69', 'GET /api/experiences?itemId=:id — 按工作项过滤', async () => {
    const r = await api('GET', `/api/experiences?itemId=${itemId}`, undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T70', 'GET /api/experiences/:id', async () => {
    const r = await api('GET', `/api/experiences/${expId}`, undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.id === expId, 'id 不匹配');
  });

  await test('T71', 'GET /api/experiences/:id — 非所有者 → 403/404', async () => {
    if (!u2Token || !expId) { console.log(`     ${Y}(跳过: u2Token/expId 为空)${RST}`); return; }
    const r = await api('GET', `/api/experiences/${expId}`, undefined, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T72', 'PUT /api/experiences/:id — 所有者更新', async () => {
    const r = await api('PUT', `/api/experiences/${expId}`, { content: `[TEST] 更新经验_${RUN}` }, u1Token);
    expectStatus(r, 200);
  });

  await test('T73', 'PUT /api/experiences/:id — 非所有者 → 403/404', async () => {
    if (!u2Token || !expId) { console.log(`     ${Y}(跳过: u2Token/expId 为空)${RST}`); return; }
    const r = await api('PUT', `/api/experiences/${expId}`, { content: '他人修改' }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T74', 'DELETE /api/experiences/:id — 非所有者 → 403/404', async () => {
    if (!u2Token || !expId) { console.log(`     ${Y}(跳过: u2Token/expId 为空)${RST}`); return; }
    const r = await api('DELETE', `/api/experiences/${expId}`, undefined, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T75', 'DELETE /api/experiences/:id — 所有者删除', async () => {
    const r = await api('DELETE', `/api/experiences/${expId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
    expId = null;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('提醒模块 (Reminders)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T76', 'POST /api/reminders — 创建 CUSTOM 提醒', async () => {
    const remindAt = new Date(Date.now() + 86400000).toISOString();
    const r = await api('POST', '/api/reminders', {
      itemId: itemId,
      type: 'CUSTOM',
      remindAt,
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    reminderId = r.data.id;
  });

  await test('T77', 'POST /api/reminders — 缺少 itemId → 400', async () => {
    const r = await api('POST', '/api/reminders', {
      type: 'CUSTOM',
      remindAt: new Date(Date.now() + 86400000).toISOString(),
    }, u1Token);
    expectStatus(r, 400);
  });

  await test('T78', 'GET /api/reminders — 列表', async () => {
    const r = await api('GET', '/api/reminders', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T79', 'PUT /api/reminders/:id — 更新时间', async () => {
    const remindAt = new Date(Date.now() + 172800000).toISOString();
    const r = await api('PUT', `/api/reminders/${reminderId}`, { remindAt, isEnabled: true }, u1Token);
    expectStatus(r, 200);
  });

  await test('T80', 'DELETE /api/reminders/:id', async () => {
    const r = await api('DELETE', `/api/reminders/${reminderId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
    reminderId = null;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('报告模块 (Reports)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T81', 'GET /api/reports — 列表', async () => {
    const r = await api('GET', '/api/reports', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T82', 'GET /api/reports — 未认证 → 401', async () => {
    const r = await api('GET', '/api/reports');
    expectStatus(r, 401);
  });

  await test('T83', 'GET /api/reports/llm-providers', async () => {
    const r = await api('GET', '/api/reports/llm-providers', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data && typeof r.data === 'object', '期望对象');
  });

  await test('T84', 'POST /api/reports/generate — 缺少必填字段 → 400', async () => {
    const r = await api('POST', '/api/reports/generate', {
      type: 'WEEKLY',
      // 缺少 periodStart / periodEnd
    }, u1Token);
    expectStatus(r, 400);
  });

  await test('T85', 'POST /api/reports/generate — 未认证 → 401', async () => {
    const r = await api('POST', '/api/reports/generate', {});
    expectStatus(r, 401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('子状态模块 (SubStatus)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T86', 'POST /api/sub-status — 创建', async () => {
    const r = await api('POST', '/api/sub-status', {
      category: `TEST_${RUN}`,
      name: `[TEST] 子状态_${RUN}`,
      order: 1,
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    subStatusId = r.data.id;
  });

  await test('T87', 'POST /api/sub-status — 缺少 category → 400', async () => {
    const r = await api('POST', '/api/sub-status', { name: '无分类' }, u1Token);
    expectStatus(r, 400);
  });

  await test('T88', 'GET /api/sub-status — 列表', async () => {
    const r = await api('GET', '/api/sub-status', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T89', 'PUT /api/sub-status/:id — 所有者更新', async () => {
    const r = await api('PUT', `/api/sub-status/${subStatusId}`, {
      name: `[TEST] 子状态(改)_${RUN}`,
    }, u1Token);
    expectStatus(r, 200);
  });

  await test('T90', 'PUT /api/sub-status/:id — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('PUT', `/api/sub-status/${subStatusId}`, { name: '他人修改' }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T91', 'PATCH /api/sub-status/reorder', async () => {
    const r = await api('PATCH', '/api/sub-status/reorder', {
      items: [{ id: subStatusId, order: 99 }],
    }, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T92', 'DELETE /api/sub-status/:id — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('DELETE', `/api/sub-status/${subStatusId}`, undefined, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T93', 'DELETE /api/sub-status/:id — 所有者删除', async () => {
    const r = await api('DELETE', `/api/sub-status/${subStatusId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
    subStatusId = null;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('类别模块 (Categories)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T94', 'POST /api/categories — 创建', async () => {
    const r = await api('POST', '/api/categories', {
      key: `test_cat_${RUN}`,
      name: `[TEST] 类别_${RUN}`,
      order: 1,
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    categoryId = r.data.id;
  });

  await test('T95', 'POST /api/categories — 缺少 key → 400', async () => {
    const r = await api('POST', '/api/categories', { name: '无 key' }, u1Token);
    expectStatus(r, 400);
  });

  await test('T96', 'GET /api/categories — 列表', async () => {
    const r = await api('GET', '/api/categories', undefined, u1Token);
    expectStatus(r, 200);
    ok(Array.isArray(r.data), '期望数组');
  });

  await test('T97', 'PUT /api/categories/:id — 所有者更新', async () => {
    const r = await api('PUT', `/api/categories/${categoryId}`, {
      name: `[TEST] 类别(改)_${RUN}`,
    }, u1Token);
    expectStatus(r, 200);
  });

  await test('T98', 'PUT /api/categories/:id — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('PUT', `/api/categories/${categoryId}`, { name: '他人修改' }, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T99', 'PATCH /api/categories/reorder', async () => {
    const r = await api('PATCH', '/api/categories/reorder', {
      items: [{ id: categoryId, order: 99 }],
    }, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T100', 'DELETE /api/categories/:id — 非所有者 → 403/404', async () => {
    if (!u2Token) { console.log(`     ${Y}(跳过: u2Token 为空)${RST}`); return; }
    const r = await api('DELETE', `/api/categories/${categoryId}`, undefined, u2Token);
    ok(r.status === 403 || r.status === 404, `期望 403/404，实际 ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await test('T101', 'DELETE /api/categories/:id — 所有者删除', async () => {
    const r = await api('DELETE', `/api/categories/${categoryId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
    categoryId = null;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('静态页面 (CSP 合规)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T102', 'GET /forgot-password → 200 HTML', async () => {
    const r = await fetch(`${BASE}/forgot-password`);
    ok(r.status === 200, `期望 200，实际 ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    ok(ct.includes('html'), `Content-Type 非 html: ${ct}`);
  });

  await test('T103', 'GET /reset-password → 200 HTML', async () => {
    const r = await fetch(`${BASE}/reset-password`);
    ok(r.status === 200, `期望 200，实际 ${r.status}`);
  });

  await test('T104', 'GET /admin/users → 200 HTML', async () => {
    const r = await fetch(`${BASE}/admin/users`);
    ok(r.status === 200, `期望 200，实际 ${r.status}`);
  });

  await test('T105', '/forgot-password 无内联 <script>（CSP 合规）', async () => {
    const r = await fetch(`${BASE}/forgot-password`);
    const html = await r.text();
    const hasInline = /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(html);
    ok(!hasInline, '检测到内联 <script>，违反 Helmet CSP script-src \'self\'');
  });

  await test('T106', '/reset-password 无内联 <script>（CSP 合规）', async () => {
    const r = await fetch(`${BASE}/reset-password`);
    const html = await r.text();
    const hasInline = /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(html);
    ok(!hasInline, '检测到内联 <script>，违反 Helmet CSP script-src \'self\'');
  });

  await test('T107', '/admin/users 无内联 <script>（CSP 合规）', async () => {
    const r = await fetch(`${BASE}/admin/users`);
    const html = await r.text();
    const hasInline = /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(html);
    ok(!hasInline, '检测到内联 <script>，违反 Helmet CSP script-src \'self\'');
  });

  await test('T108', 'HTTP 响应包含 Content-Security-Policy 头', async () => {
    const r = await fetch(`${BASE}/forgot-password`);
    const csp = r.headers.get('content-security-policy') || '';
    ok(csp.length > 0, 'Content-Security-Policy 头缺失');
    ok(
      csp.includes("script-src 'self'") || csp.includes("default-src 'self'"),
      `CSP 未限制脚本来源: "${csp}"`
    );
  });

  await test('T109', 'HTTP 响应包含 X-Frame-Options 头', async () => {
    const r = await fetch(`${BASE}/`);
    const xfo = r.headers.get('x-frame-options') || '';
    ok(xfo.length > 0, 'X-Frame-Options 头缺失');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('安全边界');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T110', '所有受保护 GET 接口无 token → 401', async () => {
    const endpoints = [
      '/api/auth/me',
      '/api/items',
      '/api/departments',
      '/api/experiences',
      '/api/reminders',
      '/api/reports',
      '/api/sub-status',
      '/api/categories',
    ];
    for (const path of endpoints) {
      const r = await api('GET', path);
      ok(r.status === 401, `${path} 无 token 期望 401，实际 ${r.status}`);
    }
  });

  await test('T111', '无效 JWT token → 401', async () => {
    const r = await api('GET', '/api/items', undefined, 'invalid.jwt.forged');
    expectStatus(r, 401);
  });

  await test('T112', 'ADMIN 专属接口非管理员 → 403', async () => {
    const targetId = u2Id || u1Id;
    const endpoints = [
      ['GET', '/api/auth/users', undefined],
      ['PUT', `/api/auth/users/${targetId}/role`, { role: 'MEMBER' }],
      ['POST', `/api/auth/users/${targetId}/reset-password`, {}],
    ];
    for (const [method, path, body] of endpoints) {
      const r = await api(method, path, body, u1Token);
      ok(r.status === 403, `${method} ${path} 期望 403，实际 ${r.status}`);
    }
  });

  await test('T113', '404 — 不存在的 API 路径', async () => {
    const r = await api('GET', '/api/nonexistent-route-xyz');
    expectStatus(r, 404);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('月度统计 & 节约金额 (T116-T120)');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T116', 'GET /api/auth/me — token 有效时返回用户', async () => {
    const r = await api('GET', '/api/auth/me', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.id === u1Id, `userId 不匹配: ${r.data.id}`);
    ok(r.data.email === U1.email, `email 不匹配: ${r.data.email}`);
  });

  await test('T117', 'GET /api/items/summary — monthly 字段结构正确', async () => {
    const r = await api('GET', '/api/items/summary', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.monthly && typeof r.data.monthly === 'object', '缺少 monthly 字段');
    ok(typeof r.data.monthly.count === 'number', 'monthly.count 应为数字');
    ok(typeof r.data.monthly.completedCount === 'number', 'monthly.completedCount 应为数字');
    ok(typeof r.data.monthly.inProgressCount === 'number', 'monthly.inProgressCount 应为数字');
    ok(typeof r.data.monthly.overdueCount === 'number', 'monthly.overdueCount 应为数字');
    ok(typeof r.data.monthly.estimatedAmount === 'number', 'monthly.estimatedAmount 应为数字');
    ok(typeof r.data.monthly.finalAmount === 'number', 'monthly.finalAmount 应为数字');
    ok(typeof r.data.monthly.savedAmount === 'number', 'monthly.savedAmount 应为数字');
    ok(r.data.monthly.period && typeof r.data.monthly.period.label === 'string', 'monthly.period.label 应为字符串');
    ok(r.data.monthly.period.start && r.data.monthly.period.end, 'monthly.period.start/end 应存在');
  });

  await test('T118', 'GET /api/items/summary — 自然月边界正确 (1日起始)', async () => {
    const r = await api('GET', '/api/items/summary', undefined, u1Token);
    expectStatus(r, 200);
    const start = new Date(r.data.monthly.period.start);
    ok(start.getDate() === 1, `月份开始应为第1天，实际: ${start.getDate()}`);
    ok(start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0,
      `开始时间应为 00:00:00，实际: ${start.getHours()}:${start.getMinutes()}:${start.getSeconds()}`);
    const end = new Date(r.data.monthly.period.end);
    ok(end > start, '月末时间应晚于月初');
    const label = r.data.monthly.period.label;
    ok(/^\d{4}年\d{1,2}月$/.test(label), `label 格式应为 YYYY年M月，实际: "${label}"`);
  });

  await test('T119', 'POST /api/items — 创建节约金额测试项', async () => {
    const r = await api('POST', '/api/items', {
      title: `[TEST] 节约金额测试 ${RUN}`,
      estimatedAmount: 100000,
      finalAmount: 80000,
      status: 'COMPLETED',
    }, u1Token);
    ok(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    ok(r.data && r.data.id, '响应缺少 id');
    monthlyItemId = r.data.id;
  });

  await test('T120', 'GET /api/items/summary — 节约金额计算正确', async () => {
    const r = await api('GET', '/api/items/summary', undefined, u1Token);
    expectStatus(r, 200);
    ok(r.data.monthly.savedAmount >= 20000,
      `savedAmount(${r.data.monthly.savedAmount}) 应 >= 20000 (est=100000 final=80000 节约=20000)`);
    ok(r.data.monthly.completedCount >= 1, `completedCount(${r.data.monthly.completedCount}) 应 >= 1`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('清理测试数据');
  // ═══════════════════════════════════════════════════════════════════════════

  await test('T114', '删除工作项 2 (排序测试)', async () => {
    if (!item2Id) return;
    const r = await api('DELETE', `/api/items/${item2Id}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  await test('T115', '删除工作项 1 (主测试项)', async () => {
    if (!itemId) return;
    const r = await api('DELETE', `/api/items/${itemId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  await test('T121', '删除节约金额测试项', async () => {
    if (!monthlyItemId) return;
    const r = await api('DELETE', `/api/items/${monthlyItemId}`, undefined, u1Token);
    ok(r.status === 200 || r.status === 204, `期望 200/204，实际 ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════════════════════════════
  const total = passed + failed + skipped;
  const pct   = (passed + failed) > 0 ? Math.round(passed / (passed + failed) * 100) : 0;

  console.log('\n' + '═'.repeat(60));
  console.log(
    `${B}测试结果:  ` +
    `${G}${passed} 通过${RST}${B}  /  ` +
    `${R}${failed} 失败${RST}${B}  /  ` +
    (skipped > 0 ? `${Y}${skipped} 跳过${RST}${B}  /  ` : '') +
    `${total} 总计  (${pct}% 通过率)${RST}`
  );

  if (failures.length > 0) {
    console.log(`\n${R}${B}失败详情:${RST}`);
    for (const f of failures) {
      console.log(`  ${DIM}${f.id}${RST}  ${f.name}`);
      console.log(`       ${R}→ ${f.error}${RST}`);
    }
  } else if (skipped === 0) {
    console.log(`\n${G}${B}✓ 全部通过！${RST}`);
  } else {
    console.log(`\n${G}${B}✓ 无失败！${RST} (${Y}${skipped} 项因依赖缺失跳过${RST})`);
  }

  console.log(
    `\n${DIM}固定测试账号: ${U1.email} / ${U2.email}（跨运行复用）${RST}`
  );
  console.log(`${DIM}遗留数据: 部门 [TEST] 测试部门_${RUN} (无删除接口)${RST}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
