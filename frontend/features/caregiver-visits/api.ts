import { apiRequest } from '../../lib/api-client';
import {
  decodeCaregiverVisitDetail,
  decodeCaregiverVisitList,
  type CaregiverVisitDetail,
  type CaregiverVisitListResult,
} from './contracts';

export interface CaregiverVisitQuery {
  from?: string;
  to?: string;
  cursor?: string;
}

function queryString(query: CaregiverVisitQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.cursor) params.set('cursor', query.cursor);
  return params.size ? `?${params}` : '';
}

export function listCaregiverVisits(
  query: CaregiverVisitQuery = {},
  signal?: AbortSignal,
): Promise<CaregiverVisitListResult> {
  return apiRequest(`/caregiver/my/visits${queryString(query)}`, { signal }).then(
    decodeCaregiverVisitList,
  );
}

export function getCaregiverVisit(visitId: string): Promise<CaregiverVisitDetail> {
  return apiRequest(`/caregiver/my/visits/${encodeURIComponent(visitId)}`).then(
    decodeCaregiverVisitDetail,
  );
}

export function startVisit(visitId: string): Promise<unknown> {
  return apiRequest(`/caregiver/my/visits/${encodeURIComponent(visitId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function markTaskDone(visitId: string, taskId: string): Promise<unknown> {
  return apiRequest(
    `/caregiver/my/visits/${encodeURIComponent(visitId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ outcome: 'DONE' }),
    },
  );
}

export function markTaskNotDone(visitId: string, taskId: string, reason: string): Promise<unknown> {
  return apiRequest(
    `/caregiver/my/visits/${encodeURIComponent(visitId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ outcome: 'NOT_DONE', reason }),
    },
  );
}

export function saveVisitNote(visitId: string, body: string): Promise<unknown> {
  return apiRequest(`/caregiver/my/visits/${encodeURIComponent(visitId)}/note`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

export function completeVisit(visitId: string): Promise<unknown> {
  return apiRequest(`/caregiver/my/visits/${encodeURIComponent(visitId)}/complete`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({}),
  });
}
