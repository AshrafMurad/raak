export type CarePlanStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type PlanVersionStatus = 'DRAFT' | 'APPROVED' | 'ACTIVATED';
export type PlanDstResolution = 'REJECT' | 'EARLIEST' | 'LATEST';

export interface TaskTemplate {
  description: string;
  isRequired: boolean;
}

export interface PlanContent {
  primaryCaregiverId: string | null;
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  localStartTime: string;
  durationMin: number;
  goalText: string | null;
  taskTemplates: TaskTemplate[];
  clinicalInstructionsRestricted: string | null;
  dstResolution: PlanDstResolution;
}

export interface CarePlanCreateInput extends PlanContent {
  agencyServiceId: string;
  serviceRequestId: string | null;
}

export interface CarePlanDraftEditInput extends PlanContent {
  expectedDraftVersion: number;
}

export interface CarePlanVersion extends Omit<
  PlanContent,
  'primaryCaregiverId' | 'weekdays' | 'taskTemplates'
> {
  id: string;
  version: number;
  status: PlanVersionStatus;
  weekdaysJson: number[];
  taskTemplatesJson: TaskTemplate[];
  timezoneSnapshot: string;
  approvedByStaffId: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface CarePlanSummary {
  id: string;
  status: CarePlanStatus;
  currentVersion: number;
  primaryCaregiverId: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  patient: { id: string; displayName: string };
  serviceId: string;
  serviceNameAr: string;
  serviceNameEn: string;
  plannedVisits: number;
}

export interface CarePlanDetail extends Omit<CarePlanSummary, 'plannedVisits'> {
  patient: { id: string; displayName: string; areaId: string };
  clinicalClass: 'CLINICAL' | 'NON_CLINICAL';
  requiredQualificationCodes: string[];
  plannedVisits: number;
  scheduledVisits: number;
  versions: CarePlanVersion[];
}

export interface GenerationPreview {
  planId: string;
  version: number;
  versionStatus: PlanVersionStatus;
  clinicalApprovalRequired: boolean;
  spanDays: number;
  occurrenceCount: number;
  occurrences: { localDate: string; weekday: number; startUtc: string; endUtc: string }[];
  wouldCancelCount: number;
  wouldCancel: { visitId: string; localDate: string }[];
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OptionRecord {
  id: string;
  displayName?: string;
  name?: string;
  config?: { nameAr: string; nameEn: string; allowRecurring?: boolean };
}

export type CarePlanOptionRecord = OptionRecord;

export type CarePlanLifecycleAction = 'pause' | 'resume' | 'complete' | 'cancel';
export type PlannedVisitsAction = 'KEEP' | 'CANCEL';
export type CarePlanStatusFilter = CarePlanStatus;
