import type { ChangeInput, CustomerVisit } from './api';
export function canRequestChange(visit: CustomerVisit, now = new Date()) {
  return (
    visit.status === 'SCHEDULED' && !visit.pendingChange && new Date(visit.scheduledStartUtc) > now
  );
}
export function validChangeInput(input: ChangeInput) {
  const length = input.reason.trim().length;
  if (length < 10 || length > 1000) return false;
  return (
    input.type === 'CANCEL' ||
    (/^\d{4}-\d{2}-\d{2}$/.test(input.proposedDate) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(input.proposedTime))
  );
}
