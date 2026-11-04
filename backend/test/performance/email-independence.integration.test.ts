// Sprint 7 Session 5 — docs 12 performance budget 3: guest request and quote
// accept transactions complete without waiting for an email provider, and
// budget 4: worker delivery retries stay bounded under a hanging/failing
// provider, with repeated outbox dispatch remaining idempotent. Synthetic
// data only; no real email I/O.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';
import { hashPassword } from '../../src/modules/auth/crypto';
import { openSecret } from '../../src/modules/requesting/secrets';
import { dispatchNotificationEvent } from '../../src/modules/notifications/dispatcher';
import { deliverNotificationEmail } from '../../src/modules/notifications/delivery';

const db = getPrisma();
const slug = `perf-mail-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const encryptionKey = 'synthetic-test-key-at-least-32-characters';
const HTTP_BOUND_MS = 2000;
const serviceConfig = {
  nameAr: 'خدمة تجريبية',
  nameEn: 'Synthetic quoted service',
  summaryAr: 'للتجربة',
  summaryEn: 'Summary',
  descriptionAr: 'بيانات تجريبية',
  descriptionEn: 'Synthetic only',
  durationMin: 90,
  clinicalClass: 'NON_CLINICAL',
  requiredQualificationCodes: [],
  serviceAreaIds: ['central'],
  allowStandalone: true,
  allowRecurring: false,
  pricingType: 'CUSTOM_QUOTE',
  priceMinor: null,
  pricingUnit: null,
};
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: encryptionKey }),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
  db,
});
let tenantId = '';
let staffCookie = '';
let staffCsrf = '';
let serviceId = '';
let serviceVersion = 1;

const staffPost = (path: string, body?: object) =>
  request(app)
    .post(`/v1${path}`)
    .set('Host', host)
    .set('Cookie', staffCookie)
    .set('X-CSRF-Token', staffCsrf)
    .send(body);

/** Full guest → verified → SENT quote flow; returns what the assertions need. */
async function seedGuestQuote(email: string) {
  const intakeStarted = performance.now();
  const intake = await request(app)
    .post('/v1/portal/requests')
    .set('Host', host)
    .set('Idempotency-Key', randomUUID())
    .send({
      serviceId,
      serviceVersion,
      locale: 'en',
      requesterName: 'Synthetic requester',
      requesterEmail: email,
      beneficiaryName: 'Synthetic beneficiary',
      relationship: 'FAMILY',
      areaId: 'central',
      preferredDate: '2026-12-15',
      preferredPeriod: 'FLEXIBLE',
      privacyAccepted: true,
      privacyVersion: '2026-11-01',
      priceAcknowledged: false,
    });
  const intakeMs = performance.now() - intakeStarted;
  expect(intake.status, JSON.stringify(intake.body)).toBe(201);
  const requestId = intake.body.data.id as string;
  const tokenRow = await db.guestActionToken.findFirstOrThrow({
    where: { tenantId, requestId, consumedAt: null },
    orderBy: { expiresAt: 'desc' },
  });
  const token = openSecret(tokenRow.encryptedSecret!, encryptionKey, `${tenantId}:${tokenRow.id}`);
  const consume = await request(app)
    .post('/v1/portal/requests/access-link/consume')
    .set('Host', host)
    .send({ token });
  expect(consume.status).toBe(200);
  const guestCookie = String(consume.headers['set-cookie']![0]).split(';')[0]!;
  const detail = await request(app)
    .get(`/v1/agency/requests/${requestId}`)
    .set('Host', host)
    .set('Cookie', staffCookie);
  const start = await staffPost(`/agency/requests/${requestId}/start-review`, {
    expectedVersion: detail.body.data.version,
  });
  expect(start.status).toBe(200);
  const draft = await staffPost(`/agency/requests/${requestId}/quotes`, {
    lineItems: [{ description: 'Synthetic visits', quantity: 2, unitPriceMinor: 15000 }],
    terms: 'Synthetic terms only.',
  });
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const sent = await staffPost(`/agency/quotes/${draft.body.data.id}/send`, {
    expectedVersion: draft.body.data.rowVersion,
    validForHours: 72,
  });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const portalList = await request(app)
    .get(`/v1/portal/my/requests/${requestId}/quotes`)
    .set('Host', host)
    .set('Cookie', guestCookie);
  expect(portalList.status).toBe(200);
  const quoteId = portalList.body.data.items[0].id as string;
  return { requestId, guestCookie, quoteId, version: sent.body.data.version as number, intakeMs };
}

beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: 'Synthetic Mail Independence',
      displayName: 'Synthetic',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'synthetic@example.invalid',
    },
  });
  tenantId = tenant.id;
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailNormalized: 'owner@example.invalid',
      passwordHash: await hashPassword('Synthetic-Password-1!'),
      emailVerifiedAt: new Date(),
    },
  });
  const session = await createSession(db, {
    principalType: 'AGENCY_STAFF',
    principalId: staff.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  staffCookie = `raak_session_agency=${session.sessionToken}`;
  staffCsrf = session.csrfToken;
  const service = await db.agencyService.create({
    data: { tenantId, slug: 'perf-mail-service', config: serviceConfig },
  });
  serviceId = service.id;
  const publish = await request(app)
    .post(`/v1/agency/services/${service.id}/publish`)
    .set('Host', host)
    .set('Cookie', staffCookie)
    .set('X-CSRF-Token', staffCsrf)
    .send({ expectedVersion: 1 });
  expect(publish.status, publish.body?.error?.code).toBe(200);
  serviceVersion = (await db.agencyService.findUniqueOrThrow({ where: { id: service.id } })).version;
});

afterAll(async () => {
  if (!tenantId) return;
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.notification.deleteMany({ where: { tenantId } });
  await db.notificationPolicy.deleteMany({ where: { tenantId } });
  await db.notificationPreference.deleteMany({ where: { tenantId } });
  await db.idempotencyKey.deleteMany({ where: { tenantId } });
  await db.requestNotification.deleteMany({ where: { tenantId } });
  await db.quoteRevisionRequest.deleteMany({ where: { tenantId } });
  await db.quote.deleteMany({ where: { tenantId } });
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
});

it('completes guest intake and quote acceptance without waiting for a hanging provider', async () => {
  // Budget 3 (guest request): no provider exists in this environment at all;
  // the intake transaction must not wait on one.
  const flow = await seedGuestQuote('hung@example.invalid');
  expect(flow.intakeMs, `guest intake took ${flow.intakeMs}ms`).toBeLessThan(HTTP_BOUND_MS);
  const accessEvent = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, eventType: 'email.request_access' },
  });
  expect(accessEvent.processedAt).toBeNull();
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, eventType: 'quote.sent', aggregateId: flow.quoteId },
  });
  await dispatchNotificationEvent(db, event.id, () => new Date());
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { tenantId, eventId: event.id, channel: 'EMAIL' },
  });
  // Worker side: provider never responds. The lease holds the delivery, and
  // nothing in the guest's HTTP path can block on this promise.
  void deliverNotificationEmail({
    db,
    tenantId,
    deliveryId: delivery.id,
    now: () => new Date(),
    render: () => ({ subject: 'Synthetic', text: 'Synthetic body' }),
    send: () => new Promise(() => {}),
  });
  const acceptStarted = performance.now();
  const [first, replay] = await Promise.all([
    request(app)
      .post(`/v1/portal/my/quotes/${flow.quoteId}/accept`)
      .set('Host', host)
      .set('Cookie', flow.guestCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteVersion: flow.version }),
    request(app)
      .post(`/v1/portal/my/quotes/${flow.quoteId}/accept`)
      .set('Host', host)
      .set('Cookie', flow.guestCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteVersion: flow.version }),
  ]);
  const acceptMs = performance.now() - acceptStarted;
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(replay.status, JSON.stringify(replay.body)).toBe(200);
  expect(first.body.data.status).toBe('ACCEPTED');
  expect(replay.body.data.status).toBe('ACCEPTED');
  expect(acceptMs, `quote accept took ${acceptMs}ms while the provider hung`).toBeLessThan(
    HTTP_BOUND_MS,
  );
  const stuck = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(stuck.status).toBe('SENDING');
  expect(stuck.executionToken).not.toBeNull();
});

it('caps delivery retries at five attempts and keeps repeated dispatch idempotent', async () => {
  const flow = await seedGuestQuote('retry@example.invalid');
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, eventType: 'quote.sent', aggregateId: flow.quoteId },
  });
  await dispatchNotificationEvent(db, event.id, () => new Date());
  const deliveriesBefore = await db.notificationDelivery.count({
    where: { tenantId, eventId: event.id },
  });
  await Promise.all([
    dispatchNotificationEvent(db, event.id, () => new Date()),
    dispatchNotificationEvent(db, event.id, () => new Date()),
    dispatchNotificationEvent(db, event.id, () => new Date()),
  ]);
  const deliveriesAfter = await db.notificationDelivery.count({
    where: { tenantId, eventId: event.id },
  });
  expect(deliveriesAfter).toBe(deliveriesBefore);
  expect(deliveriesAfter).toBeGreaterThan(0);
  expect(
    await db.notification.count({ where: { tenantId, eventId: event.id } }),
  ).toBe(0);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt).not.toBeNull();

  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { tenantId, eventId: event.id, status: 'PENDING' },
  });
  let clock = Date.now();
  const now = () => new Date(clock);
  for (let attempt = 0; attempt < 5; attempt++) {
    clock += 10_000 * (attempt + 1);
    await deliverNotificationEmail({
      db,
      tenantId,
      deliveryId: delivery.id,
      now,
      render: () => ({ subject: 'Synthetic', text: 'Synthetic body' }),
      send: async () => {
        throw new Error('synthetic provider outage');
      },
    });
  }
  const exhausted = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(exhausted.attempts).toBe(5);
  expect(exhausted.status).toBe('FAILED');
  expect(exhausted.lastErrorCode).toBe('DELIVERY_FAILED');
  clock += 60_000;
  await deliverNotificationEmail({
    db,
    tenantId,
    deliveryId: delivery.id,
    now,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic body' }),
    send: async () => {
      throw new Error('synthetic provider outage');
    },
  });
  const unchanged = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(unchanged.attempts).toBe(5);
  expect(unchanged.status).toBe('FAILED');
});
