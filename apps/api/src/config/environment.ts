import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv({ quiet: true });

const environmentSchema = z
  .object({
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:kb|mb)$/iu)
      .default('1mb'),
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

    if (webOrigin.origin !== value.WEB_ORIGIN.replace(/\/$/u, '')) {
      context.addIssue({
        code: 'custom',
        message: 'WEB_ORIGIN must contain only an origin, without a path.',
        path: ['WEB_ORIGIN'],
      });
    }

    if (value.NODE_ENV === 'production') {
      if (webOrigin.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          message: 'WEB_ORIGIN must use HTTPS in production.',
          path: ['WEB_ORIGIN'],
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
