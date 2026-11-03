/**
 * BR-SCH hard-filter evaluation shared by the advisory candidate search, the
 * commit-time assignment recheck and the reassignment impact scanner. Pure
 * data-in/reasons-out so every caller enforces identical rules (docs 05
 * rule 5: foundation eligibility alone is never booking eligibility).
 */
import type { Prisma } from '../../db/generated/prisma/client';
import type { CandidateExclusionReason } from '../../contracts/careplans';
import { coversInterval } from '../common/interval';
import { utcLocalClock, utcLocalDate } from '../common/local-time';
import { ServiceConfigSchema } from '../../contracts/catalog';
import {
  effectiveIntervals,
  foundationReasons,
  type CaregiverFoundation,
} from '../caregivers/eligibility';

export interface VisitForFilters {
  id: string;
  patientId: string;
  agencyServiceId: string;
  areaId: string;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  timezoneSnapshot: string;
}

export interface ServiceConfigForFilters {
  requiredQualificationCodes: string[];
  serviceAreaIds: string[];
}

export interface FilterContext {
  tenantId: string;
  bufferMinutes: number;
  visit: VisitForFilters;
  config: ServiceConfigForFilters;
}

export async function loadFilterContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visit: VisitForFilters,
): Promise<FilterContext> {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { travelBufferMin: true },
  });
  const service = await tx.agencyService.findFirstOrThrow({
    where: { tenantId, id: visit.agencyServiceId },
    select: { config: true },
  });
  const config = ServiceConfigSchema.parse(service.config);
  return { tenantId, bufferMinutes: tenant.travelBufferMin, visit, config };
}

/** Exact buffer-boundary math (docs 04 BR-SCH): adjacent at exactly the
 * buffer distance is allowed; buffer applies before and after the candidate. */
export function bufferConflicts(
  candidate: { start: Date; end: Date },
  other: { start: Date; end: Date },
  bufferMinutes: number,
) {
  const bufferMs = bufferMinutes * 60_000;
  return (
    candidate.start.getTime() < other.end.getTime() + bufferMs &&
    candidate.end.getTime() + bufferMs > other.start.getTime()
  );
}

export async function hasBufferConflict(
  tx: Prisma.TransactionClient,
  ctx: FilterContext,
  caregiverId: string,
  excludeVisitId?: string,
) {
  const bufferMs = ctx.bufferMinutes * 60_000;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM visits
    WHERE tenant_id = ${ctx.tenantId}::uuid
      AND assigned_caregiver_id = ${caregiverId}::uuid
      AND status IN ('SCHEDULED','IN_PROGRESS')
      AND (${excludeVisitId ?? null}::uuid IS NULL OR id <> ${excludeVisitId ?? null}::uuid)
      AND scheduled_start_utc < (${ctx.visit.scheduledEndUtc}::timestamp + make_interval(secs => ${bufferMs / 1000}))
      AND scheduled_end_utc > (${ctx.visit.scheduledStartUtc}::timestamp - make_interval(secs => ${bufferMs / 1000}))
    LIMIT 1`;
  return rows.length > 0;
}

export async function hardFilterReasons(
  tx: Prisma.TransactionClient,
  ctx: FilterContext,
  caregiver: CaregiverFoundation,
  options: { excludeVisitId?: string; checkConflicts?: boolean } = {},
): Promise<CandidateExclusionReason[]> {
  const visitLocalDate = utcLocalDate(ctx.visit.scheduledStartUtc, ctx.visit.timezoneSnapshot);
  const reasons = foundationReasons(
    caregiver,
    ctx.visit.agencyServiceId,
    ctx.config,
    visitLocalDate,
  );
  const startClock = utcLocalClock(ctx.visit.scheduledStartUtc, ctx.visit.timezoneSnapshot);
  const endClock = utcLocalClock(ctx.visit.scheduledEndUtc, ctx.visit.timezoneSnapshot);
  const endDate = utcLocalDate(ctx.visit.scheduledEndUtc, ctx.visit.timezoneSnapshot);
  const intervals =
    endDate !== visitLocalDate
      ? [] // overnight visits cannot fit same-day availability intervals
      : await effectiveIntervals(tx, ctx.tenantId, caregiver.id, visitLocalDate);
  if (!coversInterval(intervals, startClock, endClock)) reasons.push('OUTSIDE_AVAILABILITY');
  if (
    options.checkConflicts !== false &&
    (await hasBufferConflict(tx, ctx, caregiver.id, options.excludeVisitId))
  )
    reasons.push('SCHEDULE_CONFLICT');
  return reasons;
}
