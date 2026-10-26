import { z } from 'zod';

/**
 * Pagination contract (docs 07): default 20, max 100, opaque cursor.
 * Sorting/filtering allowlists are per-endpoint and belong to their feature sprints.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(1024).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int().min(1).max(100),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;
