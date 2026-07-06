// import dotenv from 'dotenv';
import { z } from 'zod';

// dotenv.config({
//   override: true,
// });


const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  API_PREFIX: z.string().default('/api/v1'),
  APP_URL: z.string(),
  DATABASE_URL: z.string().url(),
  FRONT_END_URL: z.string(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_USERNAME: z.coerce.string().default("default"),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_BASE_PATH: z.string().default('./storage'),
  STORAGE_LOCAL_MAX_SIZE_MB: z.coerce.number().default(5000),

  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().default('amzn-s3-trans-v1'),
  
  QUEUE_NAME: z.string().default('transcription'),
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
  QUEUE_MAX_RETRIES: z.coerce.number().default(3),
  QUEUE_BACKOFF_DELAY_MS: z.coerce.number().default(5000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(600),
  GCS_UPLOAD_BUCKET: z.string().default("subcult"),
  CORS_ORIGIN: z.string(),
  GCP_PROJECT_ID: z.string(),
  GCP_CLIENT_EMAIL: z.string(),
  GCP_PRIVATE_KEY: z.string(),
  GCS_BUCKET: z.string(),

  SMTP_HOST:z.string(),
  SMTP_PORT:z.string(),
  SMTP_SECURE: z.string(),
  SMTP_USER:z.string(),
  SMTP_PASS:z.string(),
  SUPPORT_INBOX_EMAIL: z.string(),

  
  // ── Stripe ──────────────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY:      z.string(),
  STRIPE_WEBHOOK_SECRET:  z.string().default("whsec_kXdiiogYYo0ctP9cNIAhCnId6zW0YnwI"),
  STRIPE_PRICE_STARTER:   z.string().optional().default("0"),
  STRIPE_PRICE_PRO:       z.string().default("price_1TlXJnL0kkUgmPpMA34YdZji"),
  STRIPE_PRICE_ENTERPRISE: z.string().optional().default("79.00"),
  STRIPE_SUCCESS_URL:     z.string().default('https://subcult.vercel.app/billing/billing?success=1'),
  STRIPE_CANCEL_URL:      z.string().default('https://subcult.vercel.app/billing/billing?canceled=1'),
});

const parsed = envSchema.safeParse(process.env);
 
if (!parsed.success) {
  console.error('❌  Invalid environment variables:\n', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
