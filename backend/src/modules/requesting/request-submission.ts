import { createHmac, randomBytes } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { ServiceConfigSchema, BrandingSchema, type GuestSubmission } from '../../contracts/catalog';
import { ApiError } from '../../api-error';
import { lockActiveTenant, missing, stale } from '../catalog/catalog.repository';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { RequestEvents } from '../../contracts/events';
import type { RequestTokenIssuer } from './request-access';

export function createRequestSubmission(
  db: DatabaseClient,
  now: () => Date,
  key: () => string,
  issue: RequestTokenIssuer,
) {
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
  };
}
