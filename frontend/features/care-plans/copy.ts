import ar from '../../messages/ar/care-plans.json';
import en from '../../messages/en/care-plans.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';

export type CarePlanCopy = typeof en;

export function carePlanCopy(locale: Locale): CarePlanCopy {
  return locale === 'ar' ? ar : en;
}

export function carePlanError(copy: CarePlanCopy, error: unknown): string {
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

export function localizedPlanService(
  value: { serviceNameAr: string; serviceNameEn: string },
  locale: Locale,
): string {
  return locale === 'ar' ? value.serviceNameAr : value.serviceNameEn;
}

export function formatPlanDateTime(value: string, locale: Locale, timezone?: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}
