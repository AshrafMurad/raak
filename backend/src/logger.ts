/**
 * Structured, safe logger (docs 08 observability, docs 09 log redaction).
 *
 * - One JSON object per line on stdout (collectable by any log pipeline).
 * - Values whose key looks sensitive (tokens, secrets, credentials, contact
 *   data, free-text care content) are replaced with "[REDACTED]" before
 *   serialization. Redaction is deny-by-default for known-sensitive key
 *   patterns; never log raw request bodies or ORM rows wholesale.
 * - `correlationId` / `tenantId` may be attached as safe correlation metadata.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = '[REDACTED]';

/** Lower-cased key fragments that mark a value as sensitive. */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'authheader',
  'cookie',
  'sessionid',
  'apikey',
  'email',
  'phone',
  'address',
  'note',
  'bodyrestricted',
  'dateofbirth',
  'dob',
  'license',
  'firstname',
  'lastname',
  'beneficiary',
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export type LogValue = string | number | boolean | null | undefined;
export type LogFields = {
  [key: string]: LogValue | LogValue[] | LogFields | LogFields[] | unknown;
};

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED_DEPTH]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.length > 50
      ? value.slice(0, 50).map((v) => redact(v, depth + 1))
      : value.map((v) => redact(v, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}…[TRUNCATED]`;
  }
  return value;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface CreateLoggerOptions {
  service: string;
  level?: LogLevel;
  /** Injected in tests; defaults to process.stdout. */
  write?: (line: string) => void;
}

function emit(
  opts: { service: string; level: LogLevel; write: (line: string) => void },
  bindings: LogFields,
  level: LogLevel,
  message: string,
  fields?: LogFields,
): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[opts.level]) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    service: opts.service,
    msg: message,
    ...(redact({ ...bindings, ...(fields ?? {}) }) as LogFields),
  };
  opts.write(JSON.stringify(entry));
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const base = {
    service: options.service,
    level: options.level ?? 'info',
    write: options.write ?? ((line: string) => process.stdout.write(`${line}\n`)),
  } as const;

  const make = (bindings: LogFields): Logger => ({
    debug: (message, fields) => emit(base, bindings, 'debug', message, fields),
    info: (message, fields) => emit(base, bindings, 'info', message, fields),
    warn: (message, fields) => emit(base, bindings, 'warn', message, fields),
    error: (message, fields) => emit(base, bindings, 'error', message, fields),
    child: (childBindings) => make({ ...bindings, ...childBindings }),
  });

  return make({});
}

/** Parse a LOG_LEVEL env value with a safe fallback. */
export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  return 'info';
}
