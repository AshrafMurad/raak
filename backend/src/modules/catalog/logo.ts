import { deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(type, 4, 'ascii');
  data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
}
const invalid = () => new Error('INVALID_LOGO');

/** Restricted public brand asset, never a sensitive document upload. Decode
 * bounded 8-bit RGB/RGBA pixels and re-encode; discard all metadata/extra chunks.
 * Unsupported encodings fail closed rather than being served unvalidated. */
export function sanitizeLogoPng(base64: string): string {
  if (
    base64.length > 175000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  )
    throw invalid();
  const input = Buffer.from(base64, 'base64');
  if (input.length > 128 * 1024 || !input.subarray(0, 8).equals(signature)) throw invalid();
  let pos = 8;
  let header: Buffer | undefined;
  const image: Buffer[] = [];
  let ended = false;
  let chunks = 0;
  while (pos < input.length) {
    if (++chunks > 100 || pos + 12 > input.length) throw invalid();
    const length = input.readUInt32BE(pos);
    if (pos + length + 12 > input.length) throw invalid();
    const type = input.toString('ascii', pos + 4, pos + 8);
    const data = input.subarray(pos + 8, pos + 8 + length);
    if (input.readUInt32BE(pos + 8 + length) !== crc32(input.subarray(pos + 4, pos + 8 + length)))
      throw invalid();
    if (!header && type !== 'IHDR') throw invalid();
    if (type === 'IHDR') {
      if (header || length !== 13) throw invalid();
      header = data;
    } else if (type === 'IDAT') image.push(data);
    else if (type === 'IEND') {
      if (length !== 0) throw invalid();
      ended = true;
      pos += 12;
      break;
    } else if (type[0] === type[0]?.toUpperCase()) throw invalid();
    pos += length + 12;
  }
  if (!header || !ended || pos !== input.length || !image.length) throw invalid();
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bpp = header[9] === 6 ? 4 : header[9] === 2 ? 3 : 0;
  if (
    !width ||
    !height ||
    width > 512 ||
    height > 512 ||
    header[8] !== 8 ||
    !bpp ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0
  )
    throw invalid();
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(image), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw invalid();
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) throw invalid();
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= bpp ? pixels[i - bpp]! : 0;
      const above = y > 0 ? pixels[i - stride]! : 0;
      const upperLeft = y > 0 && x >= bpp ? pixels[i - stride - bpp]! : 0;
      const p = left + above - upperLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - above);
      const pc = Math.abs(p - upperLeft);
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : pa <= pb && pa <= pc
                  ? left
                  : pb <= pc
                    ? above
                    : upperLeft;
      pixels[i] = (raw[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
  }
  const clean = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++)
    pixels.copy(clean, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(clean)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
