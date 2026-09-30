import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv({ quiet: true });

const environmentSchema = z
  .object({
    AUTH_ACCESS_TOKEN_SECRET: z
      .string()
      .min(32)
      .default('development-only-access-token-secret-change-me'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(600),
    AUTH_AUDIENCE: z.string().min(1).default('onyx-college-portal'),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .default('onyx_refresh'),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_FAILED_ATTEMPT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    AUTH_ISSUER: z.string().min(1).default('onyx-college-api'),
    AUTH_LOCK_DURATION_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
    AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(8),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(30),
    AUTH_REFRESH_REPLAY_GRACE_SECONDS: z.coerce.number().int().min(1).max(30).default(8),
    AUTH_REFRESH_TOKEN_PEPPER: z
      .string()
      .min(32)
      .default('development-only-refresh-token-pepper-change-me'),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(31_536_000)
      .default(2_592_000),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:kb|mb)$/iu)
      .default('1mb'),
    DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(20_971_520).default(5_242_880),
    DOCUMENT_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(120),
    DOCUMENT_STORAGE_DRIVER: z.enum(['cloudinary', 'disabled', 'local']).default('local'),
    DOCUMENT_STORAGE_LOCAL_PATH: z.string().min(1).default('.data/private-uploads'),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MONGODB_URI: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must use a MongoDB connection scheme.',
      ),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    WEB_ORIGIN: z.url(),
  })
  .superRefine((value, context) => {
    const webOrigin = new URL(value.WEB_ORIGIN);

    if (value.DOCUMENT_STORAGE_DRIVER === 'cloudinary') {
      for (const [key, credential] of [
        ['CLOUDINARY_CLOUD_NAME', value.CLOUDINARY_CLOUD_NAME],
        ['CLOUDINARY_API_KEY', value.CLOUDINARY_API_KEY],
        ['CLOUDINARY_API_SECRET', value.CLOUDINARY_API_SECRET],
      ] as const) {
        if (credential === undefined || credential.trim() === '') {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when DOCUMENT_STORAGE_DRIVER is cloudinary.`,
            path: [key],
          });
        }
      }
    }

    if (webOrigin.origin !== value.WEB_ORIGIN.replace(/\/$/u, '')) {
      context.addIssue({
        code: 'custom',
        message: 'WEB_ORIGIN must contain only an origin, without a path.',
        path: ['WEB_ORIGIN'],
      });
    }

    if (value.AUTH_COOKIE_SAME_SITE === 'none' && !value.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none.',
        path: ['AUTH_COOKIE_SECURE'],
      });
    }

    if (value.NODE_ENV === 'production') {
      if (!value.AUTH_COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          message: 'AUTH_COOKIE_SECURE must be true in production.',
          path: ['AUTH_COOKIE_SECURE'],
        });
      }

      if (
        value.AUTH_ACCESS_TOKEN_SECRET.startsWith('development-only') ||
        value.AUTH_REFRESH_TOKEN_PEPPER.startsWith('development-only')
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Production authentication secrets must not use development defaults.',
          path: ['AUTH_ACCESS_TOKEN_SECRET'],
        });
      }

      if (webOrigin.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: 'WEB_ORIGIN must use HTTPS in production.',
          path: ['WEB_ORIGIN'],
        });
      }

      if (value.DOCUMENT_STORAGE_DRIVER !== 'cloudinary') {
        context.addIssue({
          code: 'custom',
          message: 'Production document storage must use the Cloudinary adapter.',
          path: ['DOCUMENT_STORAGE_DRIVER'],
        });
      }

      const supportsTransactions =
        value.MONGODB_URI.startsWith('mongodb+srv://') ||
        /[?&]replicaSet=[^&]+/u.test(value.MONGODB_URI);

      if (!supportsTransactions) {
        context.addIssue({
          code: 'custom',
          message: 'Production MongoDB configuration must target a replica set.',
          path: ['MONGODB_URI'],
        });
      }
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid application environment: ${summary}`);
  }

  return result.data;
}
