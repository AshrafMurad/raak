import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';
import { dispatchNotificationEvent } from '../../src/modules/notifications/dispatcher';
import { deliverNotificationEmail } from '../../src/modules/notifications/delivery';

const db = getPrisma();
const slug = `notify-${randomUUID().slice(0, 8)}`;
const now = () => new Date();
const app = buildApp({ env: loadApiEnv({ BASE_DOMAIN: 'localhost' }), db, now,
  logger: createLogger({ service: 'test', write: () => {} }), health: { checkDatabase: async () => true } });
let tenantId: string;
let ownerId: string;
let cookie: string;
let csrf: string;
let visitId: string;
let coordinatorId: string;
let coordinatorCookie: string;
let coordinatorCsrf: string;
const call = (method: 'get' | 'patch', path: string, body?: object) => request(app)[method](`/v1${path}`)
  .set('Host', `${slug}.localhost`).set('Cookie', cookie).set('X-CSRF-Token', csrf).send(body ?? {});

beforeAll(async () => {
  const tenant = await db.tenant.create({ data: { slug, legalName: 'Synthetic Notification Tests', displayName: 'Synthetic',
    status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 'support@example.invalid' } });
  tenantId = tenant.id;
  const owner = await db.staffAccount.create({ data: { tenantId, emailNormalized: 'owner@example.invalid',
    passwordHash: 'unused', role: 'AGENCY_OWNER', status: 'ACTIVE', emailVerifiedAt: now() } });
  ownerId = owner.id;
  const session = await createSession(db, { principalId: ownerId, principalType: 'AGENCY_STAFF', tenantId, sessionVersion: 0, ttlSeconds: 3600 });
  cookie = `raak_session_agency=${session.sessionToken}`; csrf = session.csrfToken;
  const coordinator = await db.staffAccount.create({ data: { tenantId, emailNormalized: 'coordinator@example.invalid',
    passwordHash: 'unused', role: 'CARE_COORDINATOR', status: 'ACTIVE', emailVerifiedAt: now() } });
  coordinatorId = coordinator.id;
  const cs = await createSession(db, { principalId: coordinatorId, principalType: 'AGENCY_STAFF', tenantId, sessionVersion: 0, ttlSeconds: 3600 });
  coordinatorCookie = `raak_session_agency=${cs.sessionToken}`; coordinatorCsrf = cs.csrfToken;
  const patient = await db.patient.create({ data: { tenantId, displayName: 'Synthetic patient', normalizedName: 'synthetic patient', areaId: 'central' } });
  const service = await db.agencyService.create({ data: { tenantId, slug: 'synthetic', config: {} } });
  const visit = await db.visit.create({ data: { tenantId, patientId: patient.id, agencyServiceId: service.id, areaId: 'central',
    serviceNameSnapshot: {}, reviewStatus: 'NEEDS_REVIEW', scheduledStartUtc: new Date('2026-12-01T08:00:00Z'), scheduledEndUtc: new Date('2026-12-01T09:00:00Z'), timezoneSnapshot: 'Asia/Riyadh' } });
  visitId = visit.id;
});

afterAll(async () => {
  if (!tenantId) return;
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.notification.deleteMany({ where: { tenantId } });
  await db.notificationPreference.deleteMany({ where: { tenantId } });
  await db.notificationPolicy.deleteMany({ where: { tenantId } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
});

async function event(eventType = 'visit.needs_review', aggregateId = visitId) {
  return db.outboxEvent.create({ data: { tenantId, eventType, aggregateId, payloadMinimal: {} } });
}

it('authorizes strict versioned policy updates and refuses essential changes and CSRF', async () => {
  const read = await call('get', '/agency/notification-policies');
  expect(read.status).toBe(200);
  expect(read.body.data.version).toBe(0);
  const body = { expectedVersion: 0, policies: [{ eventType: 'VISIT_NEEDS_REVIEW', channel: 'EMAIL', enabled: false }] };
  expect((await request(app).patch('/v1/agency/notification-policies').set('Host', `${slug}.localhost`).set('Cookie', cookie).send(body)).status).toBe(403);
  expect((await call('patch', '/agency/notification-policies', { ...body, policies: [{ eventType: 'VISIT_CANCELLED', channel: 'EMAIL', enabled: false }] })).status).toBe(422);
  expect((await call('patch', '/agency/notification-policies', body)).status).toBe(200);
  expect((await call('patch', '/agency/notification-policies', body)).status).toBe(409);
  expect((await request(app).patch('/v1/agency/notification-policies').set('Host', `${slug}.localhost`).set('Cookie', coordinatorCookie).set('X-CSRF-Token', coordinatorCsrf).send({ ...body, expectedVersion: 1 })).status).toBe(403);
});

it('dispatches once under races, honors email policy and retains unknown events', async () => {
  const e = await event();
  await Promise.all([dispatchNotificationEvent(db, e.id, now), dispatchNotificationEvent(db, e.id, now)]);
  expect(await db.notification.count({ where: { tenantId, eventId: e.id } })).toBe(2);
  expect(await db.notificationDelivery.count({ where: { tenantId, eventId: e.id } })).toBe(0);
  const unknown = await event('unowned.synthetic');
  await dispatchNotificationEvent(db, unknown.id, now);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: unknown.id } })).processedAt).toBeNull();
});

it('rechecks suspension and optional preferences; unrendered work stays pending', async () => {
  await call('patch', '/agency/notification-policies', { expectedVersion: 1, policies: [{ eventType: 'VISIT_NEEDS_REVIEW', channel: 'EMAIL', enabled: true }] });
  await db.notificationPreference.create({ data: { tenantId, principalType: 'AGENCY_STAFF', principalId: coordinatorId, eventType: 'VISIT_NEEDS_REVIEW', channel: 'EMAIL', optedOut: true } });
  const e = await event();
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
  await dispatchNotificationEvent(db, e.id, now);
  expect(await db.notification.count({ where: { tenantId, eventId: e.id } })).toBe(0);
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
  await dispatchNotificationEvent(db, e.id, now);
  const rows = await db.notificationDelivery.findMany({ where: { tenantId, eventId: e.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.recipientPrincipalId).toBe(ownerId);
  const delivery = rows[0]!;
  await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now });
  const unchanged = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(unchanged.attempts).toBe(0);
  expect(unchanged.status).toBe('PENDING');
  expect(unchanged.lastErrorCode).toBe('TEMPLATE_NOT_CONFIGURED');
  expect(unchanged.retryAt.getTime()).toBeGreaterThan(Date.now());
});

it('retries provider failures with bounded backoff and stable provider dedupe', async () => {
  const e = await event(); await dispatchNotificationEvent(db, e.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: e.id } });
  const keys: string[] = [];
  const render = () => ({ subject: 'Synthetic safe subject', text: 'Synthetic generic update' });
  const send = async (email: { idempotencyKey: string }) => { keys.push(email.idempotencyKey); throw new Error('provider detail must not persist'); };
  for (let attempt = 1; attempt <= 5; attempt++) {
    await db.notificationDelivery.update({ where: { id: delivery.id }, data: { retryAt: new Date(0) } });
    await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now, render, send });
  }
  const failed = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(failed.status).toBe('FAILED'); expect(failed.attempts).toBe(5);
  expect(new Set(keys).size).toBe(1); expect(keys[0]).toBe(delivery.id);
  const observed = await call('get', '/agency/notification-deliveries?status=FAILED');
  expect(observed.status).toBe(200);
  expect(JSON.stringify(observed.body)).not.toContain('@');
  expect(JSON.stringify(observed.body)).not.toContain('provider detail');
});

it('does not dispatch tenant B resource IDs or reveal B policies through a tenant A session', async () => {
  const other = await db.tenant.create({ data: { slug: `other-${randomUUID()}`, legalName: 'Synthetic B', displayName: 'Synthetic',
    status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 'support@example.invalid' } });
  const bPatient = await db.patient.create({ data: { tenantId: other.id, displayName: 'Synthetic patient', normalizedName: 'synthetic patient', areaId: 'central' } });
  const bService = await db.agencyService.create({ data: { tenantId: other.id, slug: 'synthetic', config: {} } });
  const bVisit = await db.visit.create({ data: { tenantId: other.id, patientId: bPatient.id, agencyServiceId: bService.id,
    areaId: 'central', serviceNameSnapshot: {}, scheduledStartUtc: new Date('2026-12-01T08:00:00Z'), scheduledEndUtc: new Date('2026-12-01T09:00:00Z'), timezoneSnapshot: 'Asia/Riyadh' } });
  const forged = await event('visit.needs_review', bVisit.id);
  await dispatchNotificationEvent(db, forged.id, now);
  expect(await db.notification.count({ where: { tenantId, eventId: forged.id } })).toBe(0);
  expect((await request(app).get('/v1/agency/notification-policies').set('Host', `${other.slug}.localhost`).set('Cookie', cookie)).status).toBe(401);
  expect((await call('get', '/agency/notification-deliveries?tenantId=' + other.id)).status).toBe(422);
});

it('rechecks revoked grants at dispatch and again before email; essential preferences do not disable delivery', async () => {
  const visit = await db.visit.findFirstOrThrow({ where: { tenantId, id: visitId } });
  const customer = await db.customerAccount.create({ data: { tenantId, emailNormalized: `${randomUUID()}@example.invalid`, passwordHash: 'unused', status: 'ACTIVE', emailVerifiedAt: now() } });
  const grant = await db.patientAccess.create({ data: { tenantId, patientId: visit.patientId, customerAccountId: customer.id,
    scopes: ['VIEW_VISITS'], authorizationType: 'AGENCY_VERIFIED_AUTHORITY', verifiedByStaffId: ownerId, verifiedAt: now() } });
  const change = await db.visitChangeRequest.create({ data: { tenantId, visitId, requesterAccountId: customer.id,
    type: 'CANCEL', status: 'APPROVED', reason: 'Synthetic cancellation', policySnapshotJson: {}, decisionByStaffId: ownerId, decisionAt: now() } });
  const e = await event('visit.change_approved', change.id);
  await db.notificationPreference.create({ data: { tenantId, principalType: 'AGENCY_CUSTOMER', principalId: customer.id, eventType: 'VISIT_CANCELLED', channel: 'EMAIL', optedOut: true } });
  await dispatchNotificationEvent(db, e.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: e.id, recipientPrincipalId: customer.id } });
  await db.patientAccess.update({ where: { id: grant.id }, data: { status: 'REVOKED', revokedAt: now() } });
  let sent = 0;
  await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { sent++; } });
  expect(sent).toBe(0);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('SKIPPED');
  const afterRevocation = await event('visit.change_approved', change.id);
  await dispatchNotificationEvent(db, afterRevocation.id, now);
  expect(await db.notification.count({ where: { tenantId, eventId: afterRevocation.id, recipientPrincipalId: customer.id } })).toBe(0);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: afterRevocation.id } })).processedAt).toBeNull();
  const observed = await call('get', '/agency/notification-deliveries');
  expect(observed.body.data.blockedEvents.some((r: { id: string }) => r.id === afterRevocation.id)).toBe(true);
  await db.patientAccess.create({ data: { tenantId, patientId: visit.patientId, customerAccountId: customer.id,
    scopes: ['VIEW_VISITS'], authorizationType: 'AGENCY_VERIFIED_AUTHORITY', verifiedByStaffId: ownerId, verifiedAt: now() } });
  await dispatchNotificationEvent(db, afterRevocation.id, now);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: afterRevocation.id } })).processedAt).not.toBeNull();
  expect(await db.notification.count({ where: { tenantId, eventId: afterRevocation.id, recipientPrincipalId: customer.id } })).toBe(1);
});

it('sends once under concurrent claims and keeps suspended delivery work pending', async () => {
  const e = await event(); await dispatchNotificationEvent(db, e.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: e.id } });
  let sent = 0;
  const deps = { db, tenantId, deliveryId: delivery.id, now, render: () => ({ subject: 'Synthetic', text: 'Synthetic' }),
    send: async () => { sent++; await new Promise((resolve) => setTimeout(resolve, 50)); } };
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
  await deliverNotificationEmail(deps); expect(sent).toBe(0);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).attempts).toBe(0);
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
  await Promise.all([deliverNotificationEmail(deps), deliverNotificationEmail(deps)]);
  expect(sent).toBe(1);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('SENT');
});

it('fences late results from an abandoned execution and fails exhausted leases', async () => {
  const e = await event(); await dispatchNotificationEvent(db, e.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: e.id } });
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const old = deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { started(); await wait; } });
  await ready;
  await db.notificationDelivery.update({ where: { id: delivery.id }, data: { leaseUntil: new Date(0), attempts: 5 } });
  await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { throw new Error('Must not send'); } });
  release(); await old;
  const exhausted = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(exhausted.status).toBe('FAILED'); expect(exhausted.lastErrorCode).toBe('LEASE_EXHAUSTED');
});

it('resolves only the current linked caregiver and rechecks account suspension at send', async () => {
  const staff = await db.staffAccount.create({ data: { tenantId, role: 'CAREGIVER', status: 'ACTIVE', emailVerifiedAt: now(),
    emailNormalized: `${randomUUID()}@example.invalid`, passwordHash: 'unused' } });
  const caregiver = await db.caregiver.create({ data: { tenantId, staffAccountId: staff.id,
    name: 'Synthetic caregiver', professionalCategory: 'Synthetic', operationalStatus: 'ACTIVE' } });
  await db.visit.update({ where: { id: visitId }, data: { status: 'SCHEDULED', assignedCaregiverId: caregiver.id } });
  const e = await event('visit.assigned'); await dispatchNotificationEvent(db, e.id, now);
  const rows = await db.notification.findMany({ where: { tenantId, eventId: e.id } });
  expect(rows).toHaveLength(1); expect(rows[0]?.recipientPrincipalId).toBe(staff.id);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: e.id } });
  await db.staffAccount.update({ where: { id: staff.id }, data: { status: 'SUSPENDED' } });
  let sent = 0;
  await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now, render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { sent++; } });
  expect(sent).toBe(0);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('SKIPPED');
});

it('suppresses obsolete needs-review and cancelled assignment events', async () => {
  await db.visit.update({ where: { id: visitId }, data: { reviewStatus: 'REVIEWED' } });
  const review = await event(); await dispatchNotificationEvent(db, review.id, now);
  expect(await db.notification.count({ where: { tenantId, eventId: review.id } })).toBe(0);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: review.id } })).processedAt).not.toBeNull();
  await db.visit.update({ where: { id: visitId }, data: { status: 'CANCELLED' } });
  const assignment = await event('visit.assigned'); await dispatchNotificationEvent(db, assignment.id, now);
  expect(await db.notification.count({ where: { tenantId, eventId: assignment.id } })).toBe(0);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: assignment.id } })).processedAt).not.toBeNull();
});
