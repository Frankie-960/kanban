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
import { sendEmail, buildPasswordResetEmail } from '../services/emailService';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const profileUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    oldPassword: z.string().optional(),
    newPassword: z.string().min(6).optional(),
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
  .refine((d) => !d.newPassword || !!d.oldPassword, {
    message: 'Current password is required to set a new password',
    path: ['oldPassword'],
  });

// Register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash },
    });

    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Registration failed' });
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

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

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
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { department: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department,
      deepseekApiKey: decryptApiKey(user.deepseekApiKey),
      llmProvider: user.llmProvider,
      mustChangePassword: user.mustChangePassword,
    });
  } catch {
    res.status(500).json({ error: 'Failed to get user' });
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
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
      updateData.mustChangePassword = false;
    }

    if (data.deepseekApiKey !== undefined) {
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
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Admin: Get all users
router.get('/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, departmentId: true, department: true },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: Update user role
router.put('/users/:id/role', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { role } = req.body;
    if (!['ADMIN', 'DEPARTMENT_ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent self-demotion
    if (req.params.id === req.userId && role !== 'ADMIN') {
      return res.status(400).json({ error: 'Cannot demote your own account' });
    }

    // Ensure at least one admin remains
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (targetUser?.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last administrator' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Forgot password — public, always returns 200 to prevent email enumeration
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'Email is required' });

    res.json({ message: 'If that email is registered, a reset link has been sent.' });

    // Fire-and-forget after responding (prevents timing attacks)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    // Invalidate existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

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
  } catch (err) {
    console.error('[forgot-password]', err);
    // Already responded 200; swallow error
  }
});

// Reset password via token — public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid token and new password (min 6 chars) are required' });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
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

    res.json({ message: 'Password has been reset successfully.' });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Admin: force-reset a user's password and require change on next login
router.post('/users/:id/reset-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const tempPassword = crypto.randomBytes(8).toString('hex'); // 16-char hex
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, mustChangePassword: true },
    });

    res.json({ tempPassword, message: 'Password has been reset. User must change it on next login.' });
  } catch {
    res.status(500).json({ error: 'Failed to reset user password' });
  }
});

export default router;
