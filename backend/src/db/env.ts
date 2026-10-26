import { z } from 'zod';

/**
 * Typed environment for the db layer (docs 13: typed config).
 * Fails closed with a clear message instead of half-booting.
 */
export const DbEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),
});

export type DbEnv = z.infer<typeof DbEnvSchema>;

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  const parsed = DbEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid db environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
