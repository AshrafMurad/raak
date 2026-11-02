import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import {
  CreatePatientSchema,
  CreateRequestPatientSchema,
  EditPatientSchema,
  PeopleEvents,
  LinkPatientSchema,
} from '../../contracts/people';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing, stale } from '../common/agency-action';
import { appendAudit } from '../../db/audit';
import { recordChange } from '../common/record-change';
import {
  duplicateCandidates,
  normalizedName,
  patientOperationalProjection,
  type PatientProfile,
} from './patient.repository';

const patientChanged = (
  tx: Prisma.TransactionClient,
  auth: AuthState,
  tenantId: string,
  id: string,
  action: string,
  subjectType = 'patient',
) => recordChange(tx, auth, tenantId, id, action, subjectType);
export function createPatientService(db: DatabaseClient, now: () => Date) {
  async function validateProfile(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profile: PatientProfile,
  ) {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { brandJson: true, timezone: true },
    });
    const brand = tenant.brandJson as { areas?: { id: string }[] } | null;
    if (brand?.areas && !brand.areas.some((a) => a.id === profile.areaId))
      throw new ApiError(422, 'VALIDATION_FAILED', 'Area unavailable.');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now());
    if (profile.dateOfBirth && profile.dateOfBirth > today)
      throw new ApiError(422, 'VALIDATION_FAILED', 'Date of birth must not be in the future.');
  }
  async function createReviewed(
    tx: Prisma.TransactionClient,
    auth: AuthState,
    tenantId: string,
    input: z.infer<typeof CreatePatientSchema>,
    requestId?: string,
  ) {
    await validateProfile(tx, tenantId, input.profile);
    const candidates = await duplicateCandidates(tx, tenantId, input.profile);
    const reviews = new Map(input.duplicateReviews.map((r) => [r.candidateId, r.reason]));
    if (
      reviews.size !== input.duplicateReviews.length ||
      candidates.some((c) => !reviews.has(c.id)) ||
      [...reviews.keys()].some((id) => !candidates.some((c) => c.id === id))
    )
      throw new ApiError(
        409,
        'STATE_TRANSITION_INVALID',
        'Review current duplicate suggestions before creating a patient.',
      );
    const patient = await tx.patient.create({
      data: {
        tenantId,
        ...input.profile,
        normalizedName: normalizedName(input.profile.displayName),
      },
      select: patientOperationalProjection,
    });
    for (const candidate of candidates)
      await tx.patientDuplicateReview.create({
        data: {
          tenantId,
          candidatePatientId: candidate.id,
          subjectId: requestId ?? patient.id,
          reviewedBy: auth.session.principalId,
          decision: 'IGNORE',
          reason: reviews.get(candidate.id)!,
        },
      });
    await patientChanged(tx, auth, tenantId, patient.id, PeopleEvents.PATIENT_CREATED);
    return patient;
  }
  async function approvedRequest(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const row = await tx.serviceRequest.findFirst({ where: { tenantId, id } });
    if (!row) throw missing();
    if (row.status !== 'APPROVED')
      throw new ApiError(
        409,
        'STATE_TRANSITION_INVALID',
        'An approved service request is required.',
      );
    return row;
  }
  return {
    list: (auth: AuthState, cursor?: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.read');
        const rows = await tx.patient.findMany({
          where: { tenantId, ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: 'asc' },
          take: 21,
          select: { id: true, displayName: true, areaId: true, status: true, version: true },
        });
        return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.id : null };
      }),
    detail: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.read');
        const row = await tx.patient.findFirst({
          where: { tenantId, id },
          select: patientOperationalProjection,
        });
        if (!row) throw missing();
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: auth.session.principalId,
          action: 'patient.read',
          subjectType: 'patient',
          subjectId: id,
        });
        return row;
      }),
    duplicates: (auth: AuthState, profile: PatientProfile) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.manage');
        return { items: await duplicateCandidates(tx, tenantId, profile) };
      }),
    create: (auth: AuthState, input: z.infer<typeof CreatePatientSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.manage');
        return createReviewed(tx, auth, tenantId, input);
      }),
    edit: (auth: AuthState, id: string, input: z.infer<typeof EditPatientSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.manage');
        const row = await tx.patient.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        if (row.version !== input.expectedVersion) throw stale();
        await validateProfile(tx, tenantId, input.profile);
        const updated = await tx.patient.update({
          where: { tenantId_id: { tenantId, id } },
          data: {
            ...input.profile,
            normalizedName: normalizedName(input.profile.displayName),
            version: { increment: 1 },
          },
          select: patientOperationalProjection,
        });
        await patientChanged(tx, auth, tenantId, id, PeopleEvents.PATIENT_UPDATED);
        return updated;
      }),
    createFromRequest: (
      auth: AuthState,
      id: string,
      input: z.infer<typeof CreateRequestPatientSchema>,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.manage');
        const request = await approvedRequest(tx, tenantId, id);
        if (request.patientId) {
          const patient = await tx.patient.findFirst({
            where: { tenantId, id: request.patientId },
            select: patientOperationalProjection,
          });
          if (!patient) throw missing();
          return patient;
        }
        if (request.version !== input.expectedVersion) throw stale();
        const patient = await createReviewed(tx, auth, tenantId, input, request.id);
        await tx.serviceRequest.update({
          where: { tenantId_id: { tenantId, id } },
          data: { patientId: patient.id, version: { increment: 1 } },
        });
        await patientChanged(
          tx,
          auth,
          tenantId,
          id,
          PeopleEvents.PATIENT_LINKED,
          'service_request',
        );
        return patient;
      }),
    link: (auth: AuthState, id: string, input: z.infer<typeof LinkPatientSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.manage');
        const request = await approvedRequest(tx, tenantId, id);
        const patient = await tx.patient.findFirst({
          where: { tenantId, id: input.patientId, status: 'ACTIVE' },
          select: patientOperationalProjection,
        });
        if (!patient) throw missing();
        if (request.patientId === patient.id) return { requestId: id, patientId: patient.id };
        if (request.patientId)
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Request already linked.');
        if (request.version !== input.expectedVersion) throw stale();
        await tx.serviceRequest.update({
          where: { tenantId_id: { tenantId, id } },
          data: { patientId: patient.id, version: { increment: 1 } },
        });
        await tx.patientDuplicateReview.create({
          data: {
            tenantId,
            candidatePatientId: patient.id,
            subjectId: id,
            reviewedBy: auth.session.principalId,
            decision: 'LINK',
            reason: input.reason,
          },
        });
        await patientChanged(
          tx,
          auth,
          tenantId,
          id,
          PeopleEvents.PATIENT_LINKED,
          'service_request',
        );
        return { requestId: id, patientId: patient.id };
      }),
  };
}
