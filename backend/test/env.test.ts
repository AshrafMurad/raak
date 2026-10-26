import { describe, expect, it } from 'vitest';
import { DbEnvSchema, loadDbEnv } from '../src/db/env';
import { ApiEnvSchema, loadApiEnv } from '../src/config/env';
import { loadWorkerEnv } from '../src/worker/env';

describe('db env schema', () => {
  it('accepts a postgres connection string', () => {
    expect(
      DbEnvSchema.safeParse({ DATABASE_URL: 'postgresql://raak:pw@localhost:5432/raak' }).success,
    ).toBe(true);
  });

  it('rejects missing or non-postgres URLs', () => {
    expect(DbEnvSchema.safeParse({}).success).toBe(false);
    expect(DbEnvSchema.safeParse({ DATABASE_URL: 'mysql://x' }).success).toBe(false);
  });

  it('loadDbEnv throws a readable error listing issues', () => {
    expect(() => loadDbEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});

describe('api env schema', () => {
  it('defaults are safe (no proxy trust, optional DATABASE_URL)', () => {
    const env = loadApiEnv({} as NodeJS.ProcessEnv);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.trustProxyTokens).toEqual([]);
    expect(ApiEnvSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid port and short session secret', () => {
    expect(() => loadApiEnv({ API_PORT: '99999' } as NodeJS.ProcessEnv)).toThrow(/API_PORT/);
    expect(() => loadApiEnv({ SESSION_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('maps trusted proxy hosts to safe proxy-addr tokens and drops blanks', () => {
    const env = loadApiEnv({ TRUSTED_PROXY_HOSTS: 'localhost, 127.0.0.1 ,' } as NodeJS.ProcessEnv);
    expect(env.trustProxyTokens).toEqual(['loopback']);
  });

  it('accepts IPs and CIDR, rejects bare hostnames (fail closed)', () => {
    expect(
      loadApiEnv({ TRUSTED_PROXY_HOSTS: '10.0.0.0/8,::1' } as NodeJS.ProcessEnv).trustProxyTokens,
    ).toEqual(['10.0.0.0/8', 'loopback']);
    expect(() =>
      loadApiEnv({ TRUSTED_PROXY_HOSTS: 'proxy.example.com' } as NodeJS.ProcessEnv),
    ).toThrow(/TRUSTED_PROXY_HOSTS entry/);
  });
});

describe('worker env schema', () => {
  it('defaults redis url and health port', () => {
    const env = loadWorkerEnv({} as NodeJS.ProcessEnv);
    expect(env.REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(env.WORKER_HEALTH_PORT).toBe(8081);
  });

  it('rejects a bad port', () => {
    expect(() => loadWorkerEnv({ WORKER_HEALTH_PORT: 'nope' } as NodeJS.ProcessEnv)).toThrow(
      /WORKER_HEALTH_PORT/,
    );
  });
});
