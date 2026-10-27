import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/health/ready/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('web readiness HTTP boundary', () => {
  it('reports ready only after the configured backend reports ready', async () => {
    vi.stubEnv('API_INTERNAL_BASE_URL', 'http://127.0.0.1:3001');
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        data: { status: 'ready', components: { db: 'UP' } },
      }),
    );
    vi.stubGlobal('fetch', upstream);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: 'ready', service: 'web', components: { api: 'UP' } },
    });
    expect(upstream.mock.calls[0]?.[0].toString()).toBe('http://127.0.0.1:3001/v1/health/ready');
  });

  it.each([
    ['upstream unavailable', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['network failure', () => Promise.reject(new Error('private upstream diagnostic'))],
    ['unrecognized payload', () => Promise.resolve(Response.json({ ok: true }))],
    ['backend not ready', () => Promise.resolve(Response.json({ data: { status: 'not_ready' } }))],
  ])('fails closed when %s', async (_name, fetcher) => {
    vi.stubEnv('API_INTERNAL_BASE_URL', 'http://127.0.0.1:3001');
    vi.stubGlobal('fetch', vi.fn(fetcher));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      data: { status: 'not_ready', components: { api: 'DOWN' } },
    });
    expect(JSON.stringify(body)).not.toContain('private upstream diagnostic');
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });

  it.each(['', 'file:///etc/passwd', 'http://user:secret@localhost:3001'])(
    'never fetches an absent or invalid configured URL: %s',
    async (baseUrl) => {
      vi.stubEnv('API_INTERNAL_BASE_URL', baseUrl);
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const response = await GET();
      expect(response.status).toBe(503);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
