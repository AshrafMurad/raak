import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession, resolveSession } from '../../src/modules/auth/session.service';
import { createCatalogService } from '../../src/modules/catalog/catalog.service';
import { hashPassword } from '../../src/modules/auth/crypto';
import { openSecret } from '../../src/modules/requesting/secrets';
import {
  deliverRequestEmail,
  type RequestEmail,
} from '../../src/modules/notifications/request-email';

const db = getPrisma();
const slug = `cat-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const config = {
  nameAr: 'خدمة تجريبية',
  nameEn: 'Synthetic service',
  summaryAr: 'وصف',
  summaryEn: 'Summary',
  descriptionAr: 'للتجربة فقط',
  descriptionEn: 'Synthetic only',
  durationMin: 60,
  clinicalClass: 'NON_CLINICAL',
  requiredQualificationCodes: [],
  serviceAreaIds: ['central'],
  allowStandalone: true,
  allowRecurring: false,
  pricingType: 'FIXED',
  priceMinor: 15000,
  pricingUnit: 'VISIT',
};
const app = buildApp({
  env: loadApiEnv({
    BASE_DOMAIN: 'localhost',
    SESSION_SECRET: 'synthetic-test-key-at-least-32-characters',
    API_CORS_ORIGINS: `http://${host}:3000`,
  }),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
  db,
});
let tenantId: string;
let tenantB: string;
let guestCookie: string;
let cookie: string;
let csrf: string;
let serviceId: string;
let guestRequestId: string;
beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: 'Synthetic',
      displayName: 'Synthetic',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'synthetic@example.invalid',
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
        supportEmail: 'synthetic@example.invalid',
      },
    })
  ).id;
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailNormalized: `${slug}@example.invalid`,
      passwordHash: await hashPassword('Synthetic-Password-1!'),
    },
  });
  const s = await createSession(db, {
    principalType: 'AGENCY_STAFF',
    principalId: staff.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  cookie = `raak_session_agency=${s.sessionToken}`;
  csrf = s.csrfToken;
});
afterAll(async () => {
  if (!tenantId) return;
  await db.requestNotification.deleteMany({ where: { tenantId } });
  await db.guestSession.deleteMany({ where: { tenantId } });
  await db.guestActionToken.deleteMany({ where: { tenantId } });
  await db.requestStatusHistory.deleteMany({ where: { tenantId } });
  await db.serviceRequest.deleteMany({ where: { tenantId } });
  await db.agencyService.deleteMany({ where: { tenantId } });
  await db.emailDelivery.deleteMany({ where: { tenantId } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.auditEvent.deleteMany({ where: { tenantId } });
  await db.authSession.deleteMany({ where: { tenantId } });
  await db.staffAccount.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.tenant.delete({ where: { id: tenantB } });
});
it('creates a tenant draft, hides it publicly, and publishes with version checks', async () => {
  const created = await request(app)
    .post('/v1/agency/services')
    .set('Host', host)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send({ slug: 'synthetic-service', config });
  expect(created.status).toBe(201);
  serviceId = created.body.data.id;
  expect(
    (await request(app).get('/v1/portal/services/synthetic-service').set('Host', host)).status,
  ).toBe(404);
  const published = await request(app)
    .post(`/v1/agency/services/${serviceId}/publish`)
    .set('Host', host)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send({ expectedVersion: 1 });
  expect(published.status).toBe(200);
  expect(
    (await request(app).get('/v1/portal/services/synthetic-service').set('Host', host)).body.data
      .config.nameEn,
  ).toBe('Synthetic service');
  expect(
    (
      await request(app)
        .post(`/v1/agency/services/${serviceId}/publish`)
        .set('Host', host)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({ expectedVersion: 1 })
    ).status,
  ).toBe(409);
});
it('submits once under concurrency and requires email verification instead of a reference', async () => {
  const input = {
    serviceId,
    serviceVersion: 2,
    locale: 'en',
    requesterName: 'Synthetic requester',
    requesterEmail: 'guest@example.invalid',
    beneficiaryName: 'Synthetic beneficiary',
    relationship: 'FAMILY',
    areaId: 'central',
    preferredDate: '2026-12-01',
    preferredPeriod: 'FLEXIBLE',
    privacyAccepted: true,
    privacyVersion: '2026-11-01',
    priceAcknowledged: true,
  };
  const key = randomUUID();
  const send = () =>
    request(app)
      .post('/v1/portal/requests')
      .set('Host', host)
      .set('Idempotency-Key', key)
      .send(input);
  const results = await Promise.all([send(), send()]);
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  expect(results[0]!.body.data).toEqual(results[1]!.body.data);
  guestRequestId = results[0]!.body.data.id;
  expect(
    (
      await request(app)
        .get(`/v1/portal/my/requests/${guestRequestId}`)
        .set('Host', host)
        .set('Authorization', `Bearer ${results[0]!.body.data.reference}`)
    ).status,
  ).toBe(401);
  expect(await db.serviceRequest.count({ where: { tenantId } })).toBe(1);
  expect(await db.requestNotification.count({ where: { tenantId } })).toBe(1);
});
it('delivers safe email once through outbox retry and rechecks the tenant', async () => {
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, eventType: 'email.request_access' },
  });
  const sent: RequestEmail[] = [];
  const deps = {
    db,
    eventId: event.id,
    encryptionKey: 'synthetic-test-key-at-least-32-characters',
    now: () => new Date(),
    buildLink: (s: string, l: string, t: string) => `http://${s}.localhost/${l}/track#token=${t}`,
    send: async (email: RequestEmail) => {
      sent.push(email);
    },
  };
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
  await deliverRequestEmail(deps);
  expect(sent).toHaveLength(0);
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
  await deliverRequestEmail({
    ...deps,
    send: async () => {
      throw new Error('synthetic provider failure');
    },
  });
  expect(
    (await db.emailDelivery.findUniqueOrThrow({ where: { eventId: event.id } })).lastErrorCode,
  ).toBe('DELIVERY_FAILED');
  await db.emailDelivery.update({ where: { eventId: event.id }, data: { retryAt: new Date(0) } });
  // Save the encrypted capability before successful delivery scrubs it.
  const tokenRow = await db.guestActionToken.findFirstOrThrow({
    where: { tenantId, requestId: guestRequestId },
  });
  const token = openSecret(
    tokenRow.encryptedSecret!,
    deps.encryptionKey,
    `${tenantId}:${tokenRow.id}`,
  );
  await Promise.all([deliverRequestEmail(deps), deliverRequestEmail(deps)]);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.text).toContain(`#token=${token}`);
  expect(sent[0]!.text).not.toContain('Synthetic beneficiary');
  expect(JSON.stringify(event.payloadMinimal)).not.toContain(token);
  expect(
    (await db.guestActionToken.findUniqueOrThrow({ where: { id: tokenRow.id } })).encryptedSecret,
  ).toBeNull();
  const wrongHost = await request(app)
    .post('/v1/portal/requests/access-link/consume')
    .set('Host', `${slug}-b.localhost`)
    .send({ token });
  expect(wrongHost.status).toBe(401);
  const consume = () =>
    request(app).post('/v1/portal/requests/access-link/consume').set('Host', host).send({ token });
  const results = await Promise.all([consume(), consume()]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  guestCookie = String(results.find((r) => r.status === 200)!.headers['set-cookie']![0]).split(
    ';',
  )[0]!;
});
it('projects only the verified request and denies cross-tenant/session/reference bypasses', async () => {
  const result = await request(app)
    .get(`/v1/portal/my/requests/${guestRequestId}`)
    .set('Host', host)
    .set('Cookie', guestCookie);
  expect(result.status).toBe(200);
  expect(result.body.data.reference).toMatch(/^REQ-/);
  expect(result.body.data).not.toHaveProperty('beneficiaryName');
  expect(result.body.data).not.toHaveProperty('requesterEmailNormalized');
  expect(result.body.data).not.toHaveProperty('notesRestricted');
  const prior = await db.serviceRequest.findUniqueOrThrow({ where: { id: guestRequestId } });
  const other = await db.serviceRequest.create({
    data: {
      ...prior,
      id: randomUUID(),
      reference: 'REQ-1234567890ABCDEF',
      idempotencyKey: randomUUID(),
      serviceSnapshot: { ...config, currency: 'SAR' },
      preferredWindowJson: { date: '2026-12-01', period: 'FLEXIBLE' },
    },
  });
  // Same verified email still does not authorize a different existing request.
  expect(
    (
      await request(app)
        .get(`/v1/portal/my/requests/${other.id}`)
        .set('Host', host)
        .set('Cookie', guestCookie)
    ).status,
  ).toBe(404);
  await db.serviceRequest.delete({ where: { id: other.id } });
  expect(
    (
      await request(app)
        .get(`/v1/portal/my/requests/${randomUUID()}`)
        .set('Host', host)
        .set('Cookie', guestCookie)
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get('/v1/portal/my/requests')
        .set('Host', `${slug}-b.localhost`)
        .set('Cookie', guestCookie)
    ).status,
  ).toBe(401);
  await db.guestSession.updateMany({ where: { tenantId }, data: { expiresAt: new Date(0) } });
  expect(
    (await request(app).get('/v1/portal/my/requests').set('Host', host).set('Cookie', guestCookie))
      .status,
  ).toBe(401);
});
it('uses non-enumerating link issuance and rejects expired capabilities', async () => {
  const row = await db.serviceRequest.findUniqueOrThrow({ where: { id: guestRequestId } });
  const issue = (reference: string, email: string) =>
    request(app)
      .post('/v1/portal/requests/access-link')
      .set('Host', host)
      .send({ reference, email, locale: 'en' });
  const good = await issue(row.reference, row.requesterEmailNormalized);
  const bad = await issue('REQ-0000000000000000', row.requesterEmailNormalized);
  expect(good.status).toBe(202);
  expect(bad.status).toBe(202);
  expect(good.body).toEqual(bad.body);
  const tokenRow = await db.guestActionToken.findFirstOrThrow({
    where: { tenantId, consumedAt: null, encryptedSecret: { not: null } },
  });
  const token = openSecret(
    tokenRow.encryptedSecret!,
    'synthetic-test-key-at-least-32-characters',
    `${tenantId}:${tokenRow.id}`,
  );
  await db.guestActionToken.update({
    where: { id: tokenRow.id },
    data: { purpose: 'QUOTE_ACCEPT' },
  });
  expect(
    (
      await request(app)
        .post('/v1/portal/requests/access-link/consume')
        .set('Host', host)
        .send({ token })
    ).status,
  ).toBe(401);
  expect(
    (await db.guestActionToken.findUniqueOrThrow({ where: { id: tokenRow.id } })).consumedAt,
  ).toBeNull();
  await db.guestActionToken.update({
    where: { id: tokenRow.id },
    data: { purpose: 'REQUEST_STATUS', expiresAt: new Date(0) },
  });
  expect(
    (
      await request(app)
        .post('/v1/portal/requests/access-link/consume')
        .set('Host', host)
        .send({ token })
    ).body.error.code,
  ).toBe('TOKEN_EXPIRED');
});
it('allows only the initial review transition and commits one concurrent winner', async () => {
  const get = await request(app).get('/v1/agency/requests').set('Host', host).set('Cookie', cookie);
  expect(get.status).toBe(200);
  expect(get.body.data.items).toHaveLength(1);
  const start = () =>
    request(app)
      .post(`/v1/agency/requests/${guestRequestId}/start-review`)
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 1 });
  expect((await Promise.all([start(), start()])).map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await db.requestStatusHistory.count({ where: { tenantId, toStatus: 'UNDER_REVIEW' } }),
  ).toBe(1);
  // Sprint 3 implements the decision route; an empty body fails validation
  // before any state change (the request stays UNDER_REVIEW).
  expect(
    (
      await request(app)
        .post(`/v1/agency/requests/${guestRequestId}/approve`)
        .set('Host', host)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({})
    ).status,
  ).toBe(422);
});
it('denies caregiver privileges, cross-tenant IDs and missing CSRF', async () => {
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      role: 'CAREGIVER',
      status: 'ACTIVE',
      emailNormalized: `cg-${slug}@example.invalid`,
      passwordHash: 'synthetic-not-used',
    },
  });
  const s = await createSession(db, {
    principalType: 'AGENCY_STAFF',
    principalId: staff.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  const cgCookie = `raak_session_agency=${s.sessionToken}`;
  expect(
    (await request(app).get('/v1/agency/services').set('Host', host).set('Cookie', cgCookie))
      .status,
  ).toBe(403);
  expect(
    (await request(app).get('/v1/agency/requests').set('Host', host).set('Cookie', cgCookie))
      .status,
  ).toBe(403);
  const resolved = await resolveSession(db, s.sessionToken);
  await expect(
    createCatalogService(db).publish(
      { ...resolved!, realm: { kind: 'AGENCY', tenant: { tenantId, slug, status: 'ACTIVE' } } },
      serviceId,
      2,
      false,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(
    (
      await request(app)
        .post(`/v1/agency/services/${serviceId}/unpublish`)
        .set('Host', host)
        .set('Cookie', cookie)
        .send({ expectedVersion: 2 })
    ).status,
  ).toBe(403);
  const otherService = await db.agencyService.create({
    data: { tenantId: tenantB, slug: 'other', config, isPublished: true },
  });
  expect(
    (
      await request(app)
        .get(`/v1/agency/services/${otherService.id}`)
        .set('Host', host)
        .set('Cookie', cookie)
    ).status,
  ).toBe(404);
  expect((await request(app).get('/v1/portal/services/other').set('Host', host)).status).toBe(404);
  await db.agencyService.delete({ where: { id: otherService.id } });
});
it('serializes publication changes and preserves submitted snapshots after unpublish', async () => {
  const change = (path: string) =>
    request(app)
      .post(`/v1/agency/services/${serviceId}/${path}`)
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 2 });
  const results = await Promise.all([change('unpublish'), change('unpublish')]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (await request(app).get('/v1/portal/services/synthetic-service').set('Host', host)).status,
  ).toBe(404);
  const r = await db.serviceRequest.findUniqueOrThrow({ where: { id: guestRequestId } });
  expect(r.serviceSnapshot).toMatchObject({
    nameEn: 'Synthetic service',
    priceMinor: 15000,
    currency: 'SAR',
  });
  const rejected = await request(app)
    .post('/v1/portal/requests')
    .set('Host', host)
    .set('Idempotency-Key', randomUUID())
    .send({
      serviceId,
      serviceVersion: 2,
      locale: 'en',
      requesterName: 'Synthetic',
      requesterEmail: 'new@example.invalid',
      beneficiaryName: 'Synthetic',
      relationship: 'SELF',
      areaId: 'central',
      preferredDate: '2026-12-01',
      preferredPeriod: 'FLEXIBLE',
      privacyAccepted: true,
      privacyVersion: '2026-11-01',
      priceAcknowledged: true,
    });
  expect(rejected.status).toBe(404);
});
it('rejects mass assignment, origin attacks and idempotency payload changes', async () => {
  const prior = await db.serviceRequest.findUniqueOrThrow({ where: { id: guestRequestId } });
  const input = {
    serviceId,
    serviceVersion: 2,
    locale: 'en',
    requesterName: 'Modified requester',
    requesterEmail: 'guest@example.invalid',
    beneficiaryName: 'Synthetic beneficiary',
    relationship: 'FAMILY',
    areaId: 'central',
    preferredDate: '2026-12-01',
    preferredPeriod: 'FLEXIBLE',
    privacyAccepted: true,
    privacyVersion: '2026-11-01',
    priceAcknowledged: true,
  };
  const send = (body: object, key: string = randomUUID()) =>
    request(app)
      .post('/v1/portal/requests')
      .set('Host', host)
      .set('Idempotency-Key', key)
      .send(body);
  expect((await send(input, prior.idempotencyKey)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  expect((await send({ ...input, tenantId: tenantB })).status).toBe(422);
  expect(
    (
      await request(app)
        .post('/v1/portal/requests/access-link')
        .set('Host', host)
        .set('Origin', 'https://attacker.invalid')
        .send({ reference: prior.reference, email: prior.requesterEmailNormalized, locale: 'en' })
    ).status,
  ).toBe(403);
});
it('serializes an unpublished-service submission race and tenant suspension', async () => {
  const s = await db.agencyService.create({
    data: { tenantId, slug: 'race-service', config, isPublished: true },
  });
  const input = {
    serviceId: s.id,
    serviceVersion: 1,
    locale: 'en',
    requesterName: 'Synthetic race',
    requesterEmail: 'race@example.invalid',
    beneficiaryName: 'Synthetic beneficiary',
    relationship: 'SELF',
    areaId: 'central',
    preferredDate: '2026-12-01',
    preferredPeriod: 'FLEXIBLE',
    privacyAccepted: true,
    privacyVersion: '2026-11-01',
    priceAcknowledged: true,
  };
  const [unpublish, submission] = await Promise.all([
    request(app)
      .post(`/v1/agency/services/${s.id}/unpublish`)
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 1 }),
    request(app)
      .post('/v1/portal/requests')
      .set('Host', host)
      .set('Idempotency-Key', randomUUID())
      .send(input),
  ]);
  expect(unpublish.status).toBe(200);
  expect([201, 404]).toContain(submission.status);
  const count = await db.serviceRequest.count({ where: { tenantId, agencyServiceId: s.id } });
  expect(count).toBe(submission.status === 201 ? 1 : 0);
  let pending: Promise<request.Response> | undefined;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    pending = request(app)
      .post('/v1/portal/requests/access-link/consume')
      .set('Host', host)
      .send({ token: 'a'.repeat(43) })
      .then((r) => r);
    await tx.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
  });
  expect((await pending)!.body.error.code).toBe('TENANT_INACTIVE');
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
});
it('accepts allowlisted same-tenant split-port origins and idempotency preflight', async () => {
  const prior = await db.serviceRequest.findUniqueOrThrow({ where: { id: guestRequestId } });
  const response = await request(app)
    .post('/v1/portal/requests/access-link')
    .set('Host', host)
    .set('Origin', `http://${host}:3000`)
    .send({ reference: prior.reference, email: prior.requesterEmailNormalized, locale: 'en' });
  expect(response.status).toBe(202);
  const preflight = await request(app)
    .options('/v1/portal/requests')
    .set('Host', host)
    .set('Origin', `http://${host}:3000`)
    .set('Access-Control-Request-Headers', 'content-type,idempotency-key');
  expect(String(preflight.headers['access-control-allow-headers']).toLowerCase()).toContain(
    'idempotency-key',
  );
});
it('rejects published service edits and branding changes that invalidate service areas', async () => {
  const branding = {
    nameAr: 'وكالة تجريبية',
    nameEn: 'Synthetic agency',
    descriptionAr: 'للتجربة',
    descriptionEn: 'Synthetic only',
    primaryColor: 'MIDNIGHT',
    areas: [{ id: 'central', nameAr: 'الوسطى', nameEn: 'Central' }],
  };
  const save = (body: object) =>
    request(app)
      .patch('/v1/agency/branding')
      .set('Host', host)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send(body);
  expect((await save({ expectedVersion: 0, branding })).status).toBe(200);
  const s = await db.agencyService.create({
    data: { tenantId, slug: 'area-invariant', config, isPublished: true },
  });
  expect(
    (
      await request(app)
        .patch(`/v1/agency/services/${s.id}`)
        .set('Host', host)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({
          expectedVersion: 1,
          slug: s.slug,
          config: { ...config, serviceAreaIds: ['west'] },
          isEnabled: true,
        })
    ).status,
  ).toBe(422);
  expect(
    (
      await save({
        expectedVersion: 1,
        branding: { ...branding, areas: [{ id: 'west', nameAr: 'الغرب', nameEn: 'West' }] },
      })
    ).status,
  ).toBe(422);
});
it('finalizes an exhausted abandoned delivery lease without fabricating sent status', async () => {
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, eventType: 'email.request_access' },
  });
  await db.outboxEvent.update({ where: { id: event.id }, data: { processedAt: null } });
  await db.emailDelivery.upsert({
    where: { eventId: event.id },
    create: {
      eventId: event.id,
      tenantId,
      status: 'SENDING',
      attempts: 5,
      leaseUntil: new Date(0),
    },
    update: { status: 'SENDING', attempts: 5, leaseUntil: new Date(0) },
  });
  await deliverRequestEmail({
    db,
    eventId: event.id,
    encryptionKey: 'synthetic-test-key-at-least-32-characters',
    now: () => new Date(),
    buildLink: () => '',
    send: async () => {
      throw new Error('must not send');
    },
  });
  const row = await db.emailDelivery.findUniqueOrThrow({ where: { eventId: event.id } });
  expect(row.status).toBe('FAILED');
  expect(row.lastErrorCode).toBe('LEASE_EXHAUSTED');
});
it('paginates scoped catalogs with a stable cursor and excludes unpublished items', async () => {
  await db.agencyService.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      tenantId,
      slug: `page-${i}`,
      config,
      isPublished: i < 22,
    })),
  });
  const first = await request(app).get('/v1/portal/services').set('Host', host);
  expect(first.body.data.services).toHaveLength(20);
  expect(first.body.data.nextCursor).toBeTruthy();
  const second = await request(app)
    .get(`/v1/portal/services?cursor=${first.body.data.nextCursor}`)
    .set('Host', host);
  const ids = [...first.body.data.services, ...second.body.data.services].map(
    (s: { id: string }) => s.id,
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(
    await db.agencyService.count({ where: { tenantId, isPublished: true, isEnabled: true } }),
  );
  expect((await request(app).get('/v1/portal/services?limit=101').set('Host', host)).status).toBe(
    422,
  );
  expect(
    (await request(app).get('/v1/agency/services?limit=5').set('Host', host).set('Cookie', cookie))
      .body.data.items,
  ).toHaveLength(5);
});
it('rate limits repeated guest access-link attempts without issuing mail for unknown references', async () => {
  const fresh = buildApp({
    env: loadApiEnv({
      BASE_DOMAIN: 'localhost',
      SESSION_SECRET: 'synthetic-test-key-at-least-32-characters',
    }),
    logger: createLogger({ service: 'test', write: () => {} }),
    health: { checkDatabase: async () => true },
    now: () => new Date(),
    db,
  });
  for (let i = 0; i < 31; i++) {
    const response = await request(fresh)
      .post('/v1/portal/requests/access-link')
      .set('Host', host)
      .send({ reference: 'REQ-0000000000000000', email: 'nobody@example.invalid', locale: 'ar' });
    expect(response.status).toBe(i < 30 ? 202 : 429);
  }
});
