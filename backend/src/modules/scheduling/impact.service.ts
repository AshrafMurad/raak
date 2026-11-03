/**
 * Reassignment impact scanner (docs 04 BR-SCH, F10): inside the caregiver
 * writer's transaction lock, re-evaluates every upcoming SCHEDULED visit of
 * that caregiver against the shared hard filters. Invalid assignments are
 * flagged `NEEDS_REASSIGNMENT` (or healed back to OK when the condition
 * resolves) — never silently cancelled or reassigned (BR-VST).
 */
import type { Prisma } from '../../db/generated/prisma/client';
import { SchedulingEvents } from '../../contracts/events';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { hardFilterReasons, loadFilterContext } from './filters';
import { loadCaregiverFoundation } from '../caregivers/eligibility';

export async function scanCaregiverAssignments(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    caregiverId: string;
    actorId: string;
    now: Date;
    trigger: string;
  },
): Promise<{ flagged: number; healed: number }> {
  const { tenantId, caregiverId, actorId, now, trigger } = args;
  const caregiver = await loadCaregiverFoundation(tx, tenantId, caregiverId);
  if (!caregiver) return { flagged: 0, healed: 0 };
  const upcoming = await tx.visit.findMany({
    where: {
      tenantId,
      assignedCaregiverId: caregiverId,
      status: 'SCHEDULED',
      scheduledStartUtc: { gt: now },
    },
    select: {
      id: true,
      patientId: true,
      agencyServiceId: true,
      areaId: true,
      scheduledStartUtc: true,
      scheduledEndUtc: true,
      timezoneSnapshot: true,
      assignmentHealth: true,
    },
  });
  let flagged = 0;
  let healed = 0;
  for (const visit of upcoming) {
    const ctx = await loadFilterContext(tx, tenantId, visit);
    const reasons = await hardFilterReasons(tx, ctx, caregiver, { excludeVisitId: visit.id });
    if (reasons.length > 0 && visit.assignmentHealth !== 'NEEDS_REASSIGNMENT') {
      await tx.visit.update({
        where: { tenantId_id: { tenantId, id: visit.id } },
        data: { assignmentHealth: 'NEEDS_REASSIGNMENT', version: { increment: 1 } },
      });
      await appendAudit(tx, {
        tenantId,
        actorType: 'AGENCY_STAFF',
        actorId,
        action: SchedulingEvents.REASSIGNMENT_FLAGGED,
        subjectType: 'visit',
        subjectId: visit.id,
        metadata: { caregiverId, reasons, trigger },
      });
      await enqueueOutbox(tx, {
        tenantId,
        eventType: SchedulingEvents.REASSIGNMENT_FLAGGED,
        aggregateId: visit.id,
        payloadMinimal: { caregiverId },
      });
      flagged += 1;
    } else if (reasons.length === 0 && visit.assignmentHealth === 'NEEDS_REASSIGNMENT') {
      await tx.visit.update({
        where: { tenantId_id: { tenantId, id: visit.id } },
        data: { assignmentHealth: 'OK', version: { increment: 1 } },
      });
      await appendAudit(tx, {
        tenantId,
        actorType: 'AGENCY_STAFF',
        actorId,
        action: SchedulingEvents.REASSIGNMENT_RESOLVED,
        subjectType: 'visit',
        subjectId: visit.id,
        metadata: { caregiverId, trigger },
      });
      await enqueueOutbox(tx, {
        tenantId,
        eventType: SchedulingEvents.REASSIGNMENT_RESOLVED,
        aggregateId: visit.id,
        payloadMinimal: { caregiverId },
      });
      healed += 1;
    }
  }
  return { flagged, healed };
}
