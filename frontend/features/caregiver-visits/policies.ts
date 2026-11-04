import type {
  CaregiverVisitDetail,
  CaregiverVisitSummary,
  CaregiverVisitStatus,
} from './contracts';

/** Ordered mobile sections for the caregiver's day view. */
export const VISIT_SECTION_ORDER = ['IN_PROGRESS', 'SCHEDULED', 'COMPLETED'] as const;

export function groupVisitsByStatus(visits: CaregiverVisitSummary[]) {
  const groups: Record<CaregiverVisitStatus, CaregiverVisitSummary[]> = {
    IN_PROGRESS: [],
    SCHEDULED: [],
    COMPLETED: [],
  };
  for (const visit of visits) groups[visit.status]?.push(visit);
  for (const key of VISIT_SECTION_ORDER)
    groups[key].sort((a, b) => a.scheduledStartUtc.localeCompare(b.scheduledStartUtc));
  return groups;
}

/** The current local calendar date (YYYY-MM-DD) in the agency timezone. */
export function localToday(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

export function shiftDate(date: string, days: number): string {
  const next = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export interface ExecutionActions {
  canStart: boolean;
  canComplete: boolean;
}

/** Action eligibility mirrors the server state machine (docs 04 BR-VST);
 * the server remains the authority and failures never show success. */
export function executionActions(visit: Pick<CaregiverVisitDetail, 'status'>): ExecutionActions {
  return {
    canStart: visit.status === 'SCHEDULED',
    canComplete: visit.status === 'IN_PROGRESS',
  };
}

export function allRequiredTasksClassified(visit: CaregiverVisitDetail): boolean {
  return visit.tasks.every((task) => !task.isRequired || task.outcome !== 'PENDING');
}

export function isValidNotDoneReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}

export function isValidNoteBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length >= 1 && trimmed.length <= 5000;
}
