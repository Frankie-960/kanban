import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { jwtSecret } from '../utils/env';
import { encryptApiKey, decryptApiKey } from '../utils/crypto';
import { LLM_PROVIDERS } from '../services/aiService';
import { sendEmail, buildPasswordResetEmail, buildVerifyEmail } from '../services/emailService';

const router = Router();

// Mask an API key like "sk-63779ed9...fd40" → "sk-***fd40" before sending to clients.
// /auth/me is reachable by long-lived agent tokens; returning plaintext would leak the
// user's LLM key to anyone holding the token. The mask is recognizable so updateProfile
// can ignore it and avoid overwriting the real stored value.
const API_KEY_MASK_PREFIX = 'sk-***';
function maskApiKey(plain: string | null): string | null {
  if (!plain) return plain;
  const tail = plain.length >= 4 ? plain.slice(-4) : '';
  return `${API_KEY_MASK_PREFIX}${tail}`;
}
function isMaskedApiKey(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(API_KEY_MASK_PREFIX);
}

const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .regex(/[A-Z]/, '密码需含至少一个大写字母')
  .regex(/[0-9]/, '密码需含至少一个数字');

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const profileUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    oldPassword: z.string().optional(),  // 后端原字段
    password: z.string().optional(),      // 前端别名（兼容）
    newPassword: passwordSchema.optional(),
    confirmPassword: z.string().optional(), // 前端确认字段（忽略，只用 newPassword）
    deepseekApiKey: z.string().nullable().optional(),
    llmProvider: z
      .enum([
        LLM_PROVIDERS.DEEPSEEK,
        LLM_PROVIDERS.QWEN,
        LLM_PROVIDERS.ERNIE,
        LLM_PROVIDERS.CHATGLM,
        LLM_PROVIDERS.MINIMAX,
        LLM_PROVIDERS.SPARK,
      ])
      .optional(),
  })
  .transform((d) => ({
    ...d,
    // 统一：前端发 password，后端用 oldPassword
    oldPassword: d.oldPassword || d.password,
  }))
  .refine((d) => !d.newPassword || !!d.oldPassword, {
    message: '修改密码需要提供当前密码',
    path: ['oldPassword'],
  });

// Register
router.post('/register', async (req, res) => {
  try {
    // 注册闸门 1：总开关（默认开放；env 设 'false' 关闭注册）
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: '当前未开放注册，请联系管理员' });
    }
    const data = registerSchema.parse(req.body);

    // 注册闸门 2：邮箱域名白名单（env 不设/为空时不限制，行为与现状一致）
    const whitelist = (process.env.REGISTER_EMAIL_DOMAIN_WHITELIST || '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (whitelist.length > 0) {
      const domain = data.email.split('@')[1]?.toLowerCase();
      if (!domain || !whitelist.includes(domain)) {
        return res.status(403).json({ error: '邮箱域名不在允许列表，请联系管理员' });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const verifyEnabled = process.env.EMAIL_VERIFICATION_ENABLED === 'true';
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash, emailVerified: !verifyEnabled },
    });

    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, emailVerified: user.emailVerified } });

    // 软模式：注册后异步发激活邮件，不阻塞响应（EMAIL_VERIFICATION_ENABLED=true 时）
    if (verifyEnabled) {
      (async () => {
        try {
          const vToken = crypto.randomBytes(32).toString('hex');
          await prisma.emailVerifyToken.create({
            data: { userId: user.id, token: vToken, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          });
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const emailContent = buildVerifyEmail(user.name, `${frontendUrl}/verify-email?token=${vToken}`);
          await sendEmail({ ...emailContent, to: user.email });
        } catch (e) {
          console.error('[register verify-email send] failed:', e);
        }
      })();
    }
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { department: true },
    });

    if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

    const validPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!validPassword) return res.status(401).json({ error: '邮箱或密码错误' });

    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        department: user.department,
        deepseekApiKey: decryptApiKey(user.deepseekApiKey),
        llmProvider: user.llmProvider,
        mustChangePassword: user.mustChangePassword,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { department: true },
    });
    if (!user) return res.status(404).json({ error: '用户不存在' });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department,
      deepseekApiKey: maskApiKey(decryptApiKey(user.deepseekApiKey)),
      llmProvider: user.llmProvider,
      mustChangePassword: user.mustChangePassword,
      emailVerified: user.emailVerified,
    });
  } catch {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = profileUpdateSchema.parse(req.body);
    const updateData: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;

    // Password change requires old password verification
    if (data.newPassword) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      const valid = await bcrypt.compare(data.oldPassword!, user!.passwordHash);
      if (!valid) {
        return res.status(400).json({ error: '当前密码不正确' });
      }
      updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
      updateData.mustChangePassword = false;
    }

    if (data.deepseekApiKey !== undefined && !isMaskedApiKey(data.deepseekApiKey)) {
      updateData.deepseekApiKey = data.deepseekApiKey ? encryptApiKey(data.deepseekApiKey) : null;
    }
    if (data.llmProvider !== undefined) {
      updateData.llmProvider = data.llmProvider;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, llmProvider: true, mustChangePassword: true },
    });

    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: '更新资料失败' });
  }
});

// Admin: Get all users
router.get('/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: '权限不足' });
    }
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, departmentId: true, department: true },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// Admin: Update user role
router.put('/users/:id/role', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: '权限不足' });
    }

    const { role } = req.body;
    if (!['ADMIN', 'DEPARTMENT_ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }

    // Prevent self-demotion
    if (req.params.id === req.userId && role !== 'ADMIN') {
      return res.status(400).json({ error: '不能降低自己的管理员权限' });
    }

    // Ensure at least one admin remains
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (targetUser?.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: '系统至少需要保留一位管理员' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: '更新用户角色失败' });
  }
});

// Forgot password — public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: '该邮箱未注册，请检查后重试' });
    }

    // Invalidate ALL existing tokens for this user (used + expired cleanup)
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const emailContent = buildPasswordResetEmail(user.name, resetUrl);
    await sendEmail({ ...emailContent, to: user.email });

    res.json({ message: '重置链接已发送，请查收邮件（有效期 1 小时）' });
  } catch (err) {
    console.error('[forgot-password]', err);
  }
});

// Reset password via token — public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: '请提供有效的重置链接和新密码（至少 8 位）' });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: '重置链接已失效或过期，请重新申请' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    res.json({ message: '密码已重置，请重新登录' });
  } catch {
    res.status(500).json({ error: '重置密码失败，请稍后重试' });
  }
});

// Issue a long-lived agent token (for MCP / programmatic agents)
router.post('/agent-token', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name = 'agent', scope = 'rw', days = 365 } = req.body || {};
    if (!['ro', 'rw'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope (use "ro" or "rw")' });
    }
    const ttlDays = Math.min(Math.max(parseInt(String(days), 10) || 365, 1), 365);
    const token = jwt.sign(
      { userId: req.userId, agent: true, scope, agentName: String(name).slice(0, 64) },
      jwtSecret,
      { expiresIn: `${ttlDays}d` }
    );
    res.json({ token, expiresInDays: ttlDays, scope, agentName: String(name).slice(0, 64) });
  } catch (e) {
    console.error('POST /auth/agent-token failed:', e);
    res.status(500).json({ error: '生成令牌失败' });
  }
});

// Admin: force-reset a user's password and require change on next login
router.post('/users/:id/reset-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: '权限不足' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: '用户不存在' });

    const tempPassword = crypto.randomBytes(8).toString('hex'); // 16-char hex
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, mustChangePassword: true },
    });

    res.json({ tempPassword, message: '密码已重置，该用户下次登录时需要修改密码' });
  } catch {
    res.status(500).json({ error: '重置用户密码失败' });
  }
});

// Verify email (public) — token-based 激活
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: '缺少验证令牌' });

    const record = await prisma.emailVerifyToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: '激活链接无效或已过期' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.emailVerifyToken.update({ where: { id: record.id }, data: { used: true } }),
    ]);

    res.json({ message: '邮箱已激活' });
  } catch (e) {
    console.error('POST /auth/verify-email failed:', e);
    res.status(500).json({ error: '邮箱验证失败，请稍后重试' });
  }
});

// Resend verification email (登录中、未验证用户)
router.post('/resend-verification', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.emailVerified) return res.status(400).json({ error: '邮箱已激活，无需重发' });

    // 删除该用户旧 token，避免堆积
    await prisma.emailVerifyToken.deleteMany({ where: { userId: user.id } });

    const vToken = crypto.randomBytes(32).toString('hex');
    await prisma.emailVerifyToken.create({
      data: { userId: user.id, token: vToken, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const emailContent = buildVerifyEmail(user.name, `${frontendUrl}/verify-email?token=${vToken}`);
    await sendEmail({ ...emailContent, to: user.email });

    res.json({ message: '激活邮件已发送' });
  } catch (e) {
    console.error('POST /auth/resend-verification failed:', e);
    res.status(500).json({ error: '重新发送失败，请稍后重试' });
  }
});

export default router;
