import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignVisit,
  bulkAssignVisits,
  getVisit,
  listCaregiverOptions,
  listVisits,
  loadVisitCandidates,
  reassignVisit,
} from '../features/visits/api';
import { visitDetail } from './scheduling-fixtures';

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

describe('visit API adapter', () => {
  it('rejects malformed visit and inconsistent bulk projections', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ id: 'visit-id', status: 'PLANNED' });
    await expect(getVisit('visit-id')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    respond({ results: [], summary: { succeeded: 1, failed: 0 } });
    await expect(bulkAssignVisits({ assignments: [] }, 'key')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('lists visits, caregiver options and visit detail at the exact routes', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ items: [], nextCursor: null, timezone: 'Asia/Riyadh', bufferMinutes: 30 });
    await listVisits({
      status: 'PLANNED',
      assignmentHealth: 'NEEDS_REASSIGNMENT',
      from: '2026-12-01',
      to: '2026-12-31',
      cursor: 'cursor-id',
    });
    expect(callAt(0)[0]).toBe(
      '/v1/agency/visits?status=PLANNED&assignmentHealth=NEEDS_REASSIGNMENT&from=2026-12-01&to=2026-12-31&cursor=cursor-id',
    );
    expect(callAt(0)[1]?.method).toBeUndefined();
    respond({ items: [], nextCursor: null });
    await listCaregiverOptions();
    expect(callAt(1)[0]).toBe('/v1/agency/caregivers');
    respond(visitDetail);
    await getVisit('visit-id');
    expect(callAt(2)[0]).toBe('/v1/agency/visits/visit-id');
  });

  it('loads candidates with an empty POST body and no idempotency header', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({
      visitId: 'visit-id',
      visitStatus: 'PLANNED',
      visitLocalDate: '2026-12-01',
      bufferMinutes: 30,
      advisory: true,
      items: [],
      excluded: [],
    });
    await loadVisitCandidates('visit-id');
    expect(callAt(0)[0]).toBe('/v1/agency/visits/visit-id/candidates');
    expect(callAt(0)[1]?.method).toBe('POST');
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({});
    expect(new Headers(callAt(0)[1]?.headers).get('Idempotency-Key')).toBeNull();
  });

  it('assigns with an idempotency key and omits an empty reason', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ id: 'visit-id' });
    await assignVisit(
      'visit-id',
      { caregiverId: 'caregiver-1', expectedVisitVersion: 2 },
      'idempotency-key',
    );
    expect(callAt(0)[0]).toBe('/v1/agency/visits/visit-id/assign');
    expect(callAt(0)[1]?.method).toBe('POST');
    expect(new Headers(callAt(0)[1]?.headers).get('Idempotency-Key')).toBe('idempotency-key');
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({
      caregiverId: 'caregiver-1',
      expectedVisitVersion: 2,
    });
    respond({});
    await assignVisit(
      'visit-id',
      { caregiverId: 'caregiver-1', expectedVisitVersion: 2, reason: 'Primary preference' },
      'idempotency-key-2',
    );
    expect(JSON.parse(String(callAt(1)[1]?.body))).toEqual({
      caregiverId: 'caregiver-1',
      expectedVisitVersion: 2,
      reason: 'Primary preference',
    });
  });

  it('reassigns with the required reason and no idempotency header', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({ id: 'visit-id' });
    await reassignVisit('visit-id', {
      caregiverId: 'caregiver-2',
      expectedVisitVersion: 3,
      reason: 'Reassignment after approved leave',
    });
    expect(callAt(0)[0]).toBe('/v1/agency/visits/visit-id/reassign');
    expect(callAt(0)[1]?.method).toBe('POST');
    expect(new Headers(callAt(0)[1]?.headers).get('Idempotency-Key')).toBeNull();
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({
      caregiverId: 'caregiver-2',
      expectedVisitVersion: 3,
      reason: 'Reassignment after approved leave',
    });
  });

  it('bulk-assigns in payload order with an idempotency key and optional reason', async () => {
    vi.stubGlobal('fetch', fetchMock);
    respond({
      results: [],
      summary: { succeeded: 0, failed: 0 },
    });
    await bulkAssignVisits(
      {
        assignments: [
          { visitId: 'visit-a', caregiverId: 'caregiver-1', expectedVisitVersion: 1 },
          { visitId: 'visit-b', caregiverId: 'caregiver-1', expectedVisitVersion: 4 },
        ],
        reason: 'Weekly scheduling batch',
      },
      'idempotency-key',
    );
    expect(callAt(0)[0]).toBe('/v1/agency/visits/bulk-assign');
    expect(callAt(0)[1]?.method).toBe('POST');
    expect(new Headers(callAt(0)[1]?.headers).get('Idempotency-Key')).toBe('idempotency-key');
    expect(JSON.parse(String(callAt(0)[1]?.body))).toEqual({
      assignments: [
        { visitId: 'visit-a', caregiverId: 'caregiver-1', expectedVisitVersion: 1 },
        { visitId: 'visit-b', caregiverId: 'caregiver-1', expectedVisitVersion: 4 },
      ],
      reason: 'Weekly scheduling batch',
    });
    respond({ results: [], summary: { succeeded: 0, failed: 0 } });
    await bulkAssignVisits(
      {
        assignments: [{ visitId: 'visit-a', caregiverId: 'caregiver-1', expectedVisitVersion: 1 }],
        reason: '',
      },
      'idempotency-key-2',
    );
    expect(JSON.parse(String(callAt(1)[1]?.body))).toEqual({
      assignments: [{ visitId: 'visit-a', caregiverId: 'caregiver-1', expectedVisitVersion: 1 }],
    });
  });
});
