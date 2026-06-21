// src/shared/guards/authenticate.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { UnauthorizedError } from '../errors';
import { $Enums } from '@prisma/client';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  plan: string;
  iat: number;
  exp: number;
  role:$Enums.UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}
