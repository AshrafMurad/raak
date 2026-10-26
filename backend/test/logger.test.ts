import { describe, expect, it } from 'vitest';
import { createLogger, parseLogLevel, type LogFields } from '../src/logger';

function capture(): { lines: LogFields[]; write: (line: string) => void } {
  const lines: LogFields[] = [];
  return { lines, write: (line) => void lines.push(JSON.parse(line) as LogFields) };
}

describe('createLogger', () => {
  it('emits one structured JSON line per call', () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: 'api', level: 'debug', write });
    logger.info('booting', { port: 3001 });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.['service']).toBe('api');
    expect(lines[0]?.['level']).toBe('info');
    expect(lines[0]?.['msg']).toBe('booting');
    expect(lines[0]?.['port']).toBe(3001);
    expect(typeof lines[0]?.['time']).toBe('string');
  });

  it('respects level filtering', () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: 'api', level: 'warn', write });
    logger.debug('nope');
    logger.info('nope');
    logger.warn('yes');
    logger.error('yes');
    expect(lines).toHaveLength(2);
  });

  it('child loggers inherit and extend bindings', () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: 'worker', level: 'debug', write });
    logger.child({ correlationId: 'c-1' }).info('hello', { tenantId: 't-1' });
    expect(lines[0]?.['correlationId']).toBe('c-1');
    expect(lines[0]?.['tenantId']).toBe('t-1');
  });

  it('redacts sensitive keys at any depth, including arrays', () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: 'api', level: 'debug', write });
    logger.info('request', {
      header: { authorization: 'Bearer x', Cookie: 'sid=1' },
      user: { email: 'a@example.invalid', displayName: 'Agency A' },
      items: [{ bodyRestricted: 'secret note' }],
      notes: 'free-text care content',
      token: 'abc',
    });
    const entry = lines[0] as Record<string, Record<string, unknown>>;
    const header = entry['header'] as Record<string, unknown>;
    const user = entry['user'] as Record<string, unknown>;
    const items = entry['items'] as unknown as Record<string, unknown>[];
    expect(header['authorization']).toBe('[REDACTED]');
    expect(header['Cookie']).toBe('[REDACTED]');
    expect(user['email']).toBe('[REDACTED]');
    expect(user['displayName']).toBe('Agency A');
    expect(items[0]?.['bodyRestricted']).toBe('[REDACTED]');
    // keys matching "note*" are redacted wholesale (docs 09: never log care notes)
    expect(entry['notes']).toBe('[REDACTED]');
    expect(entry['token']).toBe('[REDACTED]');
  });

  it('truncates very long string values', () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: 'api', level: 'debug', write });
    logger.info('big', { blob: 'x'.repeat(5000) });
    const blob = (lines[0] as Record<string, unknown>)['blob'];
    expect(typeof blob === 'string' && blob.length < 2100).toBe(true);
  });
});

describe('parseLogLevel', () => {
  it('accepts known levels and falls back to info', () => {
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel('error')).toBe('error');
    expect(parseLogLevel('loud')).toBe('info');
    expect(parseLogLevel(undefined)).toBe('info');
  });
});
