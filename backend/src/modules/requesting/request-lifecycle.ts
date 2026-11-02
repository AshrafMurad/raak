import type { Request } from 'express';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { RequestApproveSchema, RequestInfoSchema } from '../../contracts/quotes';
import { ApiError } from '../../api-error';
import { agencyAction, lockActiveTenant, missing, stale } from '../catalog/catalog.repository';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import type { AuthState } from '../auth/guards';
import { RequestEvents } from '../../contracts/events';
import { loadOwnedRequest, requireViewer } from './request-viewer';

const invalidTransition = (message: string) =>
  new ApiError(409, 'STATE_TRANSITION_INVALID', message);
const OPEN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CUSTOMER'];

export function createRequestLifecycle(db: DatabaseClient, now: () => Date) {
  /** Shared coordinator/customer transition core: locks the tenant-scoped
   * request row, validates the optimistic version, then applies one guarded
   * state change with history/audit/outbox in the same transaction. */
  async function transition(
    tx: Prisma.TransactionClient,
    options: {
      tenantId: string;
      requestId: string;
      from: readonly string[];
      to: string;
      expectedVersion: number;
      actorId?: string;
      actorType?: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER';
      reason?: string;
      action: string;
      event: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM service_requests WHERE tenant_id = ${options.tenantId}::uuid AND id = ${options.requestId}::uuid FOR UPDATE`;
    if (!rows[0]) throw missing();
    const request = await tx.serviceRequest.findFirst({
      where: { tenantId: options.tenantId, id: options.requestId },
    });
    if (!request) throw missing();
    if (request.version !== options.expectedVersion) throw stale();
    if (!options.from.includes(request.status))
      throw invalidTransition('Request cannot change from its current status.');
    const updated = await tx.serviceRequest.update({
      where: { tenantId_id: { tenantId: options.tenantId, id: options.requestId } },
      data: {
        status: options.to,
        version: { increment: 1 },
        ...(['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(options.to)
          ? { decisionAt: now(), decisionReason: options.reason ?? null }
          : {}),
        ...(options.to === 'APPROVED' || options.to === 'REJECTED'
          ? { decisionStaffId: options.actorId ?? null }
          : {}),
      },
      select: { id: true, status: true, version: true },
    });
    await tx.requestStatusHistory.create({
      data: {
        tenantId: options.tenantId,
        requestId: options.requestId,
        fromStatus: request.status,
        toStatus: options.to,
        ...(options.actorId ? { actorId: options.actorId } : {}),
        ...(options.reason ? { reason: options.reason } : {}),
        at: now(),
      },
    });
    await appendAudit(tx, {
      tenantId: options.tenantId,
      ...(options.actorType ? { actorType: options.actorType } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
      action: options.action,
      subjectType: 'service_request',
      subjectId: options.requestId,
      metadata: options.metadata ?? {},
    });
    await enqueueOutbox(tx, {
      tenantId: options.tenantId,
      eventType: options.event,
      aggregateId: options.requestId,
      payloadMinimal: {},
    });
    return updated;
  }

  return {
    startReview: (auth: AuthState, id: string, expectedVersion: number) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        const row = await tx.serviceRequest.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        if (row.version !== expectedVersion) throw stale();
        if (row.status !== 'SUBMITTED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Request is no longer submitted.');
        const updated = await tx.serviceRequest.update({
          where: { tenantId_id: { tenantId, id } },
          data: { status: 'UNDER_REVIEW', version: { increment: 1 } },
          select: { id: true, status: true, version: true },
        });
        await tx.requestStatusHistory.create({
          data: {
            tenantId,
            requestId: id,
            fromStatus: 'SUBMITTED',
            toStatus: 'UNDER_REVIEW',
            actorId: auth.session.principalId,
            at: now(),
          },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'request.review_started',
          subjectType: 'service_request',
          subjectId: id,
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: RequestEvents.REVIEW_STARTED,
          aggregateId: id,
          payloadMinimal: {},
        });
        return updated;
      }),
    requestInfo: (auth: AuthState, id: string, input: z.infer<typeof RequestInfoSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        return transition(tx, {
          tenantId,
          requestId: id,
          from: ['UNDER_REVIEW'],
          to: 'AWAITING_CUSTOMER',
          expectedVersion: input.expectedVersion,
          actorId: auth.session.principalId,
          actorType: 'AGENCY_STAFF',
          reason: input.note,
          action: 'request.info_needed',
          event: RequestEvents.INFO_NEEDED,
        });
      }),
    respond: (tenantId: string, req: Request, id: string, note: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        const owned = await loadOwnedRequest(tx, viewer, tenantId, id);
        return transition(tx, {
          tenantId,
          requestId: id,
          from: ['AWAITING_CUSTOMER'],
          to: 'UNDER_REVIEW',
          expectedVersion: owned.version,
          ...(viewer.kind === 'CUSTOMER' && viewer.customerAccountId
            ? { actorId: viewer.customerAccountId, actorType: 'AGENCY_CUSTOMER' as const }
            : {}),
          reason: note,
          action: 'request.responded',
          event: RequestEvents.RESPONDED,
        });
      }),
    approve: (auth: AuthState, id: string, input: z.infer<typeof RequestApproveSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        const request = await tx.serviceRequest.findFirst({
          where: { tenantId, id },
          select: { status: true, version: true, priceAcknowledged: true, serviceSnapshot: true },
        });
        if (!request) throw missing();
        const snapshot = request.serviceSnapshot as {
          pricingType?: string;
          priceMinor?: number | null;
        };
        const latestOffer = await tx.quote.findFirst({
          where: { tenantId, requestId: id, status: { not: 'DRAFT' } },
          orderBy: { version: 'desc' },
          select: { id: true, status: true },
        });
        let commercial: 'FIXED_ACK' | 'QUOTE';
        if (snapshot.pricingType === 'FIXED' && !latestOffer) {
          // A published formal offer replaces the original acknowledgment as
          // the approval prerequisite, even if it later expires/is rejected.
          if (!request.priceAcknowledged || snapshot.priceMinor == null)
            throw invalidTransition('Fixed-price acknowledgment is required before approval.');
          commercial = 'FIXED_ACK';
        } else {
          if (latestOffer?.status !== 'ACCEPTED')
            throw invalidTransition('An accepted quote is required before approval.');
          commercial = 'QUOTE';
        }
        return transition(tx, {
          tenantId,
          requestId: id,
          from: ['UNDER_REVIEW'],
          to: 'APPROVED',
          expectedVersion: input.expectedVersion,
          actorId: auth.session.principalId,
          actorType: 'AGENCY_STAFF',
          action: 'request.approved',
          event: RequestEvents.APPROVED,
          metadata: { commercial },
        });
      }),
    reject: (auth: AuthState, id: string, expectedVersion: number, reason: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        return transition(tx, {
          tenantId,
          requestId: id,
          from: OPEN_STATUSES,
          to: 'REJECTED',
          expectedVersion,
          actorId: auth.session.principalId,
          actorType: 'AGENCY_STAFF',
          reason,
          action: 'request.rejected',
          event: RequestEvents.REJECTED,
        });
      }),
    withdraw: (tenantId: string, req: Request, id: string, reason: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const viewer = await requireViewer(tx, tenantId, req, now);
        const owned = await loadOwnedRequest(tx, viewer, tenantId, id);
        return transition(tx, {
          tenantId,
          requestId: id,
          from: OPEN_STATUSES,
          to: 'WITHDRAWN',
          expectedVersion: owned.version,
          ...(viewer.kind === 'CUSTOMER' && viewer.customerAccountId
            ? { actorId: viewer.customerAccountId, actorType: 'AGENCY_CUSTOMER' as const }
            : {}),
          ...(reason ? { reason } : {}),
          action: 'request.withdrawn',
          event: RequestEvents.WITHDRAWN,
        });
      }),
  };
}
