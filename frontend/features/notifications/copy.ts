import ar from '../../messages/ar/notifications.json';
import en from '../../messages/en/notifications.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';
export const notificationCopy = (locale: Locale): typeof en => (locale === 'ar' ? ar : en);
export function notificationError(c: typeof en, error: unknown) {
  if (error instanceof ApiRequestError) {
    if ([401, 403].includes(error.status)) return c.denied;
    if (error.status === 404) return c.unavailable;
    if (error.code === 'VERSION_CONFLICT') return c.stale;
  }
  return c.error;
}
