/**
 * Caregiver visit execution (docs 04 BR-VST, docs 03 F08, docs 05 rule 6):
 * the assigned caregiver alone may list, start, update task outcomes, keep a
 * draft note and complete their own visits. The server owns actual
 * start/end timestamps; completion validates every required task, finalizes
 * the immutable note snapshot and flags NEEDS_REVIEW when a required task
 * was not done. Repeated start/complete return stable results without
 * duplicate audit/outbox rows.
 */
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { createHash } from 'node:crypto';
import { ApiError } from '../../api-error';
import type {
  CaregiverVisitQuery,
  VisitNoteDraftInput,
  VisitTaskUpdateInput,
} from '../../contracts';
import { VisitEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { visitDateWindow } from '../common/visit-date-window';
import { finalizeVisitNotes, saveDraftNote } from './visit-note.repository';

export interface CaregiverVisitListItem {
  id: string;
  status: string;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  timezoneSnapshot: string;
  version: number;
  patient: { id: string; displayName: string };
  serviceNameSnapshot: Prisma.JsonValue;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
}

export interface CaregiverVisitTask {
  id: string;
  order: number;
  descriptionSnapshot: string;
  isRequired: boolean;
  outcome: string;
  notDoneReason: string | null;
}

export interface CaregiverVisitDetail extends CaregiverVisitListItem {
  areaId: string;
  reviewStatus: string;
  tasks: CaregiverVisitTask[];
  note: { id: string; body: string; isDraft: boolean } | null;
}

async function loadOwnCaregiver(tx: Prisma.TransactionClient, tenantId: string, auth: AuthState) {
  const caregiver = await tx.caregiver.findFirst({
    where: { tenantId, staffAccountId: auth.session.principalId },
    select: {
      id: true,
      operationalStatus: true,
      staffAccount: { select: { emailVerifiedAt: true } },
    },
  });
  if (
    !caregiver ||
    caregiver.operationalStatus !== 'ACTIVE' ||
    !caregiver.staffAccount?.emailVerifiedAt
  )
    throw missing();
  return caregiver;
}

async function lockAssignedVisit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  caregiverId: string,
  visitId: string,
) {
  await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${visitId}::uuid FOR UPDATE`;
  const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
  // Wrong tenant, nonexistent, unassigned or another caregiver's visit are
  // indistinguishable (I07/I01: privacy-safe 404, never a content leak).
  if (!visit || visit.assignedCaregiverId !== caregiverId) throw missing();
  return visit;
}

/** Caregiver-facing projection of the caller's own draft/finalized note. */
function ownNote(rows: Array<{ id: string; bodyRestricted: string; isDraft: boolean }>) {
  const draft = rows.find((row) => row.isDraft);
  const note = draft ?? rows[0];
  return note ? { id: note.id, body: note.bodyRestricted, isDraft: note.isDraft } : null;
}

export function createVisitExecutionService(db: DatabaseClient, now: () => Date) {
  const caregiverScope = async (
    tx: Prisma.TransactionClient,
    auth: AuthState,
  ): Promise<{ tenantId: string; caregiverId: string }> => {
    const tenantId = await agencyAction(tx, auth, 'visits.self_execute');
    const caregiver = await loadOwnCaregiver(tx, tenantId, auth);
    return { tenantId, caregiverId: caregiver.id };
  };

  return {
    list: (auth: AuthState, query: CaregiverVisitQuery) =>
      db.$transaction(async (tx) => {
        const { tenantId, caregiverId } = await caregiverScope(tx, auth);
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const rows = await tx.visit.findMany({
          where: {
            tenantId,
            assignedCaregiverId: caregiverId,
            status: query.status ?? { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
            scheduledStartUtc: visitDateWindow(query, tenant.timezone),
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          },
          select: {
            id: true,
            status: true,
            scheduledStartUtc: true,
            scheduledEndUtc: true,
            timezoneSnapshot: true,
            version: true,
            actualStartAt: true,
            actualEndAt: true,
            patient: { select: { id: true, displayName: true } },
            serviceNameSnapshot: true,
          },
          orderBy: { id: 'asc' },
          take: 21,
        });
        return {
          timezone: tenant.timezone,
          items: rows.slice(0, 20),
          nextCursor: rows.length > 20 ? rows[19]!.id : null,
        };
      }),

    detail: (auth: AuthState, visitId: string) =>
      db.$transaction(async (tx): Promise<CaregiverVisitDetail> => {
        const { tenantId, caregiverId } = await caregiverScope(tx, auth);
        const visit = await tx.visit.findFirst({
          where: { tenantId, id: visitId, assignedCaregiverId: caregiverId },
          select: {
            id: true,
            status: true,
            scheduledStartUtc: true,
            scheduledEndUtc: true,
            timezoneSnapshot: true,
            version: true,
            actualStartAt: true,
            actualEndAt: true,
            areaId: true,
            reviewStatus: true,
            patient: { select: { id: true, displayName: true } },
            serviceNameSnapshot: true,
            tasks: {
              select: {
                id: true,
                order: true,
                descriptionSnapshot: true,
                isRequired: true,
                outcome: true,
                notDoneReason: true,
              },
              orderBy: { order: 'asc' },
            },
            notes: {
              where: { authorId: auth.session.principalId },
              select: { id: true, bodyRestricted: true, isDraft: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
        if (!visit) throw missing();
        const { notes, ...projection } = visit;
        return { ...projection, note: ownNote(notes) };
      }),

    start: (auth: AuthState, visitId: string) =>
      db.$transaction(async (tx) => {
        const { tenantId, caregiverId } = await caregiverScope(tx, auth);
        const visit = await lockAssignedVisit(tx, tenantId, caregiverId, visitId);
        if (visit.status === 'IN_PROGRESS')
          // Stable already-performed result; no duplicate audit/outbox.
          return {
            visitId: visit.id,
            status: visit.status,
            actualStartAt: visit.actualStartAt,
            version: visit.version,
          };
        if (visit.status !== 'SCHEDULED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Only scheduled visits can start.');
        if (visit.assignmentHealth !== 'OK')
          throw new ApiError(
            409,
            'CAREGIVER_UNAVAILABLE',
            'The assignment needs coordinator review before starting.',
          );
        const startedAt = now();
        const updated = await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: {
            status: 'IN_PROGRESS',
            actualStartAt: startedAt,
            version: { increment: 1 },
          },
          select: { id: true, status: true, actualStartAt: true, version: true },
        });
        await recordChange(tx, auth, tenantId, visit.id, VisitEvents.STARTED, 'visit');
        return {
          visitId: updated.id,
          status: updated.status,
          actualStartAt: updated.actualStartAt,
          version: updated.version,
        };
      }),

    updateTask: (auth: AuthState, visitId: string, taskId: string, input: VisitTaskUpdateInput) =>
      db.$transaction(async (tx) => {
        const { tenantId, caregiverId } = await caregiverScope(tx, auth);
        const visit = await lockAssignedVisit(tx, tenantId, caregiverId, visitId);
        if (visit.status !== 'IN_PROGRESS')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Task outcomes are recorded while the visit is in progress; they are frozen after completion.',
          );
        await tx.$queryRaw`SELECT id FROM visit_tasks WHERE tenant_id = ${tenantId}::uuid AND id = ${taskId}::uuid FOR UPDATE`;
        const task = await tx.visitTask.findFirst({ where: { tenantId, id: taskId } });
        if (!task || task.visitId !== visit.id) throw missing();
        const updated = await tx.visitTask.update({
          where: { tenantId_id: { tenantId, id: task.id } },
          data: {
            outcome: input.outcome,
            notDoneReason: input.outcome === 'NOT_DONE' ? input.reason : null,
            doneAt: input.outcome === 'DONE' ? now() : null,
            updatedBy: auth.session.principalId,
          },
          select: {
            id: true,
            outcome: true,
            notDoneReason: true,
            doneAt: true,
          },
        });
        await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: { version: { increment: 1 } },
        });
        await recordChange(tx, auth, tenantId, visit.id, VisitEvents.TASK_UPDATED, 'visit', {
          taskId: updated.id,
          outcome: updated.outcome,
        });
        return { visitId: visit.id, task: updated };
      }),

    saveNote: (auth: AuthState, visitId: string, input: VisitNoteDraftInput) =>
      db.$transaction(async (tx) => {
        const { tenantId, caregiverId } = await caregiverScope(tx, auth);
        const visit = await lockAssignedVisit(tx, tenantId, caregiverId, visitId);
        if (visit.status !== 'IN_PROGRESS')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Notes are drafted while the visit is in progress and finalized at completion.',
          );
        const note = await saveDraftNote(tx, {
          tenantId,
          visitId: visit.id,
          authorId: auth.session.principalId,
          body: input.body,
        });
        await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: { version: { increment: 1 } },
        });
        await recordChange(tx, auth, tenantId, visit.id, VisitEvents.DRAFT_SAVED, 'visit', {
          noteId: note.id,
        });
        return { visitId: visit.id, noteId: note.id, isDraft: note.isDraft };
      }),

    complete: (auth: AuthState, visitId: string, key: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'visits.self_execute');
        const caregiver = await loadOwnCaregiver(tx, tenantId, auth);
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = createHash('sha256').update(`${visitId}|complete`).digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: { tenantId_principalId_key: { tenantId, principalId, key } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          return prior.responseSummary;
        }
        const visit = await lockAssignedVisit(tx, tenantId, caregiver.id, visitId);
        if (visit.status === 'COMPLETED')
          // Stable already-performed result (docs 07 idempotency/delivery);
          // no duplicate audit/outbox emission.
          return {
            visitId: visit.id,
            status: visit.status,
            actualStartAt: visit.actualStartAt,
            actualEndAt: visit.actualEndAt,
            reviewStatus: visit.reviewStatus,
            version: visit.version,
          };
        if (visit.status !== 'IN_PROGRESS')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Only in-progress visits can be completed.',
          );
        const tasks = await tx.visitTask.findMany({
          where: { tenantId, visitId: visit.id, isRequired: true },
          select: { id: true, outcome: true, notDoneReason: true },
        });
        const unclassified = tasks.filter(
          (task) =>
            !['DONE', 'NOT_DONE'].includes(task.outcome) ||
            (task.outcome === 'NOT_DONE' && !task.notDoneReason?.trim()),
        );
        if (unclassified.length > 0)
          throw new ApiError(422, 'VALIDATION_FAILED', 'Every required task needs an outcome.', {
            tasks: unclassified.map((task) => ({ taskId: task.id, outcome: 'PENDING' })),
          });
        const endedAt = now();
        const needsReview = tasks.some((task) => task.outcome === 'NOT_DONE');
        const finalTasks = await tx.visitTask.findMany({
          where: { tenantId, visitId: visit.id },
          select: {
            id: true,
            descriptionSnapshot: true,
            isRequired: true,
            outcome: true,
            notDoneReason: true,
          },
          orderBy: { order: 'asc' },
        });
        const finalNotes = await tx.visitNote.findMany({
          where: { tenantId, visitId: visit.id },
          select: { id: true, authorId: true, bodyRestricted: true },
          orderBy: { createdAt: 'asc' },
        });
        const updated = await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: {
            status: 'COMPLETED',
            actualEndAt: endedAt,
            reviewStatus: needsReview ? 'NEEDS_REVIEW' : 'NOT_REQUIRED',
            completionSnapshotJson: {
              actualStartAt: visit.actualStartAt!.toISOString(),
              actualEndAt: endedAt.toISOString(),
              tasks: finalTasks,
              notes: finalNotes,
            },
            version: { increment: 1 },
          },
          select: {
            id: true,
            status: true,
            actualStartAt: true,
            actualEndAt: true,
            reviewStatus: true,
            version: true,
          },
        });
        // The completion snapshot is immutable from here on (BR-VST).
        await finalizeVisitNotes(tx, tenantId, visit.id, endedAt);
        await recordChange(tx, auth, tenantId, visit.id, VisitEvents.COMPLETED, 'visit');
        if (needsReview)
          await recordChange(tx, auth, tenantId, visit.id, VisitEvents.NEEDS_REVIEW, 'visit');
        const result = {
          visitId: updated.id,
          status: updated.status,
          actualStartAt: updated.actualStartAt,
          actualEndAt: updated.actualEndAt,
          reviewStatus: updated.reviewStatus,
          version: updated.version,
        };
        await tx.idempotencyKey.create({
          data: {
            tenantId,
            principalId,
            key,
            requestHash,
            responseSummary: result as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(now().getTime() + 24 * 3_600_000),
          },
        });
        return result;
      }),
  };
}
