import { z } from 'zod';

/**
 * Typed api config (Sprint 0). Optional infrastructure variables let the
 * process boot for liveness even when backing services are absent; readiness
 * reports components DOWN instead of crashing (docs 08 failure behaviour).
 */
export const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'))
    .optional(),
  REDIS_URL: z.string().min(1).optional(),
  BASE_DOMAIN: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
  TRUSTED_PROXY_HOSTS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

/**
 * Express `trust proxy` accepts proxy-addr tokens only (IPs, CIDR, presets like
 * `loopback`) — NOT hostnames. Translate the operator's host list into safe
 * tokens and reject anything unrecognized (fail closed, docs 08).
 */
function toTrustProxyTokens(hosts: ReadonlyArray<string>): string[] {
  const tokens = new Set<string>();
  for (const host of hosts) {
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      tokens.add('loopback');
    } else if (
      host === 'loopback' ||
      host === 'linklocal' ||
      host === 'uniquelocal' ||
      /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(host) ||
      /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(host)
    ) {
      tokens.add(host);
    } else {
      throw new Error(
        `Invalid TRUSTED_PROXY_HOSTS entry "${host}": use IPs, CIDR ranges, or the presets loopback/linklocal/uniquelocal (hostnames are not proxy-addr tokens)`,
      );
    }
  }
  return [...tokens];
}

export interface AppEnv extends ApiEnv {
  trustProxyTokens: ReadonlyArray<string>;
}

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = ApiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid api environment:\n${issues.join('\n')}`);
  }
  const hosts = parsed.data.TRUSTED_PROXY_HOSTS
    ? parsed.data.TRUSTED_PROXY_HOSTS.split(',')
        .map((host) => host.trim())
        .filter((host) => host.length > 0)
    : [];
  return {
    ...parsed.data,
    trustProxyTokens: toTrustProxyTokens(hosts),
  };
}
