import { createHmac, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import {
  ServiceConfigSchema,
  BrandingSchema,
  type GuestSubmission,
  type AccessLinkSchema,
} from '../../contracts/catalog';
import { ApiError } from '../../api-error';
import { generateToken, hashToken } from '../auth/crypto';
import { agencyAction, lockActiveTenant, missing, stale } from '../catalog/catalog.repository';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { sealSecret } from './secrets';
import type { AuthState } from '../auth/guards';
import { RequestEvents } from '../../contracts/events';

export const GUEST_TOKEN_TTL_MS = 15 * 60_000;
export const GUEST_SESSION_TTL_MS = 30 * 60_000;
const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Verification required.');
const guestProjection = {
  id: true,
  reference: true,
  status: true,
  submittedAt: true,
  serviceSnapshot: true,
  version: true,
  history: { select: { toStatus: true, at: true }, orderBy: { at: 'asc' as const } },
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
    guestRead: (tenantId: string, secret: string | undefined, requestId?: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        if (!secret) throw unauthenticated();
        const session = await tx.guestSession.findFirst({
          where: { tenantId, secretHash: hashToken(secret), expiresAt: { gt: now() } },
        });
        if (!session) throw unauthenticated();
        if (requestId && requestId !== session.requestId) throw missing();
        const row = await tx.serviceRequest.findFirst({
          where: { tenantId, id: session.requestId },
          select: guestProjection,
        });
        if (!row) throw missing();
        return requestId ? row : [row];
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
    notifications: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'requests.review');
        return tx.requestNotification.findMany({
          where: { tenantId, staffId: auth.session.principalId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, requestId: true, readAt: true, createdAt: true },
        });
      }),
  };
}
