import { apiRequest, ApiRequestError } from '../../lib/api-client';
import {
  arrayOf,
  flag,
  integer,
  nullable,
  objectOf,
  oneOf,
  text,
} from '../../lib/response-validation';

const eventType = oneOf([
  'REQUEST_RECEIVED',
  'REQUEST_NEW',
  'REQUEST_NEEDS_INFO',
  'QUOTE_SENT',
  'QUOTE_RESPONSE',
  'QUOTE_REVISION_REQUESTED',
  'QUOTE_REVISION_SENT',
  'VISIT_CONFIRMED',
  'VISIT_CHANGED',
  'VISIT_CANCELLED',
  'VISIT_ASSIGNED',
  'VISIT_REMINDER',
  'VISIT_LATE_FLAGGED',
  'VISIT_NEEDS_REVIEW',
  'CAREGIVER_EXCEPTION',
  'STAFF_INVITATION',
  'SECURITY_VERIFICATION',
] as const);
const channel = oneOf(['IN_APP', 'EMAIL'] as const);
const notice = objectOf({ id: text, eventType, readAt: nullable(text), createdAt: text });
const preference = objectOf({ eventType, channel, optedOut: flag, tenantEnabled: flag });
const policy = objectOf({
  eventType,
  channel,
  enabled: flag,
  configurable: flag,
  reminderOffsetMin: nullable(integer),
});
export type Notice = ReturnType<typeof notice>;
export type Preference = ReturnType<typeof preference>;
export type Policy = ReturnType<typeof policy>;
export type PreferenceInput = Omit<Preference, 'tenantEnabled'>;
export function getInbox(
  filters: { unreadOnly: boolean; cursor: string | null },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ unreadOnly: String(filters.unreadOnly) });
  if (filters.cursor) params.set('cursor', filters.cursor);
  return apiRequest(`/notifications?${params}`, { signal, cache: 'no-store' }).then(
    objectOf({ items: arrayOf(notice), nextCursor: nullable(text), timezone: text }),
  );
}
export function getUnreadCount(signal?: AbortSignal) {
  return apiRequest('/notifications/unread-count', { signal, cache: 'no-store' }).then(
    objectOf({ count: integer }),
  );
}
export function markRead(id: string) {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    body: '{}',
  }).then(objectOf({ id: text, readAt: text }));
}
export async function getNotificationTarget(id: string) {
  const { path } = objectOf({ path: nullable(text) })(
    await apiRequest(`/notifications/${encodeURIComponent(id)}/target`, { cache: 'no-store' }),
  );
  if (
    path !== null &&
    !/^\/(?:workspace\/(?:visits\?visit=|requests\/|caregivers\?caregiver=)|my\/visits\?visit=|caregiver\/visits\?visit=|track\?request=)[a-f0-9-]{36}$/.test(
      path,
    )
  )
    throw new ApiRequestError(502, 'INVALID_RESPONSE');
  return path;
}
export function getPreferences(signal?: AbortSignal) {
  return apiRequest('/notifications/preferences', { signal, cache: 'no-store' }).then(
    objectOf({ preferences: arrayOf(preference) }),
  );
}
export function savePreferences(preferences: PreferenceInput[]) {
  return apiRequest('/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  }).then(objectOf({ ok: flag }));
}
export function getPolicies(signal?: AbortSignal) {
  return apiRequest('/agency/notification-policies', { signal, cache: 'no-store' }).then(
    objectOf({ version: integer, policies: arrayOf(policy) }),
  );
}
export function savePolicies(version: number, policies: Policy[]) {
  return apiRequest('/agency/notification-policies', {
    method: 'PATCH',
    body: JSON.stringify({
      expectedVersion: version,
      policies: policies
        .filter((p) => p.configurable)
        .map(({ eventType, channel, enabled, reminderOffsetMin }) => ({
          eventType,
          channel,
          enabled,
          reminderOffsetMin,
        })),
    }),
  }).then(objectOf({ version: integer }));
}
