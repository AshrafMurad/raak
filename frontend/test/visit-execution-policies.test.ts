import { expect, it } from 'vitest';
import { decodeCaregiverVisitDetail } from '../features/caregiver-visits/contracts';
import {
  allRequiredTasksClassified,
  localToday,
  shiftDate,
} from '../features/caregiver-visits/policies';
import { canRequestChange, validChangeInput } from '../features/customer-visits/policies';
import { validSettings } from '../features/settings/api';

const payload = {
  id: 'synthetic-visit',
  status: 'IN_PROGRESS',
  scheduledStartUtc: '2026-12-01T06:00:00Z',
  scheduledEndUtc: '2026-12-01T07:00:00Z',
  timezoneSnapshot: 'Asia/Riyadh',
  version: 1,
  patient: { id: 'synthetic-patient', displayName: 'Synthetic patient' },
  serviceNameSnapshot: { nameAr: 'خدمة اصطناعية', nameEn: 'Synthetic service' },
  actualStartAt: '2026-12-01T06:01:00Z',
  actualEndAt: null,
  areaId: 'central',
  reviewStatus: 'NOT_REQUIRED',
  tasks: [
    {
      id: 'one',
      order: 1,
      descriptionSnapshot: 'Synthetic task',
      isRequired: true,
      outcome: 'PENDING',
      notDoneReason: null,
    },
  ],
  note: null,
};
it('does not enable completion for an unclassified required task, while optional pending is allowed', () => {
  const visit = decodeCaregiverVisitDetail(payload);
  expect(allRequiredTasksClassified(visit)).toBe(false);
  expect(
    allRequiredTasksClassified({
      ...visit,
      tasks: [
        { ...visit.tasks[0]!, outcome: 'DONE' },
        { ...visit.tasks[0]!, id: 'optional', isRequired: false },
      ],
    }),
  ).toBe(true);
});
it('fails closed on malformed task or visit projections', () => {
  expect(() => decodeCaregiverVisitDetail({ ...payload, tasks: [{ outcome: 'DONE' }] })).toThrow();
  expect(() => decodeCaregiverVisitDetail({ ...payload, status: 'UNKNOWN' })).toThrow();
});
it('uses the agency calendar date across the UTC date boundary and month-end', () => {
  expect(localToday('Asia/Riyadh', new Date('2026-11-30T22:00:00Z'))).toBe('2026-12-01');
  expect(shiftDate('2026-12-01', -1)).toBe('2026-11-30');
});
it('blocks a second request or changes on started/completed visits', () => {
  const visit = {
    ...decodeCaregiverVisitDetail(payload),
    status: 'SCHEDULED' as const,
    pendingChange: null,
    changeRequests: [],
  };
  expect(canRequestChange(visit, new Date('2026-11-30T00:00:00Z'))).toBe(true);
  expect(
    canRequestChange({ ...visit, status: 'IN_PROGRESS' }, new Date('2026-11-30T00:00:00Z')),
  ).toBe(false);
  expect(
    validChangeInput({
      type: 'RESCHEDULE',
      reason: 'Synthetic explanation',
      proposedDate: '2026-12-02',
      proposedTime: '25:00',
    }),
  ).toBe(false);
});
it('accepts initial settings revision zero and rejects out-of-range policy changes', () => {
  const policy = {
    expectedVersion: 0,
    travelBufferMin: 30,
    changeCancelCutoffHours: 24,
    changeRescheduleCutoffHours: 24,
    allowLateReview: true,
  };
  expect(validSettings(policy)).toBe(true);
  expect(validSettings({ ...policy, travelBufferMin: 121 })).toBe(false);
});
