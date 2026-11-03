import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateCarePlan,
  approveCarePlan,
  cancelCarePlan,
  completeCarePlan,
  createCarePlan,
  editCarePlanDraft,
  getCarePlan,
  listCarePlans,
  pauseCarePlan,
  previewCarePlanGeneration,
  resumeCarePlan,
  reviseCarePlan,
} from '../features/care-plans/api';
import type { PlanContent } from '../features/care-plans/contracts';
import { planDetail, planPreview, planVersion } from './scheduling-fixtures';

const content: PlanContent = {
  primaryCaregiverId: null,
  validFrom: '2026-01-01',
  validUntil: '2026-01-30',
  weekdays: [1],
  localStartTime: '09:00',
  durationMin: 60,
  goalText: null,
  taskTemplates: [],
  clinicalInstructionsRestricted: null,
  dstResolution: 'REJECT',
};
const fetchMock = vi.fn<typeof fetch>();
function callAt(index: number) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`Expected fetch call ${index}`);
  return call;
}
function respond<T>(data: T) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data }), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('care-plan API adapter', () => {
  it('rejects incomplete or malformed response projections', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ id: 'plan-id', secret: 'synthetic-private-content' });
    await expect(getCarePlan('plan-id')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    respond({ ...planDetail, status: 'UNKNOWN' });
    await expect(getCarePlan('plan-id')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('lists and gets care plans at the exact routes', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ items: [], nextCursor: null });
    await listCarePlans({ status: 'ACTIVE', cursor: 'cursor-id' });
    expect(callAt(0)[0]).toBe('/v1/agency/care-plans?status=ACTIVE&cursor=cursor-id');
    expect(callAt(0)[1]?.method).toBeUndefined();
    respond(planDetail);
    await getCarePlan('plan-id');
    expect(callAt(1)[0]).toBe('/v1/agency/care-plans/plan-id');
  });

  it('creates, edits and revises with the established request shapes', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ id: 'plan-id' });
    await createCarePlan('patient-id', {
      agencyServiceId: 'service-id',
      serviceRequestId: null,
      ...content,
    });
    expect(callAt(0)[0]).toBe('/v1/agency/patients/patient-id/care-plans');
    expect(callAt(0)[1]?.method).toBe('POST');
    expect(JSON.parse(String(callAt(0)[1]?.body))).toMatchObject({
      agencyServiceId: 'service-id',
      ...content,
    });
    respond(planVersion);
    await editCarePlanDraft('plan-id', { expectedDraftVersion: 2, ...content });
    expect(callAt(1)[0]).toBe('/v1/agency/care-plans/plan-id/draft');
    expect(callAt(1)[1]?.method).toBe('PATCH');
    respond(planVersion);
    await reviseCarePlan('plan-id', content);
    expect(callAt(2)[0]).toBe('/v1/agency/care-plans/plan-id/revise');
    expect(callAt(2)[1]?.method).toBe('POST');
  });

  it('approves, previews and activates with exact version and idempotency semantics', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({});
    await approveCarePlan('plan-id', 3);
    expect(callAt(0)[0]).toBe('/v1/agency/care-plans/plan-id/approve-clinical');
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({ version: 3 });
    respond(planPreview);
    await previewCarePlanGeneration('plan-id', 3);
    expect(callAt(1)[0]).toBe('/v1/agency/care-plans/plan-id/generation-preview?version=3');
    respond({});
    await activateCarePlan('plan-id', 3, 'idempotency-key');
    expect(callAt(2)[0]).toBe('/v1/agency/care-plans/plan-id/activate');
    expect(new Headers(callAt(2)[1]?.headers).get('Idempotency-Key')).toBe('idempotency-key');
    expect(JSON.parse(String(callAt(2)[1]?.body))).toEqual({ version: 3 });
  });

  it('sends lifecycle commands with the contract-defined methods and bodies', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({});
    await pauseCarePlan('plan-id', { reason: 'Schedule updated', plannedVisitsAction: 'CANCEL' });
    respond({});
    await resumeCarePlan('plan-id');
    respond({});
    await completeCarePlan('plan-id', { reason: 'Plan ended' });
    respond({});
    await cancelCarePlan('plan-id', { reason: 'Customer request', plannedVisitsAction: 'KEEP' });
    expect(
      Array.from({ length: fetchMock.mock.calls.length }, (_, index) => {
        const [url, init] = callAt(index);
        return [url, init?.method];
      }),
    ).toEqual([
      ['/v1/agency/care-plans/plan-id/pause', 'POST'],
      ['/v1/agency/care-plans/plan-id/resume', 'POST'],
      ['/v1/agency/care-plans/plan-id/complete', 'POST'],
      ['/v1/agency/care-plans/plan-id/cancel', 'POST'],
    ]);
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({
      reason: 'Schedule updated',
      plannedVisitsAction: 'CANCEL',
    });
    expect(JSON.parse(String(callAt(1)[1]?.body))).toEqual({});
    expect(JSON.parse(String(callAt(2)[1]?.body))).toEqual({ reason: 'Plan ended' });
  });
});
