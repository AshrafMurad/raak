import { describe, expect, it } from 'vitest';
import { ServerSessionContextSchema } from '../src/contracts/context';

const session = {
  principalId: '11111111-1111-4111-8111-111111111111',
  sessionVersion: 1,
  issuedAt: '2026-10-26T12:00:00.000Z',
  expiresAt: '2026-10-26T13:00:00.000Z',
};

describe('server-resolved session boundary contract', () => {
  it('never permits tenant-less staff or customer context', () => {
    for (const principalType of ['AGENCY_STAFF', 'AGENCY_CUSTOMER']) {
      expect(ServerSessionContextSchema.safeParse({ ...session, principalType }).success).toBe(
        false,
      );
    }
  });

  it('keeps platform and agency realms distinct', () => {
    const platform = { ...session, principalType: 'PLATFORM_OPERATOR' };
    expect(ServerSessionContextSchema.safeParse(platform).success).toBe(true);
    expect(
      ServerSessionContextSchema.safeParse({
        ...platform,
        tenantId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false);
  });

  it('accepts an explicitly bound agency context but not privilege fields', () => {
    const staff = {
      ...session,
      principalType: 'AGENCY_STAFF',
      tenantId: '22222222-2222-4222-8222-222222222222',
    };
    expect(ServerSessionContextSchema.safeParse(staff).success).toBe(true);
    expect(ServerSessionContextSchema.safeParse({ ...staff, clinicalApproved: true }).success).toBe(
      false,
    );
  });

  it('rejects an invalid session window', () => {
    expect(
      ServerSessionContextSchema.safeParse({
        ...session,
        principalType: 'PLATFORM_OPERATOR',
        expiresAt: session.issuedAt,
      }).success,
    ).toBe(false);
  });
});
