import { z } from 'zod';

/** Sprint 3 commercial contracts (docs 04 BR-QTE / docs 07). Money is integer
 * minor units in the tenant currency; totals are always computed server-side. */

export const QUOTE_LINE_ITEMS_MAX = 20;
// Prisma Int / PostgreSQL INTEGER is the persistence domain for totalMinor.
export const QUOTE_TOTAL_MINOR_MAX = 2_147_483_647;

const lineItem = z
  .strictObject({
    description: z.string().trim().min(1).max(300),
    quantity: z.number().int().min(1).max(10_000),
    unitPriceMinor: z.number().int().min(0).max(100_000_000),
  })
  .refine(
    (item) => item.quantity * item.unitPriceMinor <= QUOTE_TOTAL_MINOR_MAX,
    'Line amount exceeds the supported bound.',
  );
export const QuoteLineItemsSchema = z
  .array(lineItem)
  .min(1)
  .max(QUOTE_LINE_ITEMS_MAX)
  .superRefine((items, ctx) => {
    if (quoteTotalMinor(items) > QUOTE_TOTAL_MINOR_MAX)
      ctx.addIssue({ code: 'custom', message: 'Quote total exceeds the supported bound.' });
  });
export type QuoteLineItem = z.infer<typeof lineItem>;
export type QuoteLineItems = z.infer<typeof QuoteLineItemsSchema>;

/** Server-owned total: sum(quantity * unitPriceMinor) over validated items. */
export function quoteTotalMinor(items: readonly QuoteLineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
}

export const QuoteTermsSchema = z.string().trim().min(1).max(3000);

/** Draft content is fully replaceable until SENT freezes it. */
export const QuoteDraftSchema = z.strictObject({
  lineItems: QuoteLineItemsSchema,
  terms: QuoteTermsSchema,
});
export const QuoteDraftEditSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  lineItems: QuoteLineItemsSchema.optional(),
  terms: QuoteTermsSchema.optional(),
});

/** Quote send freezes the snapshot: validity is set here and must be future. */
export const QuoteSendSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  validForHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90),
  lineItems: QuoteLineItemsSchema.optional(),
  terms: QuoteTermsSchema.optional(),
});
export const QUOTE_VALIDITY_MAX_MS = 90 * 24 * 3600_000;

/** Customer actions name the exact version they act on (explicit consent,
 * docs 04 BR-QTE); version mismatch is a conflict, never a silent redirect. */
export const QuoteActionSchema = z.strictObject({ quoteVersion: z.number().int().positive() });
export const QuoteRevisionRequestSchema = z.strictObject({
  quoteVersion: z.number().int().positive(),
  message: z.string().trim().min(10).max(1000),
});
export const RevisionDeclineSchema = z.strictObject({
  reason: z.string().trim().min(5).max(500),
});
export const RevisionReplacementSchema = z.strictObject({
  validForHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90),
  lineItems: QuoteLineItemsSchema,
  terms: QuoteTermsSchema,
});

/** Coordinator request decisions (docs 04 BR-REQ). */
export const RequestInfoSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(5).max(500),
});
export const RequestRespondSchema = z.strictObject({
  note: z.string().trim().min(1).max(500),
});
export const RequestApproveSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  feasibilityConfirmed: z.literal(true),
});
export const RequestRejectSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});
export const RequestWithdrawSchema = z.strictObject({
  reason: z.string().trim().max(500).default(''),
});
