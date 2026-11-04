/**
 * Customer visit change requests (docs 04 BR-CHG, docs 03 F09): authorized
 * (MANAGE_VISITS PatientAccess) customers request single-occurrence
 * CANCEL/RESCHEDULE for SCHEDULED future visits. The server classifies
 * NORMAL/LATE from the tenant cutoff policy, keeps the original appointment
 * untouched while PENDING/declined/withdrawn, and approval rechecks state,
 * authorization, timezone, caregiver eligibility, availability, overlap and
 * travel buffer through the existing scheduling services under the
 * ADR-0012 lock order. Conflicts leave the request PENDING and the original
 * booking unchanged (I12/I13).
 */
import { createHash } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import type { ChangeRequestCreateInput, ChangeRequestQueueQuery } from '../../contracts';
import { VisitEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { customerAction } from '../common/customer-action';
import { recordChange } from '../common/record-change';
import { replaceVisitReminders } from '../notifications/reminders';
import { localToUtc } from '../common/local-time';
import { hasPatientGrant } from '../patients/patient.repository';
import { lockCarePlanForVisit } from '../care-plans/care-plan-assignment-policy';
import { hardFilterReasons, loadFilterContext } from './filters';
import { loadCaregiverFoundation } from '../caregivers/eligibility';
import { createCustomerVisitQueries } from './customer-visit.queries';
import { classifyUrgency, parseSnapshot } from './change-request-policy';
export { classifyUrgency } from './change-request-policy';

const reasonCode: Record<
  string,
  'CAREGIVER_UNAVAILABLE' | 'QUALIFICATION_INVALID' | 'SCHEDULE_CONFLICT'
> = {
  ACCOUNT_INACTIVE: 'CAREGIVER_UNAVAILABLE',
  SERVICE_NOT_AUTHORIZED: 'CAREGIVER_UNAVAILABLE',
  AREA_NOT_COVERED: 'CAREGIVER_UNAVAILABLE',
  OUTSIDE_AVAILABILITY: 'CAREGIVER_UNAVAILABLE',
  QUALIFICATION_INVALID: 'QUALIFICATION_INVALID',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
};

export function createChangeRequestService(db: DatabaseClient, now: () => Date) {
  return {
    ...createCustomerVisitQueries(db, now),

    submit: (auth: AuthState, visitId: string, input: ChangeRequestCreateInput) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'visits.customer_change', now);
        const tenantId = customer.tenantId;
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: {
            timezone: true,
            changeCancelCutoffHours: true,
            changeRescheduleCutoffHours: true,
            allowLateReview: true,
          },
        });
        // Serialize against concurrent submissions/completions on this visit.
        await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${visitId}::uuid FOR UPDATE`;
        const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
        if (!visit) throw missing();
        // Request ownership is never authority: only an explicit active
        // MANAGE_VISITS grant for this patient authorizes the change.
        if (
          !(await hasPatientGrant(tx, tenantId, customer.id, visit.patientId, 'MANAGE_VISITS', now))
        )
          throw missing();
        if (visit.status !== 'SCHEDULED' || visit.scheduledStartUtc <= now())
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Changes apply to confirmed future visits only.',
          );
        const existing = await tx.visitChangeRequest.findFirst({
          where: { tenantId, visitId: visit.id, status: 'PENDING' },
          select: { id: true },
        });
        if (existing)
          throw new ApiError(
            409,
            'CHANGE_REQUEST_PENDING',
            'This visit already has a pending change request.',
          );
        const cutoffHours =
          input.type === 'CANCEL'
            ? tenant.changeCancelCutoffHours
            : tenant.changeRescheduleCutoffHours;
        const urgency = classifyUrgency(now(), visit.scheduledStartUtc, cutoffHours);
        if (urgency === 'LATE' && !tenant.allowLateReview)
          throw new ApiError(
            409,
            'CHANGE_CUTOFF_EXCEEDED',
            'The change cutoff has passed; contact the agency directly.',
            { cutoffHours },
          );
        let proposedStartUtc: Date | null = null;
        if (input.type === 'RESCHEDULE') {
          const resolution = localToUtc(input.proposedDate, input.proposedTime, tenant.timezone);
          if (resolution.status !== 'UNIQUE')
            throw new ApiError(
              422,
              'RECURRENCE_TIME_INVALID',
              'The proposed local time is invalid in the agency timezone.',
            );
          proposedStartUtc = resolution.instant;
          if (proposedStartUtc.getTime() === visit.scheduledStartUtc.getTime())
            throw new ApiError(
              422,
              'VALIDATION_FAILED',
              'The proposed time matches the current appointment.',
            );
          if (proposedStartUtc <= now())
            throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a future proposed time.');
        }
        const durationMin =
          (visit.scheduledEndUtc.getTime() - visit.scheduledStartUtc.getTime()) / 60_000;
        let created;
        try {
          created = await tx.visitChangeRequest.create({
            data: {
              tenantId,
              visitId: visit.id,
              requesterAccountId: customer.id,
              type: input.type,
              status: 'PENDING',
              urgency,
              proposedStartUtc,
              reason: input.reason,
              policySnapshotJson: {
                cutoffHours,
                allowLateReview: tenant.allowLateReview,
                originalStartUtc: visit.scheduledStartUtc.toISOString(),
                originalEndUtc: visit.scheduledEndUtc.toISOString(),
                timezone: tenant.timezone,
                durationMin,
              },
            },
            select: {
              id: true,
              visitId: true,
              type: true,
              status: true,
              urgency: true,
              proposedStartUtc: true,
              createdAt: true,
            },
          });
        } catch (error) {
          // The one-PENDING partial unique index is the final guard against a
          // race the visit lock cannot cover (e.g. a future writer path).
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            throw new ApiError(
              409,
              'CHANGE_REQUEST_PENDING',
              'This visit already has a pending change request.',
            );
          throw error;
        }
        await recordChange(
          tx,
          auth,
          tenantId,
          created.id,
          VisitEvents.CHANGE_REQUESTED,
          'visit_change_request',
          { visitId: visit.id },
        );
        return created;
      }),

    withdraw: (auth: AuthState, changeRequestId: string) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'visits.customer_change', now);
        const tenantId = customer.tenantId;
        const request = await tx.visitChangeRequest.findFirst({
          where: { tenantId, id: changeRequestId, requesterAccountId: customer.id },
        });
        if (!request) throw missing();
        const visit = await tx.visit.findFirst({
          where: { tenantId, id: request.visitId },
          select: { patientId: true },
        });
        if (
          !visit ||
          !(await hasPatientGrant(tx, tenantId, customer.id, visit.patientId, 'MANAGE_VISITS', now))
        )
          throw missing();
        if (request.status !== 'PENDING')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Only pending requests can be withdrawn.',
          );
        const updated = await tx.visitChangeRequest.update({
          where: { tenantId_id: { tenantId, id: request.id } },
          data: { status: 'WITHDRAWN', withdrawnAt: now() },
          select: { id: true, status: true },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          request.id,
          VisitEvents.CHANGE_WITHDRAWN,
          'visit_change_request',
          { visitId: request.visitId },
        );
        return updated;
      }),

    queue: (auth: AuthState, query: ChangeRequestQueueQuery) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
        const rows = await tx.visitChangeRequest.findMany({
          where: {
            tenantId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.urgency ? { urgency: query.urgency } : {}),
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          },
          select: {
            id: true,
            type: true,
            status: true,
            urgency: true,
            reason: true,
            proposedStartUtc: true,
            createdAt: true,
            decisionAt: true,
            decisionReason: true,
            policySnapshotJson: true,
            visit: {
              select: {
                id: true,
                status: true,
                scheduledStartUtc: true,
                scheduledEndUtc: true,
                timezoneSnapshot: true,
                version: true,
                patient: { select: { id: true, displayName: true } },
                assignedCaregiver: { select: { id: true, name: true } },
                serviceNameSnapshot: true,
              },
            },
          },
          orderBy: { id: 'asc' },
          take: 21,
        });
        return {
          items: rows.slice(0, 20),
          nextCursor: rows.length > 20 ? rows[19]!.id : null,
        };
      }),

    reject: (auth: AuthState, changeRequestId: string, reason: string, key: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = createHash('sha256')
          .update(JSON.stringify({ action: 'visit.change_reject', changeRequestId, reason }))
          .digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: { tenantId_principalId_key: { tenantId, principalId, key } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          return prior.responseSummary;
        }
        await tx.$queryRaw`SELECT id FROM visit_change_requests WHERE tenant_id = ${tenantId}::uuid AND id = ${changeRequestId}::uuid FOR UPDATE`;
        const request = await tx.visitChangeRequest.findFirst({
          where: { tenantId, id: changeRequestId },
        });
        if (!request) throw missing();
        if (request.status !== 'PENDING')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'This request is already decided.');
        const updated = await tx.visitChangeRequest.update({
          where: { tenantId_id: { tenantId, id: request.id } },
          data: {
            status: 'REJECTED',
            decisionByStaffId: auth.session.principalId,
            decisionAt: now(),
            decisionReason: reason,
          },
          select: { id: true, status: true, decisionAt: true },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          request.id,
          VisitEvents.CHANGE_REJECTED,
          'visit_change_request',
          { visitId: request.visitId },
          reason,
        );
        await tx.idempotencyKey.create({
          data: {
            tenantId,
            principalId,
            key,
            requestHash,
            responseSummary: {
              id: updated.id,
              status: updated.status,
              decisionAt: updated.decisionAt!.toISOString(),
            },
            expiresAt: new Date(now().getTime() + 24 * 3_600_000),
          },
        });
        return updated;
      }),

    approve: (auth: AuthState, changeRequestId: string, key: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = createHash('sha256')
          .update(`${changeRequestId}|change-approve`)
          .digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: { tenantId_principalId_key: { tenantId, principalId, key } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          return prior.responseSummary;
        }
        const request = await tx.visitChangeRequest.findFirst({
          where: { tenantId, id: changeRequestId },
        });
        if (!request) throw missing();
        if (request.status !== 'PENDING')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'This request is already decided.');
        // ADR-0012 lock order for a plan-backed visit mutation:
        // tenant (held) -> care plan -> visit.
        if (request.type === 'RESCHEDULE') {
          const parent = await tx.visit.findFirst({
            where: { tenantId, id: request.visitId },
            select: { carePlanId: true },
          });
          if (parent?.carePlanId) await lockCarePlanForVisit(tx, tenantId, parent.carePlanId);
        }
        await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${request.visitId}::uuid FOR UPDATE`;
        const visit = await tx.visit.findFirst({ where: { tenantId, id: request.visitId } });
        if (!visit) throw missing();
        const snapshot = parseSnapshot(request.policySnapshotJson);
        const currentPolicy = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true, allowLateReview: true },
        });
        if (
          currentPolicy.timezone !== snapshot.timezone ||
          (request.urgency === 'LATE' && !currentPolicy.allowLateReview)
        )
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'The policy or timezone changed; review the request again.',
          );
        // Commit-time state rechecks: original window unchanged, still a
        // confirmed future visit, requester's authority still active.
        if (
          visit.status !== 'SCHEDULED' ||
          visit.scheduledStartUtc.toISOString() !== snapshot.originalStartUtc ||
          visit.scheduledEndUtc.toISOString() !== snapshot.originalEndUtc ||
          visit.scheduledStartUtc <= now()
        )
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'The appointment changed since the request; revalidate before deciding.',
          );
        const requester = await tx.customerAccount.findFirst({
          where: {
            tenantId,
            id: request.requesterAccountId,
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
          },
          select: { id: true },
        });
        if (
          !requester ||
          !(await hasPatientGrant(
            tx,
            tenantId,
            requester.id,
            visit.patientId,
            'MANAGE_VISITS',
            now,
          ))
        )
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'The requester no longer holds visit authority for this patient.',
          );

        let result: Prisma.InputJsonValue;
        if (request.type === 'CANCEL') {
          const cancelledAt = now();
          const updated = await tx.visit.update({
            where: { tenantId_id: { tenantId, id: visit.id } },
            data: {
              status: 'CANCELLED',
              cancelledReason: request.reason.slice(0, 500),
              cancelledAt,
              version: { increment: 1 },
            },
            select: {
              id: true,
              status: true,
              scheduledStartUtc: true,
              scheduledEndUtc: true,
              version: true,
            },
          });
          result = {
            changeRequestId: request.id,
            type: 'CANCEL',
            status: 'APPROVED',
            visit: updated,
          } as Prisma.InputJsonValue;
        } else {
          const proposedStart = request.proposedStartUtc!;
          if (proposedStart <= now())
            throw new ApiError(
              409,
              'STATE_TRANSITION_INVALID',
              'The proposed time is no longer in the future.',
            );
          const durationMs = snapshot.durationMin * 60_000;
          const proposedEnd = new Date(proposedStart.getTime() + durationMs);
          if (!visit.assignedCaregiverId)
            throw new ApiError(
              409,
              'STATE_TRANSITION_INVALID',
              'The visit has no assigned caregiver.',
            );
          await tx.$queryRaw`SELECT id FROM caregivers WHERE tenant_id = ${tenantId}::uuid AND id = ${visit.assignedCaregiverId}::uuid FOR UPDATE`;
          const patientConflict = await tx.visit.findFirst({
            where: {
              tenantId,
              patientId: visit.patientId,
              id: { not: visit.id },
              status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
              scheduledStartUtc: { lt: proposedEnd },
              scheduledEndUtc: { gt: proposedStart },
            },
            select: { id: true },
          });
          if (patientConflict)
            throw new ApiError(
              409,
              'SCHEDULE_CONFLICT',
              'The patient has another confirmed appointment.',
            );
          // Recheck the assigned caregiver against the NEW window through the
          // shared scheduling hard filters (BR-CHG): qualifications,
          // authorization, area, availability/leave, overlap + travel buffer.
          const caregiver = await loadCaregiverFoundation(tx, tenantId, visit.assignedCaregiverId);
          if (!caregiver) throw missing();
          const ctx = await loadFilterContext(tx, tenantId, {
            ...visit,
            scheduledStartUtc: proposedStart,
            scheduledEndUtc: proposedEnd,
            timezoneSnapshot: snapshot.timezone,
          });
          const reasons = await hardFilterReasons(tx, ctx, caregiver, {
            excludeVisitId: visit.id,
          });
          if (reasons.length > 0)
            throw new ApiError(
              409,
              reasonCode[reasons[0]!] ?? 'SCHEDULE_CONFLICT',
              'The caregiver is not available for the proposed time; the request stays pending.',
              { reasons },
            );
          const updated = await tx.visit.update({
            where: { tenantId_id: { tenantId, id: visit.id } },
            data: {
              scheduledStartUtc: proposedStart,
              scheduledEndUtc: proposedEnd,
              timezoneSnapshot: snapshot.timezone,
              assignmentHealth: 'OK',
              version: { increment: 1 },
            },
            select: {
              id: true,
              status: true,
              scheduledStartUtc: true,
              scheduledEndUtc: true,
              version: true,
            },
          });
          result = {
            changeRequestId: request.id,
            type: 'RESCHEDULE',
            status: 'APPROVED',
            visit: updated,
          } as Prisma.InputJsonValue;
        }
        await replaceVisitReminders(tx, tenantId, visit.id, now());
        await tx.visitChangeRequest.update({
          where: { tenantId_id: { tenantId, id: request.id } },
          data: {
            status: 'APPROVED',
            decisionByStaffId: auth.session.principalId,
            decisionAt: now(),
          },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          request.id,
          VisitEvents.CHANGE_APPROVED,
          'visit_change_request',
          { visitId: visit.id, type: request.type },
        );
        await tx.idempotencyKey.create({
          data: {
            tenantId,
            principalId,
            key,
            requestHash,
            responseSummary: result,
            expiresAt: new Date(now().getTime() + 24 * 3_600_000),
          },
        });
        return result;
      }),
  };
}

export type ChangeRequestService = ReturnType<typeof createChangeRequestService>;
