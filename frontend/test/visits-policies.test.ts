import { describe, expect, it } from 'vitest';
import {
  bulkAssignmentsFor,
  canAssignVisit,
  canReassignVisit,
  canSelectForBulk,
  isBulkAssignReady,
  isValidActionReason,
  visitActionFor,
  visitStatusTone,
} from '../features/visits/policies';
import type { VisitSummary } from '../features/visits/contracts';

const visit = (overrides: Partial<VisitSummary> = {}): VisitSummary => ({
  id: 'visit-1',
  status: 'PLANNED',
  assignmentHealth: 'OK',
  scheduledStartUtc: '2026-12-07T06:00:00.000Z',
  scheduledEndUtc: '2026-12-07T07:00:00.000Z',
  timezoneSnapshot: 'Asia/Riyadh',
  version: 1,
  areaId: 'central',
  carePlanId: 'plan-1',
  patient: { id: 'patient-1', displayName: 'Synthetic patient' },
  assignedCaregiver: null,
  ...overrides,
});

describe('visit policies', () => {
  it('maps visit statuses and assignment health to the established tones', () => {
    expect(visitStatusTone('PLANNED')).toBe('planned');
    expect(visitStatusTone('SCHEDULED')).toBe('scheduled');
    expect(visitStatusTone('IN_PROGRESS')).toBe('in_progress');
    expect(visitStatusTone('COMPLETED')).toBe('completed');
    expect(visitStatusTone('CANCELLED')).toBe('cancelled');
    expect(visitStatusTone('MISSED')).toBe('cancelled');
    expect(visitStatusTone('OK')).toBe('planned');
    expect(visitStatusTone('NEEDS_REASSIGNMENT')).toBe('cancelled');
  });

  it('gates single-visit actions by visit status only, never by parent-plan data', () => {
    expect(canAssignVisit(visit())).toBe(true);
    expect(canAssignVisit(visit({ status: 'SCHEDULED' }))).toBe(false);
    expect(canReassignVisit(visit({ status: 'SCHEDULED' }))).toBe(true);
    expect(canReassignVisit(visit())).toBe(false);
    expect(visitActionFor(visit())).toBe('assign');
    expect(visitActionFor(visit({ status: 'SCHEDULED' }))).toBe('reassign');
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED'] as const)
      expect(visitActionFor(visit({ status }))).toBeNull();
    // Parent-plan eligibility is server-owned: the projection exposes no
    // eligibility field and the client must not invent one from carePlanId.
    expect(canAssignVisit(visit({ carePlanId: 'some-plan-id' }))).toBe(true);
    expect(canAssignVisit(visit({ carePlanId: null }))).toBe(true);
  });

  it('permits bulk selection only for PLANNED visits and preserves list order', () => {
    const visits = [
      visit({ id: 'visit-a', version: 3 }),
      visit({ id: 'visit-b', status: 'SCHEDULED' }),
      visit({ id: 'visit-c' }),
    ];
    expect(canSelectForBulk(visits[0]!)).toBe(true);
    expect(canSelectForBulk(visits[1]!)).toBe(false);
    expect(canSelectForBulk(visits[2]!)).toBe(true);
    // Eligibility is enforced at selection time (disabled checkbox); the
    // payload carries exactly the selected visits in list order with their
    // rendered versions for the server's concurrency check.
    const selected = new Set(['visit-c', 'visit-a']);
    expect(bulkAssignmentsFor(visits, selected, 'caregiver-1')).toEqual([
      { visitId: 'visit-a', caregiverId: 'caregiver-1', expectedVisitVersion: 3 },
      { visitId: 'visit-c', caregiverId: 'caregiver-1', expectedVisitVersion: 1 },
    ]);
    expect(bulkAssignmentsFor(visits, new Set(), 'caregiver-1')).toEqual([]);
  });

  it('enforces the 5-300 character reason boundary with an optional bulk reason', () => {
    expect(isValidActionReason('', false)).toBe(true);
    expect(isValidActionReason('   ', false)).toBe(true);
    expect(isValidActionReason('oops', false)).toBe(false);
    expect(isValidActionReason('valid reason', false)).toBe(true);
    expect(isValidActionReason('', true)).toBe(false);
    expect(isValidActionReason('   ', true)).toBe(false);
    expect(isValidActionReason('valid reason', true)).toBe(true);
    expect(isValidActionReason('  padded valid reason  ', true)).toBe(true);
    expect(isValidActionReason('x'.repeat(300), true)).toBe(true);
    expect(isValidActionReason('x'.repeat(301), true)).toBe(false);
  });

  it('enables bulk submission only with a selection, caregiver and valid reason', () => {
    expect(
      isBulkAssignReady({
        selectedCount: 2,
        caregiverId: 'caregiver-1',
        reason: '',
        pending: false,
      }),
    ).toBe(true);
    expect(
      isBulkAssignReady({
        selectedCount: 2,
        caregiverId: 'caregiver-1',
        reason: 'valid reason',
        pending: false,
      }),
    ).toBe(true);
    expect(
      isBulkAssignReady({
        selectedCount: 0,
        caregiverId: 'caregiver-1',
        reason: '',
        pending: false,
      }),
    ).toBe(false);
    expect(
      isBulkAssignReady({ selectedCount: 2, caregiverId: '', reason: '', pending: false }),
    ).toBe(false);
    expect(
      isBulkAssignReady({
        selectedCount: 2,
        caregiverId: 'caregiver-1',
        reason: 'ok',
        pending: false,
      }),
    ).toBe(false);
    expect(
      isBulkAssignReady({
        selectedCount: 2,
        caregiverId: 'caregiver-1',
        reason: '',
        pending: true,
      }),
    ).toBe(false);
  });
});
