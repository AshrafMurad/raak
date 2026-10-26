/**
 * Canonical domain enums (docs 04, 05, 06, 11).
 * English technical status codes are canonical (A11); Arabic labels live in the UI only.
 * These are declaration-only shared contracts; state transitions are enforced server-side
 * in later sprints.
 */

/** docs 06 — tenants.status */
export const TenantStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

/** docs 05 — principal audiences / roles */
export const PrincipalType = {
  PLATFORM_OPERATOR: 'PLATFORM_OPERATOR',
  AGENCY_STAFF: 'AGENCY_STAFF',
  AGENCY_CUSTOMER: 'AGENCY_CUSTOMER',
} as const;
export type PrincipalType = (typeof PrincipalType)[keyof typeof PrincipalType];

export const StaffRole = {
  AGENCY_OWNER: 'AGENCY_OWNER',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  CARE_COORDINATOR: 'CARE_COORDINATOR',
  CAREGIVER: 'CAREGIVER',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/** docs 04 BR-REQ — ServiceRequest */
export const RequestStatus = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  AWAITING_CUSTOMER: 'AWAITING_CUSTOMER',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

/** docs 04 BR-PRC — ServicePricing */
export const PricingType = {
  FIXED: 'FIXED',
  STARTING_FROM: 'STARTING_FROM',
  CUSTOM_QUOTE: 'CUSTOM_QUOTE',
} as const;
export type PricingType = (typeof PricingType)[keyof typeof PricingType];

export const PriceUnit = {
  VISIT: 'VISIT',
  HOUR: 'HOUR',
  SESSION: 'SESSION',
} as const;
export type PriceUnit = (typeof PriceUnit)[keyof typeof PriceUnit];

/** docs 04 BR-QTE — Quote + revisions */
export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const QuoteRevisionStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type QuoteRevisionStatus = (typeof QuoteRevisionStatus)[keyof typeof QuoteRevisionStatus];

/** docs 04 BR-PLAN — CarePlan */
export const CarePlanStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type CarePlanStatus = (typeof CarePlanStatus)[keyof typeof CarePlanStatus];

/** docs 04 BR-VST — Visit */
export const VisitStatus = {
  PLANNED: 'PLANNED',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  MISSED: 'MISSED',
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];

export const VisitReviewStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REVIEWED: 'REVIEWED',
} as const;
export type VisitReviewStatus = (typeof VisitReviewStatus)[keyof typeof VisitReviewStatus];

export const AssignmentHealth = {
  OK: 'OK',
  NEEDS_REASSIGNMENT: 'NEEDS_REASSIGNMENT',
} as const;
export type AssignmentHealth = (typeof AssignmentHealth)[keyof typeof AssignmentHealth];

export const TaskOutcome = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  NOT_DONE: 'NOT_DONE',
} as const;
export type TaskOutcome = (typeof TaskOutcome)[keyof typeof TaskOutcome];

/** docs 04 BR-CHG — VisitChangeRequest */
export const ChangeRequestType = {
  CANCEL: 'CANCEL',
  RESCHEDULE: 'RESCHEDULE',
} as const;
export type ChangeRequestType = (typeof ChangeRequestType)[keyof typeof ChangeRequestType];

export const ChangeRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ChangeRequestStatus = (typeof ChangeRequestStatus)[keyof typeof ChangeRequestStatus];

export const ChangeRequestUrgency = {
  NORMAL: 'NORMAL',
  LATE: 'LATE',
} as const;
export type ChangeRequestUrgency = (typeof ChangeRequestUrgency)[keyof typeof ChangeRequestUrgency];

/** docs 11 — notification channels and event catalog */
export const NotificationChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationEventType = {
  REQUEST_RECEIVED: 'REQUEST_RECEIVED',
  REQUEST_NEW: 'REQUEST_NEW',
  REQUEST_NEEDS_INFO: 'REQUEST_NEEDS_INFO',
  QUOTE_SENT: 'QUOTE_SENT',
  QUOTE_RESPONSE: 'QUOTE_RESPONSE',
  QUOTE_REVISION_REQUESTED: 'QUOTE_REVISION_REQUESTED',
  QUOTE_REVISION_SENT: 'QUOTE_REVISION_SENT',
  VISIT_CONFIRMED: 'VISIT_CONFIRMED',
  VISIT_CHANGED: 'VISIT_CHANGED',
  VISIT_CANCELLED: 'VISIT_CANCELLED',
  VISIT_ASSIGNED: 'VISIT_ASSIGNED',
  VISIT_REMINDER: 'VISIT_REMINDER',
  VISIT_LATE_FLAGGED: 'VISIT_LATE_FLAGGED',
  VISIT_NEEDS_REVIEW: 'VISIT_NEEDS_REVIEW',
  CAREGIVER_EXCEPTION: 'CAREGIVER_EXCEPTION',
  STAFF_INVITATION: 'STAFF_INVITATION',
  SECURITY_VERIFICATION: 'SECURITY_VERIFICATION',
} as const;
export type NotificationEventType =
  (typeof NotificationEventType)[keyof typeof NotificationEventType];
