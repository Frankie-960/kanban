import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from '../middleware/auth';

/**
 * 业务错误。在 service / route 里 `throw new AppError(404, '项目不存在或无权限')`，
 * 由 errorHandler 统一转成对应 HTTP 状态码 + JSON。
 */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 包裹异步路由 handler，自动把抛出的错误转发给 errorHandler，
 * 取代每个 handler 里重复的 try/catch + console.error + res.status(500)。
 *
 * 用法：
 *   router.post('/', asyncHandler(async (req, res) => {
 *     const item = await itemService.create(req.user!, req.body);
 *     res.json(item);
 *   }));
 *
 * 本项目业务路由都经过 authMiddleware，故 req 默认按 AuthRequest 暴露；
 * 未鉴权路由（login/register 等）也可用，只是不访问 req.user。
 */
export const asyncHandler =
  (fn: (req: AuthRequest, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);
  };
