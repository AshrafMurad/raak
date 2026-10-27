/**
 * Integration: host realm resolver, session guard, CSRF and permission gate
 * (docs 05 enforcement rules). Real PostgreSQL; synthetic tenants only.
 * Host-header spoofing, cross-realm cookies and CSRF matrix are exercised
 * through a minimal guarded router.
 */
import type { Express } from 'express';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma, disconnectPrisma, type DatabaseClient } from '../../src/db/client';
import { createSession } from '../../src/modules/auth/session.service';
import { createHostResolver } from '../../src/modules/auth/host-resolver';
import {
  requireHostRealm,
  requireSession,
  requireCsrf,
  requirePermission,
} from '../../src/modules/auth/guards';
import { hashPassword } from '../../src/modules/auth/crypto';

const hasDatabase = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDatabase)('auth guards', () => {
  let db: DatabaseClient;
  let app: Express;
  let tenantA: { id: string; slug: string };
  let tenantB: { id: string; slug: string };
  let staffCookieA: { session: string; csrf: string };
  let caregiverCookieA: { session: string; csrf: string };
  let operatorCookie: { session: string; csrf: string; principalId: string };

  beforeAll(async () => {
    db = getPrisma();
    const hash = await hashPassword('Synthetic-Test-1!');

    tenantA = await db.tenant.create({ data: { slug: 'guards-a', legalName: 'A', displayName: 'أ', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 's@ga.invalid' } });
    tenantB = await db.tenant.create({ data: { slug: 'guards-b', legalName: 'B', displayName: 'ب', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 's@gb.invalid' } });

    const owner = await db.staffAccount.create({ data: { tenantId: tenantA.id, emailNormalized: 'owner@guards-a.invalid', passwordHash: hash, role: 'AGENCY_OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const caregiver = await db.staffAccount.create({ data: { tenantId: tenantA.id, emailNormalized: 'cg@guards-a.invalid', passwordHash: hash, role: 'CAREGIVER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const operator = await db.platformOperator.create({ data: { emailNormalized: 'op@guards.invalid', passwordHash: hash, status: 'ACTIVE' } });

    const s1 = await createSession(db, { principalType: 'AGENCY_STAFF', principalId: owner.id, tenantId: tenantA.id, sessionVersion: owner.sessionVersion, ttlSeconds: 3600 });
    staffCookieA = { session: s1.sessionToken, csrf: s1.csrfToken };
    const s2 = await createSession(db, { principalType: 'AGENCY_STAFF', principalId: caregiver.id, tenantId: tenantA.id, sessionVersion: caregiver.sessionVersion, ttlSeconds: 3600 });
    caregiverCookieA = { session: s2.sessionToken, csrf: s2.csrfToken };
    const s3 = await createSession(db, { principalType: 'PLATFORM_OPERATOR', principalId: operator.id, sessionVersion: operator.sessionVersion, ttlSeconds: 3600 });
    operatorCookie = { session: s3.sessionToken, csrf: s3.csrfToken, principalId: operator.id };

    const hostResolver = createHostResolver(db, { baseDomain: 'localhost', platformHost: 'platform.localhost' });
    const sessionScoped = [requireHostRealm(hostResolver), requireSession(db), requireCsrf()];
    app = express();
    app.use(express.json());
    app.use('/v1/me', ...sessionScoped.slice(0, 2), (req, res) => res.json({ data: { ok: true } }));
    app.use('/v1/invite', requireHostRealm(hostResolver), requireSession(db), requireCsrf(), requirePermission('staff.invitations.create'), (req, res) => res.status(201).json({ data: { ok: true } }));
    app.use('/v1/platform', requireHostRealm(hostResolver), requireSession(db), requireCsrf(), requirePermission('platform.tenants.read'), (req, res) => res.json({ data: { ok: true } }));
  });

  it('rejects unknown hosts with a non-enumerating 404', async () => {
    const res = await request(app).get('/v1/me').set('Host', 'no-such-tenant.localhost');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects the bare base domain and foreign hosts', async () => {
    expect((await request(app).get('/v1/me').set('Host', 'localhost')).status).toBe(404);
    expect((await request(app).get('/v1/me').set('Host', 'evil.example.com')).status).toBe(404);
  });

  it('resolves a tenant slug host and authenticates its staff session', async () => {
    const res = await request(app)
      .get('/v1/me')
      .set('Host', 'guards-a.localhost')
      .set('Cookie', `raak_session_agency=${staffCookieA.session}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('ignores a spoofed X-Tenant-ID header', async () => {
    const res = await request(app)
      .get('/v1/me')
      .set('Host', 'guards-a.localhost')
      .set('X-Tenant-ID', tenantB.id)
      .set('Cookie', `raak_session_agency=${staffCookieA.session}`);
    expect(res.status).toBe(200);
  });

  it('denies a tenant A session on tenant B host (cross-tenant cookie)', async () => {
    const res = await request(app)
      .get('/v1/me')
      .set('Host', 'guards-b.localhost')
      .set('Cookie', `raak_session_agency=${staffCookieA.session}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('denies an agency session on the platform host and vice versa', async () => {
    const staffOnPlatform = await request(app)
      .get('/v1/platform/tenants')
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_agency=${staffCookieA.session}`);
    expect(staffOnPlatform.status).toBe(401);

    const operatorOnAgency = await request(app)
      .get('/v1/me')
      .set('Host', 'guards-a.localhost')
      .set('Cookie', `raak_session_platform=${operatorCookie.session}`);
    expect(operatorOnAgency.status).toBe(401);
  });

  it('rejects mutations without or with a wrong CSRF token, accepts the right one', async () => {
    const host = 'guards-a.localhost';
    const cookie = `raak_session_agency=${staffCookieA.session}`;
    const noToken = await request(app).post('/v1/invite').set('Host', host).set('Cookie', cookie).send({});
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('FORBIDDEN');

    const wrongToken = await request(app)
      .post('/v1/invite')
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'totally-wrong-token-value')
      .send({});
    expect(wrongToken.status).toBe(403);

    const ok = await request(app)
      .post('/v1/invite')
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', staffCookieA.csrf)
      .send({});
    expect(ok.status).toBe(201);
  });

  it('allows the platform operator on platform routes and denies anonymous', async () => {
    const ok = await request(app)
      .get('/v1/platform/tenants')
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_platform=${operatorCookie.session}`);
    expect(ok.status).toBe(200);

    const anon = await request(app).get('/v1/platform/tenants').set('Host', 'platform.localhost');
    expect(anon.status).toBe(401);
  });

  it('denies caregiver role the invitation-create permission', async () => {
    const res = await request(app)
      .post('/v1/invite')
      .set('Host', 'guards-a.localhost')
      .set('Cookie', `raak_session_agency=${caregiverCookieA.session}`)
      .set('X-CSRF-Token', caregiverCookieA.csrf)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('denies platform actions to agency staff even with valid CSRF', async () => {
    const res = await request(app)
      .get('/v1/platform/tenants')
      .set('Host', 'platform.localhost')
      .set('Cookie', `raak_session_platform=${staffCookieA.session}`);
    expect(res.status).toBe(401); // agency cookie is not a platform cookie at all
  });

  afterAll(async () => {
    // Scoped cleanup only — other suites own their rows.
    await db.authSession.deleteMany({
      where: { OR: [{ tenantId: { in: [tenantA.id, tenantB.id] } }, { principalId: operatorCookie.principalId }] },
    });
    await db.staffAccount.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await db.platformOperator.deleteMany({ where: { emailNormalized: 'op@guards.invalid' } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await disconnectPrisma();
  });
});
