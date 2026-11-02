import http from 'node:http';
import net from 'node:net';
import { expect, it } from 'vitest';
import { createS3Storage } from '../../src/modules/documents/s3-storage';
import { createClamAvScanner } from '../../src/modules/documents/clamav';
import { matchesDocumentSignature } from '../../src/modules/documents/private-storage';
import { UploadIntentSchema } from '../../src/contracts/documents';

it('private S3 transport signs requests, uses create-only writes and bounds streaming reads', async () => {
  const requests: { method: string; conditional?: string; authorization?: string }[] = [];
  const objects = new Map<string, Buffer>();
  let publicRead = false;
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method!,
      conditional: req.headers['if-none-match'] as string | undefined,
      authorization: req.headers.authorization,
    });
    if (!req.headers.authorization && !publicRead) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'DELETE') {
      objects.delete(req.url!);
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'PUT') {
      if (objects.has(req.url!)) {
        res.writeHead(412).end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        objects.set(req.url!, Buffer.concat(chunks));
        res.writeHead(200).end();
      });
    } else {
      res.writeHead(200);
      res.end(objects.get(req.url!) ?? Buffer.alloc(100));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  const storage = createS3Storage({
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'synthetic-private',
    accessKey: 'SYNTHETIC',
    secretKey: 'synthetic-only',
    region: 'us-east-1',
  });
  try {
    await storage.putImmutable(
      'tenant/random-object',
      Buffer.from('Synthetic fixture'),
      'application/pdf',
    );
    await expect(
      storage.putImmutable('tenant/random-object', Buffer.from('replacement'), 'application/pdf'),
    ).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect((await storage.read('tenant/random-object', 100)).toString()).toBe('Synthetic fixture');
    await expect(storage.read('tenant/random-object', 3)).rejects.toThrow('FILE_TOO_LARGE');
    expect(requests[0]!.conditional).toBe('*');
    for (const req of requests)
      expect(req.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=SYNTHETIC\/\d{8}\/us-east-1\/s3\/aws4_request,/,
      );
    await storage.verifyPrivacy();
    publicRead = true;
    await expect(storage.verifyPrivacy()).rejects.toThrow('STORAGE_PRIVACY_CHECK_FAILED');
    expect(objects.size).toBe(1); // Both synthetic probes were removed.
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('ClamAV protocol adapter quarantines engine errors and requires an exact complete OK response', async () => {
  // Protocol doubles only; these responses do not assert a real malware scan.
  for (const [engineResponse, expected] of [
    ['stream: OK\0', 'CLEAN'],
    ['stream: Synthetic-Test FOUND\0', 'REJECTED'],
    ['stream: size limit exceeded ERROR\0', 'QUARANTINED'],
    ['OK\0', 'QUARANTINED'],
  ] as const) {
    let stream = Buffer.alloc(0);
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        stream = Buffer.concat([stream, chunk]);
        if (stream.length >= 22) socket.end(engineResponse); // command + size + four input bytes + terminator.
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    try {
      expect(await createClamAvScanner('127.0.0.1', port)(Buffer.from('test'))).toBe(expected);
      expect(stream.subarray(0, 10).toString()).toBe('zINSTREAM\0');
      expect(stream.readUInt32BE(10)).toBe(4);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

it('rejects spoofed file extensions, malformed magic bytes and oversized intents', () => {
  const base = {
    parentType: 'PATIENT',
    parentId: '11111111-1111-4111-8111-111111111111',
    classification: 'PATIENT_ATTACHMENT',
    originalName: 'test.pdf',
    mime: 'application/pdf',
    sizeBytes: 50,
  };
  expect(UploadIntentSchema.safeParse({ ...base, originalName: 'test.exe' }).success).toBe(false);
  expect(UploadIntentSchema.safeParse({ ...base, originalName: '../test.pdf' }).success).toBe(
    false,
  );
  expect(UploadIntentSchema.safeParse({ ...base, sizeBytes: 5242881 }).success).toBe(false);
  expect(matchesDocumentSignature(Buffer.from('MZ renamed executable'), 'application/pdf')).toBe(
    false,
  );
  expect(
    matchesDocumentSignature(Buffer.from('%PDF-1.7\nMissing trailer'), 'application/pdf'),
  ).toBe(false);
});
