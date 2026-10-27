/**
 * Auth crypto primitives (docs 05): scrypt password hashing with per-user
 * salt, and opaque single-use tokens stored only as sha-256 hashes.
 * Fail closed: any malformed stored value verifies as false, never throws.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/** Minimum accepted scrypt cost parameters; anything weaker fails closed. */
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const TOKEN_BYTES = 32;

/** Serialized form: scrypt$N$r$p$saltB64$hashB64 */
export type PasswordHash = string;

function b64(buffer: Buffer): string {
  return buffer.toString('base64');
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password.normalize('NFKC'), salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${b64(salt)}$${b64(derived)}`;
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Reject anything weaker than (or unequal to) the documented parameters.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n !== SCRYPT_N || r !== SCRYPT_r || p !== SCRYPT_p) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: n,
    r,
    p,
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface GeneratedToken {
  /** Raw opaque token — delivered to the user, never stored. */
  token: string;
  /** sha-256 hex digest of the token — the only persisted form. */
  tokenHash: string;
}

export function generateToken(): GeneratedToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}
