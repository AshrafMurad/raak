import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Only the worker can recover the delivery capability. Authorization uses its
// one-way hash; no raw email capability is stored in an event or database row.
export function sealSecret(secret: string, key: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function openSecret(value: string, key: string, context: string): string {
  const data = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(key).digest(),
    data.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
