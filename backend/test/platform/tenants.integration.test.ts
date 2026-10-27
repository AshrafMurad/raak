/**
 * Integration: platform control plane (docs 07) — tenant list/detail,
 * activate/suspend with reason audit, session revocation on suspend (I15).
 * Real PostgreSQL; synthetic tenants.
 */
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma, disconnectPrisma, type DatabaseClient } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { createLogger, type Logger } from '../../src/logger';
import { loadApiEnv, type AppEnv } from '../../src/config/env';
import { hashPassword } from '../../src/modules/auth/crypto';

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const silentLogger: Logger = createLogger({ service: 'test', write: () => {} });
const PASSWORD = 'Synthetic-Test-1!';

function makeApp(): Express {
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
    now: () => new Date(),
    db: getPrisma(),
  });
}

describe.skipIf(!hasDatabase)('platform control plane', () => {
  let db: DatabaseClient;
  let app: Express;
  const slug = 'plat-' + Date.now().toString(36);
  let tenantId = '';
  const staffEmail = `coord@${slug}.invalid`;
  let operatorCookies: { session: string; csrf: string };
  let staffCookies: { session: string; csrf: string };
  let operatorId = '';

  beforeAll(async () => {
    db = getPrisma();
    app = makeApp();
    const passwordHash = await hashPassword(PASSWORD);

    const tenant = await db.tenant.create({
      data: { slug, legalName: 'PLAT', displayName: 'P', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: `s@${slug}.invalid` },
    });
    tenantId = tenant.id;
    const staff = await db.staffAccount.create({
      data: { tenantId, emailNormalized: staffEmail, passwordHash, role: 'CARE_COORDINATOR', status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const operator = await db.platformOperator.upsert({
      where: { emailNormalized: 'op@platform-routes.invalid' },
      update: { passwordHash, status: 'ACTIVE' },
      create: { emailNormalized: 'op@platform-routes.invalid', passwordHash, status: 'ACTIVE' },
    });
    operatorId = operator.id;

    const { createSession } = await import('../../src/modules/auth/session.service');
    const opSession = await createSession(db, { principalType: 'PLATFORM_OPERATOR', principalId: operator.id, sessionVersion: operator.sessionVersion, ttlSeconds: 3600 });
    operatorCookies = { session: opSession.sessionToken, csrf: opSession.csrfToken };
    const staffSession = await createSession(db, { principalType: 'AGENCY_STAFF', principalId: staff.id, tenantId, sessionVersion: staff.sessionVersion, ttlSeconds: 3600 });
    staffCookies = { session: staffSession.sessionToken, csrf: staffSession.csrfToken };
  });

  afterAll(async () => {
    await db.authSession.deleteMany({ where: { OR: [{ tenantId }, { principalId: operatorId }] } });
    await db.emailToken.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await disconnectPrisma();
  });

  function platformGet(path: string) {
    return request(app)
      .get(path)
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_platform=${operatorCookies.session}`);
  }

  function platformPost(path: string, body: Record<string, unknown>, cookies = operatorCookies) {
    return request(app)
      .post(path)
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_platform=${cookies.session}; raak_csrf_platform=${cookies.csrf}`)
      .set('X-CSRF-Token', cookies.csrf)
      .send(body);
  }

  it('lists tenants with aggregate counts and pagination', async () => {
    const res = await platformGet('/v1/platform/tenants?limit=100');
    expect(res.status).toBe(200);
    const entry = (res.body.data.items as Array<Record<string, unknown>>).find((t) => t['slug'] === slug);
    expect(entry).toBeDefined();
    expect(entry!['status']).toBe('ACTIVE');
    expect((entry!['counts'] as Record<string, number>)['staff']).toBeGreaterThanOrEqual(1);

    const limited = await platformGet('/v1/platform/tenants?limit=1');
    expect((limited.body.data.items as unknown[]).length).toBe(1);
    expect(typeof limited.body.data.nextCursor).toBe('string');
  });

  it('returns tenant detail with owner email; unknown id is a non-enumerating 404', async () => {
    const res = await platformGet(`/v1/platform/tenants/${tenantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe(slug);
    expect(typeof res.body.data.legalName).toBe('string');

    const unknown = await platformGet('/v1/platform/tenants/33333333-3333-4333-8333-333333333333');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('denies anonymous and non-platform access', async () => {
    const anon = await request(app).get('/v1/platform/tenants').set('Host', 'platform.localhost');
    expect(anon.status).toBe(401);

    const staffOnPlatform = await request(app)
      .get('/v1/platform/tenants')
      .set('Host', `${slug}.localhost`)
      .set('Cookie', `raak_session_agency=${staffCookies.session}`);
    expect(staffOnPlatform.status).toBe(404); // platform routes are not reachable on agency hosts
  });

  it('suspends the tenant, revokes sessions and blocks login (I15); reason is audited', async () => {
    const suspend = await platformPost(`/v1/platform/tenants/${tenantId}/suspend`, { reason: 'Synthetic policy test' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe('SUSPENDED');

    // Existing staff session dies immediately.
    const meAfter = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slug}.localhost`)
      .set('Cookie', `raak_session_agency=${staffCookies.session}`);
    expect(meAfter.status).toBe(401);

    // New login fails with the generic message.
    const login = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email: staffEmail, password: PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('UNAUTHENTICATED');

    const audit = await db.auditEvent.findFirst({
      where: { tenantId, action: 'tenant.suspended' },
      orderBy: { at: 'desc' },
    });
    expect(audit?.reason).toBe('Synthetic policy test');
    expect(audit?.actorId).toBe(operatorId);
  });

  it('rejects double suspend with STATE_TRANSITION_INVALID and enforces the reason', async () => {
    const again = await platformPost(`/v1/platform/tenants/${tenantId}/suspend`, { reason: 'again' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('STATE_TRANSITION_INVALID');

    const noReason = await request(app)
      .post(`/v1/platform/tenants/${tenantId}/suspend`)
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_platform=${operatorCookies.session}; raak_csrf_platform=${operatorCookies.csrf}`)
      .set('X-CSRF-Token', operatorCookies.csrf)
      .send({});
    expect(noReason.status).toBe(422);
  });

  it('re-activates the tenant; staff can log in again', async () => {
    const activate = await platformPost(`/v1/platform/tenants/${tenantId}/activate`, { reason: 'Synthetic re-approval' });
    expect(activate.status).toBe(200);
    expect(activate.body.data.status).toBe('ACTIVE');

    const login = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email: staffEmail, password: PASSWORD });
    expect(login.status).toBe(200);

    const activatedAudit = await db.auditEvent.findFirst({
      where: { tenantId, action: 'tenant.activated' },
      orderBy: { at: 'desc' },
    });
    expect(activatedAudit?.actorId).toBe(operatorId);
  });

  it('activation from ACTIVE is an invalid transition', async () => {
    const res = await platformPost(`/v1/platform/tenants/${tenantId}/activate`, { reason: 'noop' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATE_TRANSITION_INVALID');
  });

  it('exposes operator audit entries with minimal metadata', async () => {
    const res = await platformGet('/v1/platform/audit?limit=50');
    expect(res.status).toBe(200);
    const actions = (res.body.data.items as Array<Record<string, unknown>>).map((e) => e['action']);
    expect(actions).toContain('tenant.suspended');
    expect(actions).toContain('tenant.activated');
    for (const entry of res.body.data.items as Array<Record<string, unknown>>) {
      expect(JSON.stringify(entry)).not.toContain('passwordHash');
    }
  });
});
