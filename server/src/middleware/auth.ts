import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { jwtSecret } from '../utils/env';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  mustChangePassword: boolean;
  emailVerified: boolean;
}

export interface AuthRequest extends Request {
  userId?: string;
  user?: AuthUser;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, departmentId: true, mustChangePassword: true, emailVerified: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId = user.id;
    req.user = user;

    // P2: 当服务器启用邮箱验证时，未验证用户只能访问 /auth/me 和 /auth/resend-verification
    if (process.env.EMAIL_VERIFICATION_ENABLED === 'true' && !user.emailVerified) {
      const url = req.originalUrl;
      const isExempt =
        url.includes('/auth/me') ||
        url.includes('/auth/resend-verification') ||
        url.includes('/auth/verify-email');
      if (!isExempt) {
        return res.status(403).json({ error: '请先验证您的邮箱，才能使用此功能', code: 'emailNotVerified' });
      }
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
