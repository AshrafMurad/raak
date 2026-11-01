import { expect, it } from 'vitest';
import { sanitizeLogoPng } from '../../src/modules/catalog/logo';

it('rejects SVG, malformed PNG, oversized and non-base64 logo uploads', () => {
  for (const value of [
    '<svg/>',
    Buffer.from('<svg/>').toString('base64'),
    'AAAA',
    'a'.repeat(180000),
  ])
    expect(() => sanitizeLogoPng(value)).toThrow();
});
