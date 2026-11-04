import { afterEach, expect, it, vi } from 'vitest';
import { getInbox, getNotificationTarget, savePreferences } from '../features/notifications/api';

afterEach(() => vi.unstubAllGlobals());
it('encodes URL-backed filters and decodes only safe inbox fields', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      data: {
        items: [
          {
            id: 'abc',
            eventType: 'REQUEST_NEW',
            readAt: null,
            createdAt: '2026-11-04T10:00:00Z',
            payload: 'must be stripped',
          },
        ],
        nextCursor: null,
        timezone: 'Asia/Riyadh',
      },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const page = await getInbox({ unreadOnly: true, cursor: null });
  expect(fetcher.mock.calls[0]![0]).toBe('/v1/notifications?unreadOnly=true');
  expect(page.items[0]).not.toHaveProperty('payload');
  expect(page.timezone).toBe('Asia/Riyadh');
});
it('rejects unsafe navigation targets and sends only explicit preference cells', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: { path: 'https://example.invalid' } }))
    .mockResolvedValueOnce(Response.json({ data: { ok: true } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(getNotificationTarget('abc')).rejects.toThrow();
  await savePreferences([{ eventType: 'VISIT_REMINDER', channel: 'EMAIL', optedOut: true }]);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
    preferences: [{ eventType: 'VISIT_REMINDER', channel: 'EMAIL', optedOut: true }],
  });
});
