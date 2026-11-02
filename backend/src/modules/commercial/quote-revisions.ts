import type { Request } from 'express';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { Prisma } from '../../db/generated/prisma/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { QuoteEvents } from '../../contracts/events';
import {
  QuoteRevisionRequestSchema,
  RevisionDeclineSchema,
  RevisionReplacementSchema,
  quoteTotalMinor,
} from '../../contracts/quotes';
import { agencyAction, lockActiveTenant, missing } from '../catalog/catalog.repository';
import type { AuthState } from '../auth/guards';
import { requireViewer } from '../requesting/request-viewer';
import { agencyQuote } from './quote-projection';
import { notifyCoordinators } from './quote-notifications';
import {
  QUOTE_PROJECTION,
  conflict,
  expireDueSentQuotes,
  lockRequestRow,
  lockRevisionRow,
  loadOwnedQuoteTarget,
  assertRequestOpen,
  assertEffectiveOffer,
  assertNoAcceptedAgreement,
  assertRevisionOfferEffective,
} from './quote-workflow';

export function createQuoteRevisions(db: DatabaseClient, now: () => Date) {
  return {
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

    /** Decline records a reason; the offer is actionable only while valid. */
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

    /** Replacement publication and revision resolution commit atomically. */
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
