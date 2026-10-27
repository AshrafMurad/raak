/**
 * Integration: opaque server-side sessions (docs 05). Real PostgreSQL required;
 * skipped only when DATABASE_URL is absent. All fixtures synthetic.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPrisma, disconnectPrisma, type DatabaseClient } from '../../src/db/client';
import {
  createSession,
  resolveSession,
  revokeAllSessionsForTenant,
  revokeSession,
} from '../../src/modules/auth/session.service';
import { hashPassword } from '../../src/modules/auth/crypto';
import type { StaffRole } from '../../src/db/generated/prisma/client';

const hasDatabase = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDatabase)('session service', () => {
  let db: DatabaseClient;
  let syntheticPassword: string;
  const now = () => new Date('2026-06-01T12:00:00Z');

  beforeAll(async () => {
    syntheticPassword = await hashPassword('Synthetic-Test-1!');
  });

  async function makeTenant(slug: string, status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED') {
    return db.tenant.create({
      data: {
        slug,
        legalName: `Tenant ${slug} (synthetic)`,
        displayName: `مستأجر ${slug}`,
        status,
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: `support@${slug}.example.invalid`,
      },
    });
  }

  async function makeStaff(tenantId: string, email: string, role: StaffRole = 'CARE_COORDINATOR') {
    return db.staffAccount.create({
      data: { tenantId, emailNormalized: email, passwordHash: syntheticPassword, role, status: 'ACTIVE', emailVerifiedAt: now() },
    });
  }

  beforeEach(async () => {
    db = getPrisma();
    await db.authSession.deleteMany();
    await db.emailToken.deleteMany();
    await db.staffInvitation.deleteMany();
    await db.auditEvent.deleteMany();
    await db.caregiver.deleteMany();
    await db.staffAccount.deleteMany({ where: { emailNormalized: { contains: 'sessions-test' } } });
    await db.customerAccount.deleteMany({ where: { emailNormalized: { contains: 'sessions-test' } } });
    await db.platformOperator.deleteMany({ where: { emailNormalized: { contains: 'sessions-test' } } });
    await db.tenant.deleteMany({ where: { slug: { contains: 'sessions-test' } } });
  });

  it('round-trips create -> resolve for a staff principal', async () => {
    const tenant = await makeTenant('sessions-test-a', 'ACTIVE');
    const staff = await makeStaff(tenant.id, 'owner@sessions-test.invalid', 'AGENCY_OWNER');
    const { sessionToken, csrfToken } = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staff.id,
      tenantId: tenant.id,
      sessionVersion: staff.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const resolved = await resolveSession(db, sessionToken, now);
    expect(resolved).not.toBeNull();
    expect(resolved?.session).toMatchObject({
      principalType: 'AGENCY_STAFF',
      tenantId: tenant.id,
    });
    expect(resolved?.staff?.role).toBe('AGENCY_OWNER');
    expect(resolved?.csrfTokenHash).toBeDefined();
    expect(csrfToken).not.toBe(sessionToken);
  });

  it('resolves platform operator sessions without a tenant binding', async () => {
    const operator = await db.platformOperator.create({
      data: { emailNormalized: 'op@sessions-test.invalid', passwordHash: syntheticPassword, status: 'ACTIVE' },
    });
    const { sessionToken } = await createSession(db, {
      principalType: 'PLATFORM_OPERATOR',
      principalId: operator.id,
      sessionVersion: operator.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const resolved = await resolveSession(db, sessionToken, now);
    expect(resolved?.session.principalType).toBe('PLATFORM_OPERATOR');
    expect(resolved?.session.tenantId).toBeUndefined();
  });

  it('returns null for an unknown token', async () => {
    expect(await resolveSession(db, 'no-such-token', now)).toBeNull();
  });

  it('returns null after the session is revoked', async () => {
    const tenant = await makeTenant('sessions-test-b', 'ACTIVE');
    const staff = await makeStaff(tenant.id, 'x@sessions-test.invalid');
    const { sessionToken } = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staff.id,
      tenantId: tenant.id,
      sessionVersion: staff.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const resolved = await resolveSession(db, sessionToken, now);
    expect(resolved).not.toBeNull();
    await revokeSession(db, resolved!.sessionId, now);
    expect(await resolveSession(db, sessionToken, now)).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const tenant = await makeTenant('sessions-test-c', 'ACTIVE');
    const staff = await makeStaff(tenant.id, 'y@sessions-test.invalid');
    const { sessionToken } = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staff.id,
      tenantId: tenant.id,
      sessionVersion: staff.sessionVersion,
      ttlSeconds: 60,
      now,
    });
    const later = () => new Date('2026-06-01T12:05:00Z');
    expect(await resolveSession(db, sessionToken, later)).toBeNull();
  });

  it('returns null when the account sessionVersion was bumped', async () => {
    const tenant = await makeTenant('sessions-test-d', 'ACTIVE');
    const staff = await makeStaff(tenant.id, 'z@sessions-test.invalid');
    const { sessionToken } = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staff.id,
      tenantId: tenant.id,
      sessionVersion: staff.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    expect(await resolveSession(db, sessionToken, now)).not.toBeNull();
    await db.staffAccount.update({ where: { id: staff.id }, data: { sessionVersion: staff.sessionVersion + 1 } });
    expect(await resolveSession(db, sessionToken, now)).toBeNull();
  });

  it('returns null when the tenant is suspended, but allows an owner while PENDING_APPROVAL', async () => {
    const suspended = await makeTenant('sessions-test-e', 'SUSPENDED');
    const suspendedStaff = await makeStaff(suspended.id, 's@sessions-test.invalid', 'CARE_COORDINATOR');
    const s1 = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: suspendedStaff.id,
      tenantId: suspended.id,
      sessionVersion: suspendedStaff.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    expect(await resolveSession(db, s1.sessionToken, now)).toBeNull();

    const pending = await makeTenant('sessions-test-f', 'PENDING_APPROVAL');
    const pendingOwner = await makeStaff(pending.id, 'p@sessions-test.invalid', 'AGENCY_OWNER');
    const s2 = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: pendingOwner.id,
      tenantId: pending.id,
      sessionVersion: pendingOwner.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const resolvedPending = await resolveSession(db, s2.sessionToken, now);
    expect(resolvedPending?.session).toMatchObject({
      principalType: 'AGENCY_STAFF',
      tenantId: pending.id,
    });

    // Non-owner staff on a pending tenant is denied.
    const pendingCoord = await makeStaff(pending.id, 'pc@sessions-test.invalid', 'CARE_COORDINATOR');
    const s3 = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: pendingCoord.id,
      tenantId: pending.id,
      sessionVersion: pendingCoord.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    expect(await resolveSession(db, s3.sessionToken, now)).toBeNull();
  });

  it('returns null for a suspended account and a mismatched tenant binding', async () => {
    const tenant = await makeTenant('sessions-test-g', 'ACTIVE');
    const other = await makeTenant('sessions-test-g2', 'ACTIVE');
    const staff = await makeStaff(tenant.id, 'm@sessions-test.invalid');

    // Session row claiming a different tenant than the account's real tenant.
    const forged = await db.authSession.create({
      data: {
        principalType: 'AGENCY_STAFF',
        principalId: staff.id,
        tenantId: other.id,
        secretHash: 'forged-' + randomUUID(),
        csrfTokenHash: 'x',
        sessionVersion: staff.sessionVersion,
        expiresAt: new Date('2026-06-01T13:00:00Z'),
      },
    });
    expect(await resolveSession(db, forged.secretHash, now)).toBeNull();

    await db.staffAccount.update({ where: { id: staff.id }, data: { status: 'SUSPENDED' } });
    const s = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staff.id,
      tenantId: tenant.id,
      sessionVersion: staff.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    expect(await resolveSession(db, s.sessionToken, now)).toBeNull();
  });

  it('revokeAllSessionsForTenant kills every live session of that tenant only', async () => {
    const tenantA = await makeTenant('sessions-test-h', 'ACTIVE');
    const tenantB = await makeTenant('sessions-test-h2', 'ACTIVE');
    const staffA = await makeStaff(tenantA.id, 'ra@sessions-test.invalid');
    const staffB = await makeStaff(tenantB.id, 'rb@sessions-test.invalid');
    const sa = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staffA.id,
      tenantId: tenantA.id,
      sessionVersion: staffA.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const sb = await createSession(db, {
      principalType: 'AGENCY_STAFF',
      principalId: staffB.id,
      tenantId: tenantB.id,
      sessionVersion: staffB.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    await revokeAllSessionsForTenant(db, tenantA.id, now);
    expect(await resolveSession(db, sa.sessionToken, now)).toBeNull();
    expect(await resolveSession(db, sb.sessionToken, now)).not.toBeNull();
  });

  it('resolves customer sessions with their tenant binding', async () => {
    const tenant = await makeTenant('sessions-test-i', 'ACTIVE');
    const customer = await db.customerAccount.create({
      data: {
        tenantId: tenant.id,
        emailNormalized: 'cust@sessions-test.invalid',
        passwordHash: syntheticPassword,
        status: 'ACTIVE',
        emailVerifiedAt: now(),
      },
    });
    const { sessionToken } = await createSession(db, {
      principalType: 'AGENCY_CUSTOMER',
      principalId: customer.id,
      tenantId: tenant.id,
      sessionVersion: customer.sessionVersion,
      ttlSeconds: 3600,
      now,
    });
    const resolved = await resolveSession(db, sessionToken, now);
    expect(resolved?.session.principalType).toBe('AGENCY_CUSTOMER');
    expect(resolved?.customer?.tenantId).toBe(tenant.id);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });
});
