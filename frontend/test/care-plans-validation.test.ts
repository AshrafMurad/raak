import { describe, expect, it } from 'vitest';
import { validateLifecycleReason, validatePlanContent } from '../features/care-plans/validation';
import type { PlanContent } from '../features/care-plans/contracts';

const validContent: PlanContent = {
  primaryCaregiverId: null,
  validFrom: '2026-01-01',
  validUntil: '2026-03-01',
  weekdays: [1, 3, 5],
  localStartTime: '09:00',
  durationMin: 60,
  goalText: 'Support daily living',
  taskTemplates: [{ description: 'Prepare breakfast', isRequired: true }],
  clinicalInstructionsRestricted: null,
  dstResolution: 'REJECT',
};

describe('validatePlanContent', () => {
  it('accepts the inclusive 60-day maximum and rejects 61 days', () => {
    expect(
      validatePlanContent({ ...validContent, validFrom: '2026-01-01', validUntil: '2026-03-01' }),
    ).toEqual([]);
    expect(
      validatePlanContent({ ...validContent, validFrom: '2026-01-01', validUntil: '2026-03-02' }),
    ).toContain('PLAN_DURATION_EXCEEDED');
  });

  it('rejects reversed or invalid dates', () => {
    expect(
      validatePlanContent({ ...validContent, validFrom: '2026-02-01', validUntil: '2026-01-31' }),
    ).toContain('DATE_ORDER_INVALID');
    expect(validatePlanContent({ ...validContent, validFrom: '2026-02-30' })).toContain(
      'DATE_INVALID',
    );
  });

  it('requires unique weekdays in the 0-6 range', () => {
    expect(validatePlanContent({ ...validContent, weekdays: [1, 1] })).toContain(
      'WEEKDAYS_INVALID',
    );
    expect(validatePlanContent({ ...validContent, weekdays: [7] })).toContain('WEEKDAYS_INVALID');
    expect(validatePlanContent({ ...validContent, weekdays: [] })).toContain('WEEKDAYS_INVALID');
    expect(validatePlanContent({ ...validContent, weekdays: [0, 6] })).not.toContain(
      'WEEKDAYS_INVALID',
    );
  });

  it('bounds duration, goal, instructions and task templates', () => {
    expect(validatePlanContent({ ...validContent, durationMin: 15 })).not.toContain(
      'DURATION_INVALID',
    );
    expect(validatePlanContent({ ...validContent, durationMin: 720 })).not.toContain(
      'DURATION_INVALID',
    );
    expect(validatePlanContent({ ...validContent, durationMin: 14 })).toContain('DURATION_INVALID');
    expect(validatePlanContent({ ...validContent, durationMin: 721 })).toContain(
      'DURATION_INVALID',
    );
    expect(validatePlanContent({ ...validContent, goalText: 'g'.repeat(500) })).not.toContain(
      'GOAL_INVALID',
    );
    expect(validatePlanContent({ ...validContent, goalText: ' '.repeat(501) })).toContain(
      'GOAL_INVALID',
    );
    expect(
      validatePlanContent({ ...validContent, clinicalInstructionsRestricted: 'i'.repeat(3000) }),
    ).not.toContain('INSTRUCTIONS_INVALID');
    expect(
      validatePlanContent({ ...validContent, clinicalInstructionsRestricted: 'x'.repeat(3001) }),
    ).toContain('INSTRUCTIONS_INVALID');
    expect(
      validatePlanContent({
        ...validContent,
        taskTemplates: [{ description: 't'.repeat(300), isRequired: false }],
      }),
    ).not.toContain('TASK_INVALID');
    expect(
      validatePlanContent({
        ...validContent,
        taskTemplates: [{ description: '  ', isRequired: false }],
      }),
    ).toContain('TASK_INVALID');
    expect(
      validatePlanContent({
        ...validContent,
        taskTemplates: Array.from({ length: 30 }, () => ({
          description: 'Task',
          isRequired: false,
        })),
      }),
    ).not.toContain('TASK_LIMIT_EXCEEDED');
    expect(
      validatePlanContent({
        ...validContent,
        taskTemplates: [{ description: ' '.repeat(301), isRequired: false }],
      }),
    ).toContain('TASK_INVALID');
    expect(
      validatePlanContent({
        ...validContent,
        taskTemplates: Array.from({ length: 31 }, () => ({
          description: 'Task',
          isRequired: false,
        })),
      }),
    ).toContain('TASK_LIMIT_EXCEEDED');
  });
});

describe('validateLifecycleReason', () => {
  it('requires a 5-300 character reason for cancellation and pause-with-cancel', () => {
    expect(validateLifecycleReason('cancel', '')).toBe('REASON_REQUIRED');
    expect(validateLifecycleReason('cancel', 'four')).toBe('REASON_INVALID');
    expect(validateLifecycleReason('cancel', 'short')).toBeNull();
    expect(validateLifecycleReason('cancel', 'r'.repeat(300))).toBeNull();
    expect(validateLifecycleReason('cancel', 'x'.repeat(301))).toBe('REASON_INVALID');
    expect(validateLifecycleReason('pause', '', 'CANCEL')).toBe('REASON_REQUIRED');
    expect(validateLifecycleReason('pause', 'four', 'CANCEL')).toBe('REASON_INVALID');
    expect(validateLifecycleReason('pause', '', 'KEEP')).toBeNull();
    expect(validateLifecycleReason('complete', '')).toBeNull();
    expect(validateLifecycleReason('resume', '')).toBeNull();
  });
});
