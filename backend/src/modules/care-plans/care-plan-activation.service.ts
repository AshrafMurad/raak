/**
 * Care-plan activation command (docs 04 BR-PLAN, docs 07 Sprint 5): idempotent
 * exact-version activation with recurrence occurrence generation, service/task
 * snapshots, amendment replacement of future PLANNED visits and activation
 * audit/outbox in one transaction-owning module. Idempotency: the stored key
 * row replays the stored summary; occurrence-key uniqueness guards parallel
 * and replayed generation (I09); version immutability and lock order are
 * unchanged from the characterized behavior.
 */
import type { z } from 'zod';
import { createHash } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { ActivateCarePlanSchema } from '../../contracts/careplans';
import { CarePlanEvents } from '../../contracts/events';
import type { ServiceConfigSchema } from '../../contracts/catalog';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { utcLocalDate } from '../common/local-time';
import { expandOccurrences } from './recurrence';
import { lockPlan, serviceSnapshot } from './care-plan.repository';
import { parseTaskTemplates, versionRecurrenceSpec } from './care-plan-content';
import type { ActivationSummary, CarePlanService, VersionRow } from './care-plan.types';

export function createCarePlanActivationService(
  db: DatabaseClient,
  now: () => Date,
): Pick<CarePlanService, 'activate'> {
  return {
    activate: (
      auth: AuthState,
      id: string,
      input: z.infer<typeof ActivateCarePlanSchema>,
      idempotencyKey: string,
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const principalId = `staff:${auth.session.principalId}`;
        const requestHash = createHash('sha256')
          .update(`${id}|${input.version}|activate`)
          .digest('hex');
        const prior = await tx.idempotencyKey.findUnique({
          where: { tenantId_principalId_key: { tenantId, principalId, key: idempotencyKey } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
          // Stored by this same workflow with exactly the summary shape below.
          return prior.responseSummary as unknown as ActivationSummary;
        }
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status === 'CANCELLED' || plan.status === 'COMPLETED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Plan is closed.');
        const version = await tx.carePlanVersion.findFirst({
          where: { tenantId, carePlanId: id, version: input.version },
        });
        if (!version) throw missing();
        if (input.version !== plan.currentVersion) throw stale();
        const { config } = await serviceSnapshot(tx, tenantId, plan.agencyServiceId);
        const patient = await tx.patient.findFirst({
          where: { tenantId, id: plan.patientId },
          select: { areaId: true },
        });
        if (!patient) throw missing();

        const summary = await activateVersion(tx, {
          auth,
          tenantId,
          plan,
          version,
          config,
          areaId: patient.areaId,
          now: now(),
        });
        await tx.idempotencyKey.create({
          data: {
            tenantId,
            principalId,
            key: idempotencyKey,
            requestHash,
            responseSummary: summary,
            expiresAt: new Date(now().getTime() + 24 * 3_600_000),
          },
        });
        return summary;
      }),
  };
}

async function activateVersion(
  tx: Prisma.TransactionClient,
  args: {
    auth: AuthState;
    tenantId: string;
    plan: { id: string; status: string; patientId: string; agencyServiceId: string };
    version: VersionRow;
    config: z.infer<typeof ServiceConfigSchema>;
    areaId: string;
    now: Date;
  },
) {
  const { auth, tenantId, plan, version, config, areaId, now } = args;
  const clinical = config.clinicalClass === 'CLINICAL';
  if (version.status === 'ACTIVATED') {
    // Stable replay without a stored idempotency key (I09).
    const existing = await tx.visit.count({ where: { tenantId, planVersionId: version.id } });
    return {
      planId: plan.id,
      version: version.version,
      status: plan.status,
      generatedVisits: existing,
      cancelledVisits: 0,
      replay: true as const,
    };
  }
  if (version.status !== 'DRAFT' && version.status !== 'APPROVED')
    throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Version cannot be activated.');
  if (clinical && version.status !== 'APPROVED')
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'Clinical approval of this exact version is required before activation.',
    );

  const occurrences = expandOccurrences(versionRecurrenceSpec(version), version.id);

  const isAmendment = plan.status === 'ACTIVE' || plan.status === 'PAUSED';
  let cancelledVisits = 0;
  const occupiedDates = new Set<string>();
  if (isAmendment) {
    // Replace future unassigned PLANNED occurrences of prior versions from the
    // new validFrom; keep confirmed commitments and historical visits intact.
    const future = await tx.visit.findMany({
      where: {
        tenantId,
        carePlanId: plan.id,
        status: 'PLANNED',
        assignedCaregiverId: null,
        planVersionId: { not: version.id },
      },
      select: { id: true, scheduledStartUtc: true },
    });
    const toCancel = future.filter(
      (visit) =>
        utcLocalDate(visit.scheduledStartUtc, version.timezoneSnapshot) >= version.validFrom,
    );
    if (toCancel.length) {
      const result = await tx.visit.updateMany({
        where: { tenantId, id: { in: toCancel.map((v) => v.id) } },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledReason: `Superseded by plan version ${version.version}`,
        },
      });
      cancelledVisits = result.count;
    }
  }
  // Never duplicate a date this plan still covers (e.g. a kept SCHEDULED
  // occurrence from an older version).
  const kept = await tx.visit.findMany({
    where: { tenantId, carePlanId: plan.id, status: { not: 'CANCELLED' } },
    select: { scheduledStartUtc: true },
  });
  for (const visit of kept)
    occupiedDates.add(utcLocalDate(visit.scheduledStartUtc, version.timezoneSnapshot));

  const tasks = parseTaskTemplates(version.taskTemplatesJson);
  let generated = 0;
  for (const occurrence of occurrences) {
    if (occupiedDates.has(occurrence.localDate)) continue;
    try {
      const visit = await tx.visit.create({
        data: {
          tenantId,
          patientId: plan.patientId,
          agencyServiceId: plan.agencyServiceId,
          carePlanId: plan.id,
          planVersionId: version.id,
          occurrenceKey: occurrence.occurrenceKey,
          areaId,
          serviceNameSnapshot: { nameAr: config.nameAr, nameEn: config.nameEn },
          scheduledStartUtc: occurrence.scheduledStartUtc,
          scheduledEndUtc: occurrence.scheduledEndUtc,
          timezoneSnapshot: version.timezoneSnapshot,
          status: 'PLANNED',
          assignmentHealth: 'OK',
        },
        select: { id: true },
      });
      if (tasks.length)
        await tx.visitTask.createMany({
          data: tasks.map((task, order) => ({
            tenantId,
            visitId: visit.id,
            order,
            descriptionSnapshot: task.description,
            isRequired: task.isRequired,
          })),
        });
      generated += 1;
    } catch (error) {
      // Parallel/replayed generation guard: unique occurrence key (I09).
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
  }

  await tx.carePlanVersion.update({
    where: { id: version.id },
    data: { status: 'ACTIVATED', activatedAt: now },
  });
  await tx.carePlan.update({
    where: { tenantId_id: { tenantId, id: plan.id } },
    data: { status: 'ACTIVE', ...(plan.status === 'DRAFT' ? { startedAt: now } : {}) },
  });
  await recordChange(
    tx,
    auth,
    tenantId,
    version.id,
    isAmendment ? CarePlanEvents.AMENDED : CarePlanEvents.ACTIVATED,
    'care_plan_version',
    { planId: plan.id, version: version.version, generatedVisits: generated, cancelledVisits },
  );
  return {
    planId: plan.id,
    version: version.version,
    status: 'ACTIVE' as const,
    generatedVisits: generated,
    cancelledVisits,
    replay: false as const,
  };
}
