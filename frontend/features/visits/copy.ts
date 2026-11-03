import ar from '../../messages/ar/visits.json';
import en from '../../messages/en/visits.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';

export type VisitCopy = typeof en;

export function visitCopy(locale: Locale): VisitCopy {
  return locale === 'ar' ? ar : en;
}

export function visitError(copy: VisitCopy, error: unknown): string {
  if (!(error instanceof ApiRequestError)) return copy.error;
  if ([401, 403, 404].includes(error.status)) return copy.denied;
  if (error.code === 'VISIT_VERSION_CONFLICT' || error.code === 'VERSION_CONFLICT')
    return copy.stale;
  if (error.code === 'SCHEDULE_CONFLICT') return copy.scheduleConflict;
  if (error.code === 'QUALIFICATION_INVALID' || error.code === 'CAREGIVER_UNAVAILABLE')
    return copy.caregiverUnavailable;
  if (error.code === 'IDEMPOTENCY_CONFLICT') return copy.idempotencyConflict;
  if ([409, 422].includes(error.status)) return copy.validation;
  return copy.error;
}

export function localizedVisitService(
  value: { nameAr: string; nameEn: string },
  locale: Locale,
): string {
  return locale === 'ar' ? value.nameAr : value.nameEn;
}

export function formatVisitDateTime(value: string, locale: Locale, timezone?: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}
