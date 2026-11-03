import { apiRequest } from '../../lib/api-client';
import {
  decodeCreatedPlan,
  decodeOptionPage,
  decodeServiceOptions,
  decodePlanDetail,
  decodePlanList,
  decodePlanPreview,
  decodePlanVersion,
} from './response';
import type {
  CarePlanCreateInput,
  CarePlanDetail,
  CarePlanDraftEditInput,
  CarePlanStatusFilter,
  CarePlanSummary,
  CarePlanVersion,
  GenerationPreview,
  PageResult,
  PlannedVisitsAction,
  PlanContent,
  OptionRecord,
} from './contracts';

export interface CarePlanListQuery {
  status?: CarePlanStatusFilter;
  patientId?: string;
  cursor?: string;
}

export interface CarePlanEditorOptions {
  patients: PageResult<OptionRecord>;
  services: PageResult<
    OptionRecord & { config: { nameAr: string; nameEn: string; allowRecurring?: boolean } }
  >;
  caregivers: PageResult<OptionRecord>;
}

export async function loadCarePlanEditorOptions(
  signal?: AbortSignal,
): Promise<CarePlanEditorOptions> {
  const [patients, services, caregivers] = await Promise.all([
    apiRequest('/agency/patients', { signal }).then(decodeOptionPage),
    apiRequest('/agency/services', { signal }).then(decodeServiceOptions),
    apiRequest('/agency/caregivers', { signal }).then(decodeOptionPage),
  ]);
  return { patients, services, caregivers };
}

function queryString(query: CarePlanListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.patientId) params.set('patientId', query.patientId);
  if (query.cursor) params.set('cursor', query.cursor);
  return params.size ? `?${params}` : '';
}

export function listCarePlans(
  query: CarePlanListQuery = {},
  signal?: AbortSignal,
): Promise<PageResult<CarePlanSummary>> {
  return apiRequest(`/agency/care-plans${queryString(query)}`, { signal }).then(decodePlanList);
}

export function getCarePlan(planId: string): Promise<CarePlanDetail> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}`).then(decodePlanDetail);
}

export function createCarePlan(
  patientId: string,
  input: CarePlanCreateInput,
): Promise<{ id: string }> {
  return apiRequest(`/agency/patients/${encodeURIComponent(patientId)}/care-plans`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then(decodeCreatedPlan);
}

export function editCarePlanDraft(
  planId: string,
  input: CarePlanDraftEditInput,
): Promise<CarePlanVersion> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/draft`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then(decodePlanVersion);
}

export function reviseCarePlan(planId: string, content: PlanContent): Promise<CarePlanVersion> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/revise`, {
    method: 'POST',
    body: JSON.stringify(content),
  }).then(decodePlanVersion);
}

export function approveCarePlan(planId: string, version: number): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/approve-clinical`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export function previewCarePlanGeneration(
  planId: string,
  version: number,
): Promise<GenerationPreview> {
  return apiRequest(
    `/agency/care-plans/${encodeURIComponent(planId)}/generation-preview?version=${version}`,
  ).then(decodePlanPreview);
}

export function activateCarePlan(
  planId: string,
  version: number,
  idempotencyKey: string,
): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/activate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ version }),
  });
}

export function pauseCarePlan(
  planId: string,
  input: { reason?: string; plannedVisitsAction: PlannedVisitsAction },
): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/pause`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resumeCarePlan(planId: string): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function completeCarePlan(
  planId: string,
  input: { reason?: string } = {},
): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function cancelCarePlan(
  planId: string,
  input: { reason: string; plannedVisitsAction: PlannedVisitsAction },
): Promise<unknown> {
  return apiRequest(`/agency/care-plans/${encodeURIComponent(planId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
