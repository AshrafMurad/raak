import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, privateDownloadHref } from '../lib/api-client';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('preserves binary upload MIME and resolves private downloads to the API without allowing external URLs', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001');
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data: { scanStatus: 'PROCESSING' } }) });
  vi.stubGlobal('fetch', fetcher);
  const bytes = new Blob(['%PDF-1.7\nSynthetic only\n%%EOF'], { type: 'application/pdf' });
  await apiRequest('/documents/11111111-1111-4111-8111-111111111111/upload', {
    method: 'PUT',
    body: bytes,
    headers: { 'Content-Type': 'application/pdf' },
  });
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(new Headers(init.headers).get('Content-Type')).toBe('application/pdf');
  expect(init.body).toBe(bytes);
  const path =
    '/v1/documents/11111111-1111-4111-8111-111111111111/content?ticket=synthetic_download_ticket_123456';
  expect(privateDownloadHref(path)).toBe(`http://localhost:3001${path}`);
  expect(() => privateDownloadHref('https://public-storage.invalid/private.pdf')).toThrow(
    'INVALID_DOWNLOAD_PATH',
  );
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
