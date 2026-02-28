import type { Request, Response, NextFunction } from 'express';
import { findUserByToken } from '../services/fileStore';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Session-based auth
  if (req.session?.userId) {
    next();
    return;
  }

  // Bearer token auth
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const userId = findUserByToken(token);
    if (userId) {
      req.session.userId = userId;
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Unauthorized', message: 'Nicht authentifiziert' });
}

export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
