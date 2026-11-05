import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { workerHealthHandler } from '../src/worker/health';
import type { QueueHealthSnapshot } from '../src/contracts';

const handler = (ping: () => Promise<string>) =>
  workerHealthHandler({ ping, now: () => new Date('2026-01-01T00:00:00Z') });

const snapshot: QueueHealthSnapshot = {
  data: {
    status: 'ok',
    service: 'worker',
    time: '2026-01-01T00:00:00.000Z',
    queues: {
      emailDeliveries: { pending: 2, sending: 1, failed: 3, oldestPendingSeconds: 120 },
      notificationDeliveries: { pending: 0, sending: 0, failed: 1, oldestPendingSeconds: 0 },
      outbox: { unprocessed: 4, oldestUnprocessedSeconds: 300 },
      bullmq: { 'raak-request-email': { waiting: 1, active: 1, completed: 10, failed: 0, delayed: 0 } },
    },
  },
};

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

  it('queue statistics return the collected snapshot unchanged', async () => {
    const res = await request(
      workerHealthHandler({
        ping: () => Promise.resolve('PONG'),
        now: () => new Date('2026-01-01T00:00:00Z'),
        queues: () => Promise.resolve(snapshot),
      }),
    ).get('/health/queues');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshot);
  });

  it('queue statistics are 503 with a safe error code when collection fails', async () => {
    const res = await request(
      workerHealthHandler({
        ping: () => Promise.resolve('PONG'),
        now: () => new Date('2026-01-01T00:00:00Z'),
        queues: () => Promise.reject(new Error('synthetic stats failure')),
      }),
    ).get('/health/queues');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_STATS_UNAVAILABLE');
  });

  it('queue statistics are 404 when the worker does not provide the collector', async () => {
    const res = await request(handler(() => Promise.resolve('PONG'))).get('/health/queues');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
