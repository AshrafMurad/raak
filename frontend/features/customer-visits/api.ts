import { apiRequest } from '../../lib/api-client';
import { arrayOf, nullable, objectOf, oneOf, optional, text } from '../../lib/response-validation';

const change = objectOf({
  id: text,
  type: oneOf(['CANCEL', 'RESCHEDULE']),
  status: oneOf(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']),
  urgency: oneOf(['NORMAL', 'LATE']),
  createdAt: text,
  proposedStartUtc: optional(nullable(text)),
  decisionReason: optional(nullable(text)),
});
const visit = objectOf({
  id: text,
  status: oneOf(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  scheduledStartUtc: text,
  scheduledEndUtc: text,
  timezoneSnapshot: text,
  patient: objectOf({ id: text, displayName: text }),
  serviceNameSnapshot: objectOf({ nameAr: text, nameEn: text }),
  pendingChange: nullable(change),
  changeRequests: arrayOf(change),
});
const list = objectOf({ items: arrayOf(visit), timezone: text, nextCursor: nullable(text) });
export type CustomerVisit = ReturnType<typeof visit>;
export type ChangeInput =
  | { type: 'CANCEL'; reason: string }
  | { type: 'RESCHEDULE'; reason: string; proposedDate: string; proposedTime: string };
export function listMyVisits(cursor?: string, signal?: AbortSignal) {
  return apiRequest(`/portal/my/visits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
    signal,
  }).then(list);
}
export function getMyVisit(id: string) {
  return apiRequest(`/portal/my/visits/${encodeURIComponent(id)}`).then(visit);
}
export function requestChange(id: string, input: ChangeInput) {
  return apiRequest(`/portal/my/visits/${encodeURIComponent(id)}/change-requests`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function withdrawChange(id: string) {
  return apiRequest(`/portal/my/visit-change-requests/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
    body: '{}',
  });
}
