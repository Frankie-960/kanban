import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/http';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // 输入校验失败 → 400，沿用各路由原本的 { error: err.errors } 形状
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors });
  }

  // 业务错误 → 指定状态码；仅 5xx 记日志
  if (err instanceof AppError) {
    if (err.status >= 500) console.error('AppError:', err.message, err.stack);
    return res.status(err.status).json({ error: err.message });
  }

  console.error('Unhandled error:', err.message, err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
}
