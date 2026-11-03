import { describe, expect, it } from 'vitest';
import {
  canActivatePlanVersion,
  isClinicalApprovalApplicable,
  canReviseCarePlan,
  resolveSelectedPlanVersion,
  lifecycleActions,
  canSubmitPlanContent,
} from '../features/care-plans/policies';
import { planContentFromVersion } from '../features/care-plans/mappers';
import type {
  CarePlanDetail,
  CarePlanVersion,
  PlanContent,
} from '../features/care-plans/contracts';

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
const version = (v: number, status: CarePlanVersion['status']): CarePlanVersion => ({
  id: `version-${v}`,
  version: v,
  status,
  ...content,
  weekdaysJson: content.weekdays,
  taskTemplatesJson: content.taskTemplates,
  timezoneSnapshot: 'Asia/Riyadh',
  approvedByStaffId: null,
  approvedAt: null,
  activatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const plan = (
  status: CarePlanDetail['status'],
  versions: CarePlanVersion[],
  clinical = false,
): CarePlanDetail => ({
  id: 'plan-1',
  status,
  currentVersion: versions.at(-1)?.version ?? 1,
  primaryCaregiverId: null,
  startedAt: null,
  closedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  patient: { id: 'patient-1', displayName: 'Synthetic Patient', areaId: 'area-1' },
  serviceId: 'service-1',
  serviceNameAr: 'خدمة',
  serviceNameEn: 'Service',
  clinicalClass: clinical ? 'CLINICAL' : 'NON_CLINICAL',
  requiredQualificationCodes: [],
  plannedVisits: 0,
  scheduledVisits: 0,
  versions,
});

describe('care-plan policies', () => {
  it('resolves a selected version, then current version, then latest available', () => {
    const versions = [version(1, 'ACTIVATED'), version(2, 'DRAFT')];
    expect(resolveSelectedPlanVersion(versions, 1)?.version).toBe(1);
    expect(resolveSelectedPlanVersion(versions, 9, 2)?.version).toBe(2);
    expect(resolveSelectedPlanVersion([versions[0]!], 9, 9)?.version).toBe(1);
    expect(resolveSelectedPlanVersion([], 1)).toBeNull();
  });

  it('falls back to the newest version when history arrives newest-first', () => {
    const newestFirst = [version(2, 'DRAFT'), version(1, 'ACTIVATED')];
    expect(resolveSelectedPlanVersion(newestFirst, 9, 9)?.version).toBe(2);
  });

  it('allows revision only when no draft is open and the plan is not closed or draft', () => {
    expect(canReviseCarePlan(plan('ACTIVE', [version(1, 'ACTIVATED')]))).toBe(true);
    expect(canReviseCarePlan(plan('PAUSED', [version(1, 'ACTIVATED')]))).toBe(true);
    for (const status of ['DRAFT', 'COMPLETED', 'CANCELLED'] as const)
      expect(canReviseCarePlan(plan(status, [version(1, 'ACTIVATED')]))).toBe(false);
    expect(canReviseCarePlan(plan('ACTIVE', [version(1, 'ACTIVATED'), version(2, 'DRAFT')]))).toBe(
      false,
    );
  });

  it('requires current exact draft approval and current-version preview for activation', () => {
    const draft = version(2, 'DRAFT');
    expect(isClinicalApprovalApplicable(plan('DRAFT', [draft], true), draft)).toBe(true);
    expect(isClinicalApprovalApplicable(plan('DRAFT', [draft]), draft)).toBe(false);
    expect(
      isClinicalApprovalApplicable(
        plan('DRAFT', [version(1, 'DRAFT'), draft], true),
        version(1, 'DRAFT'),
      ),
    ).toBe(false);
    expect(canActivatePlanVersion(plan('DRAFT', [draft]), draft, true)).toBe(true);
    expect(canActivatePlanVersion(plan('DRAFT', [draft], true), draft, true)).toBe(false);
    expect(
      canActivatePlanVersion(
        plan('DRAFT', [version(2, 'APPROVED')], true),
        version(2, 'APPROVED'),
        true,
      ),
    ).toBe(true);
    expect(isClinicalApprovalApplicable(plan('ACTIVE', [draft], true), draft)).toBe(true);
    expect(canActivatePlanVersion(plan('DRAFT', [draft]), draft, false)).toBe(false);
    expect(canActivatePlanVersion(plan('CANCELLED', [draft]), draft, true)).toBe(false);
  });

  it('exposes lifecycle actions from state only, without treating a role as authority', () => {
    expect(lifecycleActions('ACTIVE')).toEqual(['pause', 'complete', 'cancel']);
    expect(lifecycleActions('PAUSED')).toEqual(['resume', 'complete', 'cancel']);
    expect(lifecycleActions('DRAFT')).toEqual(['cancel']);
    expect(lifecycleActions('COMPLETED')).toEqual([]);
    expect(lifecycleActions('CANCELLED')).toEqual([]);
  });

  it('permits submit only for locally valid content and no pending request', () => {
    expect(canSubmitPlanContent(content, false)).toBe(true);
    expect(canSubmitPlanContent({ ...content, weekdays: [] }, false)).toBe(false);
    expect(canSubmitPlanContent(content, true)).toBe(false);
  });

  it('maps version snapshots into editable form content without losing the caregiver selection', () => {
    const draft = version(2, 'DRAFT');
    expect(planContentFromVersion(draft, 'caregiver-id')).toEqual({
      ...content,
      primaryCaregiverId: 'caregiver-id',
    });
  });
});
