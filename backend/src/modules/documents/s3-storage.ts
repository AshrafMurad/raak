import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { PrivateObjectStorage } from './private-storage';

interface S3Options {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}
const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();
const encode = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Minimal server-only SigV4 adapter. No public ACL, presigned bucket URL or
 * filesystem fallback. Conditional writes make scanned keys immutable. */
export function createS3Storage(
  options: S3Options,
): PrivateObjectStorage & { verifyPrivacy(): Promise<void> } {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  )
    throw new Error('Invalid storage endpoint');
  async function call(method: 'GET' | 'PUT' | 'DELETE', key: string, body?: Buffer, mime?: string) {
    const url = new URL(endpoint);
    url.pathname = `/${encode(options.bucket)}/${key.split('/').map(encode).join('/')}`;
    const at = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = at.slice(0, 8);
    const payload = digest(body ?? '');
    const values: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payload,
      'x-amz-date': at,
    };
    if (method === 'PUT') {
      values['content-type'] = mime!;
      values['if-none-match'] = '*';
    }
    const names = Object.keys(values).sort();
    const signedHeaders = names.join(';');
    const canonical = `${method}\n${url.pathname}\n\n${names.map((name) => `${name}:${values[name]}\n`).join('')}\n${signedHeaders}\n${payload}`;
    const scope = `${date}/${options.region}/s3/aws4_request`;
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${options.secretKey}`, date), options.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey)
      .update(`AWS4-HMAC-SHA256\n${at}\n${scope}\n${digest(canonical)}`)
      .digest('hex');
    const headers = {
      ...values,
      Authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: new Uint8Array(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('STORAGE_UNAVAILABLE');
    }
    return response;
  }
  return {
    async verifyPrivacy() {
      // Probe with a fixed non-sensitive payload BEFORE enabling patient uploads.
      // A private ACL/configuration claim is insufficient if anonymous GET works.
      const key = `_raak_private_probe/${randomUUID()}`;
      try {
        await call(
          'PUT',
          key,
          Buffer.from('Raak synthetic privacy probe'),
          'application/octet-stream',
        );
        const url = new URL(endpoint);
        url.pathname = `/${encode(options.bucket)}/${key.split('/').map(encode).join('/')}`;
        const anonymous = await fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        await anonymous.body?.cancel();
        if (anonymous.status !== 403) throw new Error('STORAGE_PRIVACY_CHECK_FAILED');
      } finally {
        // Delete only this unique synthetic probe, never a patient object.
        const response = await call('DELETE', key);
        await response.body?.cancel();
      }
    },
    async putImmutable(key, bytes, mime) {
      const response = await call('PUT', key, bytes, mime);
      await response.body?.cancel();
    },
    async read(key, maxBytes) {
      const response = await call('GET', key);
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new Error('FILE_TOO_LARGE');
      }
      if (!response.body) throw new Error('STORAGE_UNAVAILABLE');
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) throw new Error('FILE_TOO_LARGE');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      return Buffer.concat(chunks, size);
    },
  };
}
