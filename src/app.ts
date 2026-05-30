// src/app.ts
import 'express-async-errors';
import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './shared/utils/logger';
import { errorHandler } from './shared/middleware/errorHandler';
import { NotFoundError } from './shared/errors';

// Routers
import authRouter from './modules/auth/auth.router';
import jobsRouter from './modules/jobs/jobs.router';
import uploadRouter from './modules/upload/upload.router';
import billingRouter from './modules/billing/billing.router';
import usersRouter from './modules/users/users.router';
import internalRouter from './modules/internal/internal.router';

export function createApp(): Application {
  const app = express();

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Callback-Signature'],
    }),
  );

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many requests' },
  });
  app.use(limiter);

  // Stricter limiter on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many auth attempts' },
  });

  // ── Parsers ───────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Logging ───────────────────────────────────────────────────────────────
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (_req, res) => res.statusCode < 400 && config.NODE_ENV === 'production',
    }),
  );

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  // ── API Routes ────────────────────────────────────────────────────────────
  const prefix = config.API_PREFIX;

  app.use(`${prefix}/auth`, authLimiter, authRouter);
  app.use(`${prefix}/upload`, uploadRouter);
  app.use(`${prefix}/jobs`, jobsRouter);
  app.use(`${prefix}/billing`, billingRouter);
  app.use(`${prefix}/users`, usersRouter);

  // Internal routes (Python worker callbacks) — bind to loopback in production
  app.use(`${prefix}/internal`, internalRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route'));
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
