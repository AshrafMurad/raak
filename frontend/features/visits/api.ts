import { apiRequest } from '../../lib/api-client';
import {
  decodeBulkResult,
  decodeCandidates,
  decodeCaregiverOptions,
  decodeVisitDetail,
  decodeVisitList,
} from './response';
import type {
  AssignVisitInput,
  BulkAssignInput,
  BulkAssignmentResult,
  CandidateResult,
  CaregiverOption,
  PageResult,
  ReassignVisitInput,
  VisitDetailData,
  VisitListResult,
  VisitStatusFilter,
  AssignmentHealthFilter,
} from './contracts';

export interface VisitListQuery {
  status?: VisitStatusFilter;
  assignmentHealth?: AssignmentHealthFilter;
  from?: string;
  to?: string;
  cursor?: string;
}

function visitQueryString(query: VisitListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.assignmentHealth) params.set('assignmentHealth', query.assignmentHealth);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.cursor) params.set('cursor', query.cursor);
  return params.size ? `?${params}` : '';
}

export function listVisits(
  query: VisitListQuery = {},
  signal?: AbortSignal,
): Promise<VisitListResult> {
  return apiRequest(`/agency/visits${visitQueryString(query)}`, { signal }).then(decodeVisitList);
}

export function listCaregiverOptions(signal?: AbortSignal): Promise<PageResult<CaregiverOption>> {
  return apiRequest('/agency/caregivers', { signal }).then(decodeCaregiverOptions);
}

export function getVisit(visitId: string): Promise<VisitDetailData> {
  return apiRequest(`/agency/visits/${encodeURIComponent(visitId)}`).then(decodeVisitDetail);
}

export function loadVisitCandidates(visitId: string): Promise<CandidateResult> {
  return apiRequest(`/agency/visits/${encodeURIComponent(visitId)}/candidates`, {
    method: 'POST',
    body: JSON.stringify({}),
  }).then(decodeCandidates);
}

export function assignVisit(
  visitId: string,
  input: AssignVisitInput,
  idempotencyKey: string,
): Promise<unknown> {
  return apiRequest(`/agency/visits/${encodeURIComponent(visitId)}/assign`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      caregiverId: input.caregiverId,
      expectedVisitVersion: input.expectedVisitVersion,
      ...(input.reason ? { reason: input.reason } : {}),
    }),
  });
}

export function reassignVisit(visitId: string, input: ReassignVisitInput): Promise<unknown> {
  return apiRequest(`/agency/visits/${encodeURIComponent(visitId)}/reassign`, {
    method: 'POST',
    body: JSON.stringify({
      caregiverId: input.caregiverId,
      expectedVisitVersion: input.expectedVisitVersion,
      reason: input.reason,
    }),
  });
}

export function bulkAssignVisits(
  input: BulkAssignInput,
  idempotencyKey: string,
): Promise<BulkAssignmentResult> {
  return apiRequest('/agency/visits/bulk-assign', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      assignments: input.assignments,
      ...(input.reason ? { reason: input.reason } : {}),
    }),
  }).then(decodeBulkResult);
}
