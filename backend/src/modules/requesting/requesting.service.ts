import { createHmac, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import {
  ServiceConfigSchema,
  BrandingSchema,
  type GuestSubmission,
  type AccessLinkSchema,
} from '../../contracts/catalog';
import { RequestApproveSchema, RequestInfoSchema } from '../../contracts/quotes';
import { ApiError } from '../../api-error';
import { generateToken, hashToken } from '../auth/crypto';
import { agencyAction, lockActiveTenant, missing, stale } from '../catalog/catalog.repository';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { sealSecret } from './secrets';
import type { AuthState } from '../auth/guards';
import { RequestEvents } from '../../contracts/events';
import { loadOwnedRequest, requireViewer } from './request-viewer';

export const GUEST_TOKEN_TTL_MS = 15 * 60_000;
export const GUEST_SESSION_TTL_MS = 30 * 60_000;
const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Verification required.');
const invalidTransition = (message: string) =>
  new ApiError(409, 'STATE_TRANSITION_INVALID', message);
const OPEN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CUSTOMER'];
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

export function createRequestingService(
  db: DatabaseClient,
  now: () => Date,
  encryptionKey?: string,
) {
  const key = () => {
    if (!encryptionKey)
      throw new ApiError(503, 'INTERNAL_ERROR', 'Service temporarily unavailable.');
    return encryptionKey;
  };
  async function issue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestId: string,
    email: string,
  ) {
    const secret = generateToken().token;
    const row = await tx.guestActionToken.create({
      data: {
        tenantId,
        requestId,
        tokenHash: hashToken(secret),
        emailHash: hashToken(email),
        expiresAt: new Date(now().getTime() + GUEST_TOKEN_TTL_MS),
      },
    });
    await tx.guestActionToken.update({
      where: { id: row.id },
      data: { encryptedSecret: sealSecret(secret, key(), `${tenantId}:${row.id}`) },
    });
    await enqueueOutbox(tx, {
      tenantId,
      eventType: RequestEvents.ACCESS_EMAIL,
      aggregateId: row.id,
      payloadMinimal: { requestId },
    });
  }
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
    submit: (tenantId: string, input: GuestSubmission, idempotencyKey: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const payloadHash = createHmac('sha256', key()).update(JSON.stringify(input)).digest('hex');
        const prior = await tx.serviceRequest.findFirst({ where: { tenantId, idempotencyKey } });
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Submission key already used.');
          return { id: prior.id, reference: prior.reference };
        }
        if (input.website) throw new ApiError(422, 'VALIDATION_FAILED', 'Submission unavailable.');
        const service = await tx.agencyService.findFirst({
          where: { tenantId, id: input.serviceId, isEnabled: true, isPublished: true },
        });
        if (!service) throw missing();
        if (service.version !== input.serviceVersion) throw stale();
        const config = ServiceConfigSchema.parse(service.config);
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const brand = tenant.brandJson ? BrandingSchema.parse(tenant.brandJson) : null;
        if (
          !config.serviceAreaIds.includes(input.areaId) ||
          (brand && !brand.areas.some((a) => a.id === input.areaId))
        )
          throw new ApiError(422, 'VALIDATION_FAILED', 'Area unavailable.');
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: tenant.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now());
        if (input.preferredDate < today)
          throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a future preference.');
        if (config.pricingType === 'FIXED' && !input.priceAcknowledged)
          throw new ApiError(422, 'VALIDATION_FAILED', 'Price acknowledgment required.');
        const recent = await tx.serviceRequest.count({
          where: {
            tenantId,
            requesterEmailNormalized: input.requesterEmail,
            submittedAt: { gt: new Date(now().getTime() - 3600_000) },
          },
        });
        if (recent >= 5) throw new ApiError(429, 'RATE_LIMITED', 'Try again later.');
        const row = await tx.serviceRequest.create({
          data: {
            tenantId,
            agencyServiceId: service.id,
            reference: `REQ-${randomBytes(8).toString('hex').toUpperCase()}`,
            idempotencyKey,
            payloadHash,
            requesterName: input.requesterName,
            requesterEmailNormalized: input.requesterEmail,
            requesterPhone: input.requesterPhone,
            beneficiaryName: input.beneficiaryName,
            relationship: input.relationship,
            areaId: input.areaId,
            preferredWindowJson: {
              date: input.preferredDate,
              period: input.preferredPeriod,
              timezone: tenant.timezone,
            },
            notesRestricted: input.notes,
            locale: input.locale,
            privacyVersion: input.privacyVersion,
            serviceSnapshot: {
              ...config,
              currency: tenant.currency,
              publishedVersion: service.version,
            },
            priceAcknowledged: input.priceAcknowledged,
            submittedAt: now(),
          },
        });
        await tx.requestStatusHistory.create({
          data: { tenantId, requestId: row.id, toStatus: 'SUBMITTED', at: now() },
        });
        await appendAudit(tx, {
          tenantId,
          action: 'request.submitted',
          subjectType: 'service_request',
          subjectId: row.id,
        });
        await issue(tx, tenantId, row.id, row.requesterEmailNormalized);
        await enqueueOutbox(tx, {
          tenantId,
          eventType: RequestEvents.SUBMITTED,
          aggregateId: row.id,
          payloadMinimal: {},
        });
        const recipients = await tx.staffAccount.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            role: { in: ['AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR'] },
          },
          select: { id: true },
        });
        await tx.requestNotification.createMany({
          data: recipients.map((s) => ({ tenantId, requestId: row.id, staffId: s.id })),
        });
        return { id: row.id, reference: row.reference };
      }),
    accessLink: (tenantId: string, input: z.infer<typeof AccessLinkSchema>) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const row = await tx.serviceRequest.findFirst({
          where: { tenantId, reference: input.reference, requesterEmailNormalized: input.email },
        });
        if (!row) return;
        const count = await tx.guestActionToken.count({
          where: {
            tenantId,
            requestId: row.id,
            expiresAt: { gt: new Date(now().getTime() - 45 * 60_000) },
          },
        });
        // Non-enumerating suppression uses the same 202 response as no match.
        if (count >= 4) return;
        await issue(tx, tenantId, row.id, row.requesterEmailNormalized);
      }),
    consume: (tenantId: string, secret: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const row = await tx.guestActionToken.findFirst({
          where: { tenantId, tokenHash: hashToken(secret), purpose: 'REQUEST_STATUS' },
          include: { request: { select: { requesterEmailNormalized: true } } },
        });
        if (!row || row.emailHash !== hashToken(row.request.requesterEmailNormalized))
          throw unauthenticated();
        if (row.consumedAt) throw new ApiError(409, 'TOKEN_ALREADY_USED', 'Link already used.');
        const consumedAt = now();
        const claim = await tx.guestActionToken.updateMany({
          where: { id: row.id, tenantId, consumedAt: null, expiresAt: { gt: consumedAt } },
          data: { consumedAt, encryptedSecret: null },
        });
        if (claim.count !== 1) throw new ApiError(401, 'TOKEN_EXPIRED', 'Link expired.');
        const sessionToken = generateToken().token;
        await tx.guestSession.create({
          data: {
            tenantId,
            requestId: row.requestId,
            secretHash: hashToken(sessionToken),
            expiresAt: new Date(consumedAt.getTime() + GUEST_SESSION_TTL_MS),
          },
        });
        await appendAudit(tx, {
          tenantId,
          action: 'request.ownership_verified',
          subjectType: 'service_request',
          subjectId: row.requestId,
        });
        return { sessionToken, requestId: row.requestId };
      }),
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
