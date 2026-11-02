import { expect, it } from 'vitest';
import { AvailabilitySchema, ExceptionSchema } from '../../src/contracts/caregivers';
import { coversInterval } from '../../src/modules/caregivers/eligibility';

it('accepts multiple non-overlapping intervals, rejects overlapping effective periods and invalid dates', () => {
  const slot = { weekday: 1, localStartTime: '08:00', localEndTime: '12:00' };
  expect(
    AvailabilitySchema.safeParse({
      expectedRevision: 1,
      slots: [slot, { ...slot, localStartTime: '12:00', localEndTime: '16:00' }],
    }).success,
  ).toBe(true);
  expect(AvailabilitySchema.safeParse({ expectedRevision: 1, slots: [slot, slot] }).success).toBe(
    false,
  );
  expect(
    AvailabilitySchema.safeParse({
      expectedRevision: 1,
      slots: [{ ...slot, effectiveFrom: '2026-02-30' }],
    }).success,
  ).toBe(false);
  expect(
    ExceptionSchema.safeParse({
      expectedRevision: 1,
      localDate: '2026-12-01',
      type: 'UNAVAILABLE',
      startLocal: '09:00',
      reason: 'Synthetic leave',
    }).success,
  ).toBe(false);
});

it('coverage agrees with an independent occupied-hour oracle for all 64 schedules and is order-independent', () => {
  const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  for (let mask = 0; mask < 64; mask++) {
    const intervals = Array.from({ length: 6 }, (_, hour) => hour)
      .filter((hour) => mask & (1 << hour))
      .map((hour) => ({ start: clock(hour), end: clock(hour + 1) }));
    for (let start = 0; start < 6; start++)
      for (let end = start + 1; end <= 6; end++) {
        const expected = Array.from({ length: end - start }, (_, i) => start + i).every(
          (hour) => (mask & (1 << hour)) !== 0,
        );
        expect(coversInterval(intervals, clock(start), clock(end))).toBe(expected);
        expect(coversInterval([...intervals].reverse(), clock(start), clock(end))).toBe(expected);
      }
  }
});
