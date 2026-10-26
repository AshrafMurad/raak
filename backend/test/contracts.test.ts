import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  ERROR_CODES,
  ErrorEnvelopeSchema,
  HealthLiveSchema,
  HealthReadySchema,
  LOCALE_DIRECTION,
  NotificationEventType,
  PaginationQuerySchema,
  SUPPORTED_LOCALES,
  TenantStatus,
  VisitStatus,
  errorEnvelope,
  isLocale,
} from '../src/contracts';

describe('locales', () => {
  it('arabic is the default locale and RTL', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALE_DIRECTION[DEFAULT_LOCALE]).toBe('rtl');
    expect(LOCALE_DIRECTION['en']).toBe('ltr');
  });

  it('isLocale guards the closed set', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(SUPPORTED_LOCALES).toEqual(['ar', 'en']);
  });
});

describe('domain enums', () => {
  it('tenant statuses match docs 06', () => {
    expect(Object.values(TenantStatus)).toEqual(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']);
  });

  it('visit statuses match BR-VST state machine', () => {
    expect(Object.values(VisitStatus)).toEqual([
      'PLANNED',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'MISSED',
    ]);
  });

  it('notification events cover the docs 11 catalog essentials', () => {
    expect(NotificationEventType.VISIT_CONFIRMED).toBe('VISIT_CONFIRMED');
    expect(NotificationEventType.SECURITY_VERIFICATION).toBe('SECURITY_VERIFICATION');
  });
});

describe('error envelope', () => {
  it('errorEnvelope produces a contract-valid payload', () => {
    const payload = errorEnvelope('SCHEDULE_CONFLICT', 'Selected caregiver is not available.', {
      requestId: 'req-1234',
      details: { conflictType: 'BUFFER' },
    });
    expect(() => ErrorEnvelopeSchema.parse(payload)).not.toThrow();
    expect(payload.error.code).toBe('SCHEDULE_CONFLICT');
  });

  it('rejects codes outside the registry', () => {
    expect(() =>
      ErrorEnvelopeSchema.parse({ error: { code: 'SOMETHING_ODD', message: 'x' } }),
    ).toThrow();
  });

  it('registry contains the minimum codes from docs 07', () => {
    for (const code of ['SCHEDULE_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'QUOTE_SUPERSEDED']) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

describe('health contracts', () => {
  it('parses live and ready payloads', () => {
    expect(() =>
      HealthLiveSchema.parse({
        data: { status: 'ok', service: 'api', time: new Date().toISOString() },
      }),
    ).not.toThrow();
    expect(() =>
      HealthReadySchema.parse({
        data: {
          status: 'ready',
          service: 'api',
          components: { db: 'UP', redis: 'DOWN' },
          time: new Date().toISOString(),
        },
      }),
    ).not.toThrow();
  });

  it('rejects unknown component status', () => {
    expect(() =>
      HealthReadySchema.parse({
        data: {
          status: 'ready',
          service: 'api',
          components: { db: 'SIDEWAYS' },
          time: new Date().toISOString(),
        },
      }),
    ).toThrow();
  });
});

describe('pagination contract', () => {
  it('defaults limit to 20 and caps at 100', () => {
    expect(PaginationQuerySchema.parse({}).limit).toBe(20);
    expect(PaginationQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(() => PaginationQuerySchema.parse({ limit: '101' })).toThrow();
  });
});
