import { apiRequest } from '../../lib/api-client';
import { arrayOf, integer, nullable, objectOf, oneOf, text } from '../../lib/response-validation';
const change = objectOf({
  id: text,
  type: oneOf(['CANCEL', 'RESCHEDULE']),
  status: oneOf(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']),
  urgency: oneOf(['NORMAL', 'LATE']),
  reason: text,
  proposedStartUtc: nullable(text),
  createdAt: text,
  decisionReason: nullable(text),
  visit: objectOf({
    id: text,
    status: text,
    scheduledStartUtc: text,
    scheduledEndUtc: text,
    timezoneSnapshot: text,
    version: integer,
    patient: objectOf({ id: text, displayName: text }),
    assignedCaregiver: nullable(objectOf({ id: text, name: text })),
  }),
});
export type VisitChange = ReturnType<typeof change>;
export function listChanges(
  status: string,
  urgency: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (urgency) params.set('urgency', urgency);
  if (cursor) params.set('cursor', cursor);
  return apiRequest(`/agency/visit-change-requests?${params}`, { signal }).then(
    objectOf({ items: arrayOf(change), nextCursor: nullable(text) }),
  );
}
export function approveChange(id: string, key: string) {
  return apiRequest(`/agency/visit-change-requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: '{}',
  });
}
export function declineChange(id: string, reason: string) {
  return apiRequest(`/agency/visit-change-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ reason }),
  });
}
