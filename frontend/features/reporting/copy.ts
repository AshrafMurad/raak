import ar from '../../messages/ar/reporting.json';
import en from '../../messages/en/reporting.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';

export const reportingCopy = (locale: Locale): typeof en => (locale === 'ar' ? ar : en);
export function reportingError(c: typeof en, error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return c.denied;
    if (error.status === 404) return c.unavailable;
    if (error.status === 422) return c.validation;
    if (error.status === 401) return c.denied;
  }
  return c.error;
}
export function auditError(c: typeof en, error: unknown) {
  if (error instanceof ApiRequestError && error.status === 403) return c.auditDenied;
  return reportingError(c, error);
}
