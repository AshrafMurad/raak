import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { workerHealthHandler } from '../src/worker/health';

const handler = (ping: () => Promise<string>) =>
  workerHealthHandler({ ping, now: () => new Date('2026-01-01T00:00:00Z') });

describe('worker health handler', () => {
  it('liveness is always 200 with the live shape', async () => {
    const res = await request(handler(() => Promise.reject(new Error('down')))).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { status: 'ok', service: 'worker', time: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('readiness is 200 when redis pongs', async () => {
    const res = await request(handler(() => Promise.resolve('PONG'))).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ready', components: { redis: 'UP' } });
  });

  it('readiness is 503 when redis is unreachable', async () => {
    const res = await request(handler(() => Promise.reject(new Error('down')))).get(
      '/health/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: 'not_ready', components: { redis: 'DOWN' } });
  });

  it('unknown paths return a 404 envelope', async () => {
    const res = await request(handler(() => Promise.resolve('PONG'))).get('/other');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
