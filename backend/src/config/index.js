// Configuration Module - Centralized config management
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Configuration schema with validation
const configSchema = z.object({
  // Server
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  apiPort: z.coerce.number().default(3000),
  apiHost: z.string().default('localhost'),
  frontendUrl: z.string().url().default('http://localhost:3000'),

  // Database
  databaseUrl: z.string().url().default('postgresql://localhost:5432/mvoe'),

  // Redis (optional — in-memory fallback when not set)
  redisUrl: z.string().optional(),

  // JWT
  jwtSecret: z.string().min(32).default('please-set-JWT_SECRET-env-var-min-32-chars!!'),
  jwtExpiresIn: z.string().default('7d'),
  refreshTokenSecret: z.string().min(32).default('please-set-REFRESH_TOKEN_SECRET-env-var!!'),
  refreshTokenExpiresIn: z.string().default('30d'),

  // Stripe (optional — payment features disabled when not set)
  stripeSecretKey: z.string().optional(),
  stripePublishableKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),

  // AWS S3
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsRegion: z.string().default('us-east-1'),
  awsS3Bucket: z.string().optional(),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),
  allowGuestWrites: z.coerce.boolean().default(false),

  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Food bank directory indexing
  foodBankDirectoryRegions: z.string().default('Austin,TX'),
  foodBankDirectoryRunIntervalHours: z.coerce.number().default(168),
  foodBankDirectorySearchProvider: z.string().default('web'),

  // Meal planner pricing index
  firecrawlApiKey: z.string().optional(),
  pricingIndexRefreshIntervalHours: z.coerce.number().default(24),
  pricingIndexStaleAfterHours: z.coerce.number().default(72),

  // Composio / Google Drive
  composioApiKey: z.string().optional(),

  // Google auth
  googleClientIds: z.string().optional(),
  googleTokenInfoUrl: z.string().url().default('https://oauth2.googleapis.com/tokeninfo'),
});

// Parse and validate environment variables
const parseConfig = () => {
  try {
    return configSchema.parse({
      // Server
      nodeEnv: process.env.NODE_ENV,
      apiPort: process.env.PORT ?? process.env.API_PORT,
      apiHost: process.env.API_HOST,
      frontendUrl: process.env.FRONTEND_URL,

      // Database
      databaseUrl: process.env.DATABASE_URL,

      // Redis
      redisUrl: process.env.REDIS_URL,

      // JWT
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
      refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,

      // Stripe
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

      // AWS
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION,
      awsS3Bucket: process.env.AWS_S3_BUCKET,

      // Rate Limiting
      rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
      allowGuestWrites: process.env.ALLOW_GUEST_WRITES,

      // Logging
      logLevel: process.env.LOG_LEVEL,

      // Food bank directory indexing
      foodBankDirectoryRegions: process.env.FOOD_BANK_DIRECTORY_REGIONS,
      foodBankDirectoryRunIntervalHours: process.env.FOOD_BANK_DIRECTORY_RUN_INTERVAL_HOURS,
      foodBankDirectorySearchProvider: process.env.FOOD_BANK_DIRECTORY_SEARCH_PROVIDER,

      // Meal planner pricing index
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      pricingIndexRefreshIntervalHours: process.env.PRICING_INDEX_REFRESH_INTERVAL_HOURS,
      pricingIndexStaleAfterHours: process.env.PRICING_INDEX_STALE_AFTER_HOURS,

      // Composio / Google Drive
      composioApiKey: process.env.COMPOSIO_API_KEY,

      // Google auth
      googleClientIds: process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_CLIENT_ID,
      googleTokenInfoUrl: process.env.GOOGLE_TOKENINFO_URL,
    });
  } catch (error) {
    console.error('❌ Invalid configuration:', error.errors);
    process.exit(1);
  }
};

export const config = parseConfig();

// Helper: Check if running in production
export const isProduction = () => config.nodeEnv === 'production';

// Helper: Check if running in development
export const isDevelopment = () => config.nodeEnv === 'development';

const DEFAULT_JWT_SECRET = 'please-set-JWT_SECRET-env-var-min-32-chars!!';
const DEFAULT_REFRESH_SECRET = 'please-set-REFRESH_TOKEN_SECRET-env-var!!';

function isLocalUrl(value) {
  return String(value || '').includes('localhost') || String(value || '').includes('127.0.0.1');
}

export const getProductionReadiness = () => {
  const checks = [
    {
      key: 'nodeEnv',
      ok: config.nodeEnv === 'production',
      message: 'NODE_ENV must be production for public deployment.',
    },
    {
      key: 'frontendUrl',
      ok: Boolean(config.frontendUrl) && !isLocalUrl(config.frontendUrl),
      message: 'FRONTEND_URL must be the public app URL, not localhost.',
    },
    {
      key: 'databaseUrl',
      ok: Boolean(config.databaseUrl) && !isLocalUrl(config.databaseUrl),
      message: 'DATABASE_URL must point to managed production Postgres.',
    },
    {
      key: 'redisUrl',
      ok: Boolean(config.redisUrl) && !isLocalUrl(config.redisUrl),
      message: 'REDIS_URL must point to managed production Redis for shared rate limits/queues.',
    },
    {
      key: 'jwtSecret',
      ok: Boolean(config.jwtSecret) && config.jwtSecret !== DEFAULT_JWT_SECRET,
      message: 'JWT_SECRET must be unique and not the development default.',
    },
    {
      key: 'refreshTokenSecret',
      ok: Boolean(config.refreshTokenSecret) && config.refreshTokenSecret !== DEFAULT_REFRESH_SECRET,
      message: 'REFRESH_TOKEN_SECRET must be unique and not the development default.',
    },
    {
      key: 'guestWrites',
      ok: config.allowGuestWrites === false,
      message: 'ALLOW_GUEST_WRITES must stay false in production; public writes require accounts.',
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  return {
    ready: failed.length === 0,
    checks,
    failed,
  };
};

if (isProduction()) {
  const readiness = getProductionReadiness();
  if (!readiness.ready) {
    // ponytail: warn but don't exit — demo mode runs in production without all services
    console.warn('⚠️  Production readiness checks failed (demo mode):', readiness.failed.map(f => f.message));
  }
}

// Helper: Check if running in test
export const isTest = () => config.nodeEnv === 'test';
