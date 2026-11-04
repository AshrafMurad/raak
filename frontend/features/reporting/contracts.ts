/** Client-side mirrors of the Session 4 report contracts (docs 07). English
 * status codes are canonical; labels are localized in the UI only. */
export const REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_CUSTOMER',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export const VISIT_STATUSES = [
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
] as const;
export type RequestReportStatus = (typeof REQUEST_STATUSES)[number];
export type VisitReportStatus = (typeof VISIT_STATUSES)[number];
export type RequestStatusFilter = RequestReportStatus | '';
export type VisitStatusFilter = VisitReportStatus | '';

export interface ServiceOption {
  serviceId: string;
  label: string;
}

export interface ServiceBreakdownRow {
  serviceId: string;
  slug: string;
  nameAr: string | null;
  nameEn: string | null;
  count: number;
}

export interface RequestsReportData {
  timezone: string;
  total: number;
  byStatus: Record<string, number>;
  byService: ServiceBreakdownRow[];
  byServiceTruncated: boolean;
}

export interface VisitsReportData {
  timezone: string;
  total: number;
  byStatus: Record<string, number>;
  unassigned: number;
  timeliness: { started: number; onTime: number; late: number; notStarted: number };
}

export interface CaregiverLoadItem {
  caregiverId: string;
  name: string;
  scheduledMinutes: number;
  byStatus: Record<string, number>;
}

export interface CaregiversReportData {
  timezone: string;
  items: CaregiverLoadItem[];
  truncated: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorType: string | null;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  reason: string | null;
}

export interface AuditPageData {
  timezone: string;
  items: AuditEntry[];
  nextCursor: string | null;
}
