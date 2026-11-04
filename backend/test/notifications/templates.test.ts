import { expect, it } from 'vitest';
import { NOTIFICATION_EVENTS } from '../../src/contracts/notifications';
import { renderNotification, tenantNotificationUrl } from '../../src/modules/notifications/templates';

it.each(['ar', 'en'] as const)('renders every matrix code in %s with generic direction-safe content', (locale) => {
  for (const eventType of NOTIFICATION_EVENTS) {
    const url = tenantNotificationUrl({ baseDomain: 'example.invalid', slug: 'synthetic', locale, path: '/notifications', production: true });
    const mail = renderNotification(eventType, { locale, agencyName: 'Synthetic Agency', url });
    expect(mail.subject.length).toBeGreaterThan(5);
    expect(mail.subject).not.toContain('Synthetic Agency');
    expect(mail.text).toContain('Synthetic Agency');
    expect(mail.text).toContain(`https://synthetic.example.invalid/${locale}/notifications`);
    expect(mail.text).not.toMatch(/patient|diagnosis|address|<script|<html/i);
    if (locale === 'ar') expect(mail.text).toContain('\u2066' + url + '\u2069');
  }
});

it('refuses unsafe origins/paths and strips header/bidi injection from agency labels', () => {
  const input = { baseDomain: 'example.invalid', slug: 'synthetic', locale: 'en' as const, path: '/notifications', production: true };
  for (const patch of [{ baseDomain: 'evil.invalid/path' }, { slug: 'x@evil' }, { path: '//evil.invalid' }, { path: '/notifications#token=secret' }])
    expect(() => tenantNotificationUrl({ ...input, ...patch })).toThrow();
  const mail = renderNotification('VISIT_REMINDER', { locale: 'en', agencyName: 'Synthetic\r\nBcc: injected\u202e', url: tenantNotificationUrl(input) });
  expect(mail.text).not.toContain('\r');
  expect(mail.text).not.toContain('\u202e');
  expect(mail.subject).toBe('Appointment reminder');
});
