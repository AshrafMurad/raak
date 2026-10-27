/**
 * Unit: scrypt password hashing and opaque token utilities (docs 05 — tokens
 * stored hashed only; timing-safe comparisons). No database access.
 */
import { describe, expect, it } from 'vitest';
import {
  generateToken,
  hashPassword,
  hashToken,
  safeEqual,
  verifyPassword,
} from '../../src/modules/auth/crypto';

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const stored = await hashPassword('Correct-Horse-1!');
    expect(typeof stored).toBe('string');
    await expect(verifyPassword('Correct-Horse-1!', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('Correct-Horse-1!');
    await expect(verifyPassword('Wrong-Horse-1!', stored)).resolves.toBe(false);
  });

  it('produces the documented scrypt param format', async () => {
    const stored = await hashPassword('abc12345678');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
  });

  it('uses a per-call random salt (two hashes of one password differ)', async () => {
    const a = await hashPassword('Same-Password-9');
    const b = await hashPassword('Same-Password-9');
    expect(a).not.toBe(b);
  });

  it('fails closed on a malformed/tampered stored hash', async () => {
    await expect(verifyPassword('whatever', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(verifyPassword('whatever', '')).resolves.toBe(false);
    // Tampered cost parameter must not be silently honoured.
    const stored = await hashPassword('abc12345678');
    const parts = stored.split('$');
    parts[1] = '1'; // scrypt -> unknown kdf label
    await expect(verifyPassword('abc12345678', parts.join('$'))).resolves.toBe(false);
    const weak = stored.split('$');
    weak[1] = '1024'; // weaker N than the documented minimum
    await expect(verifyPassword('abc12345678', weak.join('$'))).resolves.toBe(false);
  });
});

describe('generateToken / hashToken / safeEqual', () => {
  it('generates 32-byte base64url tokens (43 chars, no padding)', () => {
    const { token } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('generates unique tokens', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      seen.add(generateToken().token);
    }
    expect(seen.size).toBe(100);
  });

  it('returns a sha256 hex tokenHash matching hashToken(token)', () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(tokenHash);
    expect(hashToken(token)).not.toBe(token);
  });

  it('safeEqual is true only for identical strings', () => {
    expect(safeEqual('abcdef', 'abcdef')).toBe(true);
    expect(safeEqual('abcdef', 'abcdeg')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
