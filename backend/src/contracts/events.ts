/** Sprint 2 outbox identifiers. Payloads contain resource IDs only. */
export const RequestEvents = {
  ACCESS_EMAIL: 'email.request_access',
  SUBMITTED: 'request.new',
  REVIEW_STARTED: 'request.review_started',
} as const;
export const CatalogEvents = {
  CREATED: 'catalog.created',
  UPDATED: 'catalog.updated',
  PUBLISHED: 'catalog.published',
  UNPUBLISHED: 'catalog.unpublished',
  BRANDING_UPDATED: 'branding.updated',
} as const;
export type CatalogEvent = (typeof CatalogEvents)[keyof typeof CatalogEvents];
