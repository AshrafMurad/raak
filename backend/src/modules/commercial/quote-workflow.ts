import { ApiError } from '../../api-error';
import type { Prisma, Quote } from '../../db/generated/prisma/client';
import { missing, stale } from '../catalog/catalog.repository';
import { loadOwnedRequest, type RequestViewer } from '../requesting/request-viewer';

type ConflictCode =
  'STATE_TRANSITION_INVALID' | 'QUOTE_EXPIRED' | 'QUOTE_SUPERSEDED' | 'QUOTE_REVISION_PENDING';
export const conflict = (code: ConflictCode, message: string) => new ApiError(409, code, message);

export const QUOTE_PROJECTION = {
  id: true,
  requestId: true,
  quoteGroupId: true,
  version: true,
  rowVersion: true,
  status: true,
  currency: true,
  lineItems: true,
  totalMinor: true,
  terms: true,
  validUntil: true,
  sentAt: true,
  acceptedAt: true,
  rejectedAt: true,
  createdAt: true,
} satisfies Prisma.QuoteSelect;

/** These helpers borrow an existing transaction. The caller must first hold
 * the active tenant writer lock; no helper opens/commits its own transaction. */
export function effectiveStatus(
  quote: Pick<Quote, 'status' | 'validUntil'>,
  now: () => Date,
): string {
  return quote.status === 'SENT' &&
    quote.validUntil &&
    quote.validUntil.getTime() <= now().getTime()
    ? 'EXPIRED'
    : quote.status;
}

export function expireDueSentQuotes(
  tx: Prisma.TransactionClient,
  tenantId: string,
  now: () => Date,
) {
  return tx.quote.updateMany({
    where: { tenantId, status: 'SENT', validUntil: { lte: now() } },
    data: { status: 'EXPIRED' },
  });
}

export async function lockRequestRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM service_requests WHERE tenant_id = ${tenantId}::uuid AND id = ${requestId}::uuid FOR UPDATE`;
  if (!rows[0]) throw missing();
}

export async function lockQuoteRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quoteId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM quotes WHERE tenant_id = ${tenantId}::uuid AND id = ${quoteId}::uuid FOR UPDATE`;
  if (!rows[0]) throw missing();
}

export async function lockRevisionRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  revisionId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM quote_revision_requests WHERE tenant_id = ${tenantId}::uuid AND id = ${revisionId}::uuid FOR UPDATE`;
  if (!rows[0]) throw missing();
}

/** All customer action paths share ownership, locking and expiry refresh.
 * Acceptance calls this after its principal-scoped idempotency lookup. */
export async function loadOwnedQuoteTarget(
  tx: Prisma.TransactionClient,
  viewer: RequestViewer,
  tenantId: string,
  quoteId: string,
  now: () => Date,
) {
  await lockQuoteRow(tx, tenantId, quoteId);
  const quote = await tx.quote.findFirst({
    where: { tenantId, id: quoteId },
    select: QUOTE_PROJECTION,
  });
  if (!quote || quote.status === 'DRAFT') throw missing();
  const request = await loadOwnedRequest(tx, viewer, tenantId, quote.requestId);
  await lockRequestRow(tx, tenantId, quote.requestId);
  await expireDueSentQuotes(tx, tenantId, now);
  const fresh = await tx.quote.findFirst({
    where: { tenantId, id: quoteId },
    select: QUOTE_PROJECTION,
  });
  if (!fresh) throw missing();
  return { quote: fresh, request };
}

export function assertRequestOpen(status: string) {
  if (!['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CUSTOMER'].includes(status))
    throw conflict('STATE_TRANSITION_INVALID', 'Request is no longer open.');
}

/** Stable ACCEPTED/REJECTED replays are handled by the caller before this guard. */
export function assertEffectiveOffer(
  quote: Pick<Quote, 'status' | 'validUntil' | 'version'>,
  version: number,
  requestStatus: string,
  now: () => Date,
) {
  if (quote.status === 'SUPERSEDED')
    throw conflict('QUOTE_SUPERSEDED', 'A newer offer is available.');
  if (effectiveStatus(quote, now) === 'EXPIRED')
    throw conflict('QUOTE_EXPIRED', 'This offer has expired.');
  if (quote.status !== 'SENT')
    throw conflict('STATE_TRANSITION_INVALID', 'This offer is no longer open.');
  if (quote.version !== version) throw stale();
  assertRequestOpen(requestStatus);
}

export async function assertNoPendingRevision(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quoteGroupId: string,
) {
  const pending = await tx.quoteRevisionRequest.findFirst({
    where: { tenantId, quoteGroupId, status: 'PENDING' },
    select: { id: true },
  });
  if (pending)
    throw conflict('QUOTE_REVISION_PENDING', 'A revision request is pending for this offer.');
}

/** Post-acceptance amendments are deferred in V1. Shared by every writer. */
export async function assertNoAcceptedAgreement(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
) {
  const accepted = await tx.quote.findFirst({
    where: { tenantId, requestId, status: 'ACCEPTED' },
    select: { id: true },
  });
  if (accepted)
    throw conflict('STATE_TRANSITION_INVALID', 'This request already has an accepted agreement.');
}

/** Generic draft publication and dedicated replacement must enforce the same
 * wall-clock validity on the exact quote that the pending revision targets. */
export async function assertRevisionOfferEffective(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quoteId: string,
  now: () => Date,
) {
  const target = await tx.quote.findFirst({
    where: { tenantId, id: quoteId },
    select: { status: true, validUntil: true },
  });
  if (!target || effectiveStatus(target, now) !== 'SENT')
    throw conflict('STATE_TRANSITION_INVALID', 'The offer under revision is no longer effective.');
}
