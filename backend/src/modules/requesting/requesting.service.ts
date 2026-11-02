import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { createRequestAccess, createRequestTokenIssuer } from './request-access';
import { createRequestSubmission } from './request-submission';
import { createRequestQueries } from './request-queries';
import { createRequestLifecycle } from './request-lifecycle';

export { GUEST_TOKEN_TTL_MS, GUEST_SESSION_TTL_MS } from './request-access';

/** Public requesting interface; token issuance borrows the intake/resend transaction. */
export function createRequestingService(
  db: DatabaseClient,
  now: () => Date,
  encryptionKey?: string,
) {
  const key = () => {
    if (!encryptionKey)
      throw new ApiError(503, 'INTERNAL_ERROR', 'Service temporarily unavailable.');
    return encryptionKey;
  };
  const issue = createRequestTokenIssuer(now, key);
  return {
    ...createRequestSubmission(db, now, key, issue),
    ...createRequestAccess(db, now, issue),
    ...createRequestQueries(db, now),
    ...createRequestLifecycle(db, now),
  };
}
