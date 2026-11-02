/** Private adapter contract: keys never become public URLs. Writes MUST be
 * create-only; read returns at most maxBytes and rejects larger objects. */
export interface PrivateObjectStorage {
  putImmutable(key: string, bytes: Buffer, mime: string): Promise<void>;
  read(key: string, maxBytes: number): Promise<Buffer>;
}
/** Scanner failures/absence are not CLEAN. Production must use a real engine. */
export type MalwareScanner = (bytes: Buffer) => Promise<'CLEAN' | 'REJECTED' | 'QUARANTINED'>;

export function matchesDocumentSignature(bytes: Buffer, mime: string) {
  if (mime === 'application/pdf')
    return (
      bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) &&
      bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF'))
    );
  if (mime === 'image/png')
    return (
      bytes.length >= 20 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes
        .subarray(bytes.length - 12, bytes.length - 4)
        .equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68]))
    );
  return (
    mime === 'image/jpeg' &&
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}
