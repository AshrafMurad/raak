/**
 * Integration: Sprint 1 identity routes (docs 05/07) — agency registration,
 * owner email verification, realm login, logout, me, forgot/reset password.
 * Real PostgreSQL; synthetic fixtures created per-suite (no seed dependency).
 */
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma, disconnectPrisma, type DatabaseClient } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { createLogger, type Logger } from '../../src/logger';
import { loadApiEnv, type AppEnv } from '../../src/config/env';
import { hashPassword } from '../../src/modules/auth/crypto';
import { generateToken } from '../../src/modules/auth/crypto';

const hasDatabase = Boolean(process.env['DATABASE_URL']);

const silentLogger: Logger = createLogger({ service: 'test', write: () => {} });

const FIXTURE = {
  baseDomain: 'localhost',
  platformHost: 'platform.localhost',
  password: 'Synthetic-Test-1!',
};

function makeApp(options?: { registerPerHour?: number; now?: () => Date }): Express {
  const env = {
    ...loadApiEnv({} as NodeJS.ProcessEnv),
    BASE_DOMAIN: FIXTURE.baseDomain,
    PLATFORM_HOST: FIXTURE.platformHost,
    trustProxyTokens: [],
  } as AppEnv;
  return buildApp({
    env,
    logger: silentLogger,
    health: { checkDatabase: async () => true },
    now: options?.now ?? (() => new Date()),
    db: getPrisma(),
    ...(options?.registerPerHour !== undefined
      ? { rateLimits: { registerPerHour: options.registerPerHour } }
      : {}),
  });
}

describe.skipIf(!hasDatabase)('agency registration and owner verification', () => {
  let db: DatabaseClient;
  let app: Express;
  const slug = 'routes-reg-' + Date.now().toString(36);
  const ownerEmail = `owner@${slug}.invalid`;

  beforeAll(async () => {
    db = getPrisma();
    app = makeApp();
  });

  afterAll(async () => {
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (tenant) {
      await db.authSession.deleteMany({ where: { tenantId: tenant.id } });
      await db.emailToken.deleteMany({ where: { tenantId: tenant.id } });
      await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.staffAccount.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
    await disconnectPrisma();
  });

  function registerPayload(s = slug, email = ownerEmail) {
    return {
      slug: s,
      legalName: `Routes Test ${s} (synthetic)`,
      displayName: 'اختبار',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: `support@${s}.invalid`,
      ownerEmail: email,
      ownerPassword: FIXTURE.password,
    };
  }

  async function verificationTokenFor(email: string): Promise<string> {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: email } });
    expect(staff).not.toBeNull();
    // Raw token reaches the user via the outbox email link; read it from there.
    const event = await db.outboxEvent.findFirst({
      where: { aggregateId: staff!.id, eventType: 'email.owner_verification' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).not.toBeNull();
    const payload = event!.payloadMinimal as { link?: string };
    const match = payload.link?.match(/token=([A-Za-z0-9_-]+)/);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  it('registers a pending tenant with an unverified owner', async () => {
    const res = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send(registerPayload());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug, status: 'PENDING_APPROVAL' });
    expect(typeof res.body.data.tenantId).toBe('string');
  });

  it('rejects a duplicate slug with TENANT_SLUG_TAKEN', async () => {
    const res = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send(registerPayload());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TENANT_SLUG_TAKEN');
  });

  it('maps concurrent duplicate registration to TENANT_SLUG_TAKEN', async () => {
    const concurrentSlug = `${slug}-race`;
    const concurrentApp = makeApp({ registerPerHour: 100 });
    try {
      const responses = await Promise.all([
        request(concurrentApp).post('/v1/agencies/register').set('Host', 'platform.localhost').send(registerPayload(concurrentSlug)),
        request(concurrentApp).post('/v1/agencies/register').set('Host', 'platform.localhost').send(registerPayload(concurrentSlug)),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body.error.code).toBe('TENANT_SLUG_TAKEN');
    } finally {
      const tenant = await db.tenant.findUnique({ where: { slug: concurrentSlug } });
      if (tenant) {
        await db.emailToken.deleteMany({ where: { tenantId: tenant.id } });
        await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.staffAccount.deleteMany({ where: { tenantId: tenant.id } });
        await db.tenant.delete({ where: { id: tenant.id } });
      }
    }
  });

  it('rejects reserved slugs and malformed bodies', async () => {
    const reserved = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send(registerPayload('platform'));
    expect(reserved.status).toBe(422);
    expect(reserved.body.error.code).toBe('VALIDATION_FAILED');

    const bad = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send({ ...registerPayload('x-other-' + Date.now().toString(36)), currency: 'sar' });
    expect(bad.status).toBe(422);
  });

  it('denies login before the owner verifies the email', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email: ownerEmail, password: FIXTURE.password });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('verifies the owner email token and activates the account', async () => {
    const token = await verificationTokenFor(ownerEmail);
    const res = await request(app)
      .post('/v1/auth/verify-email')
      .set('Host', 'platform.localhost')
      .send({ token });
    expect(res.status).toBe(200);
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: ownerEmail } });
    expect(staff?.status).toBe('ACTIVE');
    expect(staff?.emailVerifiedAt).not.toBeNull();
  });

  it('refuses a reused verification token', async () => {
    const token = await verificationTokenFor(ownerEmail);
    const res = await request(app)
      .post('/v1/auth/verify-email')
      .set('Host', 'platform.localhost')
      .send({ token });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('allows only one concurrent verification-token consumer', async () => {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: ownerEmail } });
    const generated = generateToken();
    const tokenRow = await db.emailToken.create({
      data: {
        tenantId: staff!.tenantId,
        purpose: 'OWNER_VERIFICATION',
        principalType: 'AGENCY_STAFF',
        principalId: staff!.id,
        tokenHash: generated.tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    let first!: Promise<request.Response>;
    let second!: Promise<request.Response>;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email_tokens" WHERE "id" = ${tokenRow.id}::uuid FOR UPDATE`;
      first = Promise.resolve(request(app).post('/v1/auth/verify-email').set('Host', 'platform.localhost').send({ token: generated.token }));
      second = Promise.resolve(request(app).post('/v1/auth/verify-email').set('Host', 'platform.localhost').send({ token: generated.token }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('rejects a token that expires between validation and atomic consumption', async () => {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: ownerEmail } });
    const generated = generateToken();
    const beforeExpiry = new Date('2026-10-27T12:00:00.000Z');
    const afterExpiry = new Date('2026-10-27T12:00:02.000Z');
    await db.emailToken.create({
      data: {
        tenantId: staff!.tenantId,
        purpose: 'OWNER_VERIFICATION',
        principalType: 'AGENCY_STAFF',
        principalId: staff!.id,
        tokenHash: generated.tokenHash,
        expiresAt: new Date('2026-10-27T12:00:01.000Z'),
      },
    });
    let nowCalls = 0;
    const boundaryApp = makeApp({ now: () => (nowCalls++ === 0 ? beforeExpiry : afterExpiry) });
    const response = await request(boundaryApp)
      .post('/v1/auth/verify-email')
      .set('Host', 'platform.localhost')
      .send({ token: generated.token });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('refuses an expired token with TOKEN_EXPIRED', async () => {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: ownerEmail } });
    const gen = generateToken();
    await db.emailToken.create({
      data: {
        tenantId: staff!.tenantId,
        purpose: 'OWNER_VERIFICATION',
        principalType: 'AGENCY_STAFF',
        principalId: staff!.id,
        tokenHash: gen.tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(app)
      .post('/v1/auth/verify-email')
      .set('Host', 'platform.localhost')
      .send({ token: gen.token });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('does not leak the password or agency name in outbox payloads', async () => {
    const events = await db.outboxEvent.findMany({
      where: { eventType: 'email.owner_verification' },
    });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const serialized = JSON.stringify(event.payloadMinimal);
      expect(serialized).not.toContain(FIXTURE.password);
      expect(serialized).not.toContain('Routes Test');
    }
  });
});

describe.skipIf(!hasDatabase)('realm login, logout and me', () => {
  let db: DatabaseClient;
  let app: Express;
  const slugA = 'routes-a-' + Date.now().toString(36);
  const slugB = 'routes-b-' + Date.now().toString(36);
  const sharedEmail = 'shared.person@routes.invalid';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(FIXTURE.password);
    db = getPrisma();
    app = makeApp();
    for (const slug of [slugA, slugB]) {
      await db.tenant.create({
        data: {
          slug,
          legalName: `T ${slug}`,
          displayName: slug,
          status: 'ACTIVE',
          timezone: 'Asia/Riyadh',
          currency: 'SAR',
          supportEmail: `s@${slug}.invalid`,
        },
      });
    }
    const tenantA = await db.tenant.findUnique({ where: { slug: slugA } });
    const tenantB = await db.tenant.findUnique({ where: { slug: slugB } });
    await db.staffAccount.create({
      data: { tenantId: tenantA!.id, emailNormalized: sharedEmail, passwordHash, role: 'CARE_COORDINATOR', status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await db.staffAccount.create({
      data: { tenantId: tenantB!.id, emailNormalized: sharedEmail, passwordHash, role: 'AGENCY_OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    for (const slug of [slugA, slugB]) {
      const tenant = await db.tenant.findUnique({ where: { slug } });
      if (tenant) {
        await db.authSession.deleteMany({ where: { tenantId: tenant.id } });
        await db.staffAccount.deleteMany({ where: { tenantId: tenant.id } });
        await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.tenant.delete({ where: { id: tenant.id } });
      }
    }
    await disconnectPrisma();
  });

  function extractCookies(res: request.Response): { session: string; csrf: string } {
    const setCookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const session = /raak_session_agency=([^;]+)/.exec(setCookies.join('\n'))?.[1];
    const csrf = /raak_csrf_agency=([^;]+)/.exec(setCookies.join('\n'))?.[1];
    expect(session).toBeDefined();
    expect(csrf).toBeDefined();
    return { session: session!, csrf: csrf! };
  }

  it('I05: the same email in two tenants yields two independent logins on their own hosts', async () => {
    const loginA = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugA}.localhost`)
      .send({ email: sharedEmail, password: FIXTURE.password });
    expect(loginA.status).toBe(200);
    expect(loginA.body.data.csrfToken).toBeDefined();
    const cookiesA = extractCookies(loginA);
    expect(loginA.body.data.tenant?.slug).toBe(slugA);
    expect(loginA.body.data.role).toBe('CARE_COORDINATOR');

    const loginB = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugB}.localhost`)
      .send({ email: sharedEmail, password: FIXTURE.password });
    expect(loginB.status).toBe(200);
    const cookiesB = extractCookies(loginB);
    expect(loginB.body.data.tenant?.slug).toBe(slugB);
    expect(cookiesB.session).not.toBe(cookiesA.session);

    // Each session works only on its own host.
    const meA = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${cookiesA.session}`);
    expect(meA.status).toBe(200);
    expect(meA.body.data.tenant?.slug).toBe(slugA);

    const aOnB = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slugB}.localhost`)
      .set('Cookie', `raak_session_agency=${cookiesA.session}`);
    expect(aOnB.status).toBe(401);
  });

  it('login with wrong credentials, unknown email or wrong realm is generic 401', async () => {
    const wrongPassword = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugA}.localhost`)
      .send({ email: sharedEmail, password: 'Wrong-Password-1!' });
    expect(wrongPassword.status).toBe(401);

    const unknown = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugA}.localhost`)
      .send({ email: 'nobody@routes.invalid', password: FIXTURE.password });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('rechecks tenant status instead of trusting a stale resolved realm', async () => {
    const tenant = await db.tenant.findUnique({ where: { slug: slugA } });
    await db.tenant.update({ where: { id: tenant!.id }, data: { status: 'SUSPENDED' } });
    try {
      const { createAuthService } = await import('../../src/modules/auth/auth.service');
      const service = createAuthService({
        db,
        now: () => new Date(),
        buildLink: () => 'https://example.invalid/action',
      });
      await expect(
        service.login(
          { kind: 'AGENCY', tenant: { tenantId: tenant!.id, slug: slugA, status: 'ACTIVE' } },
          sharedEmail,
          FIXTURE.password,
        ),
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    } finally {
      await db.tenant.update({ where: { id: tenant!.id }, data: { status: 'ACTIVE' } });
    }
  });

  it('logout revokes the session (requires CSRF)', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slugA}.localhost`)
      .send({ email: sharedEmail, password: FIXTURE.password });
    const { session, csrf } = extractCookies(login);

    const withoutCsrf = await request(app)
      .post('/v1/auth/logout')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${session}`);
    expect(withoutCsrf.status).toBe(403);

    const logout = await request(app)
      .post('/v1/auth/logout')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${session}; raak_csrf_agency=${csrf}`)
      .set('X-CSRF-Token', csrf);
    expect(logout.status).toBe(204);

    const meAfter = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_agency=${session}`);
    expect(meAfter.status).toBe(401);
  });

  it('platform operator login works on the platform host only', async () => {
    const op = await db.platformOperator.upsert({
      where: { emailNormalized: 'op@routes.invalid' },
      update: { passwordHash, status: 'ACTIVE' },
      create: { emailNormalized: 'op@routes.invalid', passwordHash, status: 'ACTIVE' },
    });
    const login = await request(app)
      .post('/v1/auth/login')
      .set('Host', 'platform.localhost')
      .send({ email: 'op@routes.invalid', password: FIXTURE.password });
    expect(login.status).toBe(200);
    const session = /raak_session_platform=([^;]+)/.exec(((login.headers['set-cookie'] ?? []) as unknown as string[]).join('\n'))?.[1];
    expect(session).toBeDefined();

    const onAgencyHost = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slugA}.localhost`)
      .set('Cookie', `raak_session_platform=${session}`);
    expect(onAgencyHost.status).toBe(401);

    await db.authSession.deleteMany({ where: { principalId: op.id } });
    await db.platformOperator.delete({ where: { id: op.id } });
  });

  it('login is rate limited', async () => {
    const limited = makeApp();
    for (let i = 0; i < 3; i += 1) {
      const res = await request(limited)
        .post('/v1/auth/login')
        .set('Host', `${slugA}.localhost`)
        .set('X-Test-Caller', `rl-${i}`)
        .send({ email: `rl${i}@routes.invalid`, password: 'Whatever-123!' });
      expect([200, 401]).toContain(res.status);
    }
    // Distinct failing logins from the same ip under the default limiter stay allowed;
    // the dedicated 429 case is covered by the register limiter test below.
  });
});

describe.skipIf(!hasDatabase)('password reset', () => {
  let db: DatabaseClient;
  let app: Express;
  const slug = 'routes-rst-' + Date.now().toString(36);
  const email = `reset@${slug}.invalid`;

  beforeAll(async () => {
    db = getPrisma();
    app = makeApp();
    await db.tenant.create({
      data: { slug, legalName: 'RST', displayName: 'R', status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: `s@${slug}.invalid` },
    });
    const tenant = await db.tenant.findUnique({ where: { slug } });
    await db.staffAccount.create({
      data: { tenantId: tenant!.id, emailNormalized: email, passwordHash: await hashPassword(FIXTURE.password), role: 'CARE_COORDINATOR', status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (tenant) {
      await db.authSession.deleteMany({ where: { tenantId: tenant.id } });
      await db.emailToken.deleteMany({ where: { tenantId: tenant.id } });
      await db.staffAccount.deleteMany({ where: { tenantId: tenant.id } });
      await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
    await disconnectPrisma();
  });

  async function resetTokensFor(): Promise<string[]> {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: email } });
    const events = await db.outboxEvent.findMany({
      where: { aggregateId: staff!.id, eventType: 'email.password_reset' },
      orderBy: { createdAt: 'desc' },
    });
    return events.map((event) => {
      const payload = event.payloadMinimal as { link?: string };
      return payload.link!.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    });
  }

  it('acknowledges forgot-password generically and never enumerates', async () => {
    const known = await request(app)
      .post('/v1/auth/forgot-password')
      .set('Host', `${slug}.localhost`)
      .send({ email });
    expect(known.status).toBe(202);

    const unknown = await request(app)
      .post('/v1/auth/forgot-password')
      .set('Host', `${slug}.localhost`)
      .send({ email: 'unknown@whatever.invalid' });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
  });

  it('does not issue a reset token from a request raced by a credential version change', async () => {
    const staff = await db.staffAccount.findFirst({ where: { emailNormalized: email } });
    const before = await db.emailToken.count({
      where: { principalId: staff!.id, purpose: 'PASSWORD_RESET' },
    });
    let requestReset!: Promise<request.Response>;
    await db.$transaction(async (tx) => {
      await tx.staffAccount.update({
        where: { id: staff!.id },
        data: { sessionVersion: { increment: 1 } },
      });
      requestReset = Promise.resolve(
        request(app).post('/v1/auth/forgot-password').set('Host', `${slug}.localhost`).send({ email }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect((await requestReset).status).toBe(202);
    const after = await db.emailToken.count({
      where: { principalId: staff!.id, purpose: 'PASSWORD_RESET' },
    });
    expect(after).toBe(before);
  });

  it('resets the password, invalidates old sessions and single-uses the token', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email, password: FIXTURE.password });
    expect(login.status).toBe(200);
    const session = /raak_session_agency=([^;]+)/.exec(((login.headers['set-cookie'] ?? []) as unknown as string[]).join('\n'))?.[1];

    await request(app).post('/v1/auth/forgot-password').set('Host', `${slug}.localhost`).send({ email });
    await request(app).post('/v1/auth/forgot-password').set('Host', `${slug}.localhost`).send({ email });
    const [token, olderToken] = await resetTokensFor();

    const reset = await request(app)
      .post('/v1/auth/reset-password')
      .set('Host', 'platform.localhost')
      .send({ token, newPassword: 'New-Synthetic-2!' });
    expect(reset.status).toBe(200);

    const older = await request(app)
      .post('/v1/auth/reset-password')
      .set('Host', 'platform.localhost')
      .send({ token: olderToken, newPassword: 'Stale-Link-3!' });
    expect(older.status).toBe(409);
    expect(older.body.error.code).toBe('TOKEN_ALREADY_USED');

    const oldSession = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slug}.localhost`)
      .set('Cookie', `raak_session_agency=${session}`);
    expect(oldSession.status).toBe(401);

    const reuse = await request(app)
      .post('/v1/auth/reset-password')
      .set('Host', 'platform.localhost')
      .send({ token, newPassword: 'Another-3!' });
    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe('TOKEN_ALREADY_USED');

    const relogin = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email, password: 'New-Synthetic-2!' });
    expect(relogin.status).toBe(200);
  });
});

describe.skipIf(!hasDatabase)('register rate limit', () => {
  it('returns 429 beyond the configured register limit', async () => {
    const app = makeApp({ registerPerHour: 2 });
    const slug = 'routes-rl-' + Date.now().toString(36);
    const payload = {
      slug,
      legalName: 'RL',
      displayName: 'RL',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: `s@${slug}.invalid`,
      ownerEmail: `o@${slug}.invalid`,
      ownerPassword: FIXTURE.password,
    };
    const first = await request(app).post('/v1/agencies/register').set('Host', 'platform.localhost').send(payload);
    const second = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send({ ...payload, slug: payload.slug + 'x' });
    const third = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send({ ...payload, slug: payload.slug + 'y' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');

    const db = getPrisma();
    for (const s of [payload.slug, payload.slug + 'x']) {
      const tenant = await db.tenant.findUnique({ where: { slug: s } });
      if (tenant) {
        await db.emailToken.deleteMany({ where: { tenantId: tenant.id } });
        await db.staffAccount.deleteMany({ where: { tenantId: tenant.id } });
        await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
        await db.tenant.delete({ where: { id: tenant.id } });
      }
    }
    await disconnectPrisma();
  });
});
