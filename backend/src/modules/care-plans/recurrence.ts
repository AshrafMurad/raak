/**
 * Recurrence expansion (docs 04 BR-PLAN, docs 08 recurrence/timezones).
 * Expands an inclusive local date range over selected weekdays into concrete
 * UTC instants using the tenant IANA timezone, rejecting DST gaps always and
 * folds per the stored dstResolution (ADR-0012). occurrenceKey is
 * deterministic from planVersionId + local date + ordinal so replays and
 * parallel activations cannot duplicate occurrences (I09).
 */
import { ApiError } from '../../api-error';
import {
  addDays,
  inclusiveDays,
  localDateWeekday,
  localToUtcWithPolicy,
} from '../common/local-time';

export interface RecurrenceSpec {
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  localStartTime: string;
  durationMin: number;
  timezone: string;
  dstResolution: 'REJECT' | 'EARLIEST' | 'LATEST';
}

export interface Occurrence {
  occurrenceKey: string;
  localDate: string;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
}

export function planDurationError(spec: { validFrom: string; validUntil: string }) {
  if (spec.validFrom > spec.validUntil) return 'End date precedes start date.';
  if (inclusiveDays(spec.validFrom, spec.validUntil) > 60)
    return 'Plan span exceeds the 60 consecutive day cap.';
  return null;
}

/** Expand the full inclusive range; rejects on the first DST violation. */
export function expandOccurrences(spec: RecurrenceSpec, planVersionId: string): Occurrence[] {
  const durationError = planDurationError(spec);
  if (durationError) throw new ApiError(422, 'PLAN_DURATION_EXCEEDED', durationError);

  const selected = new Set(spec.weekdays);
  const occurrences: Occurrence[] = [];
  const durationMs = spec.durationMin * 60_000;
  for (let date = spec.validFrom; date <= spec.validUntil; date = addDays(date, 1)) {
    if (!selected.has(localDateWeekday(date))) continue;
    const resolved = localToUtcWithPolicy(
      date,
      spec.localStartTime,
      spec.timezone,
      spec.dstResolution,
    );
    if (resolved.status === 'GAP')
      throw new ApiError(
        422,
        'RECURRENCE_TIME_INVALID',
        `Local time ${date} ${spec.localStartTime} does not exist in ${spec.timezone}.`,
      );
    if (resolved.status === 'AMBIGUOUS')
      throw new ApiError(
        422,
        'RECURRENCE_TIME_INVALID',
        `Local time ${date} ${spec.localStartTime} is ambiguous in ${spec.timezone}; choose an explicit DST resolution.`,
      );
    occurrences.push({
      occurrenceKey: occurrenceKey(planVersionId, date),
      localDate: date,
      scheduledStartUtc: resolved.instant,
      scheduledEndUtc: new Date(resolved.instant.getTime() + durationMs),
    });
  }
  return occurrences;
}

/** Stable, version-scoped key (docs 08): v<version>|<date>|<ordinal>. */
export function occurrenceKey(planVersionId: string, localDate: string, ordinal = 0): string {
  return `v-${planVersionId}|${localDate}|${ordinal}`;
}
