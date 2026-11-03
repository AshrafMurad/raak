/**
 * Pure IANA timezone helpers (docs 04: UTC instants persist; local calendars
 * built with the tenant timezone). Built on Intl — no external date library,
 * so DST gaps/folds are detected explicitly instead of silently shifting
 * (docs 08 recurrence contract, ADR-0012).
 */

export interface LocalDateTime {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
}

export type LocalResolution =
  | { status: 'UNIQUE'; instant: Date }
  | { status: 'GAP' }
  | { status: 'AMBIGUOUS'; candidates: [Date, Date] };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = partsCache.get(timeZone);
  if (!dtf) {
    // Validate the zone eagerly; invalid IANA names throw here.
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Wall-clock parts of a UTC instant in the given zone. */
export function utcParts(instant: Date, timeZone: string): LocalDateTime {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Zone offset (minutes east of UTC) in effect at a UTC instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = utcParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Resolve a local wall time to a UTC instant.
 * - UNIQUE: exactly one instant maps back to the local time.
 * - GAP: the local time does not exist (spring-forward).
 * - AMBIGUOUS: fold (fall-back); both candidates map back.
 *
 * Offsets are probed across a ±24h window around the naive UTC guess so both
 * sides of a transition are always considered (a two-probe search can land on
 * one side of a fold and miss it).
 */
export function localToUtc(localDate: string, clock: string, timeZone: string): LocalResolution {
  const year = +localDate.slice(0, 4);
  const month = +localDate.slice(5, 7);
  const day = +localDate.slice(8, 10);
  const hour = +clock.slice(0, 2);
  const minute = +clock.slice(3, 5);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const roundTrip = (instant: Date) => {
    const p = utcParts(instant, timeZone);
    return (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    );
  };
  const offsets = new Set<number>();
  for (const sample of [-24, -12, -6, -2, 0, 2, 6, 12, 24]) {
    offsets.add(offsetMinutes(new Date(guess + sample * 3_600_000), timeZone));
  }
  const valid: Date[] = [];
  for (const offset of offsets) {
    const candidate = new Date(guess - offset * 60_000);
    if (roundTrip(candidate) && !valid.some((v) => v.getTime() === candidate.getTime()))
      valid.push(candidate);
  }
  if (valid.length === 0) return { status: 'GAP' };
  if (valid.length === 1) return { status: 'UNIQUE', instant: valid[0]! };
  valid.sort((a, b) => a.getTime() - b.getTime());
  return { status: 'AMBIGUOUS', candidates: [valid[0]!, valid[1]!] };
}

/** Resolve with an explicit DST policy (ADR-0012): gaps always fail. */
export function localToUtcWithPolicy(
  localDate: string,
  clock: string,
  timeZone: string,
  dstResolution: 'REJECT' | 'EARLIEST' | 'LATEST',
): { status: 'UNIQUE'; instant: Date } | { status: 'GAP' } | { status: 'AMBIGUOUS' } {
  const result = localToUtc(localDate, clock, timeZone);
  if (result.status === 'AMBIGUOUS' && dstResolution !== 'REJECT')
    return {
      status: 'UNIQUE',
      instant: dstResolution === 'EARLIEST' ? result.candidates[0] : result.candidates[1],
    };
  return result;
}

/** Local calendar date (YYYY-MM-DD) of a UTC instant in the zone. */
export function utcLocalDate(instant: Date, timeZone: string): string {
  const p = utcParts(instant, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Local clock (HH:mm) of a UTC instant in the zone. */
export function utcLocalClock(instant: Date, timeZone: string): string {
  const p = utcParts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** ISO weekday (0=Sunday..6=Saturday) of a plain local calendar date. */
export function localDateWeekday(localDate: string): number {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}

/** Inclusive day count between two local dates (assumes from <= to). */
export function inclusiveDays(from: string, to: string): number {
  return (
    (Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
      Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) /
      86_400_000 +
    1
  );
}

/** Next (or same) local calendar date after `date`. */
export function addDays(localDate: string, days: number): string {
  const next = new Date(
    Date.UTC(+localDate.slice(0, 4), +localDate.slice(5, 7) - 1, +localDate.slice(8, 10)) +
      days * 86_400_000,
  );
  return next.toISOString().slice(0, 10);
}
