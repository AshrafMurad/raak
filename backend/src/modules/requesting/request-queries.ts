import type { Request } from 'express';
import type { DatabaseClient } from '../../db/client';
import { agencyAction, lockActiveTenant, missing } from '../catalog/catalog.repository';
import type { AuthState } from '../auth/guards';
import { loadOwnedRequest, requireViewer } from './request-viewer';

const guestProjection = {
  id: true,
  reference: true,
  status: true,
  submittedAt: true,
  serviceSnapshot: true,
  version: true,
  history: {
    select: { toStatus: true, reason: true, at: true },
    orderBy: { at: 'asc' as const },
  },
};

export function createRequestQueries(db: DatabaseClient, now: () => Date) {
  return {
    portalRead: (tenantId: string, req: Request, requestId?: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        if (requestId) await loadOwnedRequest(tx, viewer, tenantId, requestId);
        const rows = await tx.serviceRequest.findMany({
          where: {
            tenantId,
            ...(requestId ? { id: requestId } : {}),
            ...(viewer.kind === 'GUEST'
              ? { id: viewer.guestRequestId! }
              : { customerAccountId: viewer.customerAccountId! }),
          },
          orderBy: { submittedAt: 'desc' },
          take: 100,
          select: guestProjection,
        });
        if (requestId && !rows[0]) throw missing();
        return requestId ? rows[0] : rows;
      }),
    queue: (auth: AuthState, cursor?: string, status?: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        const rows = await tx.serviceRequest.findMany({
          where: {
            tenantId,
            ...(status ? { status } : {}),
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          take: 21,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            reference: true,
            status: true,
            submittedAt: true,
            serviceSnapshot: true,
            version: true,
          },
        });
        const data = rows.slice(0, 20);
        return { items: data, nextCursor: rows.length > 20 ? data.at(-1)?.id : null };
      }),
    detail: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        const row = await tx.serviceRequest.findFirst({
          where: { tenantId, id },
          select: {
            ...guestProjection,
            requesterName: true,
            requesterEmailNormalized: true,
            requesterPhone: true,
            beneficiaryName: true,
            relationship: true,
            areaId: true,
            preferredWindowJson: true,
            notesRestricted: true,
          },
        });
        if (!row) throw missing();
        return row;
      }),
    notifications: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        return tx.requestNotification.findMany({
          where: { tenantId, staffId: auth.session.principalId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, requestId: true, eventType: true, readAt: true, createdAt: true },
        });
      }),
  };
}
