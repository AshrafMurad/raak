import en from '../../messages/en/commercial.json';
import ar from '../../messages/ar/commercial.json';
import type { Locale } from '../../lib/i18n';

export type CommercialCopy = typeof en;
export function commercialCopy(locale: Locale): CommercialCopy {
  return locale === 'ar' ? ar : en;
}

export type QuoteStatusKey = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';

/** Typed status labels; no literal business text in components (docs 10). */
export function quoteStatusLabel(copy: CommercialCopy, status: string): string {
  const map: Record<string, keyof CommercialCopy> = {
    DRAFT: 'statusDraft',
    SENT: 'statusSent',
    ACCEPTED: 'statusAccepted',
    REJECTED: 'statusRejected',
    EXPIRED: 'statusExpired',
    SUPERSEDED: 'statusSuperseded',
  };
  const key = map[status];
  return key ? (copy[key] as string) : status;
}

export function requestStatusLabel(copy: CommercialCopy, status: string): string {
  const map: Record<string, keyof CommercialCopy> = {
    SUBMITTED: 'statusSubmitted',
    UNDER_REVIEW: 'statusUnderReview',
    AWAITING_CUSTOMER: 'statusAwaitingCustomer',
    APPROVED: 'statusApproved',
    REJECTED: 'statusRejectedRequest',
    WITHDRAWN: 'statusWithdrawn',
  };
  const key = map[status];
  return key ? (copy[key] as string) : status;
}

/** Revision state labels share the commercial feature namespace. */
export function revisionStatusLabel(copy: CommercialCopy, status: string): string {
  const labels: Record<string, string> = {
    PENDING: copy.statusRevisionPending,
    RESOLVED: copy.statusRevisionResolved,
    DECLINED: copy.statusRevisionDeclined,
    WITHDRAWN: copy.statusWithdrawn,
  };
  return labels[status] ?? status;
}

/** Error codes translated at the UI boundary (docs 10). */
export function errorLabel(copy: CommercialCopy, code: string): string {
  const map: Record<string, keyof CommercialCopy> = {
    QUOTE_EXPIRED: 'errorQuoteExpired',
    QUOTE_SUPERSEDED: 'errorQuoteSuperseded',
    QUOTE_REVISION_PENDING: 'errorRevisionPending',
    VERSION_CONFLICT: 'errorVersionConflict',
    VISIT_VERSION_CONFLICT: 'errorVersionConflict',
    STATE_TRANSITION_INVALID: 'errorState',
    VALIDATION_FAILED: 'errorValidation',
  };
  const key = map[code];
  return key ? (copy[key] as string) : copy['errorOther'];
}

/** Integer minor units -> localized currency string (docs 04: no floats). */
export function formatMinor(totalMinor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(totalMinor / 100);
}
