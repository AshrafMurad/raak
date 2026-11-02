import type { Quote } from '../../db/generated/prisma/client';
import { effectiveStatus } from './quote-workflow';

type QuoteRow = Pick<
  Quote,
  | 'id'
  | 'requestId'
  | 'quoteGroupId'
  | 'version'
  | 'rowVersion'
  | 'status'
  | 'currency'
  | 'lineItems'
  | 'totalMinor'
  | 'terms'
  | 'validUntil'
  | 'sentAt'
  | 'acceptedAt'
  | 'rejectedAt'
  | 'createdAt'
>;

export function portalQuote(quote: QuoteRow, now: () => Date) {
  return {
    id: quote.id,
    quoteGroupId: quote.quoteGroupId,
    version: quote.version,
    status: effectiveStatus(quote, now),
    currency: quote.currency,
    totalMinor: quote.totalMinor,
    lineItems: quote.lineItems,
    terms: quote.terms,
    validUntil: quote.validUntil?.toISOString() ?? null,
    sentAt: quote.sentAt?.toISOString() ?? null,
    acceptedAt: quote.acceptedAt?.toISOString() ?? null,
    rejectedAt: quote.rejectedAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
  };
}

export function agencyQuote(quote: QuoteRow, now: () => Date) {
  return { ...portalQuote(quote, now), rowVersion: quote.rowVersion, rawStatus: quote.status };
}
