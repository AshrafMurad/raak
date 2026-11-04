import { ApiError } from '../../api-error';
import { addDays, localToUtc } from './local-time';

/** Inclusive local dates become a half-open instant window. The final
 * minute's seconds belong to the requested day, never the next day. */
export function visitDateWindow(query: { from?: string; to?: string }, timezone: string) {
  if (query.from && query.to && query.from > query.to)
    throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid date window.');
  const from = query.from ? localToUtc(query.from, '00:00', timezone) : null;
  const until = query.to ? localToUtc(addDays(query.to, 1), '00:00', timezone) : null;
  if ((from && from.status !== 'UNIQUE') || (until && until.status !== 'UNIQUE'))
    throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid date window.');
  return {
    ...(from?.status === 'UNIQUE' ? { gte: from.instant } : {}),
    ...(until?.status === 'UNIQUE' ? { lt: until.instant } : {}),
  };
}
