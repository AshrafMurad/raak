import { expect, it } from 'vitest';
import { classifyUrgency } from '../../src/modules/scheduling/change-request.service';
import { visitDateWindow } from '../../src/modules/common/visit-date-window';

it('has monotone cutoff classification across every permitted hour and is invariant under common clock shifts', () => {
  const start = new Date('2026-12-01T06:00:00Z');
  for (const time of ['2026-11-30T06:00:00Z', '2026-11-25T10:45:00Z', '2026-12-01T05:59:59.999Z']) {
    const now = new Date(time);
    let alreadyLate = false;
    for (let hours = 0; hours <= 168; hours++) {
      const result = classifyUrgency(now, start, hours);
      if (alreadyLate) expect(result).toBe('LATE');
      alreadyLate ||= result === 'LATE';
      for (const shift of [-86_400_000, 3_600_000, 7 * 86_400_000]) {
        expect(
          classifyUrgency(
            new Date(now.getTime() + shift),
            new Date(start.getTime() + shift),
            hours,
          ),
        ).toBe(result);
      }
    }
  }
});

it('includes the last second of the local day and handles 23/25-hour DST days', () => {
  const riyadh = visitDateWindow({ from: '2026-12-01', to: '2026-12-01' }, 'Asia/Riyadh');
  expect(riyadh.gte?.toISOString()).toBe('2026-11-30T21:00:00.000Z');
  expect(riyadh.lt?.toISOString()).toBe('2026-12-01T21:00:00.000Z');
  expect(new Date('2026-12-01T20:59:59.999Z') < riyadh.lt!).toBe(true);
  const spring = visitDateWindow({ from: '2027-03-28', to: '2027-03-28' }, 'Europe/Berlin');
  expect(spring.gte?.toISOString()).toBe('2027-03-27T23:00:00.000Z');
  expect(spring.lt?.toISOString()).toBe('2027-03-28T22:00:00.000Z');
  const autumn = visitDateWindow({ from: '2027-10-31', to: '2027-10-31' }, 'Europe/Berlin');
  expect(autumn.gte?.toISOString()).toBe('2027-10-30T22:00:00.000Z');
  expect(autumn.lt?.toISOString()).toBe('2027-10-31T23:00:00.000Z');
  expect(() => visitDateWindow({ from: '2026-12-02', to: '2026-12-01' }, 'Asia/Riyadh')).toThrow();
});
