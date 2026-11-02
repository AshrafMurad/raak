import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { openSecret } from '../../src/modules/requesting/secrets';
import { hashPassword } from '../../src/modules/auth/crypto';
import { createSession } from '../../src/modules/auth/session.service';
import {
  deliverRequestEmail,
  type RequestEmail,
} from '../../src/modules/notifications/request-email';

const db = getPrisma();
const slug = `people-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const key = 'synthetic-people-key-at-least-32-characters';
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: key }),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
  db,
});
let tenantId: string;
let tenantB: string;
const email = 'synthetic.customer@example.invalid';
const password = 'Synthetic-password-123!';

beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: 'Synthetic People',
      displayName: 'Synthetic People',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'support@example.invalid',
    },
  });
  tenantId = tenant.id;
  tenantB = (
    await db.tenant.create({
      data: {
        slug: `${slug}-b`,
        legalName: 'Synthetic B',
        displayName: 'Synthetic B',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
});
afterAll(async () => {
  if (tenantId) {
    await db.customerCapability.deleteMany({ where: { tenantId } });
    await db.serviceRequest.deleteMany({ where: { tenantId } });
    await db.agencyService.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.emailDelivery.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.authSession.deleteMany({ where: { tenantId } });
    await db.customerAccount.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.customerCapability.deleteMany({ where: { tenantId: tenantB } });
    await db.emailDelivery.deleteMany({ where: { tenantId: tenantB } });
    await db.outboxEvent.deleteMany({ where: { tenantId: tenantB } });
    await db.auditEvent.deleteMany({ where: { tenantId: tenantB } });
    await db.authSession.deleteMany({ where: { tenantId: tenantB } });
    await db.customerAccount.deleteMany({ where: { tenantId: tenantB } });
    await db.tenant.delete({ where: { id: tenantB } });
  }
  await db.$disconnect();
});

it('selects the customer audience explicitly when a staff identity shares the same tenant email', async () => {
  const sharedEmail = 'synthetic.shared.realm@example.invalid';
  await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: sharedEmail,
      passwordHash: await hashPassword(password),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'CARE_COORDINATOR',
    },
  });
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/register')
        .set('Host', host)
        .send({ email: sharedEmail, password, locale: 'en' })
    ).status,
  ).toBe(202);
  const capability = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, customer: { emailNormalized: sharedEmail }, purpose: 'VERIFY_EMAIL' },
  });
  const token = openSecret(capability.encryptedSecret!, key, `${tenantId}:${capability.id}`);
  expect(
    (await request(app).post('/v1/portal/accounts/verify-email').set('Host', host).send({ token }))
      .status,
  ).toBe(200);
  const customerLogin = await request(app)
    .post('/v1/portal/accounts/login')
    .set('Host', host)
    .send({ email: sharedEmail, password });
  expect(customerLogin.status).toBe(200);
  expect(customerLogin.body.data.principalType).toBe('AGENCY_CUSTOMER');
  expect(customerLogin.body.data.role).toBeUndefined();
  const cookie = String(customerLogin.headers['set-cookie']![0]).split(';')[0]!;
  expect(
    (await request(app).get('/v1/agency/patients').set('Host', host).set('Cookie', cookie)).status,
  ).toBe(403);
  const staffLogin = await request(app)
    .post('/v1/auth/login')
    .set('Host', host)
    .send({ email: sharedEmail, password });
  expect(staffLogin.body.data.principalType).toBe('AGENCY_STAFF');
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/claim-link')
        .set('Host', host)
        .set('Cookie', String(staffLogin.headers['set-cookie']![0]).split(';')[0]!)
        .set('X-CSRF-Token', staffLogin.body.data.csrfToken)
        .send({ reference: 'REQ-SYNTHETIC', locale: 'en' })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/login')
        .set('Host', 'platform.localhost')
        .send({ email: sharedEmail, password })
    ).status,
  ).toBe(401);
  const otherHost = `${slug}-b.localhost`;
  await request(app)
    .post('/v1/portal/accounts/register')
    .set('Host', otherHost)
    .send({ email: sharedEmail, password, locale: 'en' });
  const other = await db.customerCapability.findFirstOrThrow({
    where: { tenantId: tenantB, purpose: 'VERIFY_EMAIL' },
  });
  const otherToken = openSecret(other.encryptedSecret!, key, `${tenantB}:${other.id}`);
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/verify-email')
        .set('Host', host)
        .send({ token: otherToken })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/verify-email')
        .set('Host', otherHost)
        .send({ token: otherToken })
    ).status,
  ).toBe(200);
  const otherLogin = await request(app)
    .post('/v1/portal/accounts/login')
    .set('Host', otherHost)
    .send({ email: sharedEmail, password });
  expect(otherLogin.body.data.principalType).toBe('AGENCY_CUSTOMER');
  expect(
    (
      await request(app)
        .get('/v1/portal/my/patients')
        .set('Host', host)
        .set('Cookie', String(otherLogin.headers['set-cookie']![0]).split(';')[0]!)
    ).status,
  ).toBe(401);
});

it('requires a fresh customer-bound claim token; refuses wrong resource, replay and concurrent reuse', async () => {
  const claimEmail = 'synthetic.claim@example.invalid';
  const customer = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: claimEmail,
      passwordHash: await hashPassword(password),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const service = await db.agencyService.create({
    data: { tenantId, slug: 'synthetic', config: {} },
  });
  const prior = await db.serviceRequest.create({
    data: {
      tenantId,
      agencyServiceId: service.id,
      reference: `REQ-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      payloadHash: 'synthetic',
      requesterName: 'Synthetic requester',
      requesterEmailNormalized: claimEmail,
      requesterPhone: '',
      beneficiaryName: 'Synthetic beneficiary',
      relationship: 'FAMILY',
      areaId: 'central',
      preferredWindowJson: {},
      notesRestricted: '',
      locale: 'en',
      privacyVersion: 'test',
      serviceSnapshot: {},
      priceAcknowledged: false,
    },
  });
  const login = await request(app)
    .post('/v1/auth/login')
    .set('Host', host)
    .send({ email: claimEmail, password });
  const cookie = String(login.headers['set-cookie']![0]).split(';')[0]!;
  const csrf = login.body.data.csrfToken as string;
  const own = await request(app)
    .get('/v1/portal/my/requests')
    .set('Host', host)
    .set('Cookie', cookie);
  expect(own.body.data).toEqual([]); // Matching email does not link old requests.
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/claim-link')
        .set('Host', host)
        .set('Cookie', cookie)
        .send({ reference: prior.reference, locale: 'en' })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/claim-link')
        .set('Host', host)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({ reference: prior.reference, locale: 'en' })
    ).status,
  ).toBe(202);
  const row = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, customerId: customer.id, purpose: 'CLAIM_REQUEST' },
  });
  const token = openSecret(row.encryptedSecret!, key, `${tenantId}:${row.id}`);
  const stranger = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: 'stranger@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const strangerSession = await createSession(db, {
    principalType: 'AGENCY_CUSTOMER',
    principalId: stranger.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  expect(
    (
      await request(app)
        .post(`/v1/portal/my/requests/${prior.id}/claim`)
        .set('Host', host)
        .set('Cookie', `raak_session_agency=${strangerSession.sessionToken}`)
        .set('X-CSRF-Token', strangerSession.csrfToken)
        .send({ token })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(`/v1/portal/my/requests/${prior.id}/claim`)
        .set('Host', `${slug}-b.localhost`)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({ token })
    ).status,
  ).toBe(401);
  const post = (id: string) =>
    request(app)
      .post(`/v1/portal/my/requests/${id}/claim`)
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ token });
  expect((await post(randomUUID())).status).toBe(404);
  const results = await Promise.all([post(prior.id), post(prior.id)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await post(prior.id)).status).toBe(409);
  expect(
    (await db.serviceRequest.findUniqueOrThrow({ where: { id: prior.id } })).customerAccountId,
  ).toBe(customer.id);
  expect(await db.auditEvent.count({ where: { tenantId, action: 'request.claimed' } })).toBe(1);
  expect(await db.patientAccess.count({ where: { tenantId } })).toBe(0);
});

it('registers without granting authority; verifies only on its tenant and refuses replay', async () => {
  const registered = await request(app)
    .post('/v1/portal/accounts/register')
    .set('Host', host)
    .send({ email, password, locale: 'en' });
  expect(registered.status).toBe(202);
  expect(JSON.stringify(registered.body)).not.toContain(email);
  expect(
    (await request(app).post('/v1/auth/login').set('Host', host).send({ email, password })).status,
  ).toBe(401);
  const row = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, purpose: 'VERIFY_EMAIL', customer: { emailNormalized: email } },
  });
  const token = openSecret(row.encryptedSecret!, key, `${tenantId}:${row.id}`);
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/verify-email')
        .set('Host', 'platform.localhost')
        .send({ token })
    ).status,
  ).toBe(404);
  expect(
    (await db.customerCapability.findUniqueOrThrow({ where: { id: row.id } })).consumedAt,
  ).toBeNull();
  const verified = await request(app)
    .post('/v1/portal/accounts/verify-email')
    .set('Host', host)
    .send({ token });
  expect(verified.status).toBe(200);
  expect(
    (await request(app).post('/v1/portal/accounts/verify-email').set('Host', host).send({ token }))
      .status,
  ).toBe(409);
  const login = await request(app)
    .post('/v1/auth/login')
    .set('Host', host)
    .send({ email, password });
  expect(login.status).toBe(200);
  expect(login.body.data.principalType).toBe('AGENCY_CUSTOMER');
  expect(await db.patientAccess.count({ where: { tenantId } })).toBe(0);
});

it('expires verification, supports bounded non-enumerating resend and retries safe captured email exactly once', async () => {
  const freshEmail = 'fresh.synthetic@example.invalid';
  await request(app)
    .post('/v1/portal/accounts/register')
    .set('Host', host)
    .send({ email: freshEmail, password, locale: 'ar' });
  const account = await db.customerAccount.findFirstOrThrow({
    where: { tenantId, emailNormalized: freshEmail },
  });
  const first = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, customerId: account.id },
  });
  const oldToken = openSecret(first.encryptedSecret!, key, `${tenantId}:${first.id}`);
  await db.customerCapability.update({
    where: { id: first.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect(
    (
      await request(app)
        .post('/v1/portal/accounts/verify-email')
        .set('Host', host)
        .send({ token: oldToken })
    ).status,
  ).toBe(401);
  const resend = (email: string) =>
    request(app)
      .post('/v1/portal/accounts/resend-verification')
      .set('Host', host)
      .send({ email, locale: 'ar' });
  expect((await resend('unknown@example.invalid')).body).toEqual((await resend(freshEmail)).body);
  const current = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, customerId: account.id, id: { not: first.id } },
  });
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, aggregateId: current.id },
  });
  expect(event.payloadMinimal).toEqual({});
  let fail = true;
  const mails: RequestEmail[] = [];
  const deliver = () =>
    deliverRequestEmail({
      db,
      eventId: event.id,
      encryptionKey: key,
      now: () => new Date(),
      buildLink: (_slug, _locale, token) => `https://synthetic.invalid/account#token=${token}`,
      send: async (mail) => {
        if (fail) throw new Error('Synthetic provider unavailable');
        mails.push(mail);
      },
    });
  await deliver();
  expect((await db.emailDelivery.findUniqueOrThrow({ where: { eventId: event.id } })).status).toBe(
    'PENDING',
  );
  fail = false;
  await db.emailDelivery.update({ where: { eventId: event.id }, data: { retryAt: new Date(0) } });
  await deliver();
  await deliver();
  expect(mails).toHaveLength(1);
  expect(mails[0]!.text).not.toMatch(/patient|license|address/i);
  const newToken = mails[0]!.text.match(/#token=([A-Za-z0-9_-]+)/)![1]!;
  const results = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post('/v1/portal/accounts/verify-email')
        .set('Host', host)
        .send({ token: newToken }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
});
