import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../lib/api-client';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('preserves cursor parameters when an explicit API origin is configured', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001');
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  vi.stubGlobal('fetch', fetcher);
  await apiRequest('/agency/requests?cursor=11111111-1111-4111-8111-111111111111');
  const url = new URL(fetcher.mock.calls[0]![0]);
  expect(url.pathname).toBe('/v1/agency/requests');
  expect(url.searchParams.get('cursor')).toBe('11111111-1111-4111-8111-111111111111');
});
