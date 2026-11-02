import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { QuoteEvents } from '../../contracts/events';
import {
  QuoteDraftEditSchema,
  QuoteDraftSchema,
  QuoteLineItemsSchema,
  QuoteSendSchema,
  quoteTotalMinor,
} from '../../contracts/quotes';
import { agencyAction, missing, stale } from '../catalog/catalog.repository';
import type { AuthState } from '../auth/guards';
import { agencyQuote } from './quote-projection';
import {
  QUOTE_PROJECTION,
  conflict,
  expireDueSentQuotes,
  lockRequestRow,
  lockQuoteRow,
  assertRequestOpen,
  assertNoAcceptedAgreement,
  assertRevisionOfferEffective,
} from './quote-workflow';

/** Stored JSON re-validated on read; frozen snapshots never trusted blindly. */
function parseLineItems(value: unknown): z.infer<typeof QuoteLineItemsSchema> {
  return QuoteLineItemsSchema.parse(value);
}

export function createQuoteDrafts(db: DatabaseClient, now: () => Date) {
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

    /** Freeze, supersede and resolve pending revisions in one transaction. */
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
  };
}
