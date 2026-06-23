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
import authRouter     from './modules/auth/auth.router';
import jobsRouter     from './modules/jobs/jobs.router';
import uploadRouter   from './modules/upload/upload.router';
import billingRouter  from './modules/billing/billing.router';
import usersRouter    from './modules/users/users.router';
import internalRouter from './modules/internal/internal.router';
import paymentsRouter from './modules/payments/payments.router';
import adminRouter from './modules/admin/admin.router'
import { transcriptionsRouter } from './modules/transcription/transcriptions.routes';

   

export function createApp(): Application {
  const app = express();
 console.log(config.DATABASE_URL)
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

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many auth attempts' },
  });

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

  // ── Payments router BEFORE express.json() ────────────────────────────────
  // The /webhook route inside uses express.raw() on its own.
  // All other payment routes are fine with JSON parsed later.
  const prefix = config.API_PREFIX;

  app.use(`${prefix}/payments`, paymentsRouter);
  app.use(`${prefix}/internal`, internalRouter);
  // ── Parsers (after webhook route) ────────────────────────────────────────
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use(`${prefix}/auth`,     authLimiter, authRouter);
  app.use(`${prefix}/upload`,   uploadRouter);
  app.use(`${prefix}/jobs`,     jobsRouter);
  app.use(`${prefix}/billing`,  billingRouter);
  app.use(`${prefix}/users`,    usersRouter);
  app.use(`${prefix}/transcriptions`,    transcriptionsRouter);
  
  app.set('trust proxy', 1);
  app.set("json replacer", (_key: string, value: unknown) => {
  return typeof value === "bigint"
    ? value.toString()
    : value;
});
  app.use(`${prefix}/admin`, adminRouter);
  
  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route'));
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
