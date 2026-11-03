import type { CarePlanVersion, PlanContent } from './contracts';

export function planContentFromVersion(
  version: CarePlanVersion,
  primaryCaregiverId: string | null,
): PlanContent {
  return {
    primaryCaregiverId,
    validFrom: version.validFrom,
    validUntil: version.validUntil,
    weekdays: version.weekdaysJson,
    localStartTime: version.localStartTime,
    durationMin: version.durationMin,
    goalText: version.goalText,
    taskTemplates: version.taskTemplatesJson,
    clinicalInstructionsRestricted: version.clinicalInstructionsRestricted,
    dstResolution: version.dstResolution,
  };
}

export function planContentForRequest(content: PlanContent): PlanContent {
  return {
    ...content,
    weekdays: [...content.weekdays],
    taskTemplates: content.taskTemplates.map((task) => ({ ...task })),
    goalText: content.goalText?.trim() || null,
    clinicalInstructionsRestricted: content.clinicalInstructionsRestricted?.trim() || null,
  };
}
