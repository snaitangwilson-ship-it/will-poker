import { Request, Response, NextFunction } from 'express';
import { SecurityUtils } from '../utils/security';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = SecurityUtils.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = payload.userId;
  next();
};

export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // This will be implemented with role-based access
  next();
};
