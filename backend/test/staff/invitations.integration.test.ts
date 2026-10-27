/**
 * Integration: staff invitations (docs 05 registration/invitation; docs 07).
 * Owner/Admin only, tenant ACTIVE, hashed single-use token, 48h expiry,
 * account bound to the invitation's tenant (I06 + wrong-tenant matrix).
 */
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma, disconnectPrisma, type DatabaseClient } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { createLogger, type Logger } from '../../src/logger';
import { loadApiEnv, type AppEnv } from '../../src/config/env';
import { hashPassword } from '../../src/modules/auth/crypto';
import type { StaffRole } from '../../src/db/generated/prisma/client';

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const silentLogger: Logger = createLogger({ service: 'test', write: () => {} });
const PASSWORD = 'Synthetic-Test-1!';

function makeApp(now: () => Date = () => new Date()): Express {
  const env = {
    ...loadApiEnv({} as NodeJS.ProcessEnv),
    BASE_DOMAIN: 'localhost',
    PLATFORM_HOST: 'platform.localhost',
    trustProxyTokens: [],
  } as AppEnv;
  return buildApp({
    env,
    logger: silentLogger,
    health: { checkDatabase: async () => true },
    now,
    db: getPrisma(),
  });
}

describe.skipIf(!hasDatabase)('staff invitations', () => {
  let db: DatabaseClient;
  let app: Express;
  const slugA = 'inv-a-' + Date.now().toString(36);
  const slugB = 'inv-b-' + Date.now().toString(36);
  const ids: { tenantA?: string; tenantB?: string; owner?: string; admin?: string; coord?: string; caregiver?: string } = {};
  let ownerCookies: { session: string; csrf: string };
  let adminCookies: { session: string; csrf: string };
  let coordCookies: { session: string; csrf: string };
  let caregiverCookies: { session: string; csrf: string };

  beforeAll(async () => {
    db = getPrisma();
    app = makeApp();
    const passwordHash = await hashPassword(PASSWORD);

    const tenantA = await db.tenant.create({
      data: { slug: slugA, legalName: 'INV A', displayName: 'A', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: `s@${slugA}.invalid` },
    });
    const tenantB = await db.tenant.create({
      data: { slug: slugB, legalName: 'INV B', displayName: 'B', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: `s@${slugB}.invalid` },
    });
    ids.tenantA = tenantA.id;
    ids.tenantB = tenantB.id;

    async function makeStaff(role: StaffRole, email: string, tenantId: string) {
      return db.staffAccount.create({
        data: { tenantId, emailNormalized: email, passwordHash, role, status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
    }
    ids.owner = (await makeStaff('AGENCY_OWNER', `owner@${slugA}.invalid`, tenantA.id)).id;
    ids.admin = (await makeStaff('AGENCY_ADMIN', `admin@${slugA}.invalid`, tenantA.id)).id;
    ids.coord = (await makeStaff('CARE_COORDINATOR', `coord@${slugA}.invalid`, tenantA.id)).id;
    ids.caregiver = (await makeStaff('CAREGIVER', `cg@${slugA}.invalid`, tenantA.id)).id;

    const { createSession } = await import('../../src/modules/auth/session.service');
    async function loginAs(staffId: string) {
      const s = await createSession(db, { principalType: 'AGENCY_STAFF', principalId: staffId, tenantId: tenantA.id, sessionVersion: 0, ttlSeconds: 3600 });
      return { session: s.sessionToken, csrf: s.csrfToken };
    }
    ownerCookies = await loginAs(ids.owner!);
    adminCookies = await loginAs(ids.admin!);
    coordCookies = await loginAs(ids.coord!);
    caregiverCookies = await loginAs(ids.caregiver!);
  });

  function postInvite(cookies: { session: string; csrf: string }, body: Record<string, unknown>) {
    return request(app)
      .post('/v1/staff/invitations')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${cookies.session}; raak_csrf_agency=${cookies.csrf}`)
      .set('X-CSRF-Token', cookies.csrf)
      .send(body);
  }

  async function latestInvitationToken(email: string): Promise<string> {
    const invite = await db.staffInvitation.findFirst({
      where: { emailNormalized: email },
      orderBy: { createdAt: 'desc' },
    });
    expect(invite).not.toBeNull();
    const event = await db.outboxEvent.findFirst({
      where: { aggregateId: invite!.id, eventType: 'email.staff_invitation' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).not.toBeNull();
    const payload = event!.payloadMinimal as { link?: string };
    return payload.link!.match(/token=([A-Za-z0-9_-]+)/)![1]!;
  }

  afterAll(async () => {
    for (const tenantId of [ids.tenantA, ids.tenantB]) {
      if (!tenantId) continue;
      await db.authSession.deleteMany({ where: { tenantId } });
      await db.emailToken.deleteMany({ where: { tenantId } });
      await db.staffInvitation.deleteMany({ where: { tenantId } });
      await db.outboxEvent.deleteMany({ where: { tenantId } });
      await db.auditEvent.deleteMany({ where: { tenantId } });
      await db.caregiver.deleteMany({ where: { tenantId } });
      await db.staffAccount.deleteMany({ where: { tenantId } });
      await db.tenant.delete({ where: { id: tenantId } });
    }
    await disconnectPrisma();
  });

  it('owner and admin can create invitations; coordinator and caregiver cannot', async () => {
    const owner = await postInvite(ownerCookies, { email: `nurse1@${slugA}.invalid`, role: 'CAREGIVER', caregiverProfile: { name: 'سلمى أحمد', professionalCategory: 'NURSE' } });
    expect(owner.status).toBe(201);
    expect(typeof owner.body.data.invitationId).toBe('string');
    expect(owner.body.data.expiresAt).toBeDefined();

    const admin = await postInvite(adminCookies, { email: `coord2@${slugA}.invalid`, role: 'CARE_COORDINATOR' });
    expect(admin.status).toBe(201);

    const coord = await postInvite(coordCookies, { email: `x@${slugA}.invalid`, role: 'CAREGIVER' });
    expect(coord.status).toBe(403);
    expect(coord.body.error.code).toBe('FORBIDDEN');

    const caregiver = await postInvite(caregiverCookies, { email: `y@${slugA}.invalid`, role: 'CAREGIVER' });
    expect(caregiver.status).toBe(403);
  });

  it('requires a valid CSRF token', async () => {
    const res = await request(app)
      .post('/v1/staff/invitations')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${ownerCookies.session}`)
      .send({ email: `csrfless@${slugA}.invalid`, role: 'CAREGIVER' });
    expect(res.status).toBe(403);
  });

  it('rejects AGENCY_OWNER invitations at validation', async () => {
    const res = await postInvite(ownerCookies, { email: `owner2@${slugA}.invalid`, role: 'AGENCY_OWNER' });
    expect(res.status).toBe(422);
  });

  it('accept flow creates an ACTIVE account bound to the invitation tenant, with caregiver profile', async () => {
    const token = await latestInvitationToken(`nurse1@${slugA}.invalid`);
    const accept = await request(app)
      .post('/v1/staff/invitations/accept')
      .set('Host', 'platform.localhost')
      .send({ token, password: 'Invited-Pass-1!' });
    expect(accept.status).toBe(200);

    const account = await db.staffAccount.findUnique({
      where: { tenantId_emailNormalized: { tenantId: ids.tenantA!, emailNormalized: `nurse1@${slugA}.invalid` } },
    });
    expect(account?.status).toBe('ACTIVE');
    expect(account?.role).toBe('CAREGIVER');
    expect(account?.emailVerifiedAt).not.toBeNull();

    const caregiver = await db.caregiver.findFirst({ where: { tenantId: ids.tenantA!, staffAccountId: account!.id } });
    expect(caregiver?.name).toBe('سلمى أحمد');
    expect(caregiver?.operationalStatus).toBe('INACTIVE');

    // Login works on the invitation tenant host only.
    const loginOk = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugA}.localhost`)
      .send({ email: `nurse1@${slugA}.invalid`, password: 'Invited-Pass-1!' });
    expect(loginOk.status).toBe(200);

    const loginWrongTenant = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugB}.localhost`)
      .send({ email: `nurse1@${slugA}.invalid`, password: 'Invited-Pass-1!' });
    expect(loginWrongTenant.status).toBe(401);
  });

  it('refuses a consumed invitation token (single use)', async () => {
    const token = await latestInvitationToken(`nurse1@${slugA}.invalid`);
    const res = await request(app)
      .post('/v1/staff/invitations/accept')
      .set('Host', 'platform.localhost')
      .send({ token, password: 'Other-Pass-2!' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('I06: refuses an expired invitation token', async () => {
    const { generateToken } = await import('../../src/modules/auth/crypto');
    const gen = generateToken();
    await db.staffInvitation.create({
      data: {
        tenantId: ids.tenantA!,
        emailNormalized: `expired@${slugA}.invalid`,
        role: 'CAREGIVER',
        tokenHash: gen.tokenHash,
        expiresAt: new Date(Date.now() - 1000),
        createdByStaffId: ids.owner!,
      },
    });
    const res = await request(app)
      .post('/v1/staff/invitations/accept')
      .set('Host', 'platform.localhost')
      .send({ token: gen.token, password: 'Whatever-9!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects an invitation that expires before its atomic consumption', async () => {
    const { generateToken } = await import('../../src/modules/auth/crypto');
    const generated = generateToken();
    const beforeExpiry = new Date('2026-10-27T12:00:00.000Z');
    const afterExpiry = new Date('2026-10-27T12:00:02.000Z');
    await db.staffInvitation.create({
      data: {
        tenantId: ids.tenantA!,
        emailNormalized: `boundary@${slugA}.invalid`,
        role: 'CAREGIVER',
        tokenHash: generated.tokenHash,
        expiresAt: new Date('2026-10-27T12:00:01.000Z'),
        createdByStaffId: ids.owner!,
      },
    });
    let nowCalls = 0;
    const boundaryApp = makeApp(() => (nowCalls++ === 0 ? beforeExpiry : afterExpiry));
    const response = await request(boundaryApp)
      .post('/v1/staff/invitations/accept')
      .set('Host', 'platform.localhost')
      .send({ token: generated.token, password: 'Boundary-Pass-1!' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('does not create an invitation after concurrent suspension commits', async () => {
    let invitation!: Promise<request.Response>;
    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'SUSPENDED' } });
      invitation = Promise.resolve(
        postInvite(ownerCookies, { email: `raced@${slugA}.invalid`, role: 'CAREGIVER' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const response = await invitation;
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TENANT_INACTIVE');
    await db.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'ACTIVE' } });
  });

  it('does not accept an invitation after concurrent suspension commits', async () => {
    const email = `suspension-accept@${slugA}.invalid`;
    const issued = await postInvite(ownerCookies, { email, role: 'CARE_COORDINATOR' });
    expect(issued.status).toBe(201);
    const token = await latestInvitationToken(email);
    let acceptance!: Promise<request.Response>;
    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'SUSPENDED' } });
      acceptance = Promise.resolve(
        request(app)
          .post('/v1/staff/invitations/accept')
          .set('Host', 'platform.localhost')
          .send({ token, password: 'Suspended-Pass-1!' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const response = await acceptance;
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TENANT_INACTIVE');
    const invitation = await db.staffInvitation.findUnique({ where: { tokenHash: (await import('../../src/modules/auth/crypto')).hashToken(token) } });
    expect(invitation?.consumedAt).toBeNull();
    await db.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'ACTIVE' } });
  });

  it('maps concurrent same-email invitation acceptance to a state conflict', async () => {
    const email = `duplicate-accept@${slugA}.invalid`;
    const first = await postInvite(ownerCookies, { email, role: 'CARE_COORDINATOR' });
    const second = await postInvite(ownerCookies, { email, role: 'AGENCY_ADMIN' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const events = await db.outboxEvent.findMany({
      where: { aggregateId: { in: [first.body.data.invitationId, second.body.data.invitationId] }, eventType: 'email.staff_invitation' },
    });
    const tokens = events.map((event) => ((event.payloadMinimal as { link: string }).link.match(/token=([A-Za-z0-9_-]+)/)![1]!));
    const responses = await Promise.all(tokens.map((token) => request(app)
      .post('/v1/staff/invitations/accept')
      .set('Host', 'platform.localhost')
      .send({ token, password: 'Duplicate-Pass-1!' })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe('STATE_TRANSITION_INVALID');
  });

  it('a suspended tenant kills its sessions: invitation creation becomes unauthenticated (I15 adjacency)', async () => {
    await db.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'SUSPENDED' } });
    const res = await postInvite(ownerCookies, { email: `late@${slugA}.invalid`, role: 'CAREGIVER' });
    expect(res.status).toBe(401);
    await db.tenant.update({ where: { id: ids.tenantA! }, data: { status: 'ACTIVE' } });
    const again = await postInvite(ownerCookies, { email: `back@${slugA}.invalid`, role: 'CAREGIVER' });
    expect(again.status).toBe(201);
  });
});
