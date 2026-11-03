import { describe, expect, it } from 'vitest';
import {
  QuoteDraftSchema,
  QuoteLineItemsSchema,
  QuoteSendSchema,
  QuoteRevisionRequestSchema,
  quoteTotalMinor,
} from '../../src/contracts/quotes';

describe('quote contracts', () => {
  it('computes integer minor-unit totals server-side (U10: 12 x 15000 = 180000)', () => {
    const items = [
      { description: '12 home visits', quantity: 12, unitPriceMinor: 15000 },
      { description: 'Initial assessment', quantity: 1, unitPriceMinor: 0 },
    ];
    expect(QuoteLineItemsSchema.parse(items)).toHaveLength(2);
    expect(quoteTotalMinor(items)).toBe(180000);
    expect(Number.isInteger(quoteTotalMinor(items))).toBe(true);
  });

  it('rejects malformed line items, unknown fields and non-integer money', () => {
    expect(
      QuoteLineItemsSchema.safeParse([{ description: 'x', quantity: 1.5, unitPriceMinor: 100 }])
        .success,
    ).toBe(false);
    expect(
      QuoteLineItemsSchema.safeParse([{ description: 'x', quantity: 1, unitPriceMinor: -1 }])
        .success,
    ).toBe(false);
    expect(QuoteLineItemsSchema.safeParse([]).success).toBe(false);
    expect(QuoteDraftSchema.safeParse({ lineItems: [], terms: 't', totalMinor: 5 }).success).toBe(
      false,
    );
    expect(
      QuoteLineItemsSchema.safeParse([
        { description: 'overflow', quantity: 10_000, unitPriceMinor: 100_000_000 },
        { description: 'overflow b', quantity: 10_000, unitPriceMinor: 100_000_000 },
      ]).success,
    ).toBe(false);
  });

  it('bounds validity windows and revision messages', () => {
    const items = [{ description: 'Visit', quantity: 1, unitPriceMinor: 100 }];
    expect(
      QuoteSendSchema.safeParse({ expectedVersion: 1, validForHours: 24, lineItems: items })
        .success,
    ).toBe(true);
    expect(QuoteSendSchema.safeParse({ expectedVersion: 1, validForHours: 0 }).success).toBe(false);
    expect(QuoteSendSchema.safeParse({ expectedVersion: 1, validForHours: 24 * 91 }).success).toBe(
      false,
    );
    expect(
      QuoteRevisionRequestSchema.safeParse({ quoteVersion: 1, message: 'short' }).success,
    ).toBe(false);
    expect(
      QuoteRevisionRequestSchema.safeParse({
        quoteVersion: 1,
        message: 'Please revise the weekend coverage details.',
      }).success,
    ).toBe(true);
  });
});
