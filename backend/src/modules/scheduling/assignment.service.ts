/**
 * Transactional assignment (docs 04 BR-SCH/BR-VST, docs 08 assignment
 * boundary): tenant → visit → caregiver row locks, full hard-filter recheck at
 * commit time, exact buffer math, append-only assignment history, atomic
 * audit/outbox and idempotent replays. Bulk assignment commits per visit and
 * reports explicit partial outcomes.
 */
import type { z } from 'zod';
import { createHash } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import type { ErrorCode } from '../../contracts';
import {
  AssignVisitSchema,
  BulkAssignSchema,
  ReassignVisitSchema,
} from '../../contracts/careplans';
import { SchedulingEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import {
  lockAssignableCarePlanForVisit,
  lockCarePlanForVisit,
} from '../care-plans/care-plan-assignment-policy';
import { hardFilterReasons, loadFilterContext } from './filters';
import { loadCaregiverFoundation } from '../caregivers/eligibility';
import {
  reserveBulkExecution,
  lockBulkExecution,
  checkpointBulkResults,
  BULK_RESULT_TTL_MS,
} from './bulk-reservation';

const reasonCode: Record<string, ErrorCode> = {
  ACCOUNT_INACTIVE: 'CAREGIVER_UNAVAILABLE',
  SERVICE_NOT_AUTHORIZED: 'CAREGIVER_UNAVAILABLE',
  AREA_NOT_COVERED: 'CAREGIVER_UNAVAILABLE',
  OUTSIDE_AVAILABILITY: 'CAREGIVER_UNAVAILABLE',
  QUALIFICATION_INVALID: 'QUALIFICATION_INVALID',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
};

async function lockVisit(tx: Prisma.TransactionClient, tenantId: string, visitId: string) {
  await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${visitId}::uuid FOR UPDATE`;
  const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
  if (!visit) throw missing();
  return visit;
}

async function lockCaregiver(tx: Prisma.TransactionClient, tenantId: string, caregiverId: string) {
  await tx.$queryRaw`SELECT id FROM caregivers WHERE tenant_id = ${tenantId}::uuid AND id = ${caregiverId}::uuid FOR UPDATE`;
}

interface AssignmentItem {
  visitId: string;
  caregiverId: string;
  expectedVisitVersion: number;
  reason?: string;
}

interface AssignmentResult {
  visitId: string;
  status: string;
  assignedCaregiverId: string | null;
  version: number;
  assignmentHealth: string;
}

/** Single commit-time assignment core; every writer path funnels through it. */
async function commitAssignment(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  tenantId: string,
  input: AssignmentItem,
  mode: 'assign' | 'reassign',
): Promise<AssignmentResult> {
  // Plan-backed new assignment locks tenant -> care plan -> visit -> caregiver
  // (ADR-0012): the parent-plan recheck happens after the plan lock so a
  // concurrent pause/cancel cannot slip between the check and the commit.
  const target = await tx.visit.findFirst({
    where: { tenantId, id: input.visitId },
    select: { carePlanId: true },
  });
  if (!target) throw missing();
  if (target.carePlanId) {
    if (mode === 'assign') await lockAssignableCarePlanForVisit(tx, tenantId, target.carePlanId);
    else await lockCarePlanForVisit(tx, tenantId, target.carePlanId);
  }
  const visit = await lockVisit(tx, tenantId, input.visitId);
  if (mode === 'assign' && visit.status !== 'PLANNED')
    throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Only planned visits can be assigned.');
  if (mode === 'reassign' && visit.status !== 'SCHEDULED')
    throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Only scheduled visits can be reassigned.');
  if (visit.version !== input.expectedVisitVersion)
    throw new ApiError(409, 'VISIT_VERSION_CONFLICT', 'Visit changed; reload and retry.');
  if (visit.assignedCaregiverId === input.caregiverId)
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'Caregiver is already assigned to this visit.',
    );
  for (const id of [
    ...new Set(
      [visit.assignedCaregiverId, input.caregiverId].filter((id): id is string => id !== null),
    ),
  ].sort())
    await lockCaregiver(tx, tenantId, id);
  const caregiver = await loadCaregiverFoundation(tx, tenantId, input.caregiverId);
  if (!caregiver) throw missing();
  const ctx = await loadFilterContext(tx, tenantId, visit);
  const reasons = await hardFilterReasons(tx, ctx, caregiver, { excludeVisitId: visit.id });
  if (reasons.length > 0)
    throw new ApiError(409, reasonCode[reasons[0]!]!, 'Caregiver is not eligible for this visit.', {
      reasons,
    });
  const updated = await tx.visit.update({
    where: { tenantId_id: { tenantId, id: visit.id } },
    data: {
      assignedCaregiverId: input.caregiverId,
      status: 'SCHEDULED',
      assignmentHealth: 'OK',
      version: { increment: 1 },
    },
    select: {
      id: true,
      status: true,
      assignedCaregiverId: true,
      version: true,
      assignmentHealth: true,
    },
  });
  await tx.visitAssignmentHistory.create({
    data: {
      tenantId,
      visitId: visit.id,
      oldCaregiverId: visit.assignedCaregiverId,
      newCaregiverId: input.caregiverId,
      changedBy: auth.session.principalId,
      reason: input.reason ?? null,
    },
  });
  await recordChange(
    tx,
    auth,
    tenantId,
    visit.id,
    SchedulingEvents.ASSIGNED,
    'visit',
    { caregiverId: input.caregiverId, reassignment: mode === 'reassign' },
    input.reason,
  );
  return {
    visitId: updated.id,
    status: updated.status,
    assignedCaregiverId: updated.assignedCaregiverId,
    version: updated.version,
    assignmentHealth: updated.assignmentHealth,
  };
}

/**
 * Canonical bulk request identity (ADR-0012 decision 10): input order is
 * semantic, so the hash preserves assignment order and includes every
 * visit/caregiver/version tuple plus the top-level reason.
 */
export function bulkAssignRequestHash(input: z.infer<typeof BulkAssignSchema>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: 'visit.bulkAssign',
        assignments: input.assignments.map((item) => ({
          visitId: item.visitId,
          caregiverId: item.caregiverId,
          expectedVisitVersion: item.expectedVisitVersion,
        })),
        reason: input.reason ?? null,
      }),
    )
    .digest('hex');
}

export function createAssignmentService(db: DatabaseClient, now: () => Date) {
  const assignOne = (auth: AuthState, input: AssignmentItem, mode: 'assign' | 'reassign') =>
    db.$transaction(async (tx) => {
      const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
      return commitAssignment(tx, auth, tenantId, input, mode);
    });

  return {
    assign: (
      auth: AuthState,
      input: z.infer<typeof AssignVisitSchema> & { visitId: string },
      key: string,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = createHash('sha256')
          .update(`${input.visitId}|${input.caregiverId}|${input.expectedVisitVersion}|assign`)
          .digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: { tenantId_principalId_key: { tenantId, principalId, key } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          return prior.responseSummary;
        }
        const result = await commitAssignment(tx, auth, tenantId, input, 'assign');
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

    reassign: (auth: AuthState, input: z.infer<typeof ReassignVisitSchema> & { visitId: string }) =>
      assignOne(auth, input, 'reassign'),

    bulkAssign: (auth: AuthState, input: z.infer<typeof BulkAssignSchema>, key: string) =>
      (async () => {
        const tenantId = await db.$transaction(async (tx) =>
          agencyAction(tx, auth, 'scheduling.manage'),
        );
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = bulkAssignRequestHash(input);
        const reserved = await reserveBulkExecution(
          db,
          now,
          tenantId,
          principalId,
          key,
          requestHash,
        );
        if (reserved.mode === 'replay') return reserved.summary;
        // Independent per-visit atomic commits with explicit partial outcomes
        // (docs 08): one failing visit never rolls back the others. Each
        // completed outcome is checkpointed before the next visit starts so an
        // interrupted run resumes without rerunning completed work.
        for (const item of input.assignments) {
          try {
            await db.$transaction(async (tx) => {
              await agencyAction(tx, auth, 'scheduling.manage');
              const results = await lockBulkExecution(
                tx,
                tenantId,
                principalId,
                key,
                reserved.executionToken,
              );
              if (results.some((entry) => entry.visitId === item.visitId)) return;
              const result = await commitAssignment(
                tx,
                auth,
                tenantId,
                { ...item, reason: input.reason },
                'assign',
              );
              results.push({ ...result, ok: true });
              // Assignment, history, audit/outbox and checkpoint commit together.
              await checkpointBulkResults(
                tx,
                now,
                tenantId,
                principalId,
                key,
                reserved.executionToken,
                results,
              );
            });
          } catch (error) {
            if (!(error instanceof ApiError) || error.code === 'IDEMPOTENCY_IN_PROGRESS')
              throw error;
            await db.$transaction(async (tx) => {
              await agencyAction(tx, auth, 'scheduling.manage');
              const results = await lockBulkExecution(
                tx,
                tenantId,
                principalId,
                key,
                reserved.executionToken,
              );
              if (!results.some((entry) => entry.visitId === item.visitId))
                results.push({ visitId: item.visitId, ok: false, code: error.code });
              await checkpointBulkResults(
                tx,
                now,
                tenantId,
                principalId,
                key,
                reserved.executionToken,
                results,
              );
            });
          }
        }
        return db.$transaction(async (tx) => {
          await agencyAction(tx, auth, 'scheduling.manage');
          const results = await lockBulkExecution(
            tx,
            tenantId,
            principalId,
            key,
            reserved.executionToken,
          );
          const summary = {
            results,
            summary: {
              succeeded: results.filter((r) => r.ok).length,
              failed: results.filter((r) => !r.ok).length,
            },
          };
          await tx.idempotencyKey.update({
            where: { tenantId_principalId_key: { tenantId, principalId, key } },
            data: {
              responseSummary: summary as Prisma.InputJsonValue,
              expiresAt: new Date(now().getTime() + BULK_RESULT_TTL_MS),
            },
          });
          return summary;
        });
      })(),
  };
}
