import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidPassword,
  isValidSlug,
  isValidSuspendReason,
} from '../lib/form-validation';

describe('Sprint 1 form validation', () => {
  it.each(['afiya', 'afiya-care', 'a1-care2'])('accepts valid slug %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(['Afiya', '-afiya', 'afiya-', 'afiya--care', 'afiya care', 'platform', 'api'])(
    'rejects invalid or reserved slug %s',
    (slug) => expect(isValidSlug(slug)).toBe(false),
  );

  it('validates email shape without pretending to verify ownership', () => {
    expect(isValidEmail('owner@example.invalid')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@')).toBe(false);
  });

  it('applies the backend 10..128 password length boundary', () => {
    expect(isValidPassword('Synthetic1')).toBe(true);
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('x'.repeat(129))).toBe(false);
  });

  it('requires a trimmed suspension reason of 3..500 characters', () => {
    expect(isValidSuspendReason('Policy review')).toBe(true);
    expect(isValidSuspendReason(' ab ')).toBe(false);
    expect(isValidSuspendReason('x'.repeat(501))).toBe(false);
  });
});
