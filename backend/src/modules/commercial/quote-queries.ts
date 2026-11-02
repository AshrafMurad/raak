import type { Request } from 'express';
import type { DatabaseClient } from '../../db/client';
import { agencyAction, lockActiveTenant } from '../catalog/catalog.repository';
import type { AuthState } from '../auth/guards';
import { loadOwnedRequest, requireViewer } from '../requesting/request-viewer';
import { agencyQuote, portalQuote } from './quote-projection';
import { QUOTE_PROJECTION, expireDueSentQuotes, lockRequestRow } from './quote-workflow';

export function createQuoteQueries(db: DatabaseClient, now: () => Date) {
  return {
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
  };
}
