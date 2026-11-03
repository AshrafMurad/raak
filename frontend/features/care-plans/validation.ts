import type { CarePlanLifecycleAction, PlanContent, PlannedVisitsAction } from './contracts';

export type PlanContentValidationCode =
  | 'DATE_INVALID'
  | 'DATE_ORDER_INVALID'
  | 'PLAN_DURATION_EXCEEDED'
  | 'WEEKDAYS_INVALID'
  | 'DURATION_INVALID'
  | 'TIME_INVALID'
  | 'GOAL_INVALID'
  | 'INSTRUCTIONS_INVALID'
  | 'TASK_INVALID'
  | 'TASK_LIMIT_EXCEEDED';

function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    return null;
  return timestamp / 86_400_000;
}

function boundedOptionalText(value: string | null, max: number): boolean {
  return value === null || (value.trim().length > 0 && value.trim().length <= max);
}

export function validatePlanContent(content: PlanContent): PlanContentValidationCode[] {
  const errors: PlanContentValidationCode[] = [];
  const from = calendarDay(content.validFrom);
  const until = calendarDay(content.validUntil);
  if (from === null || until === null) errors.push('DATE_INVALID');
  else if (from > until) errors.push('DATE_ORDER_INVALID');
  else if (until - from + 1 > 60) errors.push('PLAN_DURATION_EXCEEDED');

  if (
    content.weekdays.length < 1 ||
    content.weekdays.length > 7 ||
    content.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(content.weekdays).size !== content.weekdays.length
  )
    errors.push('WEEKDAYS_INVALID');
  if (
    !Number.isInteger(content.durationMin) ||
    content.durationMin < 15 ||
    content.durationMin > 720
  )
    errors.push('DURATION_INVALID');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(content.localStartTime)) errors.push('TIME_INVALID');
  if (!boundedOptionalText(content.goalText, 500)) errors.push('GOAL_INVALID');
  if (!boundedOptionalText(content.clinicalInstructionsRestricted, 3000))
    errors.push('INSTRUCTIONS_INVALID');
  if (content.taskTemplates.length > 30) errors.push('TASK_LIMIT_EXCEEDED');
  if (
    content.taskTemplates.some(
      (task) => !task.description.trim() || task.description.trim().length > 300,
    )
  )
    errors.push('TASK_INVALID');
  return errors;
}

export function validateLifecycleReason(
  action: CarePlanLifecycleAction,
  reason: string,
  plannedVisitsAction?: PlannedVisitsAction,
): 'REASON_REQUIRED' | 'REASON_INVALID' | null {
  if (action === 'resume') return null;
  const required = action === 'cancel' || (action === 'pause' && plannedVisitsAction === 'CANCEL');
  const trimmed = reason.trim();
  if (!required && trimmed.length === 0) return null;
  if (required && trimmed.length === 0) return 'REASON_REQUIRED';
  return trimmed.length < 5 || trimmed.length > 300 ? 'REASON_INVALID' : null;
}

/** Field association is part of validation, not duplicated in rendering code. */
export function planFieldErrors(
  content: PlanContent,
): Partial<Record<keyof PlanContent, PlanContentValidationCode>> {
  const fields: Partial<Record<keyof PlanContent, PlanContentValidationCode>> = {};
  const targets: Record<PlanContentValidationCode, keyof PlanContent> = {
    DATE_INVALID: 'validFrom',
    DATE_ORDER_INVALID: 'validUntil',
    PLAN_DURATION_EXCEEDED: 'validUntil',
    WEEKDAYS_INVALID: 'weekdays',
    DURATION_INVALID: 'durationMin',
    TIME_INVALID: 'localStartTime',
    GOAL_INVALID: 'goalText',
    INSTRUCTIONS_INVALID: 'clinicalInstructionsRestricted',
    TASK_INVALID: 'taskTemplates',
    TASK_LIMIT_EXCEEDED: 'taskTemplates',
  };
  for (const error of validatePlanContent(content)) fields[targets[error]] = error;
  if (calendarDay(content.validUntil) === null) fields.validUntil = 'DATE_INVALID';
  if (calendarDay(content.validFrom) !== null) delete fields.validFrom;
  return fields;
}
