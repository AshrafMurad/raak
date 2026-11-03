/**
 * Care-plan recurrence content mapping (docs 04 BR-PLAN). One canonical home
 * for turning validated plan-content input or a stored version row into the
 * recurrence engine's `RecurrenceSpec`, so create/edit/revise/preview/activate
 * cannot drift apart. Pure mapping only — validation and expansion stay in the
 * recurrence engine and the workflow transactions.
 */
import type { z } from 'zod';
import type { Prisma } from '../../db/generated/prisma/client';
import type {
  CarePlanCreateSchema,
  CarePlanDraftEditSchema,
  CarePlanReviseSchema,
} from '../../contracts/careplans';
import type { RecurrenceSpec } from './recurrence';
import type { VersionRow } from './care-plan.types';

/** Plan recurrence content shared by create, draft edit and revise. */
export type PlanContentInput = z.infer<
  typeof CarePlanCreateSchema | typeof CarePlanDraftEditSchema | typeof CarePlanReviseSchema
>;

/** Map validated plan-content input (tenant timezone applied) to a spec. */
export function mapPlanContentToSpec(input: PlanContentInput, timezone: string): RecurrenceSpec {
  return {
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    weekdays: input.weekdays,
    localStartTime: input.localStartTime,
    durationMin: input.durationMin,
    timezone,
    dstResolution: input.dstResolution,
  };
}

/** Parse a stored version row's JSON recurrence fields into a spec. */
export function versionRecurrenceSpec(version: VersionRow): RecurrenceSpec {
  return {
    validFrom: version.validFrom,
    validUntil: version.validUntil,
    weekdays: (version.weekdaysJson as number[]) ?? [],
    localStartTime: version.localStartTime,
    durationMin: version.durationMin,
    timezone: version.timezoneSnapshot,
    dstResolution: version.dstResolution as 'REJECT' | 'EARLIEST' | 'LATEST',
  };
}

/** Parse stored version task templates; empty templates generate bare visits. */
export function parseTaskTemplates(json: Prisma.JsonValue): Array<{
  description: string;
  isRequired: boolean;
}> {
  return (json as Array<{ description: string; isRequired: boolean }>) ?? [];
}
