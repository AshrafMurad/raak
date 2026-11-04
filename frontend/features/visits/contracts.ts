/**
 * Frontend-safe visit DTOs mirrored from the `/v1` scheduling projections.
 * Visit-domain only: parent-plan eligibility is not encoded here; the server
 * remains authoritative for assignment eligibility at commit time.
 */
export type VisitStatus =
  'PLANNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'MISSED';

export type AssignmentHealth = 'OK' | 'NEEDS_REASSIGNMENT';

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface VisitSummary {
  id: string;
  status: VisitStatus;
  assignmentHealth: AssignmentHealth;
  reviewStatus?: string;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  timezoneSnapshot: string;
  version: number;
  areaId: string;
  carePlanId: string | null;
  patient: { id: string; displayName: string };
  assignedCaregiver: { id: string; name: string } | null;
}

export interface VisitListResult extends PageResult<VisitSummary> {
  timezone: string;
  bufferMinutes: number;
}

export interface VisitDetailData extends Omit<VisitSummary, 'carePlanId'> {
  reviewStatus: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  occurrenceKey: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  serviceNameSnapshot: { nameAr: string; nameEn: string };
  carePlan: { id: string; status: string; currentVersion: number } | null;
  tasks: {
    id: string;
    order: number;
    descriptionSnapshot: string;
    isRequired: boolean;
    outcome: string | null;
    notDoneReason?: string | null;
  }[];
  assignmentHistory: {
    id: string;
    oldCaregiverId: string | null;
    newCaregiverId: string;
    oldCaregiverName: string | null;
    newCaregiverName: string | null;
    reason: string | null;
    createdAt: string;
  }[];
}

export interface CandidateResult {
  visitId: string;
  visitStatus: VisitStatus;
  visitLocalDate: string;
  bufferMinutes: number;
  advisory: true;
  items: {
    caregiverId: string;
    name: string;
    isPrimary: boolean;
    load: number;
    sameArea: boolean;
    serviceAreas: string[];
  }[];
  excluded: { caregiverId: string; name: string; reasons: string[] }[];
}

export interface BulkAssignmentResult {
  results: Array<{
    visitId: string;
    ok: boolean;
    code?: string;
    status?: string;
    assignedCaregiverId?: string | null;
    version?: number;
  }>;
  summary: { succeeded: number; failed: number };
}

export interface CaregiverOption {
  id: string;
  name?: string | null;
}

export interface AssignVisitInput {
  caregiverId: string;
  expectedVisitVersion: number;
  reason?: string;
}

export interface ReassignVisitInput {
  caregiverId: string;
  expectedVisitVersion: number;
  reason: string;
}

export interface BulkAssignItem {
  visitId: string;
  caregiverId: string;
  expectedVisitVersion: number;
}

export interface BulkAssignInput {
  assignments: BulkAssignItem[];
  reason?: string;
}

export type VisitStatusFilter = VisitStatus;
export type AssignmentHealthFilter = AssignmentHealth;
