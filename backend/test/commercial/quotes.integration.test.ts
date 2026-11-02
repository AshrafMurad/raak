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

const db = getPrisma();
const slug = `com-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const hostB = `${slug}-b.localhost`;
const encryptionKey = 'synthetic-test-key-at-least-32-characters';
const customConfig = {
  nameAr: 'خدمة عرض سعر',
  nameEn: 'Synthetic quoted service',
  summaryAr: 'ملخص',
  summaryEn: 'Summary',
  descriptionAr: 'للتجربة فقط',
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
const fixedConfig = {
  ...customConfig,
  pricingType: 'FIXED',
  priceMinor: 15000,
  pricingUnit: 'VISIT',
};
const app = buildApp({
  env: loadApiEnv({
    BASE_DOMAIN: 'localhost',
    SESSION_SECRET: encryptionKey,
    API_CORS_ORIGINS: `http://${host}:3000`,
  }),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
  db,
});
let tenantId: string;
let tenantB: string;
let ownerCookie: string;
let ownerCsrf: string;
let coordinatorCookie: string;
let coordinatorCsrf: string;
let caregiverCookie: string;
let caregiverCsrf: string;
let ownerBCookie: string;
let ownerBCsrf: string;
let customServiceId: string;
let customServiceVersion = 1;
let fixedServiceId: string;
let requestId = '';
let fixedRequestId = '';
let guestCookie = '';
let guestCookieFixed = '';

async function staffSession(
  tenantId: string,
  role: 'AGENCY_OWNER' | 'CARE_COORDINATOR' | 'CAREGIVER',
) {
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      role,
      status: 'ACTIVE',
      emailNormalized: `${slug}-${role.toLowerCase()}-${randomUUID().slice(0, 6)}@example.invalid`,
      passwordHash: await hashPassword('Synthetic-Password-1!'),
    },
  });
  const session = await createSession(db, {
    principalType: 'AGENCY_STAFF',
    principalId: staff.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  return {
    cookie: `raak_session_agency=${session.sessionToken}`,
    csrf: session.csrfToken,
  };
}

async function submitGuestRequest(serviceId: string, serviceVersion: number, email: string) {
  const key = randomUUID();
  const res = await request(app)
    .post('/v1/portal/requests')
    .set('Host', host)
    .set('Idempotency-Key', key)
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
      priceAcknowledged: serviceId === fixedServiceId,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; reference: string };
}

/** Consume the newest access capability for a request into a guest cookie. */
async function guestCookieFor(tenant: string, requestRowId: string, reqHost: string) {
  const tokenRow = await db.guestActionToken.findFirstOrThrow({
    where: { tenantId: tenant, requestId: requestRowId, consumedAt: null },
    orderBy: { expiresAt: 'desc' },
  });
  const token = openSecret(tokenRow.encryptedSecret!, encryptionKey, `${tenant}:${tokenRow.id}`);
  const res = await request(app)
    .post('/v1/portal/requests/access-link/consume')
    .set('Host', reqHost)
    .send({ token });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.headers['set-cookie']![0]).split(';')[0]!;
}

async function cleanupTenant(tenant: string) {
  await db.idempotencyKey.deleteMany({ where: { tenantId: tenant } });
  await db.requestNotification.deleteMany({ where: { tenantId: tenant } });
  await db.quoteRevisionRequest.deleteMany({ where: { tenantId: tenant } });
  await db.quote.deleteMany({ where: { tenantId: tenant } });
  await db.guestSession.deleteMany({ where: { tenantId: tenant } });
  await db.guestActionToken.deleteMany({ where: { tenantId: tenant } });
  await db.requestStatusHistory.deleteMany({ where: { tenantId: tenant } });
  await db.serviceRequest.deleteMany({ where: { tenantId: tenant } });
  await db.agencyService.deleteMany({ where: { tenantId: tenant } });
  await db.emailDelivery.deleteMany({ where: { tenantId: tenant } });
  await db.outboxEvent.deleteMany({ where: { tenantId: tenant } });
  await db.auditEvent.deleteMany({ where: { tenantId: tenant } });
  await db.authSession.deleteMany({ where: { tenantId: tenant } });
  await db.customerAccount.deleteMany({ where: { tenantId: tenant } });
  await db.staffAccount.deleteMany({ where: { tenantId: tenant } });
  await db.tenant.delete({ where: { id: tenant } });
}

beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: 'Synthetic Commercial',
      displayName: 'Synthetic Commercial',
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
  const owner = await staffSession(tenantId, 'AGENCY_OWNER');
  ownerCookie = owner.cookie;
  ownerCsrf = owner.csrf;
  const coordinator = await staffSession(tenantId, 'CARE_COORDINATOR');
  coordinatorCookie = coordinator.cookie;
  coordinatorCsrf = coordinator.csrf;
  const caregiver = await staffSession(tenantId, 'CAREGIVER');
  caregiverCookie = caregiver.cookie;
  caregiverCsrf = caregiver.csrf;
  const ownerB = await staffSession(tenantB, 'AGENCY_OWNER');
  ownerBCookie = ownerB.cookie;
  ownerBCsrf = ownerB.csrf;

  for (const [path, config] of [
    ['synthetic-quoted', customConfig],
    ['synthetic-fixed', fixedConfig],
  ] as const) {
    const res = await request(app)
      .post('/v1/agency/services')
      .set('Host', host)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ slug: path, config });
    expect(res.status).toBe(201);
    if (path === 'synthetic-quoted') customServiceId = res.body.data.id;
    else fixedServiceId = res.body.data.id;
    const publish = await request(app)
      .post(`/v1/agency/services/${res.body.data.id}/publish`)
      .set('Host', host)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ expectedVersion: 1 });
    expect(publish.status).toBe(200);
  }
  customServiceVersion = (
    await db.agencyService.findUniqueOrThrow({ where: { id: customServiceId } })
  ).version;

  const submitted = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    'quote@example.invalid',
  );
  requestId = submitted.id;
  guestCookie = await guestCookieFor(tenantId, requestId, host);
  const fixedSubmitted = await submitGuestRequest(fixedServiceId, 2, 'fixed@example.invalid');
  fixedRequestId = fixedSubmitted.id;
  guestCookieFixed = await guestCookieFor(tenantId, fixedRequestId, host);
});

afterAll(async () => {
  if (tenantId) await cleanupTenant(tenantId);
  if (tenantB) await cleanupTenant(tenantB);
});

const staffPost = (cookie: string, csrf: string, path: string, body?: object, reqHost = host) =>
  request(app)
    .post(`/v1${path}`)
    .set('Host', reqHost)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send(body);
const staffGet = (cookie: string, path: string, reqHost = host) =>
  request(app).get(`/v1${path}`).set('Host', reqHost).set('Cookie', cookie);
const guestPost = (cookie: string, path: string, body: object, reqHost = host) =>
  request(app).post(`/v1${path}`).set('Host', reqHost).set('Cookie', cookie).send(body);
const guestGet = (cookie: string, path: string, reqHost = host) =>
  request(app).get(`/v1${path}`).set('Host', reqHost).set('Cookie', cookie);
const lineItems = [
  { description: '12 home visits', quantity: 12, unitPriceMinor: 15000 },
  { description: 'Assessment visit', quantity: 1, unitPriceMinor: 10000 },
];

it('runs the E03 revision journey: send v1, revise, replace with v2, accept, approve', async () => {
  // Coordinator starts review, drafts and sends quote v1.
  const detail = await staffGet(coordinatorCookie, `/agency/requests/${requestId}`);
  expect(detail.status).toBe(200);
  const start = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${requestId}/start-review`,
    { expectedVersion: detail.body.data.version },
  );
  expect(start.status).toBe(200);
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${requestId}/quotes`,
    {
      lineItems,
      terms: 'Scope: weekly visits for one month. Excludes medical supplies.',
    },
  );
  expect(draft.status).toBe(201);
  expect(draft.body.data.totalMinor).toBe(190000);
  expect(draft.body.data.status).toBe('DRAFT');
  const draftId = draft.body.data.id as string;
  const edited = await request(app)
    .patch(`/v1/agency/quotes/${draftId}/draft`)
    .set('Host', host)
    .set('Cookie', coordinatorCookie)
    .set('X-CSRF-Token', coordinatorCsrf)
    .send({
      expectedVersion: 1,
      terms: 'Scope: weekly visits for one month. Includes assessment.',
    });
  expect(edited.status).toBe(200);
  expect(edited.body.data.rowVersion).toBe(2);
  // Drafts are invisible to the verified requester.
  expect(
    (await guestGet(guestCookie, `/portal/my/requests/${requestId}/quotes`)).body.data.items,
  ).toEqual([]);
  const sent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${draftId}/send`,
    {
      expectedVersion: 2,
      validForHours: 72,
    },
  );
  expect(sent.status).toBe(200);
  expect(sent.body.data.status).toBe('SENT');
  expect(sent.body.data.version).toBe(1);
  const portalList = await guestGet(guestCookie, `/portal/my/requests/${requestId}/quotes`);
  expect(portalList.status).toBe(200);
  expect(portalList.body.data.items).toHaveLength(1);
  expect(portalList.body.data.items[0]).not.toHaveProperty('rowVersion');
  const quoteV1 = portalList.body.data.items[0].id as string;

  // Requester asks for a revision; acceptance is blocked while PENDING (U11).
  const revision = await guestPost(guestCookie, `/portal/my/quotes/${quoteV1}/revision-requests`, {
    quoteVersion: 1,
    message: 'Please reduce the visit count to eight and adjust the total.',
  });
  expect(revision.status).toBe(201);
  expect(revision.body.data.status).toBe('PENDING');
  const pendingView = await guestGet(guestCookie, `/portal/my/requests/${requestId}/quotes`);
  expect(pendingView.body.data.items[0].revisionPending).toBe(true);
  const blocked = await guestPost(guestCookie, `/portal/my/quotes/${quoteV1}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.code).toBe('QUOTE_REVISION_PENDING');
  const duplicateRevision = await guestPost(
    guestCookie,
    `/portal/my/quotes/${quoteV1}/revision-requests`,
    { quoteVersion: 1, message: 'Another synthetic revision request message.' },
  );
  expect(duplicateRevision.status).toBe(409);

  // Coordinator resolves with replacement v2; v1 is superseded atomically.
  const revisions = await staffGet(
    coordinatorCookie,
    `/agency/quotes/${quoteV1}/revision-requests`,
  );
  expect(revisions.status).toBe(200);
  expect(revisions.body.data.items).toHaveLength(1);
  const replacement = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quote-revisions/${revisions.body.data.items[0].id}/resolve-with-replacement`,
    {
      validForHours: 48,
      lineItems: [
        { description: '8 home visits', quantity: 8, unitPriceMinor: 15000 },
        { description: 'Assessment visit', quantity: 1, unitPriceMinor: 10000 },
      ],
      terms: 'Revised scope: eight visits plus assessment.',
    },
  );
  expect(replacement.status).toBe(201);
  expect(replacement.body.data.version).toBe(2);
  expect(replacement.body.data.status).toBe('SENT');
  expect(replacement.body.data.totalMinor).toBe(130000);
  expect((await db.quote.findUniqueOrThrow({ where: { id: quoteV1 } })).status).toBe('SUPERSEDED');
  expect(
    (await db.quoteRevisionRequest.findFirstOrThrow({ where: { quoteId: quoteV1 } })).status,
  ).toBe('RESOLVED');

  // I10: v1 acceptance is rejected after replacement.
  const staleAccept = await guestPost(guestCookie, `/portal/my/quotes/${quoteV1}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(staleAccept.status).toBe(409);
  expect(staleAccept.body.error.code).toBe('QUOTE_SUPERSEDED');
  const quoteV2 = replacement.body.data.id as string;

  // Approving before the customer accepts must fail the prerequisite check.
  const midDetail = await staffGet(coordinatorCookie, `/agency/requests/${requestId}`);
  const premature = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${requestId}/approve`,
    {
      expectedVersion: midDetail.body.data.version,
      feasibilityConfirmed: true,
    },
  );
  expect(premature.status).toBe(409);
  expect(premature.body.error.code).toBe('STATE_TRANSITION_INVALID');

  // I11: acceptance is idempotent by key — one acceptance, one outbox event.
  const acceptKey = randomUUID();
  const accept = () =>
    guestPost(guestCookie, `/portal/my/quotes/${quoteV2}/accept`, { quoteVersion: 2 }).set(
      'Idempotency-Key',
      acceptKey,
    );
  const [first, replay] = await Promise.all([accept(), accept()]);
  expect([first.status, replay.status].sort()).toEqual([200, 200]);
  expect(first.body.data.status).toBe('ACCEPTED');
  expect(replay.body.data.status).toBe('ACCEPTED');
  const wrongReplayVersion = await guestPost(guestCookie, `/portal/my/quotes/${quoteV2}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(wrongReplayVersion.status).toBe(409);
  expect(wrongReplayVersion.body.error.code).toBe('VERSION_CONFLICT');
  expect(await db.quote.count({ where: { tenantId, id: quoteV2, status: 'ACCEPTED' } })).toBe(1);
  expect(
    await db.outboxEvent.count({
      where: { tenantId, eventType: 'quote.responded', aggregateId: quoteV2 },
    }),
  ).toBe(1);
  const conflicting = await guestPost(guestCookie, `/portal/my/quotes/${quoteV2}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', acceptKey);
  expect(conflicting.status).toBe(409);
  expect(conflicting.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

  // Coordinator approves once the accepted quote prerequisite holds.
  const refreshed = await staffGet(coordinatorCookie, `/agency/requests/${requestId}`);
  const approved = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${requestId}/approve`,
    {
      expectedVersion: refreshed.body.data.version,
      feasibilityConfirmed: true,
    },
  );
  expect(approved.status).toBe(200);
  expect(approved.body.data.status).toBe('APPROVED');
  const row = await db.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect(row.decisionAt).not.toBeNull();
  expect(row.decisionStaffId).not.toBeNull();
  const acceptedQuote = await db.quote.findUniqueOrThrow({ where: { id: quoteV2 } });
  expect(acceptedQuote.acceptedAt).not.toBeNull();
  // Historical snapshot survives approval immutably.
  expect(acceptedQuote.totalMinor).toBe(130000);
});

it('denies quote actions across tenants, roles and unauthenticated callers', async () => {
  const detail = await staffGet(coordinatorCookie, `/agency/requests/${requestId}`);
  expect(detail.status).toBe(200);
  const requestB = await db.serviceRequest.findFirst({ where: { tenantId: tenantB } });
  expect(requestB).toBeNull();
  const crossTenant = await staffGet(ownerBCookie, `/agency/requests/${requestId}`, hostB);
  expect(crossTenant.status).toBe(404);
  expect(
    (
      await staffPost(
        ownerBCookie,
        ownerBCsrf,
        `/agency/requests/${requestId}/quotes`,
        { lineItems, terms: 't' },
        hostB,
      )
    ).status,
  ).toBe(404);
  expect((await staffGet(ownerBCookie, `/agency/requests/${requestId}/quotes`, hostB)).status).toBe(
    404,
  );
  expect(
    (
      await staffPost(caregiverCookie, caregiverCsrf, `/agency/requests/${requestId}/quotes`, {
        lineItems,
        terms: 't',
      })
    ).status,
  ).toBe(403);
  expect(
    (await request(app).get(`/v1/agency/requests/${requestId}/quotes`).set('Host', host)).status,
  ).toBe(401);
  const quote = await db.quote.findFirstOrThrow({ where: { tenantId, requestId } });
  expect(
    (await request(app).get(`/v1/portal/my/requests/${requestId}/quotes`).set('Host', host)).status,
  ).toBe(401);
  expect(
    (
      (await guestGet(guestCookie, `/portal/my/quotes/${quote.id}/accept`)) as unknown as {
        status: number;
      }
    ).status,
  ).toBe(404);
  // A verified guest of one request cannot act on another request's quotes.
  const otherDraft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/quotes`,
    {
      lineItems: [{ description: 'Foreign-offer guard', quantity: 1, unitPriceMinor: 5000 }],
      terms: 'Synthetic terms for the foreign-action guard.',
    },
  );
  expect(otherDraft.status).toBe(201);
  const otherSent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${otherDraft.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 24,
    },
  );
  expect(otherSent.status).toBe(200);
  const otherQuote = await db.quote.findFirstOrThrow({
    where: { tenantId, requestId: fixedRequestId, status: 'SENT' },
  });
  const foreign = await guestPost(guestCookie, `/portal/my/quotes/${otherQuote.id}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(foreign.status).toBe(404);
  // Staff session cookie never grants portal customer actions.
  expect(
    (
      await guestPost(coordinatorCookie, `/portal/my/quotes/${quote.id}/accept`, {
        quoteVersion: 1,
      }).set('Idempotency-Key', randomUUID())
    ).status,
  ).toBe(401);
});

it('expires SENT offers by wall clock and keeps them unacceptable (lazy expiry)', async () => {
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/quotes`,
    {
      lineItems: [{ description: 'Fixed-scope visit package', quantity: 4, unitPriceMinor: 15000 }],
      terms: 'Synthetic terms for the expiry scenario.',
    },
  );
  expect(draft.status).toBe(201);
  const sent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${draft.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 1,
    },
  );
  expect(sent.status).toBe(200);
  const quoteId = sent.body.data.id as string;
  // Simulate elapsed time deterministically, then exercise the lazy check.
  await db.quote.update({
    where: { id: quoteId },
    data: { validUntil: new Date(Date.now() - 1000) },
  });
  const accept = await guestPost(guestCookieFixed, `/portal/my/quotes/${quoteId}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(accept.status).toBe(409);
  expect(accept.body.error.code).toBe('QUOTE_EXPIRED');
  const portal = await guestGet(guestCookieFixed, `/portal/my/requests/${fixedRequestId}/quotes`);
  expect(portal.body.data.items.at(-1).status).toBe('EXPIRED');
  expect((await db.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('EXPIRED');
  const revision = await guestPost(
    guestCookieFixed,
    `/portal/my/quotes/${quoteId}/revision-requests`,
    {
      quoteVersion: 1,
      message: 'Attempted revision on an expired synthetic offer.',
    },
  );
  expect(revision.status).toBe(409);
  expect(revision.body.error.code).toBe('QUOTE_EXPIRED');
});

it('supports request-info/respond and withdraw with terminal guards', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `info-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  const started = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/start-review`,
    {
      expectedVersion: 1,
    },
  );
  expect(started.status).toBe(200);
  const info = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/request-info`,
    {
      expectedVersion: 2,
      note: 'Please share the preferred morning hours for assessment.',
    },
  );
  expect(info.status).toBe(200);
  expect(info.body.data.status).toBe('AWAITING_CUSTOMER');
  const duplicateInfo = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/request-info`,
    {
      expectedVersion: 2,
      note: 'Duplicate transition attempt from the wrong state.',
    },
  );
  expect(duplicateInfo.status).toBe(409);
  const respond = await guestPost(cookie, `/portal/my/requests/${extra.id}/respond`, {
    note: 'Mornings between 9 and 11 work best for us.',
  });
  expect(respond.status).toBe(200);
  expect(respond.body.data.status).toBe('UNDER_REVIEW');
  const withdraw = await guestPost(cookie, `/portal/my/requests/${extra.id}/withdraw`, {
    reason: '',
  });
  expect(withdraw.status).toBe(200);
  expect(withdraw.body.data.status).toBe('WITHDRAWN');
  const withdrawnRow = await db.serviceRequest.findUniqueOrThrow({ where: { id: extra.id } });
  expect(withdrawnRow.decisionAt).not.toBeNull();
  expect(
    (await guestPost(cookie, `/portal/my/requests/${extra.id}/respond`, { note: 'nope' })).status,
  ).toBe(409);
  const withdrawAgain = await guestPost(cookie, `/portal/my/requests/${extra.id}/withdraw`, {});
  expect(withdrawAgain.status).toBe(409);
  expect(
    (
      await staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/quotes`, {
        lineItems,
        terms: 'Draft on a withdrawn request must be refused.',
      })
    ).status,
  ).toBe(409);
});

it('approves a FIXED-price request from its immutable acknowledgment snapshot', async () => {
  // Keep the unchanged fixed-price agreement separate from quote/expiry fixtures.
  const fixed = await submitGuestRequest(
    fixedServiceId,
    2,
    `ack-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const fixedRequestId = fixed.id;
  const started = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/start-review`,
    {
      expectedVersion: 1,
    },
  );
  expect(started.status).toBe(200);
  const missingConfirmation = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/approve`,
    { expectedVersion: started.body.data.version },
  );
  expect(missingConfirmation.status).toBe(422);
  const approved = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/approve`,
    {
      expectedVersion: started.body.data.version,
      feasibilityConfirmed: true,
    },
  );
  expect(approved.status).toBe(200);
  expect(approved.body.data.status).toBe('APPROVED');
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { tenantId, subjectId: fixedRequestId, action: 'request.approved' },
  });
  expect(audit.metadataJson).toEqual({ commercial: 'FIXED_ACK' });
  const rejectAfterDecision = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/reject`,
    { expectedVersion: approved.body.data.version, reason: 'Terminal state guard check.' },
  );
  expect(rejectAfterDecision.status).toBe(409);
});

it('requires acceptance of a formal quote even when the original request had a FIXED acknowledgment', async () => {
  const started = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/start-review`,
    {
      expectedVersion: 1,
    },
  );
  expect(started.status).toBe(200);
  // This fixture already has sent and expired revised prices: the original
  // acknowledgment cannot silently restore the old commercial scope.
  const approve = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${fixedRequestId}/approve`, {
      expectedVersion: started.body.data.version,
      feasibilityConfirmed: true,
    });
  expect((await approve()).status).toBe(409);
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${fixedRequestId}/quotes`,
    {
      lineItems,
      terms: 'Formal replacement of the original fixed-price scope.',
    },
  );
  expect(draft.status).toBe(201);
  const sent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${draft.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 24,
    },
  );
  expect(sent.status).toBe(200);
  expect((await approve()).status).toBe(409);
  const accepted = await guestPost(
    guestCookieFixed,
    `/portal/my/quotes/${sent.body.data.id}/accept`,
    {
      quoteVersion: sent.body.data.version,
    },
  ).set('Idempotency-Key', randomUUID());
  expect(accepted.status).toBe(200);
  expect((await approve()).status).toBe(200);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { tenantId, subjectId: fixedRequestId, action: 'request.approved' },
  });
  expect(audit.metadataJson).toMatchObject({ commercial: 'QUOTE' });
});

it('serializes concurrent draft creation (one winner)', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `race-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  await staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/start-review`, {
    expectedVersion: 1,
  });
  const create = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/quotes`, {
      lineItems,
      terms: 'Concurrent draft creation race scenario.',
    });
  const results = await Promise.all([create(), create()]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const drafts = await db.quote.findMany({
    where: { tenantId, requestId: extra.id, status: 'DRAFT' },
  });
  expect(drafts).toHaveLength(1);
});

it('freezes the commercial process after acceptance, including drafts prepared before acceptance', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `freeze-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  const create = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/quotes`, {
      lineItems,
      terms: 'Synthetic agreement must not be amended after acceptance.',
    });
  const first = await create();
  expect(first.status).toBe(201);
  expect(
    (
      await staffPost(
        coordinatorCookie,
        coordinatorCsrf,
        `/agency/quotes/${first.body.data.id}/send`,
        {
          expectedVersion: 1,
          validForHours: 24,
        },
      )
    ).status,
  ).toBe(200);
  const prepared = await create();
  expect(prepared.status).toBe(201);
  expect(
    (
      await guestPost(cookie, `/portal/my/quotes/${first.body.data.id}/accept`, {
        quoteVersion: 1,
      }).set('Idempotency-Key', randomUUID())
    ).status,
  ).toBe(200);
  const send = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${prepared.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 24,
    },
  );
  expect(send.status).toBe(409);
  const another = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `freeze-new-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const anotherCookie = await guestCookieFor(tenantId, another.id, host);
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${another.id}/quotes`,
    {
      lineItems,
      terms: 'No new drafts after agreement.',
    },
  );
  expect(
    (
      await staffPost(
        coordinatorCookie,
        coordinatorCsrf,
        `/agency/quotes/${draft.body.data.id}/send`,
        {
          expectedVersion: 1,
          validForHours: 24,
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await guestPost(anotherCookie, `/portal/my/quotes/${draft.body.data.id}/accept`, {
        quoteVersion: 1,
      }).set('Idempotency-Key', randomUUID())
    ).status,
  ).toBe(200);
  expect(
    (
      await staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${another.id}/quotes`, {
        lineItems,
        terms: 'Forbidden post-acceptance draft.',
      })
    ).status,
  ).toBe(409);
  expect(
    await db.quote.count({ where: { tenantId, requestId: extra.id, status: 'ACCEPTED' } }),
  ).toBe(1);
  expect(
    await db.outboxEvent.count({
      where: { tenantId, aggregateId: prepared.body.data.id, eventType: 'quote.sent' },
    }),
  ).toBe(0);
});

it('refuses expired pending-revision replacement through either publication route at the expiry boundary', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `expiry-rev-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  const create = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/quotes`, {
      lineItems,
      terms: 'Expiry replacement guard.',
    });
  const first = await create();
  const sent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${first.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 1,
    },
  );
  expect(sent.status).toBe(200);
  const revision = await guestPost(
    cookie,
    `/portal/my/quotes/${first.body.data.id}/revision-requests`,
    {
      quoteVersion: 1,
      message: 'Synthetic pending revision at expiry.',
    },
  );
  expect(revision.status).toBe(201);
  const draft = await create();
  expect(draft.status).toBe(201);
  const boundaryApp = buildApp({
    env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: encryptionKey }),
    logger: createLogger({ service: 'test', write: () => {} }),
    health: { checkDatabase: async () => true },
    now: () => new Date(sent.body.data.validUntil),
    db,
  });
  const publish = (path: string, body: object) =>
    request(boundaryApp)
      .post(`/v1${path}`)
      .set('Host', host)
      .set('Cookie', coordinatorCookie)
      .set('X-CSRF-Token', coordinatorCsrf)
      .send(body);
  const direct = await publish(
    `/agency/quote-revisions/${revision.body.data.id}/resolve-with-replacement`,
    {
      lineItems,
      terms: 'Expired replacement.',
      validForHours: 24,
    },
  );
  expect(direct.status).toBe(409);
  const generic = await publish(`/agency/quotes/${draft.body.data.id}/send`, {
    expectedVersion: 1,
    validForHours: 24,
  });
  expect(generic.status).toBe(409);
  expect(
    (await db.quoteRevisionRequest.findUniqueOrThrow({ where: { id: revision.body.data.id } }))
      .status,
  ).toBe('PENDING');
  expect((await db.quote.findUniqueOrThrow({ where: { id: draft.body.data.id } })).status).toBe(
    'DRAFT',
  );
  expect(await db.outboxEvent.count({ where: { tenantId, aggregateId: draft.body.data.id } })).toBe(
    0,
  );
});

it('authorizes linked verified customer cookies, enforces CSRF and rechecks account/session state', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `account-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const customer = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: `customer-${randomUUID()}@example.invalid`,
      passwordHash: await hashPassword('Synthetic-Password-1!'),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await db.serviceRequest.update({
    where: { id: extra.id },
    data: { customerAccountId: customer.id },
  });
  const session = await createSession(db, {
    principalType: 'AGENCY_CUSTOMER',
    principalId: customer.id,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  const cookie = `raak_session_agency=${session.sessionToken}`;
  const list = await guestGet(cookie, `/portal/my/requests/${extra.id}/quotes`);
  expect(list.status).toBe(200);
  expect((await guestGet(cookie, `/portal/my/requests/${extra.id}`)).status).toBe(200);
  expect((await guestGet(cookie, `/portal/my/requests/${requestId}/quotes`)).status).toBe(404);
  expect((await guestGet(cookie, `/portal/my/requests/${extra.id}/quotes`, hostB)).status).toBe(
    401,
  );
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems,
      terms: 'Linked customer agreement.',
    },
  );
  expect(
    (
      await staffPost(
        coordinatorCookie,
        coordinatorCsrf,
        `/agency/quotes/${draft.body.data.id}/send`,
        {
          expectedVersion: 1,
          validForHours: 24,
        },
      )
    ).status,
  ).toBe(200);
  const accept = () =>
    guestPost(cookie, `/portal/my/quotes/${draft.body.data.id}/accept`, {
      quoteVersion: 1,
    }).set('Idempotency-Key', randomUUID());
  expect((await accept()).status).toBe(403);
  expect((await accept().set('X-CSRF-Token', 'wrong')).status).toBe(403);
  expect((await accept().set('X-CSRF-Token', session.csrfToken)).status).toBe(200);
  await db.customerAccount.update({ where: { id: customer.id }, data: { status: 'SUSPENDED' } });
  expect((await guestGet(cookie, `/portal/my/requests/${extra.id}/quotes`)).status).toBe(401);
  await db.customerAccount.update({
    where: { id: customer.id },
    data: { status: 'ACTIVE', emailVerifiedAt: null },
  });
  expect((await guestGet(cookie, `/portal/my/requests/${extra.id}/quotes`)).status).toBe(401);
  await db.customerAccount.update({
    where: { id: customer.id },
    data: { emailVerifiedAt: new Date() },
  });
  await db.authSession.update({
    where: { id: session.sessionId },
    data: { revokedAt: new Date() },
  });
  expect((await guestGet(cookie, `/portal/my/requests/${extra.id}/quotes`)).status).toBe(401);
});

it('validates money against PostgreSQL storage bounds before persistence', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `money-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const oversized = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems: [{ description: 'Too large', quantity: 22, unitPriceMinor: 100000000 }],
      terms: 'Synthetic limits.',
    },
  );
  expect(oversized.status).toBe(422);
  const items = [
    { description: 'Synthetic package', quantity: 21, unitPriceMinor: 100000000 },
    { description: 'Synthetic remainder', quantity: 1, unitPriceMinor: 47483647 },
  ];
  const boundary = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems: items,
      terms: 'Largest supported stored total.',
    },
  );
  expect(boundary.status).toBe(201);
  expect(boundary.body.data.totalMinor).toBe(2147483647);
  const aboveBoundary = await request(app)
    .patch(`/v1/agency/quotes/${boundary.body.data.id}/draft`)
    .set('Host', host)
    .set('Cookie', coordinatorCookie)
    .set('X-CSRF-Token', coordinatorCsrf)
    .send({ expectedVersion: 1, lineItems: [items[0], { ...items[1], unitPriceMinor: 47483648 }] });
  expect(aboveBoundary.status).toBe(422);
});

it('serializes acceptance against replacement publication without conflicting agreements', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `accept-race-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  const create = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/quotes`, {
      lineItems,
      terms: 'Acceptance versus replacement race.',
    });
  const first = await create();
  expect(
    (
      await staffPost(
        coordinatorCookie,
        coordinatorCsrf,
        `/agency/quotes/${first.body.data.id}/send`,
        {
          expectedVersion: 1,
          validForHours: 24,
        },
      )
    ).status,
  ).toBe(200);
  const second = await create();
  const [accept, send] = await Promise.all([
    guestPost(cookie, `/portal/my/quotes/${first.body.data.id}/accept`, { quoteVersion: 1 }).set(
      'Idempotency-Key',
      randomUUID(),
    ),
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/quotes/${second.body.data.id}/send`, {
      expectedVersion: 1,
      validForHours: 24,
    }),
  ]);
  expect([accept.status, send.status].sort()).toEqual([200, 409]);
  const history = await staffGet(coordinatorCookie, `/agency/requests/${extra.id}/quotes`);
  const statuses = history.body.data.items.map((quote: { status: string }) => quote.status);
  expect(statuses).toEqual(accept.status === 200 ? ['ACCEPTED', 'DRAFT'] : ['SUPERSEDED', 'SENT']);
});

it('keeps one effective SENT per group when two sends race', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `send-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems,
      terms: 'Send race scenario.',
    },
  );
  expect(draft.status).toBe(201);
  const send = () =>
    staffPost(coordinatorCookie, coordinatorCsrf, `/agency/quotes/${draft.body.data.id}/send`, {
      expectedVersion: 1,
      validForHours: 24,
    });
  const results = await Promise.all([send(), send()]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await db.quote.count({ where: { tenantId, requestId: extra.id, status: 'SENT' } })).toBe(
    1,
  );
});

it('requires a fresh effective offer: reject and revision only on newest SENT', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `ver-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  await staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/start-review`, {
    expectedVersion: 1,
  });
  const first = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems,
      terms: 'First version.',
    },
  );
  const sendFirst = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${first.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 24,
    },
  );
  expect(sendFirst.status).toBe(200);
  // Wrong-version consent is a conflict, not a silent redirect.
  const wrongVersion = await guestPost(cookie, `/portal/my/quotes/${first.body.data.id}/accept`, {
    quoteVersion: 7,
  }).set('Idempotency-Key', randomUUID());
  expect(wrongVersion.status).toBe(409);
  const second = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems,
      terms: 'Second version.',
    },
  );
  expect(second.status).toBe(201);
  expect(second.body.data.version).toBe(2);
  const sendSecond = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${second.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 24,
    },
  );
  expect(sendSecond.status).toBe(200);
  expect((await db.quote.findUniqueOrThrow({ where: { id: first.body.data.id } })).status).toBe(
    'SUPERSEDED',
  );
  const rejectOld = await guestPost(cookie, `/portal/my/quotes/${first.body.data.id}/reject`, {
    quoteVersion: 1,
  });
  expect(rejectOld.status).toBe(409);
  expect(rejectOld.body.error.code).toBe('QUOTE_SUPERSEDED');
  const rejectNew = await guestPost(cookie, `/portal/my/quotes/${second.body.data.id}/reject`, {
    quoteVersion: 2,
  });
  expect(rejectNew.status).toBe(200);
  expect(rejectNew.body.data.status).toBe('REJECTED');
  const rejectAgain = await guestPost(cookie, `/portal/my/quotes/${second.body.data.id}/reject`, {
    quoteVersion: 2,
  });
  expect(rejectAgain.status).toBe(200);
  expect(rejectAgain.body.data.status).toBe('REJECTED');
  // A rejected offer cannot be accepted afterwards.
  const acceptRejected = await guestPost(
    cookie,
    `/portal/my/quotes/${second.body.data.id}/accept`,
    {
      quoteVersion: 2,
    },
  ).set('Idempotency-Key', randomUUID());
  expect(acceptRejected.status).toBe(409);
  expect(acceptRejected.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('declines a revision and re-enables the still-valid offer; coordinator gets in-app notification', async () => {
  const extra = await submitGuestRequest(
    customServiceId,
    customServiceVersion,
    `dec-${randomUUID().slice(0, 6)}@example.invalid`,
  );
  const cookie = await guestCookieFor(tenantId, extra.id, host);
  await staffPost(coordinatorCookie, coordinatorCsrf, `/agency/requests/${extra.id}/start-review`, {
    expectedVersion: 1,
  });
  const draft = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/requests/${extra.id}/quotes`,
    {
      lineItems,
      terms: 'Decline scenario.',
    },
  );
  const sent = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quotes/${draft.body.data.id}/send`,
    {
      expectedVersion: 1,
      validForHours: 48,
    },
  );
  expect(sent.status).toBe(200);
  const revision = await guestPost(
    cookie,
    `/portal/my/quotes/${draft.body.data.id}/revision-requests`,
    {
      quoteVersion: 1,
      message: 'Could the total include weekend coverage instead?',
    },
  );
  expect(revision.status).toBe(201);
  const notified = await db.requestNotification.findFirst({
    where: { tenantId, requestId: extra.id, eventType: 'QUOTE_REVISION_REQUESTED' },
  });
  expect(notified).not.toBeNull();
  const decline = await staffPost(
    coordinatorCookie,
    coordinatorCsrf,
    `/agency/quote-revisions/${revision.body.data.id}/decline`,
    { reason: 'Weekend coverage is outside the published scope.' },
  );
  expect(decline.status).toBe(200);
  expect(decline.body.data.status).toBe('DECLINED');
  expect(
    (
      await staffPost(
        coordinatorCookie,
        coordinatorCsrf,
        `/agency/quote-revisions/${revision.body.data.id}/decline`,
        {
          reason: 'Declining the same revision twice must fail.',
        },
      )
    ).status,
  ).toBe(409);
  const accept = await guestPost(cookie, `/portal/my/quotes/${draft.body.data.id}/accept`, {
    quoteVersion: 1,
  }).set('Idempotency-Key', randomUUID());
  expect(accept.status).toBe(200);
  expect(accept.body.data.status).toBe('ACCEPTED');
});
