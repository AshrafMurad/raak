import { z } from 'zod';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';

const PolicySnapshotSchema = z.strictObject({
  cutoffHours: z.number().int().min(0).max(168),
  allowLateReview: z.boolean(),
  originalStartUtc: z.string().datetime(),
  originalEndUtc: z.string().datetime(),
  timezone: z.string().min(1),
  durationMin: z.number().positive(),
});

/** At/before the cutoff is NORMAL; later is LATE. No client classification. */
export function classifyUrgency(now: Date, start: Date, cutoffHours: number): 'NORMAL' | 'LATE' {
  return now.getTime() > start.getTime() - cutoffHours * 3_600_000 ? 'LATE' : 'NORMAL';
}

/** Persisted snapshots also fail closed if their contract cannot be verified. */
export function parseSnapshot(json: Prisma.JsonValue) {
  const parsed = PolicySnapshotSchema.safeParse(json);
  if (!parsed.success)
    throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'The policy snapshot cannot be verified.');
  return parsed.data;
}
