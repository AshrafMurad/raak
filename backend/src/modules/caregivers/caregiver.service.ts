import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import {
  CaregiverEvents,
  CaregiverOperationalSchema,
  EditCaregiverSchema,
  QualificationSchema,
  VerifyQualificationSchema,
  ServiceAuthorizationSchema,
  EligibilitySchema,
} from '../../contracts/caregivers';
import { ServiceConfigSchema } from '../../contracts/catalog';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { coversInterval } from '../common/interval';
import { scanCaregiverAssignments } from '../scheduling';
import { effectiveIntervals, foundationReasons, loadCaregiverFoundation } from './eligibility';

const projection = {
  id: true,
  name: true,
  professionalCategory: true,
  operationalStatus: true,
  serviceAreasJson: true,
  version: true,
  availabilityRevision: true,
} as const;
export async function caregiverRow(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM caregivers WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  const row = await tx.caregiver.findFirst({ where: { tenantId, id } });
  if (!row) throw missing();
  return row;
}
async function validAreas(tx: Prisma.TransactionClient, tenantId: string, areas: string[]) {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { brandJson: true },
  });
  const brand = tenant.brandJson as { areas?: { id: string }[] } | null;
  if (brand?.areas && areas.some((id) => !brand.areas!.some((a) => a.id === id)))
    throw new ApiError(422, 'VALIDATION_FAILED', 'Area unavailable.');
}
export function createCaregiverService(db: DatabaseClient, now: () => Date) {
  return {
    list: (auth: AuthState, cursor?: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.read');
        const rows = await tx.caregiver.findMany({
          where: { tenantId, ...(cursor ? { id: { gt: cursor } } : {}) },
          select: projection,
          orderBy: { id: 'asc' },
          take: 21,
        });
        return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.id : null };
      }),
    create: (auth: AuthState, input: z.infer<typeof CaregiverOperationalSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.manage');
        await validAreas(tx, tenantId, input.serviceAreas);
        const row = await tx.caregiver.create({
          data: {
            tenantId,
            name: input.name,
            professionalCategory: input.professionalCategory,
            operationalStatus: input.operationalStatus,
            serviceAreasJson: input.serviceAreas,
          },
          select: projection,
        });
        await recordChange(tx, auth, tenantId, row.id, CaregiverEvents.CREATED, 'caregiver');
        return row;
      }),
    detail: (auth: AuthState, id?: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(
          tx,
          auth,
          id ? 'caregivers.read' : 'caregivers.self_read',
        );
        const row = await tx.caregiver.findFirst({
          where: { tenantId, ...(id ? { id } : { staffAccountId: auth.session.principalId }) },
          select: {
            ...projection,
            qualifications: {
              select: {
                id: true,
                code: true,
                licenseIssuer: true,
                validThrough: true,
                documentId: true,
                status: true,
                verifiedAt: true,
                version: true,
              },
            },
            serviceAuthorizations: { select: { agencyServiceId: true } },
            availabilitySlots: {
              select: {
                weekday: true,
                localStartTime: true,
                localEndTime: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
            },
            exceptions: {
              select: { id: true, localDate: true, startLocal: true, endLocal: true, type: true },
            },
          },
        });
        if (!row) throw missing();
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: tenant.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now());
        return {
          ...row,
          qualifications: row.qualifications.map((qualification) => ({
            ...qualification,
            effectiveStatus:
              qualification.status === 'VERIFIED' &&
              qualification.validThrough &&
              qualification.validThrough < today
                ? 'EXPIRED'
                : qualification.status,
          })),
          timezone: tenant.timezone,
        };
      }),
    edit: (auth: AuthState, id: string, input: z.infer<typeof EditCaregiverSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.manage');
        const row = await caregiverRow(tx, tenantId, id);
        if (row.version !== input.expectedVersion) throw stale();
        await validAreas(tx, tenantId, input.serviceAreas);
        const updated = await tx.caregiver.update({
          where: { tenantId_id: { tenantId, id } },
          data: {
            name: input.name,
            professionalCategory: input.professionalCategory,
            operationalStatus: input.operationalStatus,
            serviceAreasJson: input.serviceAreas,
            version: { increment: 1 },
          },
          select: projection,
        });
        await recordChange(tx, auth, tenantId, id, CaregiverEvents.UPDATED, 'caregiver');
        // Area/status changes can invalidate confirmed assignments (F10).
        const impact = await scanCaregiverAssignments(tx, {
          tenantId,
          caregiverId: id,
          actorId: auth.session.principalId,
          now: now(),
          trigger: 'profile_edited',
        });
        return { ...updated, impactScan: impact };
      }),
    qualification: (auth: AuthState, id: string, input: z.infer<typeof QualificationSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.manage');
        await caregiverRow(tx, tenantId, id);
        if (input.documentId) {
          const document = await tx.document.findFirst({
            where: {
              tenantId,
              id: input.documentId,
              parentType: 'CAREGIVER',
              parentId: id,
              classification: 'QUALIFICATION',
              scanStatus: 'CLEAN',
              archivedAt: null,
            },
          });
          if (!document) throw missing();
        }
        const row = await tx.caregiverQualification.create({
          data: { tenantId, caregiverId: id, ...input, documentId: input.documentId ?? null },
          select: { id: true, code: true, status: true, version: true },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          row.id,
          CaregiverEvents.QUALIFICATION_SUBMITTED,
          'caregiver_qualification',
        );
        return row;
      }),
    verify: (auth: AuthState, id: string, input: z.infer<typeof VerifyQualificationSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.verify');
        const row = await tx.caregiverQualification.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        const caregiver = await caregiverRow(tx, tenantId, row.caregiverId);
        if (caregiver.staffAccountId === auth.session.principalId)
          throw new ApiError(403, 'FORBIDDEN', 'Independent agency verification is required.');
        if (row.version !== input.expectedVersion) throw stale();
        if (
          row.status !== 'PENDING' &&
          !(row.status === 'VERIFIED' && input.decision === 'REJECTED')
        )
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Qualification was already reviewed.',
          );
        if (input.decision === 'VERIFIED' && row.documentId) {
          if (
            !(await tx.document.findFirst({
              where: {
                tenantId,
                id: row.documentId,
                parentId: row.caregiverId,
                parentType: 'CAREGIVER',
                classification: 'QUALIFICATION',
                scanStatus: 'CLEAN',
                archivedAt: null,
              },
            }))
          )
            throw missing();
        }
        const updated = await tx.caregiverQualification.update({
          where: { id, tenantId },
          data: {
            status: input.decision,
            ...(input.decision === 'VERIFIED'
              ? { verifiedBy: auth.session.principalId, verifiedAt: now() }
              : {}),
            version: { increment: 1 },
          },
          select: { id: true, status: true, version: true, verifiedAt: true },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          row.id,
          CaregiverEvents.QUALIFICATION_REVIEWED,
          'caregiver_qualification',
          { fromStatus: row.status, toStatus: input.decision },
          input.reason,
        );
        // Withdrawing a verified qualification can invalidate confirmed
        // assignments and blocks new ones (I20): flag, never silently change.
        const impact =
          input.decision === 'REJECTED' && row.status === 'VERIFIED'
            ? await scanCaregiverAssignments(tx, {
                tenantId,
                caregiverId: row.caregiverId,
                actorId: auth.session.principalId,
                now: now(),
                trigger: 'qualification_withdrawn',
              })
            : { flagged: 0, healed: 0 };
        return { ...updated, impactScan: impact };
      }),
    authorizeServices: (
      auth: AuthState,
      id: string,
      input: z.infer<typeof ServiceAuthorizationSchema>,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.verify');
        const row = await caregiverRow(tx, tenantId, id);
        if (row.version !== input.expectedVersion) throw stale();
        const services = await tx.agencyService.count({
          where: { tenantId, id: { in: input.serviceIds } },
        });
        if (services !== input.serviceIds.length) throw missing();
        await tx.caregiverServiceAuthorization.deleteMany({ where: { tenantId, caregiverId: id } });
        await tx.caregiverServiceAuthorization.createMany({
          data: input.serviceIds.map((agencyServiceId) => ({
            tenantId,
            caregiverId: id,
            agencyServiceId,
            authorizedBy: auth.session.principalId,
            authorizedAt: now(),
          })),
        });
        await tx.caregiver.update({
          where: { tenantId_id: { tenantId, id } },
          data: { version: { increment: 1 } },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          id,
          CaregiverEvents.SERVICES_AUTHORIZED,
          'caregiver',
        );
        await scanCaregiverAssignments(tx, {
          tenantId,
          caregiverId: id,
          actorId: auth.session.principalId,
          now: now(),
          trigger: 'service_authorizations_changed',
        });
        return { id, version: row.version + 1 };
      }),
    eligibility: (auth: AuthState, id: string, input: z.infer<typeof EligibilitySchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.read');
        const row = await caregiverRow(tx, tenantId, id);
        const service = await tx.agencyService.findFirst({
          where: { tenantId, id: input.serviceId, isEnabled: true },
        });
        if (!service) throw missing();
        const config = ServiceConfigSchema.parse(service.config);
        const foundation = await loadCaregiverFoundation(tx, tenantId, row.id);
        if (!foundation) throw missing();
        const reasons = foundationReasons(foundation, service.id, config, input.localDate);
        const intervals = await effectiveIntervals(tx, tenantId, row.id, input.localDate);
        if (!coversInterval(intervals, input.startLocal, input.endLocal))
          reasons.push('OUTSIDE_AVAILABILITY');
        return {
          caregiverId: id,
          foundationEligible: reasons.length === 0,
          reasons,
          bookingAvailabilityChecked: false,
          appointmentConfirmed: false,
        };
      }),
  };
}
