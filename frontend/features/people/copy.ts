import ar from '../../messages/ar/people.json';
import en from '../../messages/en/people.json';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';
export type PeopleCopy = typeof en;
export const peopleCopy = (locale: Locale): PeopleCopy => (locale === 'ar' ? ar : en);
export function peopleError(c: PeopleCopy, error: unknown) {
  if (!(error instanceof ApiRequestError)) return c.error;
  if (error.status === 503) return c.unavailable;
  if ([401, 403, 404].includes(error.status))
    return error.code === 'TOKEN_EXPIRED' ? c.expired : c.denied;
  if (error.code === 'TOKEN_ALREADY_USED') return c.used;
  if (error.code === 'VERSION_CONFLICT') return c.stale;
  if ([409, 422].includes(error.status)) return c.validation;
  return c.error;
}
export function stateLabel(c: PeopleCopy, state: string) {
  return state === 'EXPIRED'
    ? c.expiredStatus
    : (c.states[state as keyof typeof c.states] ?? c.error);
}
