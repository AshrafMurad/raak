import { describe, expect, it } from 'vitest';
import {
  commercialCopy,
  errorLabel,
  formatMinor,
  quoteStatusLabel,
  requestStatusLabel,
} from '../features/commercial/copy';

describe('commercial copy helpers', () => {
  it('maps quote and request statuses to typed labels in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      const c = commercialCopy(locale);
      expect(quoteStatusLabel(c, 'SUPERSEDED')).toBe(c.statusSuperseded);
      expect(quoteStatusLabel(c, 'UNKNOWN')).toBe('UNKNOWN');
      expect(requestStatusLabel(c, 'AWAITING_CUSTOMER')).toBe(c.statusAwaitingCustomer);
      expect(requestStatusLabel(c, 'WITHDRAWN')).toBe(c.statusWithdrawn);
    }
  });

  it('translates API error codes at the UI boundary', () => {
    const c = commercialCopy('en');
    expect(errorLabel(c, 'QUOTE_EXPIRED')).toBe(c.errorQuoteExpired);
    expect(errorLabel(c, 'QUOTE_SUPERSEDED')).toBe(c.errorQuoteSuperseded);
    expect(errorLabel(c, 'QUOTE_REVISION_PENDING')).toBe(c.errorRevisionPending);
    expect(errorLabel(c, 'VERSION_CONFLICT')).toBe(c.errorVersionConflict);
    expect(errorLabel(c, 'SCHEDULE_CONFLICT')).toBe(c.errorOther);
  });

  it('formats integer minor units as localized currency without float money math', () => {
    expect(formatMinor(180000, 'SAR', 'en')).toContain('1,800.00');
    expect(formatMinor(180000, 'SAR', 'ar')).toContain('١٬٨٠٠');
    expect(formatMinor(0, 'SAR', 'en')).toContain('0.00');
  });
});
