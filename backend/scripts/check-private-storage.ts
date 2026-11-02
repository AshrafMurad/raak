/** Local emulator check only. Uses cached compose LocalStack, synthetic bytes,
 * dev-only credentials and a unique object cleaned up in finally. No downloads. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createS3Storage } from '../src/modules/documents/s3-storage';

const endpoint = 'http://127.0.0.1:4566';
const key = `_sprint4_verification/${randomUUID()}.pdf`;
const storage = createS3Storage({
  endpoint,
  bucket: 'raak-private',
  accessKey: 'raak',
  secretKey: 'raak-dev-only-secret',
  region: 'us-east-1',
});
const bytes = Buffer.from('%PDF-1.7\nSynthetic storage check only\n%%EOF');
try {
  await storage.verifyPrivacy();
  await storage.putImmutable(key, bytes, 'application/pdf');
  assert.deepEqual(await storage.read(key, 1024), bytes);
  await assert.rejects(storage.putImmutable(key, Buffer.from('replacement'), 'application/pdf'));
  await assert.rejects(storage.read(key, 3));
  const anonymous = await fetch(`${endpoint}/raak-private/${key}`, { redirect: 'error' });
  await anonymous.body?.cancel();
  assert.equal(anonymous.status, 403, 'Anonymous object access must be denied');
  process.stdout.write(
    'PASS local S3 emulator: SigV4 write/read, conditional overwrite denial, bounded reads and anonymous download denial\n',
  );
} finally {
  execFileSync(
    'docker',
    ['exec', 'raak-localstack-1', 'awslocal', 's3', 'rm', `s3://raak-private/${key}`],
    { stdio: 'pipe' },
  );
}
