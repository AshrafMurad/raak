// Sprint 7 Session 5 — E09 accessibility/locale sweep and docs 12 manual UX
// checklist. Synthetic fixtures, real Express/PostgreSQL/Next, installed Chrome.
// No mail/storage I/O; the guest link is built locally through the capture path.
import '../../src/env-load';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { Page } from '../../../frontend/node_modules/@playwright/test/index.js';
const {
  chromium,
  expect,
}: typeof import('../../../frontend/node_modules/@playwright/test/index.js') = createRequire(
  import.meta.url,
)('../../../frontend/node_modules/@playwright/test');
import arCatalog from '../../../frontend/messages/ar/catalog.json';
import enCatalog from '../../../frontend/messages/en/catalog.json';
import arCommercial from '../../../frontend/messages/ar/commercial.json';
import enCommercial from '../../../frontend/messages/en/commercial.json';
import arReporting from '../../../frontend/messages/ar/reporting.json';
import enReporting from '../../../frontend/messages/en/reporting.json';
import arNotifications from '../../../frontend/messages/ar/notifications.json';
import enNotifications from '../../../frontend/messages/en/notifications.json';
import arCaregiver from '../../../frontend/messages/ar/caregiver-visits.json';
import enCaregiver from '../../../frontend/messages/en/caregiver-visits.json';
import arPeople from '../../../frontend/messages/ar/people.json';
import enPeople from '../../../frontend/messages/en/people.json';
import arVisits from '../../../frontend/messages/ar/visits.json';
import enVisits from '../../../frontend/messages/en/visits.json';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { createSession } from '../../src/modules/auth/session.service';
import { utcLocalDate, localToUtc } from '../../src/modules/common/local-time';
import {
  deliverRequestEmail,
  type RequestEmail,
} from '../../src/modules/notifications/request-email';

type Catalog = typeof enCatalog;
type Commercial = typeof enCommercial;
type Reporting = typeof enReporting;
type Notifications = typeof enNotifications;
type Caregiver = typeof enCaregiver;
type People = typeof enPeople;
type Visits = typeof enVisits;

const db = getPrisma();
const slug = `browser-a11y-${randomUUID().slice(0, 8)}`;
const secret = 'synthetic-browser-encryption-key-32-characters';
const zone = 'Asia/Riyadh';
const base = `http://${slug}.localhost:3154`;
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: secret }),
  db,
  now: () => new Date(),
  logger: createLogger({ service: 'browser-test', write: () => {} }),
  health: { checkDatabase: async () => true },
});
const next = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../../../frontend/node_modules/next/dist/bin/next', import.meta.url)),
    'start',
    '-p',
    '3155',
    '-H',
    '127.0.0.1',
  ],
  {
    cwd: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
    stdio: 'ignore',
    windowsHide: true,
  },
);
const ingress = http.createServer((req, res) => {
  if (req.url?.startsWith('/v1/')) {
    app(req, res);
    return;
  }
  const proxy = http.request(
    { hostname: '127.0.0.1', port: 3155, path: req.url, method: req.method, headers: req.headers },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(proxy);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let tenantId = '';

function noOverflow(page: Page, url: string) {
  return expect(
    page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
    `horizontal overflow at ${url}`,
  ).resolves.toBe(true);
}

async function assertDirection(page: Page, locale: 'ar' | 'en', url: string) {
  expect(await page.locator('html').getAttribute('lang'), url).toBe(locale);
  expect(await page.locator('html').getAttribute('dir'), url).toBe(locale === 'ar' ? 'rtl' : 'ltr');
}

async function assertFocusRing(page: Page, url: string): Promise<boolean> {
  await page.keyboard.press('Tab');
  const first = await page.evaluate<
    { isSkip: boolean; ring: boolean; revealed: boolean; tag: string } | null
  >(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      isSkip: el.classList.contains('rv-skip'),
      ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      revealed: rect.width > 0 && rect.height > 0,
      tag: el.tagName.toLowerCase(),
    };
  })()`);
  expect(first, `keyboard Tab reaches no focus target at ${url}`).not.toBeNull();
  const info = first!;
  expect(
    info.ring || (info.isSkip && info.revealed),
    `no visible focus indicator on <${info.tag}> at ${url}`,
  ).toBe(true);
  return info.isSkip;
}

async function focusInsideDialog(page: Page) {
  return page.evaluate("Boolean(document.activeElement?.closest('[role=dialog]'))");
}

try {
  await new Promise<void>((resolve) => ingress.listen(3154, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3155/en/login')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Run frontend npm run build:browser before this suite');
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Accessibility Browser Agency',
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: zone,
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const owner = await db.staffAccount.create({
    data: {
      tenantId,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      emailNormalized: 'owner@example.invalid',
      passwordHash: 'unused',
    },
  });
  const caregiverStaff = await db.staffAccount.create({
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
      staffAccountId: caregiverStaff.id,
      name: 'Synthetic sweep caregiver',
      professionalCategory: 'NURSE',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  await db.caregiverServiceAuthorization.create({
    data: {
      tenantId,
      caregiverId: caregiver.id,
      agencyServiceId: (
        await db.agencyService.create({
          data: {
            tenantId,
            slug: 'sweep-service',
            isEnabled: true,
            isPublished: true,
            config: {
              nameAr: 'خدمة الفحص التجريبية',
              nameEn: 'Synthetic sweep service',
              summaryAr: 'للتجربة فقط',
              summaryEn: 'Synthetic only',
              descriptionAr: 'بيانات تجريبية',
              descriptionEn: 'Synthetic fixture',
              durationMin: 60,
              clinicalClass: 'NON_CLINICAL',
              requiredQualificationCodes: [],
              serviceAreaIds: ['central'],
              allowStandalone: true,
              allowRecurring: true,
              pricingType: 'FIXED',
              priceMinor: 15000,
              pricingUnit: 'VISIT',
            },
          },
        })
      ).id,
      authorizedBy: owner.id,
      authorizedAt: new Date(),
    },
  });
  await db.availabilitySlot.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      tenantId,
      caregiverId: caregiver.id,
      weekday,
      localStartTime: '08:00',
      localEndTime: '18:00',
    })),
  });
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic sweep beneficiary',
      normalizedName: 'synthetic sweep beneficiary',
      areaId: 'central',
    },
  });
  const service = await db.agencyService.findFirstOrThrow({ where: { tenantId, slug: 'sweep-service' } });
  const today = utcLocalDate(new Date(), zone);
  const startResolution = localToUtc(today, '09:00', zone);
  if (startResolution.status !== 'UNIQUE') throw new Error('Synthetic fixture local time invalid');
  const visit = await db.visit.create({
    data: {
      tenantId,
      patientId: patient.id,
      agencyServiceId: service.id,
      assignedCaregiverId: caregiver.id,
      areaId: 'central',
      status: 'SCHEDULED',
      scheduledStartUtc: startResolution.instant,
      scheduledEndUtc: new Date(startResolution.instant.getTime() + 3_600_000),
      timezoneSnapshot: zone,
      serviceNameSnapshot: { nameAr: 'خدمة الفحص التجريبية', nameEn: 'Synthetic sweep service' },
    },
  });
  const reference = `SYN-A11Y-${randomUUID().slice(0, 8)}`;
  await db.serviceRequest.create({
    data: {
      tenantId,
      agencyServiceId: service.id,
      requesterName: 'Synthetic sweep requester',
      requesterEmailNormalized: 'sweep-requester@example.invalid',
      requesterPhone: '+966500000000',
      beneficiaryName: 'Synthetic sweep beneficiary',
      relationship: 'OTHER',
      areaId: 'central',
      preferredWindowJson: {},
      notesRestricted: '',
      locale: 'ar',
      privacyVersion: 'test',
      serviceSnapshot: { pricingType: 'FIXED', priceMinor: 15000 },
      priceAcknowledged: true,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      reference,
      idempotencyKey: randomUUID(),
      payloadHash: 'synthetic',
    },
  });
  const customer = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: 'sweep-customer@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await db.patientAccess.create({
    data: {
      tenantId,
      patientId: patient.id,
      customerAccountId: customer.id,
      scopes: ['VIEW_VISITS', 'MANAGE_VISITS'],
      authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
      verifiedByStaffId: owner.id,
      verifiedAt: new Date(),
    },
  });
  for (const [index] of [3, 2, 1].entries()) {
    await db.auditEvent.create({
      data: {
        tenantId,
        at: new Date(Date.now() - index * 60_000),
        actorType: 'AGENCY_STAFF',
        actorId: owner.id,
        action: 'visit.assigned',
        subjectType: 'visit',
        subjectId: visit.id,
        metadataJson: {},
      },
    });
  }
  const staffEvent = await db.outboxEvent.create({
    data: { tenantId, eventType: 'synthetic', aggregateId: visit.id, payloadMinimal: {} },
  });
  await db.notification.create({
    data: {
      tenantId,
      eventId: staffEvent.id,
      principalType: 'AGENCY_STAFF',
      recipientPrincipalId: owner.id,
      eventType: 'VISIT_NEEDS_REVIEW',
      entityType: 'visit',
      entityId: visit.id,
    },
  });
  const customerEvent = await db.outboxEvent.create({
    data: { tenantId, eventType: 'synthetic', aggregateId: visit.id, payloadMinimal: {} },
  });
  const customerNotice = await db.notification.create({
    data: {
      tenantId,
      eventId: customerEvent.id,
      principalType: 'AGENCY_CUSTOMER',
      recipientPrincipalId: customer.id,
      eventType: 'VISIT_CHANGED',
      entityType: 'visit',
      entityId: visit.id,
    },
  });

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const locale of ['ar', 'en'] as const) {
    const catalog = (locale === 'ar' ? arCatalog : enCatalog) as Catalog;
    const commercial = (locale === 'ar' ? arCommercial : enCommercial) as Commercial;
    const reporting = (locale === 'ar' ? arReporting : enReporting) as Reporting;
    const notifications = (locale === 'ar' ? arNotifications : enNotifications) as Notifications;
    const caregiverCopy = (locale === 'ar' ? arCaregiver : enCaregiver) as Caregiver;
    const people = (locale === 'ar' ? arPeople : enPeople) as People;
    const visits = (locale === 'ar' ? arVisits : enVisits) as Visits;
    const serviceName = locale === 'ar' ? 'خدمة الفحص التجريبية' : 'Synthetic sweep service';
    const startResolution = localToUtc(today, locale === 'ar' ? '11:00' : '14:00', zone);
    if (startResolution.status !== 'UNIQUE') throw new Error('Synthetic fixture local time invalid');
    const startPatient = await db.patient.create({
      data: {
        tenantId,
        displayName: `Synthetic start beneficiary ${locale}`,
        normalizedName: `synthetic start beneficiary ${locale}`,
        areaId: 'central',
      },
    });
    const localeVisit = await db.visit.create({
      data: {
        tenantId,
        patientId: startPatient.id,
        agencyServiceId: service.id,
        assignedCaregiverId: caregiver.id,
        areaId: 'central',
        status: 'SCHEDULED',
        scheduledStartUtc: startResolution.instant,
        scheduledEndUtc: new Date(startResolution.instant.getTime() + 3_600_000),
        timezoneSnapshot: zone,
        serviceNameSnapshot: { nameAr: 'خدمة الفحص التجريبية', nameEn: 'Synthetic sweep service' },
      },
    });
    type RouteCheck = { path: string; ready: (page: Page) => Promise<void> };
    const roles: {
      name: string;
      session?: { principalId: string; principalType: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER' };
      routes: RouteCheck[];
    }[] = [
      {
        name: 'guest',
        routes: [
          {
            path: '/',
            ready: (p) =>
              expect(p.getByRole('link', { name: serviceName, exact: true }).first()).toBeVisible(),
          },
          {
            path: '/request',
            ready: (p) => expect(p.getByText(catalog.notConfirmed, { exact: true })).toBeVisible(),
          },
          {
            path: '/track',
            ready: (p) =>
              expect(p.getByRole('button', { name: catalog.sendLink, exact: true })).toBeVisible(),
          },
          {
            path: '/services',
            ready: (p) =>
              expect(p.getByRole('link', { name: serviceName, exact: true }).first()).toBeVisible(),
          },
          { path: '/login', ready: (p) => expect(p.locator('[name=email]')).toBeVisible() },
        ],
      },
      {
        name: 'staff',
        session: { principalId: owner.id, principalType: 'AGENCY_STAFF' },
        routes: [
          {
            path: '/workspace/requests',
            ready: (p) => expect(p.getByText(reference, { exact: true }).first()).toBeVisible(),
          },
          {
            path: '/workspace/visits',
            ready: (p) =>
              expect(p.getByText(visits.visitsIntro, { exact: true })).toBeVisible(),
          },
          {
            path: '/workspace/patients',
            ready: (p) =>
              expect(p.getByText('Synthetic sweep beneficiary', { exact: true }).first()).toBeVisible(),
          },
          {
            path: '/workspace/caregivers',
            ready: (p) =>
              expect(p.getByText('Synthetic sweep caregiver', { exact: true }).first()).toBeVisible(),
          },
          {
            path: '/workspace/reports',
            ready: (p) =>
              expect(p.getByRole('heading', { name: reporting.title, exact: true })).toBeVisible(),
          },
          {
            path: '/workspace/audit',
            ready: (p) => expect(p.locator('bdi[dir="ltr"]').first()).toBeVisible(),
          },
          {
            path: '/workspace/notifications',
            ready: (p) =>
              expect(
                p.getByRole('button', { name: notifications.markRead, exact: true }).first(),
              ).toBeVisible(),
          },
          {
            path: '/workspace/settings/notifications',
            ready: (p) => expect(p.locator('#VISIT_CANCELLED-EMAIL')).toBeVisible(),
          },
        ],
      },
      {
        name: 'customer',
        session: { principalId: customer.id, principalType: 'AGENCY_CUSTOMER' },
        routes: [
          {
            path: '/my/visits',
            ready: (p) =>
              expect(p.getByText('Synthetic sweep beneficiary', { exact: true }).first()).toBeVisible(),
          },
          {
            path: '/notifications',
            ready: (p) =>
              expect(p.locator(`[data-notification-id="${customerNotice.id}"]`)).toBeVisible(),
          },
          {
            path: '/notifications/preferences',
            ready: (p) => expect(p.locator('#VISIT_REMINDER-IN_APP')).toBeVisible(),
          },
          {
            path: '/account',
            ready: (p) => expect(p.getByRole('heading', { name: people.account, exact: true })).toBeVisible(),
          },
        ],
      },
      {
        name: 'caregiver',
        session: { principalId: caregiverStaff.id, principalType: 'AGENCY_STAFF' },
        routes: [
          {
            path: '/caregiver/visits',
            ready: (p) =>
              expect(
                p.getByRole('button', { name: caregiverCopy.open, exact: true }).first(),
              ).toBeVisible(),
          },
          {
            path: '/caregiver/profile',
            ready: (p) => expect(p.getByRole('heading', { name: people.ownProfile, exact: true })).toBeVisible(),
          },
        ],
      },
    ];

    for (const mobile of [false, true]) {
      const viewport = mobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 };
      for (const role of roles) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        if (role.session) {
          const session = await createSession(db, {
            tenantId,
            principalId: role.session.principalId,
            principalType: role.session.principalType,
            sessionVersion: 0,
            ttlSeconds: 3600,
          });
          await context.addCookies([
            { name: 'raak_session_agency', value: session.sessionToken, url: base, httpOnly: true },
            { name: 'raak_csrf_agency', value: session.csrfToken, url: base },
          ]);
        }
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        try {
          for (const route of role.routes) {
            const url = `${base}/${locale}${route.path}${mobile ? '?theme=dark' : ''}`;
            await page.goto(url);
            await route.ready(page);
            await assertDirection(page, locale, url);
            await noOverflow(page, url);
            if (mobile) {
              const onSkip = await assertFocusRing(page, url);
              if (onSkip) {
                await page.keyboard.press('Tab');
                const ring = await page.evaluate<boolean>(`(() => {
                  const el = document.activeElement;
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
                })()`);
                expect(ring, `second Tab focus ring missing at ${url}`).toBe(true);
              }
            }
            expect(errors, `page errors on ${url}: ${errors.join('; ')}`).toEqual([]);
          }
          console.log(
            `PASS a11y sweep ${role.name} ${locale} ${mobile ? '360px dark' : 'desktop light'} (${role.routes.length} routes)`,
          );
        } finally {
          await context.close();
        }
      }
    }

    // Guest intake: keyboard-complete flow, announced errors, failure never succeeds.
    {
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/${locale}/request?theme=dark`);
        await expect(page.getByText(catalog.notConfirmed, { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: serviceName, exact: true })).toBeVisible();
        const continueButton = page.getByRole('button', { name: catalog.next, exact: true });
        await continueButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: catalog.steps[1], exact: true })).toBeVisible();
        await continueButton.focus();
        await page.keyboard.press('Enter');
        const required = page.getByRole('alert').filter({ hasText: catalog.required }).first();
        await expect(required).toBeVisible();
        const invalid = page.locator('#requesterName');
        await expect(invalid).toBeFocused();
        await expect(invalid).toHaveAttribute('aria-invalid', 'true');
        await expect(invalid).toHaveAttribute('aria-describedby', 'requesterName-error');
        await expect(page.locator('#requesterName-error')).toBeVisible();
        await page.locator('#requesterName').fill('Synthetic sweep requester');
        await page.locator('#requesterEmail').fill(`sweep-guest-${locale}@example.invalid`);
        await page.locator('#beneficiaryName').fill('Synthetic sweep beneficiary');
        await page.route('**/v1/portal/requests', (route) => route.abort());
        await continueButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: catalog.steps[2], exact: true })).toBeVisible();
        const area = page.locator('#areaId');
        await area.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Home');
        await page.keyboard.press('Enter');
        await page.locator('#preferredDate').fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
        await continueButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: catalog.steps[3], exact: true })).toBeVisible();
        await page.locator('#privacyAccepted').focus();
        await page.keyboard.press('Space');
        await page.locator('#priceAcknowledged').focus();
        await page.keyboard.press('Space');
        const submit = page.getByRole('button', { name: catalog.submit, exact: true });
        await submit.focus();
        await page.keyboard.press('Enter');
        const failed = page.getByRole('alert').filter({ hasText: catalog.error }).first();
        await expect(failed).toBeVisible();
        await expect(page.getByRole('heading', { name: catalog.received, exact: true })).toHaveCount(0);
        await page.unroute('**/v1/portal/requests');
        await submit.focus();
        const [receiptResponse] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === '/v1/portal/requests' && r.request().method() === 'POST',
          ),
          page.keyboard.press('Enter'),
        ]);
        expect(receiptResponse.status()).toBe(201);
        await expect(page.getByRole('heading', { name: catalog.received, exact: true })).toBeVisible();
        await expect(page.getByText(catalog.notConfirmed, { exact: true })).toBeVisible();
        const referenceText = await page.getByTestId('receipt-reference').innerText();
        await noOverflow(page, `${base}/${locale}/request`);
        const requestRow = await db.serviceRequest.findFirstOrThrow({
          where: { tenantId, reference: referenceText },
        });
        await db.serviceRequest.update({
          where: { id: requestRow.id },
          data: { status: 'UNDER_REVIEW' },
        });
        await db.requestStatusHistory.create({
          data: {
            tenantId,
            requestId: requestRow.id,
            fromStatus: 'SUBMITTED',
            toStatus: 'UNDER_REVIEW',
            at: new Date(),
          },
        });
        await db.quote.create({
          data: {
            tenantId,
            requestId: requestRow.id,
            quoteGroupId: randomUUID(),
            version: 1,
            status: 'SENT',
            currency: 'SAR',
            lineItems: [{ description: 'Synthetic sweep visit', quantity: 1, unitPriceMinor: 15000 }],
            totalMinor: 15000,
            terms: 'Synthetic sweep terms',
            validUntil: new Date(Date.now() + 7 * 86_400_000),
            sentAt: new Date(),
          },
        });
        const token = await db.guestActionToken.findFirstOrThrow({
          where: { tenantId, requestId: requestRow.id },
        });
        const event = await db.outboxEvent.findFirstOrThrow({
          where: { tenantId, aggregateId: token.id, eventType: 'email.request_access' },
        });
        const captured: RequestEmail[] = [];
        await deliverRequestEmail({
          db,
          eventId: event.id,
          encryptionKey: secret,
          now: () => new Date(),
          buildLink: (s, l, t) => `http://${s}.localhost:3154/${l}/track#token=${t}`,
          send: async (mail) => {
            captured.push(mail);
          },
        });
        expect(captured).toHaveLength(1);
        const link = captured[0]!.text.match(/http:\/\/\S+/)![0];
        await page.goto(link);
        await page.getByRole('button', { name: catalog.verify, exact: true }).click();
        await expect(page.getByRole('heading', { name: catalog.verified, exact: true })).toBeVisible();
        await expect(page.getByText(commercial.notPayment, { exact: true })).toBeVisible();
        await expect(
          page.getByRole('heading', { name: commercial.quoteVersion }).first(),
        ).toBeVisible();
        await expect(page.getByText(commercial.total).first()).toBeVisible();
        await expect(page.getByText(commercial.expiresAt).first()).toBeVisible();
        await expect(page.getByRole('button', { name: commercial.accept, exact: true })).toBeVisible();
        if (locale === 'ar') {
          expect(await page.locator('bdi[dir="ltr"]').first().isVisible()).toBe(true);
        }
        await noOverflow(page, `${base}/${locale}/track`);
        expect(errors).toEqual([]);
        console.log(`PASS a11y intake/announce/failure/quote ${locale} 360px dark (keyboard-only)`);
      } finally {
        await context.close();
      }
    }

    // Staff request queue: dialog tab containment, focus return, mixed-direction isolation.
    {
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        reducedMotion: 'reduce',
      });
      const session = await createSession(db, {
        tenantId,
        principalId: owner.id,
        principalType: 'AGENCY_STAFF',
        sessionVersion: 0,
        ttlSeconds: 3600,
      });
      await context.addCookies([
        { name: 'raak_session_agency', value: session.sessionToken, url: base, httpOnly: true },
        { name: 'raak_csrf_agency', value: session.csrfToken, url: base },
      ]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/${locale}/workspace/requests?theme=dark`);
        const article = page.locator('article').filter({ hasText: reference });
        await expect(article).toBeVisible();
        const detail = article.getByRole('button', { name: catalog.detail, exact: true });
        await detail.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        expect(await focusInsideDialog(page)).toBe(true);
        for (let tab = 0; tab < 3; tab++) {
          await page.keyboard.press('Tab');
          expect(await focusInsideDialog(page), `Tab ${tab + 1} escaped the dialog`).toBe(true);
        }
        if (locale === 'ar') {
          await expect(dialog.locator('bdi[dir="ltr"]').first()).toBeVisible();
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(detail).toBeFocused();
        expect(errors).toEqual([]);
        console.log(`PASS a11y staff dialog containment/return ${locale} 360px dark`);
      } finally {
        await context.close();
      }
    }

    // Caregiver: keyboard start at 360px with no horizontal scrolling (docs 12 UX item).
    {
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        reducedMotion: 'reduce',
      });
      const session = await createSession(db, {
        tenantId,
        principalId: caregiverStaff.id,
        principalType: 'AGENCY_STAFF',
        sessionVersion: 0,
        ttlSeconds: 3600,
      });
      await context.addCookies([
        { name: 'raak_session_agency', value: session.sessionToken, url: base, httpOnly: true },
        { name: 'raak_csrf_agency', value: session.csrfToken, url: base },
      ]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/${locale}/caregiver/visits?theme=dark`);
        const card = page
          .locator('article')
          .filter({ hasText: `Synthetic start beneficiary ${locale}` });
        const open = card.getByRole('button', { name: caregiverCopy.open, exact: true });
        await expect(open).toBeVisible();
        await open.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const startButton = dialog.getByRole('button', { name: caregiverCopy.start, exact: true });
        await startButton.focus();
        const [startResponse] = await Promise.all([
          page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === `/v1/caregiver/my/visits/${localeVisit.id}/start` &&
              r.request().method() === 'POST',
          ),
          page.keyboard.press('Enter'),
        ]);
        expect(startResponse.status()).toBe(200);
        await expect(dialog.locator('[data-visit-status]')).toHaveAttribute(
          'data-visit-status',
          'IN_PROGRESS',
        );
        await noOverflow(page, `${base}/${locale}/caregiver/visits`);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        const openAfterReload = page
          .locator('article')
          .filter({ hasText: `Synthetic start beneficiary ${locale}` })
          .getByRole('button', { name: caregiverCopy.open, exact: true });
        await expect(openAfterReload).toBeFocused();
        expect(errors).toEqual([]);
        console.log(`PASS a11y caregiver keyboard start ${locale} 360px dark`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  ingress.close();
  ingress.closeAllConnections();
  next.kill();
  if (tenantId) {
    await db.notificationDelivery.deleteMany({ where: { tenantId } });
    await db.notification.deleteMany({ where: { tenantId } });
    await db.notificationPreference.deleteMany({ where: { tenantId } });
    await db.guestActionToken.deleteMany({ where: { tenantId } });
    await db.quoteRevisionRequest.deleteMany({ where: { tenantId } });
    await db.quote.deleteMany({ where: { tenantId } });
    await db.visitReview.deleteMany({ where: { tenantId } });
    await db.visitNote.deleteMany({ where: { tenantId } });
    await db.visitChangeRequest.deleteMany({ where: { tenantId } });
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId } });
    await db.visitTask.deleteMany({ where: { tenantId } });
    await db.visitReminder.deleteMany({ where: { tenantId } });
    await db.visit.deleteMany({ where: { tenantId } });
    await db.requestNotification.deleteMany({ where: { tenantId } });
    await db.guestSession.deleteMany({ where: { tenantId } });
    await db.requestStatusHistory.deleteMany({ where: { tenantId } });
    await db.serviceRequest.deleteMany({ where: { tenantId } });
    await db.patientAccess.deleteMany({ where: { tenantId } });
    await db.patient.deleteMany({ where: { tenantId } });
    await db.availabilitySlot.deleteMany({ where: { tenantId } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId } });
    await db.caregiver.deleteMany({ where: { tenantId } });
    await db.agencyService.deleteMany({ where: { tenantId } });
    await db.customerAccount.deleteMany({ where: { tenantId } });
    await db.authSession.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.idempotencyKey.deleteMany({ where: { tenantId } });
    await db.emailDelivery.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await disconnectPrisma();
}
