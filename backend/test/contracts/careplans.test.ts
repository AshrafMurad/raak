import { describe, expect, it } from 'vitest';
import { BulkAssignSchema } from '../../src/contracts/careplans';

const item = (visitId: string) => ({
  visitId,
  caregiverId: '11111111-1111-4111-8111-111111111111',
  expectedVisitVersion: 1,
});
const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

describe('bulk assignment contracts', () => {
  it('rejects repeated visitId values before any execution begins', () => {
    const duplicate = {
      assignments: [item(uuid(1)), item(uuid(1))],
      reason: 'Duplicate visit in bulk',
    };
    const parsed = BulkAssignSchema.safeParse(duplicate);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'assignments')).toBe(
        true,
      );
  });

  it('accepts distinct visits in semantic order and preserves the 1-100 bound', () => {
    const valid = {
      assignments: [item(uuid(1)), item(uuid(2)), item(uuid(3))],
      reason: 'Distinct ordered visits',
    };
    const parsed = BulkAssignSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data.assignments.map((a) => a.visitId)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(BulkAssignSchema.safeParse({ assignments: [] }).success).toBe(false);
    const overflow = {
      assignments: Array.from({ length: 101 }, (_, index) => item(uuid(index + 1))),
    };
    expect(BulkAssignSchema.safeParse(overflow).success).toBe(false);
    const boundary = {
      assignments: Array.from({ length: 100 }, (_, index) => item(uuid(index + 1))),
    };
    expect(BulkAssignSchema.safeParse(boundary).success).toBe(true);
  });
});
