import type { BulkAssignItem, VisitSummary } from './contracts';

export type VisitStatusTone = 'planned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Tone mapping for visit statuses and assignment-health labels. */
export function visitStatusTone(status: string): VisitStatusTone {
  if (status === 'SCHEDULED') return 'scheduled';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'CANCELLED' || status === 'MISSED' || status === 'NEEDS_REASSIGNMENT')
    return 'cancelled';
  if (status === 'IN_PROGRESS') return 'in_progress';
  return 'planned';
}

export function canAssignVisit(visit: Pick<VisitSummary, 'status'>): boolean {
  return visit.status === 'PLANNED';
}

export function canReassignVisit(visit: Pick<VisitSummary, 'status'>): boolean {
  return visit.status === 'SCHEDULED';
}

export function canSelectForBulk(visit: Pick<VisitSummary, 'status'>): boolean {
  return visit.status === 'PLANNED';
}

export type VisitAction = 'assign' | 'reassign';

/** Single visit-status action; parent-plan eligibility is server-owned and is
 * never inferred from incomplete client data. */
export function visitActionFor(visit: Pick<VisitSummary, 'status'>): VisitAction | null {
  if (canAssignVisit(visit)) return 'assign';
  if (canReassignVisit(visit)) return 'reassign';
  return null;
}

/** Mirrors the backend reason schemas: trimmed length 5-300; optional reasons
 * may be empty. Feedback only — the backend schema remains authoritative. */
export function isValidActionReason(reason: string, required: boolean): boolean {
  const trimmed = reason.trim();
  if (!required && trimmed === '') return true;
  return trimmed.length >= 5 && trimmed.length <= 300;
}

export function isBulkAssignReady(input: {
  selectedCount: number;
  caregiverId: string;
  reason: string;
  pending: boolean;
}): boolean {
  return (
    !input.pending &&
    input.selectedCount > 0 &&
    input.caregiverId !== '' &&
    isValidActionReason(input.reason, false)
  );
}

/** Selected visits in list order, each carrying its rendered version for the
 * server's optimistic-concurrency check. */
export function bulkAssignmentsFor(
  visits: VisitSummary[],
  selectedIds: ReadonlySet<string>,
  caregiverId: string,
): BulkAssignItem[] {
  return visits
    .filter((visit) => selectedIds.has(visit.id) && visit.status === 'PLANNED')
    .map((visit) => ({
      visitId: visit.id,
      caregiverId,
      expectedVisitVersion: visit.version,
    }));
}
