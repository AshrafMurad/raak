import type { DatabaseClient } from '../../db/client';
import { createQuoteDrafts } from './quote-drafts';
import { createQuoteQueries } from './quote-queries';
import { createQuoteResponses } from './quote-responses';
import { createQuoteRevisions } from './quote-revisions';

/** Public commercial interface; each workflow owns its complete transaction. */
export function createQuoteService(db: DatabaseClient, now: () => Date) {
  return {
    ...createQuoteDrafts(db, now),
    ...createQuoteQueries(db, now),
    ...createQuoteResponses(db, now),
    ...createQuoteRevisions(db, now),
  };
}

export type QuoteService = ReturnType<typeof createQuoteService>;
