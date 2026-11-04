import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `inbox-${randomUUID().slice(0, 8)}`;
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  now: () => new Date(),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
});
let tenantId: string,
  ownerId: string,
  cookie: string,
  csrf: string,
  otherCookie: string,
  otherCsrf: string;
const ids: string[] = [];
const call = (method: 'get' | 'post' | 'patch', path: string, body?: object, who = cookie) =>
  request(app)
    [method](`/v1${path}`)
    .set('Host', `${slug}.localhost`)
    .set('Cookie', who)
    .set('X-CSRF-Token', csrf)
    .send(body ?? {});

beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: 'Synthetic Inbox',
      displayName: 'Synthetic',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'support@example.invalid',
    },
  });
  tenantId = tenant.id;
  for (const role of ['AGENCY_OWNER', 'CARE_COORDINATOR'] as const) {
    const staff = await db.staffAccount.create({
      data: {
        tenantId,
        role,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailNormalized: `${role}@example.invalid`,
        passwordHash: 'unused',
      },
    });
    const session = await createSession(db, {
      principalId: staff.id,
      principalType: 'AGENCY_STAFF',
      tenantId,
      sessionVersion: 0,
      ttlSeconds: 3600,
    });
    if (role === 'AGENCY_OWNER') {
      ownerId = staff.id;
      cookie = `raak_session_agency=${session.sessionToken}`;
      csrf = session.csrfToken;
    } else {
      otherCookie = `raak_session_agency=${session.sessionToken}`;
      otherCsrf = session.csrfToken;
    }
  }
  for (let i = 0; i < 3; i++) {
    const event = await db.outboxEvent.create({
      data: { tenantId, eventType: 'request.new', aggregateId: randomUUID(), payloadMinimal: {} },
    });
    const row = await db.notification.create({
      data: {
        tenantId,
        eventId: event.id,
        principalType: 'AGENCY_STAFF',
        recipientPrincipalId: ownerId,
        eventType: 'REQUEST_NEW',
        entityType: 'service_request',
        entityId: event.aggregateId,
        createdAt: new Date(`2026-11-04T10:00:0${i}Z`),
      },
    });
    ids.unshift(row.id);
  }
});

it('pages only the current inbox and provides an exact unread count with code-only previews', async () => {
  const page = await call('get', '/notifications?limit=2');
  expect(page.status).toBe(200);
  expect(page.body.data.timezone).toBe('Asia/Riyadh');
  expect(page.body.data.items.map((r: { id: string }) => r.id)).toEqual(ids.slice(0, 2));
  expect(Object.keys(page.body.data.items[0]).sort()).toEqual([
    'createdAt',
    'eventType',
    'id',
    'readAt',
  ]);
  const next = await call(
    'get',
    `/notifications?limit=2&cursor=${encodeURIComponent(page.body.data.nextCursor)}`,
  );
  expect(next.body.data.items.map((r: { id: string }) => r.id)).toEqual(ids.slice(2));
  expect((await call('get', '/notifications/unread-count')).body.data.count).toBe(3);
  expect((await call('get', '/notifications', undefined, otherCookie)).body.data.items).toEqual([]);
  expect((await call('get', '/notifications?tenantId=' + randomUUID())).status).toBe(422);
  expect((await call('get', '/notifications?limit=101')).status).toBe(422);
});

it('marks read monotonically under concurrent replay, denies other recipients and requires CSRF', async () => {
  expect(
    (
      await request(app)
        .post(`/v1/notifications/${ids[0]}/read`)
        .set('Host', `${slug}.localhost`)
        .set('Cookie', cookie)
        .send({})
    ).status,
  ).toBe(403);
  const results = await Promise.all([
    call('post', `/notifications/${ids[0]}/read`, {}),
    call('post', `/notifications/${ids[0]}/read`, {}),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(results[0]!.body.data.readAt).toBe(results[1]!.body.data.readAt);
  expect((await call('get', '/notifications/unread-count')).body.data.count).toBe(2);
  expect(
    (await call('get', '/notifications?unreadOnly=true')).body.data.items.map(
      (r: { id: string }) => r.id,
    ),
  ).toEqual(ids.slice(1));
  expect(
    (await call('get', `/notifications/${ids[0]}/target`, undefined, otherCookie)).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(`/v1/notifications/${ids[0]}/read`)
        .set('Host', `${slug}.localhost`)
        .set('Cookie', otherCookie)
        .set('X-CSRF-Token', otherCsrf)
        .send({})
    ).status,
  ).toBe(404);
  expect(
    (await call('post', `/notifications/${ids[0]}/read`, { readAt: new Date().toISOString() }))
      .status,
  ).toBe(422);
  expect((await call('get', `/notifications/${ids[0]}/target`)).body.data).toEqual({ path: null });
});

it('stores only self optional preferences, rejects protected cells and strict input overrides', async () => {
  const body = {
    preferences: [{ eventType: 'VISIT_REMINDER', channel: 'IN_APP', optedOut: true }],
  };
  expect((await call('patch', '/notifications/preferences', body)).status).toBe(200);
  const prefs = await call('get', '/notifications/preferences');
  expect(
    prefs.body.data.preferences.find(
      (p: { eventType: string; channel: string }) =>
        p.eventType === 'VISIT_REMINDER' && p.channel === 'IN_APP',
    ).optedOut,
  ).toBe(true);
  expect(
    (
      await call('patch', '/notifications/preferences', {
        preferences: [{ eventType: 'VISIT_CANCELLED', channel: 'EMAIL', optedOut: true }],
      })
    ).status,
  ).toBe(422);
  expect(
    (await call('patch', '/notifications/preferences', { ...body, tenantId: randomUUID() })).status,
  ).toBe(422);
  expect(
    (
      await call('patch', '/notifications/preferences', {
        preferences: [...body.preferences, ...body.preferences],
      })
    ).status,
  ).toBe(422);
  const other = await call('get', '/notifications/preferences', undefined, otherCookie);
  expect(
    other.body.data.preferences.find(
      (p: { eventType: string; channel: string }) =>
        p.eventType === 'VISIT_REMINDER' && p.channel === 'IN_APP',
    ).optedOut,
  ).toBe(false);
  expect(
    (
      await request(app)
        .patch('/v1/notifications/preferences')
        .set('Host', `${slug}.localhost`)
        .set('Cookie', cookie)
        .send(body)
    ).status,
  ).toBe(403);
  await call('patch', '/agency/notification-policies', {
    expectedVersion: 0,
    policies: [{ eventType: 'VISIT_REMINDER', channel: 'EMAIL', enabled: false }],
  });
  await call('patch', '/notifications/preferences', {
    preferences: [{ eventType: 'VISIT_REMINDER', channel: 'EMAIL', optedOut: false }],
  });
  const effective = (await call('get', '/notifications/preferences')).body.data.preferences.find(
    (p: { eventType: string; channel: string }) =>
      p.eventType === 'VISIT_REMINDER' && p.channel === 'EMAIL',
  );
  expect(effective).toMatchObject({ optedOut: false, tenantEnabled: false });
});

it('rechecks customer grants, caregiver assignment, tenant and principal type without leaking resource details', async () => {
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic secret beneficiary',
      normalizedName: 'synthetic',
      areaId: 'central',
    },
  });
  const service = await db.agencyService.create({
    data: { tenantId, slug: 'synthetic', config: {} },
  });
  const customer = await db.customerAccount.create({
    data: {
      tenantId,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      emailNormalized: 'customer@example.invalid',
      passwordHash: 'unused',
    },
  });
  const cgStaff = await db.staffAccount.create({
    data: {
      tenantId,
      role: 'CAREGIVER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      emailNormalized: 'caregiver@example.invalid',
      passwordHash: 'unused',
    },
  });
  const caregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: cgStaff.id,
      name: 'Synthetic caregiver',
      professionalCategory: 'synthetic',
      operationalStatus: 'ACTIVE',
    },
  });
  const visit = await db.visit.create({
    data: {
      tenantId,
      patientId: patient.id,
      agencyServiceId: service.id,
      assignedCaregiverId: caregiver.id,
      status: 'SCHEDULED',
      areaId: 'central',
      serviceNameSnapshot: {},
      scheduledStartUtc: new Date('2026-12-01T08:00:00Z'),
      scheduledEndUtc: new Date('2026-12-01T09:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
    },
  });
  const grant = await db.patientAccess.create({
    data: {
      tenantId,
      patientId: patient.id,
      customerAccountId: customer.id,
      scopes: ['VIEW_VISITS'],
      authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
      verifiedByStaffId: ownerId,
      verifiedAt: new Date(),
    },
  });
  for (const [type, principalId, destination] of [
    ['AGENCY_CUSTOMER', customer.id, '/my/visits'],
    ['AGENCY_STAFF', cgStaff.id, '/caregiver/visits'],
  ] as const) {
    const session = await createSession(db, {
      principalId,
      principalType: type,
      tenantId,
      sessionVersion: 0,
      ttlSeconds: 3600,
    });
    const who = `raak_session_agency=${session.sessionToken}`;
    const event = await db.outboxEvent.create({
      data: { tenantId, eventType: 'synthetic', aggregateId: visit.id, payloadMinimal: {} },
    });
    const notice = await db.notification.create({
      data: {
        tenantId,
        eventId: event.id,
        principalType: type,
        recipientPrincipalId: principalId,
        eventType: 'VISIT_CHANGED',
        entityType: 'visit',
        entityId: visit.id,
      },
    });
    const target = await call('get', `/notifications/${notice.id}/target`, undefined, who);
    expect(target.body.data.path).toBe(`${destination}?visit=${visit.id}`);
    if (type === 'AGENCY_CUSTOMER') {
      await db.patientAccess.update({ where: { id: grant.id }, data: { expiresAt: new Date(0) } });
      expect(
        (await call('get', `/notifications/${notice.id}/target`, undefined, who)).body.data.path,
      ).toBeNull();
      await db.patientAccess.update({ where: { id: grant.id }, data: { expiresAt: null } });
    }
    expect(
      JSON.stringify((await call('get', '/notifications', undefined, who)).body),
    ).not.toContain('beneficiary');
    if (type === 'AGENCY_CUSTOMER')
      await db.patientAccess.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), status: 'REVOKED' },
      });
    else await db.visit.update({ where: { id: visit.id }, data: { assignedCaregiverId: null } });
    expect(
      (await call('get', `/notifications/${notice.id}/target`, undefined, who)).body.data,
    ).toEqual({ path: null });
    expect((await call('get', '/notifications/unread-count', undefined, who)).body.data.count).toBe(
      1,
    );
    expect(
      (
        await request(app)
          .patch('/v1/notifications/preferences')
          .set('Host', `${slug}.localhost`)
          .set('Cookie', who)
          .set('X-CSRF-Token', session.csrfToken)
          .send({
            preferences: [{ eventType: 'VISIT_REMINDER', channel: 'EMAIL', optedOut: true }],
          })
      ).status,
    ).toBe(200);
    await db.authSession.updateMany({
      where: { tenantId, principalId },
      data: { revokedAt: new Date() },
    });
    expect((await call('get', '/notifications', undefined, who)).status).toBe(401);
  }
  // Same UUID but a different polymorphic principal type must not share an inbox.
  const event = await db.outboxEvent.create({
    data: { tenantId, eventType: 'synthetic', aggregateId: randomUUID(), payloadMinimal: {} },
  });
  await db.notification.create({
    data: {
      tenantId,
      eventId: event.id,
      principalType: 'AGENCY_CUSTOMER',
      recipientPrincipalId: ownerId,
      eventType: 'VISIT_CHANGED',
      entityType: 'visit',
      entityId: visit.id,
    },
  });
  expect((await call('get', '/notifications/unread-count')).body.data.count).toBe(2);
  const other = await db.tenant.create({
    data: {
      slug: `inbox-b-${randomUUID().slice(0, 8)}`,
      legalName: 'Synthetic B',
      displayName: 'Synthetic',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'support@example.invalid',
    },
  });
  expect(
    (
      await request(app)
        .get('/v1/notifications')
        .set('Host', `${other.slug}.localhost`)
        .set('Cookie', cookie)
    ).status,
  ).toBe(401);
  const bEvent = await db.outboxEvent.create({
    data: {
      tenantId: other.id,
      eventType: 'synthetic',
      aggregateId: randomUUID(),
      payloadMinimal: {},
    },
  });
  const bNotice = await db.notification.create({
    data: {
      tenantId: other.id,
      eventId: bEvent.id,
      principalType: 'AGENCY_STAFF',
      recipientPrincipalId: ownerId,
      eventType: 'REQUEST_NEW',
      entityType: 'visit',
      entityId: visit.id,
    },
  });
  expect((await call('post', `/notifications/${bNotice.id}/read`, {})).status).toBe(404);
  expect((await call('get', `/notifications/${bNotice.id}/target`)).status).toBe(404);
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
  expect((await call('get', '/notifications')).status).toBe(401);
});
