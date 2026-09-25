import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith('/') || value.startsWith('https://') || value.startsWith('http://'),
      'VITE_API_BASE_URL must be a relative API path or an HTTP(S) URL.',
    )
    .default('/api/v1'),
});

const result = publicEnvironmentSchema.safeParse(import.meta.env);

if (!result.success) {
  throw new Error('The public web configuration is invalid.');
}

export const publicEnvironment = result.data;
