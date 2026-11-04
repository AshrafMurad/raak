/** Outbox identifiers. Payloads contain resource IDs only. */

/** Sprint 5 care-plan lifecycle events (docs 04 BR-PLAN, docs 11). */
export const CarePlanEvents = {
  CREATED: 'careplan.created',
  VERSION_CREATED: 'careplan.version_created',
  DRAFT_EDITED: 'careplan.draft_edited',
  CLINICAL_APPROVED: 'careplan.clinical_approved',
  ACTIVATED: 'careplan.activated',
  AMENDED: 'careplan.amended',
  PAUSED: 'careplan.paused',
  RESUMED: 'careplan.resumed',
  COMPLETED: 'careplan.completed',
  CANCELLED: 'careplan.cancelled',
} as const;

/** Sprint 5 scheduling events (docs 04 BR-SCH/BR-VST, docs 11). */
export const SchedulingEvents = {
  ASSIGNED: 'visit.assigned',
  REASSIGNMENT_FLAGGED: 'visit.reassignment_flagged',
  REASSIGNMENT_RESOLVED: 'visit.reassignment_resolved',
} as const;

/** Sprint 6 visit-execution and change-request events (docs 04 BR-VST/BR-CHG,
 * docs 11). Payloads carry resource IDs only. */
export const VisitEvents = {
  TASK_UPDATED: 'visit.task_updated',
  DRAFT_SAVED: 'visit.draft_saved',
  STARTED: 'visit.started',
  COMPLETED: 'visit.completed',
  NEEDS_REVIEW: 'visit.needs_review',
  REVIEWED: 'visit.reviewed',
  CORRECTED: 'visit.corrected',
  CHANGE_REQUESTED: 'visit.change_requested',
  CHANGE_APPROVED: 'visit.change_approved',
  CHANGE_REJECTED: 'visit.change_rejected',
  CHANGE_WITHDRAWN: 'visit.change_withdrawn',
  SETTINGS_UPDATED: 'agency.scheduling_settings_updated',
} as const;

export const RequestEvents = {
  ACCESS_EMAIL: 'email.request_access',
  SUBMITTED: 'request.new',
  REVIEW_STARTED: 'request.review_started',
  INFO_NEEDED: 'request.info_needed',
  RESPONDED: 'request.responded',
  APPROVED: 'request.approved',
  REJECTED: 'request.rejected',
  WITHDRAWN: 'request.withdrawn',
} as const;
export const CatalogEvents = {
  CREATED: 'catalog.created',
  UPDATED: 'catalog.updated',
  PUBLISHED: 'catalog.published',
  UNPUBLISHED: 'catalog.unpublished',
  BRANDING_UPDATED: 'branding.updated',
} as const;
export type CatalogEvent = (typeof CatalogEvents)[keyof typeof CatalogEvents];
/** Sprint 3 commercial events (docs 11 catalog names); payloads carry
 * { requestId, quoteId? } only. Email delivery of these durable events stays
 * with the Sprint 7 notification matrix. */
export const QuoteEvents = {
  SENT: 'quote.sent',
  RESPONDED: 'quote.responded',
  REVISION_REQUESTED: 'quote.revision_requested',
  REVISION_SENT: 'quote.revision_sent',
} as const;
export type QuoteEvent = (typeof QuoteEvents)[keyof typeof QuoteEvents];
