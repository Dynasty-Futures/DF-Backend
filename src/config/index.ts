import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// =============================================================================
// Environment Schema
// =============================================================================

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // YourPropFirm API
  YOURPROPFIRM_API_URL: z.string().url().optional(),
  YOURPROPFIRM_API_KEY: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // AWS (for S3, SES, etc.)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_DOCUMENTS: z.string().optional(),
  SES_FROM_EMAIL: z.string().email().default('noreply@dynastyfuturesdyn.com'),
  SUPPORT_EMAIL: z.string().email().default('support@dynastyfuturesdyn.com'),

  // Security
  BCRYPT_ROUNDS: z.string().default('12').transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Frontend URL (for emails, etc.)
  FRONTEND_URL: z.string().url().optional(),
});

// =============================================================================
// Parse and Validate
// =============================================================================

const parseEnv = (): z.infer<typeof envSchema> => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
};

// =============================================================================
// Export Config
// =============================================================================

const env = parseEnv();

export const config = {
  // App
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  host: env.HOST,

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  // Stripe
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  },

  // YourPropFirm
  yourPropFirm: {
    apiUrl: env.YOURPROPFIRM_API_URL,
    apiKey: env.YOURPROPFIRM_API_KEY,
  },

  // Google OAuth
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
  },

  // AWS
  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3: {
      documentsBucket: env.S3_BUCKET_DOCUMENTS,
    },
    ses: {
      fromEmail: env.SES_FROM_EMAIL,
      supportEmail: env.SUPPORT_EMAIL,
    },
  },

  // Security
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
  },

  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
  },

  // Frontend
  frontendUrl: env.FRONTEND_URL,
} as const;

export type Config = typeof config;
