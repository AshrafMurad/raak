import { afterEach, expect, it, vi } from 'vitest';
import {
  getAuditPage,
  getCaregiversReport,
  getRequestsReport,
  getVisitsReport,
  getReportServiceOptions,
} from '../features/reporting/api';

afterEach(() => vi.unstubAllGlobals());

it('pages service filter options and localizes labels without hiding later pages', async () => {
  const fetcher = stub({
    items: [{ id: 'service', slug: 'care', config: { nameAr: 'رعاية', nameEn: 'Care' } }],
    nextCursor: 'next',
  });
  const page = await getReportServiceOptions('ar', undefined, 'cursor');
  expect(fetcher.mock.calls[0]![0]).toBe('/v1/agency/services?limit=100&cursor=cursor');
  expect(page).toEqual({ items: [{ serviceId: 'service', label: 'رعاية' }], nextCursor: 'next' });
});

function stub(data: unknown) {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('encodes report filters and decodes reconciled aggregate fields only', async () => {
  const fetcher = stub({
    timezone: 'Asia/Riyadh',
    total: 4,
    byStatus: {
      SUBMITTED: 1,
      UNDER_REVIEW: 1,
      AWAITING_CUSTOMER: 0,
      APPROVED: 1,
      REJECTED: 1,
      WITHDRAWN: 0,
      EXTRA_LEAK: 9,
    },
    byService: [
      { serviceId: 's1', slug: 'home-care', nameAr: 'رعاية', nameEn: 'Home care', count: 4 },
    ],
    byServiceTruncated: false,
  });
  const report = await getRequestsReport({
    from: '2026-11-01',
    to: '2026-11-07',
    serviceId: 's1',
    requestStatus: 'SUBMITTED',
    visitStatus: '',
  });
  expect(fetcher.mock.calls[0]![0]).toBe(
    '/v1/agency/reports/requests?from=2026-11-01&to=2026-11-07&serviceId=s1&status=SUBMITTED',
  );
  expect(report.total).toBe(4);
  expect(report.byService[0]!.count).toBe(4);
  expect(Object.keys(report.byStatus)).not.toContain('EXTRA_LEAK');
});

it('decodes visit timeliness and caregiver load rows', async () => {
  stub({
    timezone: 'Asia/Riyadh',
    total: 6,
    byStatus: { PLANNED: 1, SCHEDULED: 1, IN_PROGRESS: 0, COMPLETED: 2, CANCELLED: 1, MISSED: 1 },
    unassigned: 1,
    timeliness: { started: 2, onTime: 1, late: 1, notStarted: 4 },
  });
  const visits = await getVisitsReport({
    from: '',
    to: '',
    serviceId: '',
    requestStatus: '',
    visitStatus: 'COMPLETED',
  });
  expect(visits.timeliness).toEqual({ started: 2, onTime: 1, late: 1, notStarted: 4 });

  stub({
    timezone: 'Asia/Riyadh',
    items: [
      {
        caregiverId: 'c1',
        name: 'Caregiver One',
        operationalStatus: 'ACTIVE',
        scheduledMinutes: 120,
        byStatus: {
          PLANNED: 0,
          SCHEDULED: 1,
          IN_PROGRESS: 0,
          COMPLETED: 1,
          CANCELLED: 1,
          MISSED: 0,
        },
      },
    ],
    truncated: false,
  });
  const caregivers = await getCaregiversReport({
    from: '',
    to: '',
    serviceId: '',
    requestStatus: '',
    visitStatus: '',
  });
  expect(caregivers.items[0]).not.toHaveProperty('operationalStatus');
  expect(caregivers.items[0]!.scheduledMinutes).toBe(120);
});

it('decodes safe audit entries and rejects metadata leakage', async () => {
  stub({
    timezone: 'Asia/Riyadh',
    items: [
      {
        id: 'a1',
        at: '2026-11-04T10:00:00Z',
        actorType: 'AGENCY_STAFF',
        actorId: 'u1',
        action: 'visit.assigned',
        subjectType: 'visit',
        subjectId: 'v1',
        reason: 'Synthetic reason',
        metadataJson: { internalSecret: 'strip' },
      },
    ],
    nextCursor: null,
  });
  const page = await getAuditPage(null);
  expect(page.items[0]).not.toHaveProperty('metadataJson');
  expect(page.items[0]!.action).toBe('visit.assigned');

  stub({
    items: [
      {
        id: 'a1',
        at: 'x',
        actorType: 'ROOT',
        actorId: null,
        action: 'a',
        subjectType: 's',
        subjectId: null,
        reason: null,
      },
    ],
  });
  await expect(getAuditPage(null)).rejects.toThrow();
});
