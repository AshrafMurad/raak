import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { Prisma } from '../../db/generated/prisma/client';
import type { Quote } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { QuoteEvents } from '../../contracts/events';
import {
  QuoteDraftEditSchema,
  QuoteDraftSchema,
  QuoteLineItemsSchema,
  QuoteSendSchema,
  QuoteActionSchema,
  QuoteRevisionRequestSchema,
  RevisionDeclineSchema,
  RevisionReplacementSchema,
  quoteTotalMinor,
} from '../../contracts/quotes';
import { agencyAction, lockActiveTenant, missing, stale } from '../catalog/catalog.repository';
import type { AuthState } from '../auth/guards';
import { loadOwnedRequest, requireViewer } from '../requesting/request-viewer';
import {
  QUOTE_PROJECTION,
  conflict,
  effectiveStatus,
  expireDueSentQuotes,
  lockRequestRow,
  lockQuoteRow,
  lockRevisionRow,
  loadOwnedQuoteTarget,
  assertRequestOpen,
  assertEffectiveOffer,
  assertNoAcceptedAgreement,
  assertNoPendingRevision,
  assertRevisionOfferEffective,
} from './quote-workflow';

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

function portalQuote(quote: QuoteRow, now: () => Date) {
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

function agencyQuote(quote: QuoteRow, now: () => Date) {
  return { ...portalQuote(quote, now), rowVersion: quote.rowVersion, rawStatus: quote.status };
}

/** Notifies active coordinator-capable staff in-app (docs 11 QUOTE_* rows). */
async function notifyCoordinators(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
  eventType: 'QUOTE_RESPONSE' | 'QUOTE_REVISION_REQUESTED',
) {
  const recipients = await tx.staffAccount.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      role: { in: ['AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR'] },
    },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await tx.requestNotification.createMany({
    data: recipients.map((s) => ({ tenantId, requestId, staffId: s.id, eventType })),
    skipDuplicates: true,
  });
}

/** Stored JSON re-validated on read; frozen snapshots never trusted blindly. */
function parseLineItems(value: unknown): z.infer<typeof QuoteLineItemsSchema> {
  return QuoteLineItemsSchema.parse(value);
}

export function createQuoteService(db: DatabaseClient, now: () => Date) {
  return {
    /** Coordinator creates the next DRAFT version of the request's offer. */
    createDraft: (auth: AuthState, requestId: string, input: z.infer<typeof QuoteDraftSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockRequestRow(tx, tenantId, requestId);
        const request = await tx.serviceRequest.findFirst({
          where: { tenantId, id: requestId },
          select: { status: true },
        });
        if (!request) throw missing();
        assertRequestOpen(request.status);
        await assertNoAcceptedAgreement(tx, tenantId, requestId);
        const latest = await tx.quote.findFirst({
          where: { tenantId, requestId },
          orderBy: { version: 'desc' },
          select: { version: true, quoteGroupId: true },
        });
        if (latest) {
          const openDraft = await tx.quote.findFirst({
            where: { tenantId, quoteGroupId: latest.quoteGroupId, status: 'DRAFT' },
            select: { id: true },
          });
          if (openDraft)
            throw conflict(
              'STATE_TRANSITION_INVALID',
              'An open draft already exists for this request.',
            );
        }
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { currency: true },
        });
        const row = await tx.quote.create({
          data: {
            tenantId,
            requestId,
            quoteGroupId: latest?.quoteGroupId ?? randomUUID(),
            version: (latest?.version ?? 0) + 1,
            status: 'DRAFT',
            currency: tenant.currency,
            lineItems: input.lineItems,
            totalMinor: quoteTotalMinor(input.lineItems),
            terms: input.terms,
          },
          select: QUOTE_PROJECTION,
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'quote.drafted',
          subjectType: 'quote',
          subjectId: row.id,
          metadata: { requestId, version: row.version },
        });
        return agencyQuote(row, now);
      }),

    /** Coordinator edits the open DRAFT; frozen versions are immutable. */
    editDraft: (auth: AuthState, quoteId: string, input: z.infer<typeof QuoteDraftEditSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockQuoteRow(tx, tenantId, quoteId);
        const quote = await tx.quote.findFirst({
          where: { tenantId, id: quoteId },
          select: QUOTE_PROJECTION,
        });
        if (!quote) throw missing();
        if (quote.status !== 'DRAFT')
          throw conflict('STATE_TRANSITION_INVALID', 'Only draft quotes can be edited.');
        if (quote.rowVersion !== input.expectedVersion) throw stale();
        await assertNoAcceptedAgreement(tx, tenantId, quote.requestId);
        const updated = await tx.quote.update({
          where: { tenantId_id: { tenantId, id: quoteId } },
          data: {
            ...(input.lineItems
              ? { lineItems: input.lineItems, totalMinor: quoteTotalMinor(input.lineItems) }
              : {}),
            ...(input.terms !== undefined ? { terms: input.terms } : {}),
            rowVersion: { increment: 1 },
          },
          select: QUOTE_PROJECTION,
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'quote.draft_updated',
          subjectType: 'quote',
          subjectId: quoteId,
          metadata: { requestId: quote.requestId, version: quote.version },
        });
        return agencyQuote(updated, now);
      }),

    /** Freeze and publish: supersede the current effective SENT atomically,
     * resolve any pending revision, emit outbox + audit (docs 04 BR-QTE). */
    send: (auth: AuthState, quoteId: string, input: z.infer<typeof QuoteSendSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockQuoteRow(tx, tenantId, quoteId);
        const quote = await tx.quote.findFirst({
          where: { tenantId, id: quoteId },
          select: QUOTE_PROJECTION,
        });
        if (!quote) throw missing();
        await lockRequestRow(tx, tenantId, quote.requestId);
        const request = await tx.serviceRequest.findFirst({
          where: { tenantId, id: quote.requestId },
          select: { status: true },
        });
        if (!request) throw missing();
        assertRequestOpen(request.status);
        await assertNoAcceptedAgreement(tx, tenantId, quote.requestId);
        if (quote.status !== 'DRAFT')
          throw conflict('STATE_TRANSITION_INVALID', 'Only draft quotes can be sent.');
        if (quote.rowVersion !== input.expectedVersion) throw stale();
        await expireDueSentQuotes(tx, tenantId, now);
        const pending = await tx.quoteRevisionRequest.findFirst({
          where: { tenantId, quoteGroupId: quote.quoteGroupId, status: 'PENDING' },
          select: { quoteId: true },
        });
        if (pending) await assertRevisionOfferEffective(tx, tenantId, pending.quoteId, now);
        const lineItems = input.lineItems ?? parseLineItems(quote.lineItems);
        const terms = input.terms ?? quote.terms;
        const validUntil = new Date(now().getTime() + input.validForHours * 3600_000);
        const superseded = await tx.quote.updateMany({
          where: { tenantId, quoteGroupId: quote.quoteGroupId, status: 'SENT' },
          data: { status: 'SUPERSEDED' },
        });
        const resolved = await tx.quoteRevisionRequest.updateMany({
          where: { tenantId, quoteGroupId: quote.quoteGroupId, status: 'PENDING' },
          data: { status: 'RESOLVED', resolvedAt: now(), resolvedBy: auth.session.principalId },
        });
        const sent = await tx.quote.update({
          where: { tenantId_id: { tenantId, id: quoteId } },
          data: {
            status: 'SENT',
            lineItems,
            totalMinor: quoteTotalMinor(lineItems),
            terms,
            validUntil,
            sentAt: now(),
            rowVersion: { increment: 1 },
          },
          select: QUOTE_PROJECTION,
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: resolved.count > 0 ? QuoteEvents.REVISION_SENT : QuoteEvents.SENT,
          aggregateId: sent.id,
          payloadMinimal: { requestId: quote.requestId, quoteId: sent.id },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'quote.sent',
          subjectType: 'quote',
          subjectId: sent.id,
          metadata: {
            requestId: quote.requestId,
            version: sent.version,
            superseded: superseded.count,
            resolvedRevisions: resolved.count,
          },
        });
        return agencyQuote(sent, now);
      }),

    /** Agency-facing version history including drafts. */
    agencyList: (auth: AuthState, requestId: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockRequestRow(tx, tenantId, requestId);
        await expireDueSentQuotes(tx, tenantId, now);
        const rows = await tx.quote.findMany({
          where: { tenantId, requestId },
          orderBy: { version: 'asc' },
          select: QUOTE_PROJECTION,
        });
        return { items: rows.map((row) => agencyQuote(row, now)) };
      }),

    /** Verified requester history: frozen versions only, never drafts. */
    portalList: (tenantId: string, req: Request, requestId: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        await loadOwnedRequest(tx, viewer, tenantId, requestId);
        await expireDueSentQuotes(tx, tenantId, now);
        const rows = await tx.quote.findMany({
          where: { tenantId, requestId, status: { not: 'DRAFT' } },
          orderBy: { version: 'asc' },
          select: QUOTE_PROJECTION,
        });
        const pending = await tx.quoteRevisionRequest.findMany({
          where: { tenantId, quoteId: { in: rows.map((row) => row.id) }, status: 'PENDING' },
          select: { quoteId: true },
        });
        const pendingIds = new Set(pending.map((revision) => revision.quoteId));
        return {
          items: rows.map((row) => ({
            ...portalQuote(row, now),
            revisionPending: pendingIds.has(row.id),
          })),
        };
      }),

    /** Single-use-by-key verified acceptance (docs 07 idempotency; I11). */
    accept: (
      tenantId: string,
      req: Request,
      quoteId: string,
      input: z.infer<typeof QuoteActionSchema>,
      idempotencyKey: string,
    ) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        const requestHash = createHash('sha256')
          .update(`${quoteId}|${input.quoteVersion}`)
          .digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: {
            tenantId_principalId_key: {
              tenantId,
              principalId: viewer.principalId,
              key: idempotencyKey,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          return prior.responseSummary;
        }
        const { quote: fresh, request } = await loadOwnedQuoteTarget(
          tx,
          viewer,
          tenantId,
          quoteId,
          now,
        );
        const outcome = (status: string, at: Date) => ({
          quoteId,
          status,
          version: fresh.version,
          at: at.toISOString(),
        });
        if (fresh.status === 'ACCEPTED' && fresh.acceptedAt) {
          if (fresh.version !== input.quoteVersion) throw stale();
          return outcome('ACCEPTED', fresh.acceptedAt);
        }
        if (fresh.status === 'REJECTED')
          throw conflict('STATE_TRANSITION_INVALID', 'Quote was already rejected.');
        assertEffectiveOffer(fresh, input.quoteVersion, request.status, now);
        await assertNoAcceptedAgreement(tx, tenantId, fresh.requestId);
        await assertNoPendingRevision(tx, tenantId, fresh.quoteGroupId);
        const acceptedAt = now();
        await tx.quote.update({
          where: { tenantId_id: { tenantId, id: quoteId } },
          data: {
            status: 'ACCEPTED',
            acceptedAt,
            acceptedByType: viewer.kind === 'GUEST' ? 'GUEST' : 'CUSTOMER_ACCOUNT',
            acceptedById: viewer.principalId,
          },
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: QuoteEvents.RESPONDED,
          aggregateId: quoteId,
          payloadMinimal: { requestId: fresh.requestId, quoteId },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_CUSTOMER',
          action: 'quote.accepted',
          subjectType: 'quote',
          subjectId: quoteId,
          metadata: { requestId: fresh.requestId, version: fresh.version },
        });
        await notifyCoordinators(tx, tenantId, fresh.requestId, 'QUOTE_RESPONSE');
        const summary = outcome('ACCEPTED', acceptedAt);
        await tx.idempotencyKey.create({
          data: {
            tenantId,
            principalId: viewer.principalId,
            key: idempotencyKey,
            requestHash,
            responseSummary: summary,
            expiresAt: new Date(acceptedAt.getTime() + 24 * 3600_000),
          },
        });
        return summary;
      }),

    /** Verified rejection of the newest effective SENT offer. */
    reject: (
      tenantId: string,
      req: Request,
      quoteId: string,
      input: z.infer<typeof QuoteActionSchema>,
    ) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        const { quote: fresh, request } = await loadOwnedQuoteTarget(
          tx,
          viewer,
          tenantId,
          quoteId,
          now,
        );
        if (fresh.status === 'REJECTED' && fresh.rejectedAt) {
          if (fresh.version !== input.quoteVersion) throw stale();
          return {
            quoteId,
            status: 'REJECTED',
            version: fresh.version,
            at: fresh.rejectedAt.toISOString(),
          };
        }
        if (fresh.status === 'ACCEPTED')
          throw conflict('STATE_TRANSITION_INVALID', 'Quote was already accepted.');
        assertEffectiveOffer(fresh, input.quoteVersion, request.status, now);
        await assertNoPendingRevision(tx, tenantId, fresh.quoteGroupId);
        const rejectedAt = now();
        await tx.quote.update({
          where: { tenantId_id: { tenantId, id: quoteId } },
          data: { status: 'REJECTED', rejectedAt },
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: QuoteEvents.RESPONDED,
          aggregateId: quoteId,
          payloadMinimal: { requestId: fresh.requestId, quoteId },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_CUSTOMER',
          action: 'quote.rejected',
          subjectType: 'quote',
          subjectId: quoteId,
          metadata: { requestId: fresh.requestId, version: fresh.version },
        });
        await notifyCoordinators(tx, tenantId, fresh.requestId, 'QUOTE_RESPONSE');
        return {
          quoteId,
          status: 'REJECTED',
          version: fresh.version,
          at: rejectedAt.toISOString(),
        };
      }),

    /** One PENDING revision per quoteGroup; blocks acceptance meanwhile. */
    requestRevision: (
      tenantId: string,
      req: Request,
      quoteId: string,
      input: z.infer<typeof QuoteRevisionRequestSchema>,
    ) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        const { quote: fresh, request } = await loadOwnedQuoteTarget(
          tx,
          viewer,
          tenantId,
          quoteId,
          now,
        );
        assertEffectiveOffer(fresh, input.quoteVersion, request.status, now);
        try {
          const revision = await tx.quoteRevisionRequest.create({
            data: {
              tenantId,
              quoteGroupId: fresh.quoteGroupId,
              quoteId,
              message: input.message,
              requestedByType: viewer.kind === 'GUEST' ? 'GUEST' : 'CUSTOMER_ACCOUNT',
              requestedById: viewer.principalId,
            },
          });
          await enqueueOutbox(tx, {
            tenantId,
            eventType: QuoteEvents.REVISION_REQUESTED,
            aggregateId: revision.id,
            payloadMinimal: { requestId: fresh.requestId, quoteId },
          });
          await appendAudit(tx, {
            tenantId,
            actorType: 'AGENCY_CUSTOMER',
            action: 'quote.revision_requested',
            subjectType: 'quote_revision_request',
            subjectId: revision.id,
            metadata: { requestId: fresh.requestId, quoteId, version: fresh.version },
          });
          await notifyCoordinators(tx, tenantId, fresh.requestId, 'QUOTE_REVISION_REQUESTED');
          return { id: revision.id, quoteId, quoteVersion: fresh.version, status: 'PENDING' };
        } catch (error) {
          // The group's partial unique index is the only collision possible
          // here (ids are fresh UUIDs): a concurrent duplicate PENDING request.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            throw conflict('STATE_TRANSITION_INVALID', 'A revision request is already pending.');
          throw error;
        }
      }),

    /** Coordinator reviews the group's revision history. */
    listRevisions: (auth: AuthState, quoteId: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        const quote = await tx.quote.findFirst({
          where: { tenantId, id: quoteId },
          select: { quoteGroupId: true },
        });
        if (!quote) throw missing();
        const rows = await tx.quoteRevisionRequest.findMany({
          where: { tenantId, quoteGroupId: quote.quoteGroupId },
          orderBy: { createdAt: 'asc' },
        });
        return {
          items: rows.map((row) => ({
            id: row.id,
            quoteId: row.quoteId,
            status: row.status,
            message: row.message,
            createdAt: row.createdAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
            declineReason: row.declineReason,
          })),
        };
      }),

    /** Decline: record reason; the effective offer becomes actionable again
     * only if still valid (docs 03 F04). */
    declineRevision: (
      auth: AuthState,
      revisionId: string,
      input: z.infer<typeof RevisionDeclineSchema>,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockRevisionRow(tx, tenantId, revisionId);
        const revision = await tx.quoteRevisionRequest.findFirst({
          where: { tenantId, id: revisionId },
        });
        if (!revision) throw missing();
        if (revision.status !== 'PENDING')
          throw conflict(
            'STATE_TRANSITION_INVALID',
            'Only pending revision requests can be declined.',
          );
        const declined = await tx.quoteRevisionRequest.update({
          where: { tenantId_id: { tenantId, id: revisionId } },
          data: {
            status: 'DECLINED',
            resolvedAt: now(),
            resolvedBy: auth.session.principalId,
            declineReason: input.reason,
          },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'quote.revision_declined',
          subjectType: 'quote_revision_request',
          subjectId: revisionId,
          reason: input.reason,
          metadata: { quoteId: revision.quoteId },
        });
        return { id: declined.id, status: declined.status, quoteId: declined.quoteId };
      }),

    /** Atomic replacement: new version SENT, previous superseded, revision
     * resolved, notifications and audit in one transaction (docs 04 BR-QTE). */
    resolveWithReplacement: (
      auth: AuthState,
      revisionId: string,
      input: z.infer<typeof RevisionReplacementSchema>,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'quotes.manage');
        await lockRevisionRow(tx, tenantId, revisionId);
        const revision = await tx.quoteRevisionRequest.findFirst({
          where: { tenantId, id: revisionId },
        });
        if (!revision) throw missing();
        if (revision.status !== 'PENDING')
          throw conflict(
            'STATE_TRANSITION_INVALID',
            'Only pending revision requests can be resolved.',
          );
        const target = await tx.quote.findFirst({
          where: { tenantId, id: revision.quoteId },
          select: QUOTE_PROJECTION,
        });
        if (!target) throw missing();
        await lockRequestRow(tx, tenantId, target.requestId);
        const request = await tx.serviceRequest.findFirst({
          where: { tenantId, id: target.requestId },
          select: { status: true },
        });
        if (!request) throw missing();
        assertRequestOpen(request.status);
        await assertNoAcceptedAgreement(tx, tenantId, target.requestId);
        await expireDueSentQuotes(tx, tenantId, now);
        await assertRevisionOfferEffective(tx, tenantId, target.id, now);
        const latest = await tx.quote.findFirst({
          where: { tenantId, quoteGroupId: revision.quoteGroupId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const draft = await tx.quote.findFirst({
          where: { tenantId, quoteGroupId: revision.quoteGroupId, status: 'DRAFT' },
          select: { id: true, version: true },
        });
        const validUntil = new Date(now().getTime() + input.validForHours * 3600_000);
        await tx.quote.updateMany({
          where: { tenantId, quoteGroupId: revision.quoteGroupId, status: 'SENT' },
          data: { status: 'SUPERSEDED' },
        });
        const nextVersion = draft ? draft.version : (latest?.version ?? 0) + 1;
        const replacement = draft
          ? await tx.quote.update({
              where: { tenantId_id: { tenantId, id: draft.id } },
              data: {
                status: 'SENT',
                lineItems: input.lineItems,
                totalMinor: quoteTotalMinor(input.lineItems),
                terms: input.terms,
                validUntil,
                sentAt: now(),
                rowVersion: { increment: 1 },
              },
              select: QUOTE_PROJECTION,
            })
          : await tx.quote.create({
              data: {
                tenantId,
                requestId: target.requestId,
                quoteGroupId: revision.quoteGroupId,
                version: nextVersion,
                status: 'SENT',
                currency: target.currency,
                lineItems: input.lineItems,
                totalMinor: quoteTotalMinor(input.lineItems),
                terms: input.terms,
                validUntil,
                sentAt: now(),
              },
              select: QUOTE_PROJECTION,
            });
        await tx.quoteRevisionRequest.update({
          where: { tenantId_id: { tenantId, id: revisionId } },
          data: { status: 'RESOLVED', resolvedAt: now(), resolvedBy: auth.session.principalId },
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: QuoteEvents.REVISION_SENT,
          aggregateId: replacement.id,
          payloadMinimal: { requestId: target.requestId, quoteId: replacement.id },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'quote.revision_resolved',
          subjectType: 'quote_revision_request',
          subjectId: revisionId,
          metadata: { replacementQuoteId: replacement.id, version: replacement.version },
        });
        return agencyQuote(replacement, now);
      }),
  };
}

export type QuoteService = ReturnType<typeof createQuoteService>;
