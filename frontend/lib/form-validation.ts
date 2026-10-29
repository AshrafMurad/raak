const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'platform',
  'staging',
  'portal',
  'raak',
]);

export function isValidSlug(value: string): boolean {
  return value.length >= 2 && value.length <= 63 && SLUG_PATTERN.test(value) && !RESERVED_SLUGS.has(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return value.length >= 10 && value.length <= 128;
}

export function isValidSuspendReason(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}
