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

  // Redis
  redisUrl: z.string().url().default('redis://localhost:6379'),

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

  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
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

      // Logging
      logLevel: process.env.LOG_LEVEL,
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

// Helper: Check if running in test
export const isTest = () => config.nodeEnv === 'test';
