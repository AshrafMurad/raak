/** Shared interval coverage math for local clock intervals (docs 04 BR-SCH). */
export interface LocalInterval {
  start: string;
  end: string;
}
export function coversInterval(intervals: readonly LocalInterval[], start: string, end: string) {
  let coveredUntil = start;
  for (const slot of [...intervals].sort((a, b) => a.start.localeCompare(b.start))) {
    if (slot.start > coveredUntil) break;
    if (slot.end > coveredUntil) coveredUntil = slot.end;
    if (coveredUntil >= end) return true;
  }
  return false;
}
