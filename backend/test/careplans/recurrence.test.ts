import { describe, expect, it } from 'vitest';
import {
  addDays,
  inclusiveDays,
  localDateWeekday,
  localToUtc,
  localToUtcWithPolicy,
  utcLocalClock,
  utcLocalDate,
} from '../../src/modules/common/local-time';
import { expandOccurrences, occurrenceKey } from '../../src/modules/care-plans/recurrence';
import { ApiError } from '../../src/api-error';

const RIYADH = 'Asia/Riyadh'; // no DST
const NEW_YORK = 'America/New_York'; // DST northern hemisphere

describe('local-time', () => {
  it('round-trips a Riyadh local time to UTC and back', () => {
    const result = localToUtc('2026-11-10', '08:30', RIYADH);
    expect(result.status).toBe('UNIQUE');
    if (result.status === 'UNIQUE') {
      expect(result.instant.toISOString()).toBe('2026-11-10T05:30:00.000Z');
      expect(utcLocalDate(result.instant, RIYADH)).toBe('2026-11-10');
      expect(utcLocalClock(result.instant, RIYADH)).toBe('08:30');
    }
  });

  it('detects the spring-forward gap (U03)', () => {
    // America/New_York 2026-03-08: 02:00 -> 03:00, so 02:30 does not exist.
    expect(localToUtc('2026-03-08', '02:30', NEW_YORK).status).toBe('GAP');
  });

  it('detects the fall-back fold and orders both candidates', () => {
    // America/New_York 2026-11-01: 01:30 happens twice (EDT then EST).
    const result = localToUtc('2026-11-01', '01:30', NEW_YORK);
    expect(result.status).toBe('AMBIGUOUS');
    if (result.status === 'AMBIGUOUS') {
      expect(result.candidates[0].toISOString()).toBe('2026-11-01T05:30:00.000Z'); // EDT -04:00
      expect(result.candidates[1].toISOString()).toBe('2026-11-01T06:30:00.000Z'); // EST -05:00
    }
  });

  it('honours explicit EARLIEST/LATEST fold policy but never resolves gaps', () => {
    expect(localToUtcWithPolicy('2026-11-01', '01:30', NEW_YORK, 'EARLIEST')).toEqual({
      status: 'UNIQUE',
      instant: new Date('2026-11-01T05:30:00.000Z'),
    });
    expect(localToUtcWithPolicy('2026-11-01', '01:30', NEW_YORK, 'LATEST')).toEqual({
      status: 'UNIQUE',
      instant: new Date('2026-11-01T06:30:00.000Z'),
    });
    expect(localToUtcWithPolicy('2026-03-08', '02:30', NEW_YORK, 'EARLIEST').status).toBe('GAP');
    expect(localToUtcWithPolicy('2026-11-01', '01:30', NEW_YORK, 'REJECT').status).toBe(
      'AMBIGUOUS',
    );
  });

  it('computes weekdays, inclusive spans and date arithmetic', () => {
    // 2026-11-02 is a Monday.
    expect(localDateWeekday('2026-11-02')).toBe(1);
    expect(inclusiveDays('2026-11-01', '2026-11-01')).toBe(1);
    expect(inclusiveDays('2026-10-03', '2026-12-01')).toBe(60);
    expect(addDays('2026-10-03', 60)).toBe('2026-12-02');
  });
});

describe('expandOccurrences', () => {
  const base = {
    validFrom: '2026-11-02',
    validUntil: '2026-11-20',
    localStartTime: '09:00',
    durationMin: 90,
    timezone: RIYADH,
    dstResolution: 'REJECT' as const,
  };

  it('U01: Mon/Wed/Fri inclusive range yields exactly those weekdays', () => {
    const occurrences = expandOccurrences(
      { ...base, weekdays: [1, 3, 5] },
      '11111111-1111-4111-8111-111111111111',
    );
    const dates = occurrences.map((o) => o.localDate);
    expect(dates).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
    ]);
    expect(occurrences[0]!.scheduledStartUtc.toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(occurrences[0]!.scheduledEndUtc.toISOString()).toBe('2026-11-02T07:30:00.000Z');
    const keys = occurrences.map((o) => o.occurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('U02: 60 days accepted, 61 rejected with PLAN_DURATION_EXCEEDED', () => {
    const ok = expandOccurrences(
      { ...base, validFrom: '2026-10-03', validUntil: '2026-12-01', weekdays: [1] },
      'plan-a',
    );
    expect(ok).toHaveLength(9);
    expect(() =>
      expandOccurrences(
        { ...base, validFrom: '2026-10-03', validUntil: '2026-12-02', weekdays: [1] },
        'plan-a',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'PLAN_DURATION_EXCEEDED' }) as Partial<ApiError>,
    );
  });

  it('U03: DST gap occurrence is rejected with RECURRENCE_TIME_INVALID', () => {
    expect(() =>
      expandOccurrences(
        {
          validFrom: '2026-03-08',
          validUntil: '2026-03-08',
          weekdays: [0],
          localStartTime: '02:30',
          durationMin: 60,
          timezone: NEW_YORK,
          dstResolution: 'REJECT',
        },
        'plan-gap',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'RECURRENCE_TIME_INVALID' }) as Partial<ApiError>,
    );
  });

  it('rejects fold times under REJECT and resolves them under explicit policy', () => {
    const fold = {
      validFrom: '2026-11-01',
      validUntil: '2026-11-01',
      weekdays: [0],
      localStartTime: '01:30',
      durationMin: 60,
      timezone: NEW_YORK,
    };
    expect(() => expandOccurrences({ ...fold, dstResolution: 'REJECT' }, 'plan-fold')).toThrowError(
      expect.objectContaining({ code: 'RECURRENCE_TIME_INVALID' }) as Partial<ApiError>,
    );
    const early = expandOccurrences({ ...fold, dstResolution: 'EARLIEST' }, 'plan-fold');
    expect(early[0]!.scheduledStartUtc.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    const late = expandOccurrences({ ...fold, dstResolution: 'LATEST' }, 'plan-fold');
    expect(late[0]!.scheduledStartUtc.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('produces deterministic version-scoped occurrence keys', () => {
    expect(occurrenceKey('v1', '2026-11-02')).toBe('v-v1|2026-11-02|0');
    const a = expandOccurrences({ ...base, weekdays: [1] }, 'version-id-a');
    const b = expandOccurrences({ ...base, weekdays: [1] }, 'version-id-a');
    expect(a.map((o) => o.occurrenceKey)).toEqual(b.map((o) => o.occurrenceKey));
    const c = expandOccurrences({ ...base, weekdays: [1] }, 'version-id-b');
    expect(c[0]!.occurrenceKey).not.toBe(a[0]!.occurrenceKey);
  });
});
