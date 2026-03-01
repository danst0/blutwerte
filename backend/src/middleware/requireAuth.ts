import type { Request, Response, NextFunction } from 'express';
import { findUserByToken } from '../services/fileStore';
import { getConfig } from '../config';

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

export function isAdminUser(userId: string | undefined, email: string | undefined): boolean {
  if (!userId) return false;
  const config = getConfig();
  const adminIds = config.ADMIN_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean);
  return adminIds.includes(userId) || (!!email && adminIds.includes(email));
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'Nicht authentifiziert' });
    return;
  }

  if (!isAdminUser(userId, req.session?.email)) {
    res.status(403).json({ error: 'Forbidden', message: 'Keine Administratorrechte' });
    return;
  }

  next();
}

export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
