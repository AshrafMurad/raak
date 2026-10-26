import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/server';
import { createLogger, type Logger } from '../src/logger';
import { loadApiEnv, type AppEnv } from '../src/config/env';
import type { HealthService } from '../src/modules/health/service';

const silentLogger: Logger = createLogger({ service: 'test', write: () => {} });

function makeApp(checkDatabase: () => Promise<boolean>): Express {
  const env: AppEnv = loadApiEnv({} as NodeJS.ProcessEnv);
  const health: HealthService = { checkDatabase };
  return buildApp({
    env,
    logger: silentLogger,
    health,
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
}

describe('GET /v1/health/live', () => {
  it('returns 200 with the live contract shape', async () => {
    const res = await request(makeApp(async () => true)).get('/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { status: 'ok', service: 'api', time: '2026-01-01T00:00:00.000Z' },
    });
  });
});

describe('GET /v1/health/ready', () => {
  it('returns 200 when the database is up', async () => {
    const res = await request(makeApp(async () => true)).get('/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ready', components: { db: 'UP' } });
  });

  it('returns 503 when the database is down', async () => {
    const res = await request(makeApp(async () => false)).get('/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: 'not_ready', components: { db: 'DOWN' } });
  });
});

describe('correlation ids', () => {
  it('echoes a well-formed X-Request-ID', async () => {
    const res = await request(makeApp(async () => true))
      .get('/v1/health/live')
      .set('X-Request-ID', 'client-abc-123');
    expect(res.headers['x-request-id']).toBe('client-abc-123');
  });

  it('generates a request id when absent or unsafe', async () => {
    const res = await request(makeApp(async () => true)).get('/v1/health/live');
    expect(typeof res.headers['x-request-id']).toBe('string');

    const unsafe = await request(makeApp(async () => true))
      .get('/v1/health/live')
      .set('X-Request-ID', 'bad id with spaces!');
    expect(String(unsafe.headers['x-request-id'])).not.toContain(' ');
  });
});

describe('error envelope', () => {
  it('returns a stable 404 envelope for unknown routes', async () => {
    const res = await request(makeApp(async () => true)).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(typeof res.body.error.requestId).toBe('string');
  });

  it('maps malformed JSON bodies to VALIDATION_FAILED', async () => {
    const res = await request(makeApp(async () => true))
      .post('/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{not-json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(typeof res.body.error.requestId).toBe('string');
  });
});
