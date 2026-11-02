import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { QuoteEvents } from '../../contracts/events';
import { QuoteActionSchema } from '../../contracts/quotes';
import { lockActiveTenant, stale } from '../catalog/catalog.repository';
import { requireViewer } from '../requesting/request-viewer';
import { notifyCoordinators } from './quote-notifications';
import {
  conflict,
  loadOwnedQuoteTarget,
  assertEffectiveOffer,
  assertNoAcceptedAgreement,
  assertNoPendingRevision,
} from './quote-workflow';

export function createQuoteResponses(db: DatabaseClient, now: () => Date) {
  return {
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
  };
}
