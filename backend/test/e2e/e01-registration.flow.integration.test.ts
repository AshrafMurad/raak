/**
 * E01 (Sprint 1 slice): register agency -> verify owner email -> pending owner
 * login -> platform operator activation -> owner session observes ACTIVE.
 * Brand/service configuration and portal publication complete in Sprint 2.
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

describe.skipIf(!hasDatabase)('E01 agency registration (Sprint 1 slice)', () => {
  let db: DatabaseClient;
  let app: Express;
  const slug = 'e01-' + Date.now().toString(36);
  const ownerEmail = `owner@${slug}.invalid`;
  const operatorEmail = `operator@${slug}.invalid`;
  const password = 'Synthetic-E01-1!';
  let tenantId = '';
  let operatorId = '';

  beforeAll(async () => {
    db = getPrisma();
    const env = {
      ...loadApiEnv({} as NodeJS.ProcessEnv),
      BASE_DOMAIN: 'localhost',
      PLATFORM_HOST: 'platform.localhost',
      trustProxyTokens: [],
    } as AppEnv;
    app = buildApp({
      env,
      logger: silentLogger,
      health: { checkDatabase: async () => true },
      now: () => new Date(),
      db,
    });
    const operator = await db.platformOperator.create({
      data: {
        emailNormalized: operatorEmail,
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    operatorId = operator.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await db.authSession.deleteMany({ where: { OR: [{ tenantId }, { principalId: operatorId }] } });
      await db.emailToken.deleteMany({ where: { tenantId } });
      await db.staffInvitation.deleteMany({ where: { tenantId } });
      await db.outboxEvent.deleteMany({ where: { tenantId } });
      await db.auditEvent.deleteMany({ where: { tenantId } });
      await db.staffAccount.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await db.platformOperator.deleteMany({ where: { id: operatorId } });
    await disconnectPrisma();
  });

  it('completes register -> verify -> pending -> activate -> active', async () => {
    const registration = await request(app)
      .post('/v1/agencies/register')
      .set('Host', 'platform.localhost')
      .send({
        slug,
        legalName: 'E01 Synthetic Home Care',
        displayName: 'E01 Synthetic',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: `support@${slug}.invalid`,
        ownerEmail,
        ownerPassword: password,
      });
    expect(registration.status).toBe(201);
    expect(registration.body.data.status).toBe('PENDING_APPROVAL');
    tenantId = registration.body.data.tenantId as string;

    const owner = await db.staffAccount.findUnique({
      where: { tenantId_emailNormalized: { tenantId, emailNormalized: ownerEmail } },
    });
    const verificationEmail = await db.outboxEvent.findFirst({
      where: { aggregateId: owner!.id, eventType: 'email.owner_verification' },
    });
    const link = (verificationEmail!.payloadMinimal as { link: string }).link;
    const actionUrl = new URL(link);
    expect(actionUrl.searchParams.has('token')).toBe(false);
    const token = new URLSearchParams(actionUrl.hash.slice(1)).get('token');
    expect(token).toBeTruthy();

    const verification = await request(app)
      .post('/v1/auth/verify-email')
      .set('Host', 'platform.localhost')
      .send({ token });
    expect(verification.status).toBe(200);

    const ownerLogin = await request(app)
      .post('/v1/auth/login')
      .set('Host', `${slug}.localhost`)
      .send({ email: ownerEmail, password });
    expect(ownerLogin.status).toBe(200);
    expect(ownerLogin.body.data.tenant.status).toBe('PENDING_APPROVAL');
    const ownerCookie = ((ownerLogin.headers['set-cookie'] ?? []) as unknown as string[])
      .find((value) => value.startsWith('raak_session_agency='))
      ?.split(';')[0];

    const operatorLogin = await request(app)
      .post('/v1/auth/login')
      .set('Host', 'platform.localhost')
      .send({ email: operatorEmail, password });
    expect(operatorLogin.status).toBe(200);
    const operatorCookies = (operatorLogin.headers['set-cookie'] ?? []) as unknown as string[];
    const operatorSession = operatorCookies.find((value) => value.startsWith('raak_session_platform='))?.split(';')[0];
    const csrf = operatorLogin.body.data.csrfToken as string;

    const activation = await request(app)
      .post(`/v1/platform/tenants/${tenantId}/activate`)
      .set('Host', 'platform.localhost')
      .set('Cookie', `${operatorSession}; raak_csrf_platform=${csrf}`)
      .set('X-CSRF-Token', csrf)
      .send({ reason: 'E01 synthetic activation' });
    expect(activation.status).toBe(200);
    expect(activation.body.data.status).toBe('ACTIVE');

    const ownerMe = await request(app)
      .get('/v1/auth/me')
      .set('Host', `${slug}.localhost`)
      .set('Cookie', ownerCookie!);
    expect(ownerMe.status).toBe(200);
    expect(ownerMe.body.data.tenant.status).toBe('ACTIVE');
  });
});
