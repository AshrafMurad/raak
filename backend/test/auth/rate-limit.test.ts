/**
 * Unit: in-memory rate limiter (Sprint 1 public endpoints: register/login/
 * forgot/invite-accept). Single-instance limitation recorded in the sprint
 * plan; swap for Redis-backed limiting when horizontal scale arrives.
 */
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/modules/auth/rate-limit';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';

function makeApp() {
  const limiter = createRateLimiter(() => new Date('2026-06-01T12:00:00Z'));
  const app: Express = express();
  app.post(
    '/limited',
    limiter({ name: 'limited', key: (req) => req.ip ?? 'unknown', limit: 2, windowMs: 60_000 }),
    (_req, res) => res.json({ data: { ok: true } }),
  );
  return { app, limiter };
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit and returns 429 beyond it', async () => {
    const { app } = makeApp();
    const first = await request(app).post('/limited');
    const second = await request(app).post('/limited');
    const third = await request(app).post('/limited');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('resets the window after it elapses', async () => {
    const clock = { now: () => new Date('2026-06-01T12:00:00Z') };
    const limiter = createRateLimiter(() => clock.now());
    const app: Express = express();
    app.post(
      '/limited',
      limiter({ name: 'limited', key: (req) => req.ip ?? 'unknown', limit: 1, windowMs: 60_000 }),
      (_req, res) => res.json({ data: { ok: true } }),
    );
    expect((await request(app).post('/limited')).status).toBe(200);
    expect((await request(app).post('/limited')).status).toBe(429);
    clock.now = () => new Date('2026-06-01T12:01:01Z');
    expect((await request(app).post('/limited')).status).toBe(200);
  });

  it('keys limits independently per caller', async () => {
    const { app } = makeApp();
    // supertest keeps the same ip; emulate distinct keys via header-driven key fn
    const limiter = createRateLimiter(() => new Date('2026-06-01T12:00:00Z'));
    const keyed: Express = express();
    keyed.post(
      '/limited',
      limiter({ name: 'limited', key: (req) => String(req.get('X-Caller') ?? 'unknown'), limit: 1, windowMs: 60_000 }),
      (_req, res) => res.json({ data: { ok: true } }),
    );
    expect((await request(keyed).post('/limited').set('X-Caller', 'alice')).status).toBe(200);
    expect((await request(keyed).post('/limited').set('X-Caller', 'bob')).status).toBe(200);
    expect((await request(keyed).post('/limited').set('X-Caller', 'alice')).status).toBe(429);
    expect(app).toBeDefined();
  });
});
