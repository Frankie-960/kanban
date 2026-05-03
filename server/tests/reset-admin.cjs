'use strict';
/**
 * 测试环境初始化脚本
 * 用法: node server/tests/reset-admin.cjs
 *
 * 功能:
 *   1. 重置管理员密码为 Admin@2026!
 *   2. 创建/重置 CI 测试用户 (ci_u1@kanban.test / ci_u2@kanban.test)
 *
 * 在测试之前运行一次，或者当 rate-limit 导致测试账号无法建立时运行。
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const ADMIN_EMAIL = '844723538@qq.com';
const ADMIN_PASS  = 'Admin@2026!';
const U1_EMAIL    = 'ci_u1@kanban.test';
const U1_PASS     = 'CiUser1@2026!';
const U2_EMAIL    = 'ci_u2@kanban.test';
const U2_PASS     = 'CiUser2@2026!';

async function ensureUser(email, password, name, role) {
  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash: hash, mustChangePassword: false },
    });
    console.log(`重置密码: ${email} → ${password}`);
  } else {
    await prisma.user.create({
      data: { name, email, passwordHash: hash, role: role || 'MEMBER' },
    });
    console.log(`创建用户: ${email} (${role || 'MEMBER'})`);
  }
}

async function main() {
  await ensureUser(ADMIN_EMAIL, ADMIN_PASS, '管理员', 'ADMIN');
  await ensureUser(U1_EMAIL, U1_PASS, 'CI用户甲', 'MEMBER');
  await ensureUser(U2_EMAIL, U2_PASS, 'CI用户乙', 'MEMBER');
  console.log('\n✓ 初始化完成，现在可以运行: node server/tests/run.cjs');
}
main().catch(console.error).finally(() => prisma.$disconnect());
