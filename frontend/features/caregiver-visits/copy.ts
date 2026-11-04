import ar from '../../messages/ar/caregiver-visits.json';
import en from '../../messages/en/caregiver-visits.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';

export type CaregiverVisitCopy = typeof en;

export function caregiverVisitCopy(locale: Locale): CaregiverVisitCopy {
  return locale === 'ar' ? ar : en;
}

export function caregiverVisitError(copy: CaregiverVisitCopy, error: unknown): string {
  if (!(error instanceof ApiRequestError)) return copy.error;
  if ([401, 403, 404].includes(error.status)) return copy.denied;
  if (error.code === 'VISIT_VERSION_CONFLICT' || error.code === 'VERSION_CONFLICT')
    return copy.stale;
  if ([409, 422].includes(error.status)) return copy.validation;
  return copy.error;
}

export { formatDateTime } from '../../lib/date-time';
