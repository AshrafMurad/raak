// Sprint 5 synthetic browser harness (U01–U09 + F10 at the UI level).
// Starts only installed Next.js and Chrome; real Express/PostgreSQL; no
// external network, no real personal data, synthetic fixtures only.
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
import arPeople from '../../../frontend/messages/ar/people.json';
import enPeople from '../../../frontend/messages/en/people.json';
import arCatalog from '../../../frontend/messages/ar/catalog.json';
import enCatalog from '../../../frontend/messages/en/catalog.json';
import arCarePlans from '../../../frontend/messages/ar/care-plans.json';
import enCarePlans from '../../../frontend/messages/en/care-plans.json';
import arVisits from '../../../frontend/messages/ar/visits.json';
import enVisits from '../../../frontend/messages/en/visits.json';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { hashPassword } from '../../src/modules/auth/crypto';
import { checkVisitListRegressions } from './sprint5-list-regressions';

const db = getPrisma();
const slug = `browser-s5-${randomUUID().slice(0, 8)}`;
const base = `http://${slug}.localhost:3130`;
const password = 'Synthetic-Browser-Only-1!';
const ownerEmail = 'owner@example.invalid';
const reviewerEmail = 'clinical.lead@example.invalid';
const app = buildApp({
  env: loadApiEnv({
    BASE_DOMAIN: 'localhost',
    SESSION_SECRET: 'synthetic-browser-sprint5-session-secret',
  }),
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
    '3131',
    '-H',
    '127.0.0.1',
  ],
  {
    cwd: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
    stdio: 'pipe',
    windowsHide: true,
  },
);
const ingress = http.createServer((req, res) => {
  if (req.url?.startsWith('/v1/')) {
    app(req, res);
    return;
  }
  const proxy = http.request(
    { hostname: '127.0.0.1', port: 3131, path: req.url, method: req.method, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(proxy);
});
let tenantId = '';
let caregiverOneId = '';
let caregiverTwoId = '';
const caregiverOneName = 'Synthetic primary caregiver';
const caregiverTwoName = 'Synthetic secondary caregiver';
const serviceName = { ar: 'خدمة رعاية دورية اصطناعية', en: 'Synthetic recurring clinical care' };
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const browserErrors: string[] = [];
async function action(page: Page, path: string, run: () => Promise<unknown>, status = 200) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/v1${path}` && r.request().method() !== 'GET',
    ),
    run(),
  ]);
  expect(response.status(), path).toBe(status);
  return response;
}
async function getAction(page: Page, path: string, run: () => Promise<unknown>, status = 200) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/v1${path}`),
    run(),
  ]);
  expect(response.status(), path).toBe(status);
  return response;
}
async function login(page: Page, email: string, locale: string) {
  await page.goto(`${base}/${locale}/login`);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await action(page, '/auth/login', () => page.locator('button[type=submit]').click());
}
async function noOverflow(page: Page) {
  const layout = await page.evaluate<{ fits: boolean; overflowing: unknown }>(`({
    fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
    overflowing: Array.from(document.querySelectorAll('main *')).filter(e => {
      const box = e.getBoundingClientRect(); return box.right > innerWidth + 1 || box.left < -1;
    }).map(e => ({ tag: e.tagName, className: e.className, width: Math.round(e.getBoundingClientRect().width) }))
  })`);
  expect(
    layout.fits,
    `${new URL(page.url()).pathname}: ${JSON.stringify(layout.overflowing)}`,
  ).toBe(true);
}
try {
  await new Promise<void>((resolve) => ingress.listen(3130, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3131/en/login')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* boot */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Next browser build did not become ready');
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Sprint 5 browser agency',
        displayName: 'Synthetic agency',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        travelBufferMin: 30,
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const passwordHash = await hashPassword(password);
  const owner = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: ownerEmail,
      passwordHash,
      status: 'ACTIVE',
      role: 'AGENCY_OWNER',
      emailVerifiedAt: new Date(),
    },
  });
  const service = await db.agencyService.create({
    data: {
      tenantId,
      slug: 'synthetic-recurring-care',
      isPublished: true,
      config: {
        nameAr: serviceName.ar,
        nameEn: serviceName.en,
        summaryAr: 'ملخص تجريبي',
        summaryEn: 'Synthetic summary',
        descriptionAr: 'للتجربة فقط',
        descriptionEn: 'Synthetic only',
        durationMin: 60,
        clinicalClass: 'CLINICAL',
        requiredQualificationCodes: ['SYNTHETIC_SUPPORT'],
        serviceAreaIds: ['central'],
        allowStandalone: false,
        allowRecurring: true,
        pricingType: 'CUSTOM_QUOTE',
        priceMinor: null,
        pricingUnit: null,
      },
    },
  });
  for (const name of [caregiverOneName, caregiverTwoName]) {
    const staff = await db.staffAccount.create({
      data: {
        tenantId,
        emailNormalized: `${name.toLowerCase().replace(/ /g, '.')}@example.invalid`,
        passwordHash,
        status: 'ACTIVE',
        role: 'CAREGIVER',
        emailVerifiedAt: new Date(),
      },
    });
    const caregiver = await db.caregiver.create({
      data: {
        tenantId,
        staffAccountId: staff.id,
        name,
        professionalCategory: 'SYNTHETIC_SUPPORT',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
      },
    });
    if (name === caregiverOneName) caregiverOneId = caregiver.id;
    else caregiverTwoId = caregiver.id;
    await db.caregiverQualification.create({
      data: {
        tenantId,
        caregiverId: caregiver.id,
        code: 'SYNTHETIC_SUPPORT',
        licenseIssuer: 'Synthetic issuer',
        licenseNumberRestricted: `SYNTHETIC-${randomUUID().slice(0, 8)}`,
        status: 'VERIFIED',
        verifiedBy: owner.id,
        verifiedAt: new Date(),
        validThrough: '2027-12-31',
      },
    });
    await db.caregiverServiceAuthorization.create({
      data: {
        tenantId,
        caregiverId: caregiver.id,
        agencyServiceId: service.id,
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
  }
  // Clinical reviewer: coordinator role plus an agency-verified qualification
  // for the exact service (A06/ADR-0012 — titles alone never confer authority).
  const reviewerStaff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: reviewerEmail,
      passwordHash,
      status: 'ACTIVE',
      role: 'CARE_COORDINATOR',
      emailVerifiedAt: new Date(),
    },
  });
  const reviewerCaregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: reviewerStaff.id,
      name: 'Synthetic clinical reviewer',
      professionalCategory: 'SYNTHETIC_SUPPORT',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  await db.caregiverQualification.create({
    data: {
      tenantId,
      caregiverId: reviewerCaregiver.id,
      code: 'SYNTHETIC_SUPPORT',
      licenseIssuer: 'Synthetic issuer',
      licenseNumberRestricted: `SYNTHETIC-${randomUUID().slice(0, 8)}`,
      status: 'VERIFIED',
      verifiedBy: owner.id,
      verifiedAt: new Date(),
      validThrough: '2027-12-31',
    },
  });
  browser = await chromium.launch({
    channel: 'chrome',
    headless: !process.argv.includes('--headed'),
  });
  for (const locale of ['ar', 'en'] as const) {
    // The former scheduling namespace split into care-plans and visits
    // dictionaries; the harness consumes both with the state labels merged.
    const carePlansCopy = locale === 'ar' ? arCarePlans : enCarePlans;
    const visitsCopy = locale === 'ar' ? arVisits : enVisits;
    const c = {
      ...carePlansCopy,
      ...visitsCopy,
      states: { ...carePlansCopy.states, ...visitsCopy.states },
    };
    const p = locale === 'ar' ? arPeople : enPeople;
    const cc = locale === 'ar' ? arCatalog : enCatalog;
    const localizedService = locale === 'ar' ? serviceName.ar : serviceName.en;
    const validFrom = locale === 'ar' ? '2026-12-01' : '2027-01-01';
    const validUntil = locale === 'ar' ? '2026-12-31' : '2027-01-31';
    const invalidValidUntil = locale === 'ar' ? '2027-01-30' : '2027-03-02';
    // Per-locale patient keeps plan/visit selectors unambiguous because both
    // locales share this synthetic tenant within one harness run.
    const patientName = `Synthetic scheduling patient (${locale})`;
    const planCard = () =>
      page.locator('article.raak-scheduling-list-row').filter({ hasText: patientName }).first();
    await db.patient.create({
      data: {
        tenantId,
        displayName: patientName,
        normalizedName: patientName.toLowerCase(),
        areaId: 'central',
      },
    });
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => browserErrors.push(e.name));
    await login(page, ownerEmail, locale);
    // U01: create a care-plan draft from the bilingual editor.
    await page.goto(`${base}/${locale}/workspace/care-plans`);
    await page.getByRole('button', { name: c.newPlan, exact: true }).click();
    await page.locator('#create-patient').click();
    await page.getByRole('option', { name: patientName, exact: true }).click();
    await page.locator('#create-service').click();
    await page.getByRole('option', { name: localizedService, exact: true }).click();
    await page.locator('#plan-caregiver').click();
    await page.getByRole('option', { name: caregiverOneName, exact: true }).click();
    await page.locator('#plan-from').fill(validFrom);
    await page.locator('#plan-until').fill(validUntil);
    await page
      .locator('fieldset.raak-scheduling-span label', { hasText: c.weekdays['1'] })
      .locator('input')
      .check();
    await page.locator('#plan-time').fill('09:00');
    await page.locator('#plan-duration').fill('60');
    await page.locator('#plan-goal').fill('Synthetic browser care goal');
    await page.getByRole('button', { name: c.addTask, exact: true }).click();
    await page.locator('#plan-task-0').fill('Synthetic required browser task');
    // Care-plan validation is immediate feedback only; invalid content must not
    // reach the server, whose schema remains authoritative.
    await page.locator('#plan-until').fill(invalidValidUntil);
    let invalidCreateRequest = false;
    const observeInvalidCreate = (
      request: import('../../../frontend/node_modules/@playwright/test/index.js').Request,
    ) => {
      if (request.url().includes('/care-plans') && request.method() === 'POST')
        invalidCreateRequest = true;
    };
    page.on('request', observeInvalidCreate);
    await page.getByRole('button', { name: c.createPlan, exact: true }).click();
    await page.waitForTimeout(100);
    page.off('request', observeInvalidCreate);
    expect(invalidCreateRequest, '61-day content must be rejected before submission').toBe(false);
    await expect(page.locator('#plan-until')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#plan-until')).toHaveAttribute(
      'aria-describedby',
      'plan-until-error',
    );
    await expect(page.locator('#plan-until')).toBeFocused();
    await page.locator('#plan-until').fill(validUntil);
    const planId = await (async () => {
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/care-plans') && r.request().method() === 'POST',
        ),
        page.getByRole('button', { name: c.createPlan, exact: true }).click(),
      ]);
      expect(response.status()).toBe(201);
      return (await response.json()).data.id as string;
    })();
    // U02: exact-version clinical approval by a qualified reviewer (A06).
    await expect(page.getByText(c.approvalHint)).toBeVisible();
    // Clinical DRAFT preview must not expose activation before exact-version approval.
    await getAction(page, `/agency/care-plans/${planId}/generation-preview`, () =>
      page.getByRole('button', { name: c.preview, exact: true }).click(),
    );
    await expect(page.getByRole('button', { name: c.activate, exact: true })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('plan')).toBe(planId);
    const reviewerContext = await browser.newContext({ reducedMotion: 'reduce' });
    const reviewerPage = await reviewerContext.newPage();
    reviewerPage.on('pageerror', (e) => browserErrors.push(e.name));
    await login(reviewerPage, reviewerEmail, locale);
    await reviewerPage.goto(`${base}/${locale}/workspace/care-plans`);
    await reviewerPage
      .locator('article.raak-scheduling-list-row')
      .filter({ hasText: patientName })
      .first()
      .getByRole('button', { name: c.open, exact: true })
      .click();
    await action(reviewerPage, `/agency/care-plans/${planId}/approve-clinical`, () =>
      reviewerPage.getByRole('button', { name: c.approveExact, exact: true }).click(),
    );
    await expect(reviewerPage.getByText(c.states.APPROVED, { exact: true }).first()).toBeVisible();
    await expect(
      reviewerPage.getByRole('button', { name: c.approveExact, exact: true }),
      'an already-approved version must not expose another approval action',
    ).toHaveCount(0);
    await reviewerContext.close();
    // U03: read-only generation preview, then idempotent activation by the owner.
    await page.goto(`${base}/${locale}/workspace/care-plans`);
    await planCard().getByRole('button', { name: c.open, exact: true }).click();
    await getAction(page, `/agency/care-plans/${planId}/generation-preview`, () =>
      page.getByRole('button', { name: c.preview, exact: true }).click(),
    );
    await expect(page.getByText(c.occurrences, { exact: true })).toBeVisible();
    const activateButton = page.getByRole('button', { name: c.activate, exact: true });
    await expect(activateButton).toBeEnabled();
    let releaseActivationResponse: (() => void) | undefined;
    let activationResponseReady!: () => void;
    const activationReachedResponse = new Promise<void>((resolve) => {
      activationResponseReady = resolve;
    });
    await page.route(`**/v1/agency/care-plans/${planId}/activate`, async (route) => {
      activationResponseReady();
      await new Promise<void>((resolve) => {
        releaseActivationResponse = resolve;
      });
      await route.continue();
    });
    const activationClick = activateButton.click();
    await activationReachedResponse;
    await expect(page.getByText(c.generated, { exact: true })).toHaveCount(0);
    releaseActivationResponse?.();
    await activationClick;
    await page.unroute(`**/v1/agency/care-plans/${planId}/activate`);
    await expect(page.getByText(c.generated, { exact: true })).toBeVisible();
    // Editing uses the same 60-day client feedback boundary as creation.
    await page.locator('#plan-until').fill(invalidValidUntil);
    let invalidRevisionRequest = false;
    const observeInvalidRevision = (
      request: import('../../../frontend/node_modules/@playwright/test/index.js').Request,
    ) => {
      if (request.url().endsWith(`/care-plans/${planId}/revise`) && request.method() === 'POST')
        invalidRevisionRequest = true;
    };
    page.on('request', observeInvalidRevision);
    await page.getByRole('button', { name: c.revise, exact: true }).click();
    await page.waitForTimeout(100);
    page.off('request', observeInvalidRevision);
    expect(invalidRevisionRequest, '61-day revision must be rejected before submission').toBe(
      false,
    );
    await page.locator('#plan-until').fill(validUntil);
    // A revision invalidates any previous generation preview.
    await getAction(page, `/agency/care-plans/${planId}/generation-preview`, () =>
      page.getByRole('button', { name: c.preview, exact: true }).click(),
    );
    await expect(page.getByText(c.previewHint, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: c.revise, exact: true }).click();
    await expect(page.getByText(c.previewHint, { exact: true })).toHaveCount(0);
    // Delayed version-2 preview must not reappear after selecting version 1.
    let releasePreview!: () => void;
    let previewReady!: () => void;
    const previewHeld = new Promise<void>((resolve) => {
      releasePreview = resolve;
    });
    const previewArrived = new Promise<void>((resolve) => {
      previewReady = resolve;
    });
    const previewPattern = `**/v1/agency/care-plans/${planId}/generation-preview?version=2`;
    await page.route(previewPattern, async (route) => {
      // Chrome resolves *.localhost itself; Node's API client needs loopback
      // plus the original trusted host for tenant routing.
      const target = new URL(route.request().url());
      target.hostname = '127.0.0.1';
      const response = await route.fetch({
        url: target.toString(),
        headers: {
          ...route.request().headers(),
          host: new URL(base).host,
        },
      });
      previewReady();
      await previewHeld;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: c.preview, exact: true }).click();
    await previewArrived;
    await page
      .getByRole('button', { name: `${c.version} 1 · ${c.states.ACTIVATED}`, exact: true })
      .click();
    const delayedPreview = page.waitForResponse((response) =>
      response.url().includes('generation-preview?version=2'),
    );
    releasePreview();
    await delayedPreview;
    await page.unroute(previewPattern);
    await expect(page.getByText(c.previewHint, { exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: `${c.version} 2 · ${c.states.DRAFT}`, exact: true })
      .click();
    await getAction(page, `/agency/care-plans/${planId}/generation-preview`, () =>
      page.getByRole('button', { name: c.preview, exact: true }).click(),
    );
    await expect(page.getByText(c.previewHint, { exact: true })).toBeVisible();
    await page.locator('#plan-goal').fill('Synthetic edited draft goal');
    await page.route(`**/v1/agency/care-plans/${planId}/draft`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'VERSION_CONFLICT' } }),
      }),
    );
    await page.getByRole('button', { name: c.saveDraft, exact: true }).click();
    await expect(page.getByText(c.stale, { exact: true })).toBeVisible();
    await page.unroute(`**/v1/agency/care-plans/${planId}/draft`);
    await page.getByRole('button', { name: c.saveDraft, exact: true }).click();
    await expect(page.getByText(c.previewHint, { exact: true })).toHaveCount(0);
    // A committed PATCH followed by a failed detail refresh is not a failed command.
    await page.route(`**/v1/agency/care-plans/${planId}`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }),
      }),
    );
    await page.locator('#plan-goal').fill('Synthetic committed refresh failure');
    await page.getByRole('button', { name: c.saveDraft, exact: true }).click();
    await expect(page.getByText(c.savedRefreshFailed, { exact: true })).toBeVisible();
    await page.unroute(`**/v1/agency/care-plans/${planId}`);
    // Generated visits are PLANNED and unassigned (never SCHEDULED).
    await page.goto(`${base}/${locale}/workspace/visits`);
    const visitRow = () => page.locator('tbody tr').filter({ hasText: patientName });
    await expect(visitRow().filter({ hasText: c.states.PLANNED }).first()).toBeVisible();
    await expect(visitRow().filter({ hasText: c.states.SCHEDULED })).toHaveCount(0);
    expect(await db.visit.count({ where: { carePlanId: planId, status: 'PLANNED' } })).toBe(4);
    // U06: candidates are advisory; assignment confirms transactionally.
    await visitRow()
      .filter({ hasText: c.states.PLANNED })
      .first()
      .getByRole('button', { name: c.open, exact: true })
      .click();
    const visitId = await page
      .locator(`section[aria-label="${c.visitDetail}"] p.raak-scheduling-code`)
      .innerText();
    expect(new URL(page.url()).searchParams.get('visit')).toBe(visitId);
    await page.reload();
    await expect(
      page.locator(`section[aria-label="${c.visitDetail}"] p.raak-scheduling-code`),
    ).toHaveText(visitId);
    await action(page, `/agency/visits/${visitId}/candidates`, () =>
      page.getByRole('button', { name: c.loadCandidates, exact: true }).click(),
    );
    await expect(
      page.locator(`section[aria-label="${c.visitDetail}"]`).getByText(c.advisory, { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(`section[aria-label="${c.visitDetail}"] article`)
        .filter({ hasText: caregiverOneName }),
    ).toBeVisible();
    const assignResponse = await action(page, `/agency/visits/${visitId}/assign`, () =>
      page.getByRole('button', { name: c.assign, exact: true }).click(),
    );
    expect((await assignResponse.json()).data.assignmentHealth).toBe('OK');
    await expect(
      page.locator(`section[aria-label="${c.visitDetail}"]`).getByText(c.states.SCHEDULED, {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: c.close, exact: true }).click();
    const assignedVisit = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
    const leaveDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: assignedVisit.timezoneSnapshot,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(assignedVisit.scheduledStartUtc);
    // F10: approved leave flags the committed visit without cancelling it.
    await page.goto(`${base}/${locale}/workspace/caregivers`);
    await page
      .locator('article.raak-card')
      .filter({ has: page.getByRole('heading', { name: caregiverOneName, exact: true }) })
      .first()
      .getByRole('button', { name: p.detail })
      .click();
    await page.locator('#exception-date').fill(leaveDate);
    await page.locator('#exception-reason').fill('Synthetic approved leave');
    const exceptionForm = page.locator('form').filter({ has: page.locator('#exception-date') });
    await action(page, `/agency/caregivers/${caregiverOneId}/exceptions`, () =>
      exceptionForm.getByRole('button', { name: p.save, exact: true }).click(),
    );
    // U09: reassignment queue surfaces the flagged visit; reassigning restores health.
    await page.goto(`${base}/${locale}/workspace/visits`);
    await page.getByRole('button', { name: c.showQueue, exact: true }).click();
    await expect(
      page.getByText(c.states.NEEDS_REASSIGNMENT, { exact: true }).first(),
    ).toBeVisible();
    const flagged = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(flagged.status).toBe('SCHEDULED');
    expect(flagged.assignedCaregiverId).toBe(caregiverOneId);
    await page
      .locator('tbody tr', { has: page.getByText(c.states.NEEDS_REASSIGNMENT, { exact: true }) })
      .first()
      .getByRole('button', { name: c.open, exact: true })
      .click();
    await action(page, `/agency/visits/${visitId}/candidates`, () =>
      page.getByRole('button', { name: c.loadCandidates, exact: true }).click(),
    );
    await page.locator('#visit-candidate').click();
    await page.getByRole('option', { name: caregiverTwoName, exact: true }).click();
    await page.locator('#reassign-reason').fill('Synthetic reassignment after leave');
    await action(page, `/agency/visits/${visitId}/reassign`, () =>
      page.getByRole('button', { name: c.reassign, exact: true }).click(),
    );
    await expect(
      page.locator(`section[aria-label="${c.visitDetail}"]`).getByText(c.states.OK, {
        exact: true,
      }),
    ).toBeVisible();
    const recovered = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(recovered.assignedCaregiverId).toBe(caregiverTwoId);
    expect(recovered.assignmentHealth).toBe('OK');
    expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId } })).toBe(2);
    await page.getByRole('button', { name: c.close, exact: true }).click();
    // U10 lifecycle: pause keeps future planned visits explicitly, resume restores.
    await page.goto(`${base}/${locale}/workspace/care-plans`);
    await planCard().getByRole('button', { name: c.open, exact: true }).click();
    await page.getByRole('button', { name: c.pause, exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: c.confirm, exact: true })).toHaveCount(0);
    expect(await page.evaluate('document.activeElement?.textContent')).toContain(c.pause);
    await page.getByRole('button', { name: c.pause, exact: true }).click();
    await action(page, `/agency/care-plans/${planId}/pause`, () =>
      page.getByRole('button', { name: c.confirm, exact: true }).click(),
    );
    await expect(page.getByText(c.states.PAUSED, { exact: true }).first()).toBeVisible();
    expect(
      await db.visit.count({ where: { tenantId, carePlanId: planId, status: 'PLANNED' } }),
    ).toBe(3);
    await page.getByRole('button', { name: c.resume, exact: true }).click();
    await action(page, `/agency/care-plans/${planId}/resume`, () =>
      page.getByRole('button', { name: c.confirm, exact: true }).click(),
    );
    await expect(page.getByText(c.states.ACTIVE, { exact: true }).first()).toBeVisible();
    await checkVisitListRegressions(page, base, locale, visitsCopy, caregiverTwoName);
    // Approved-route matrix: RTL/LTR, mobile/desktop, light/dark, keyboard.
    for (const width of [390, 1440])
      for (const dark of [false, true]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ['/workspace/care-plans', '/workspace/visits']) {
          await page.goto(`${base}/${locale}${route}`);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          expect(await page.locator('html').getAttribute('dir')).toBe(
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          if (dark) await page.getByRole('button', { name: cc.theme, exact: true }).click();
          await noOverflow(page);
          await page.keyboard.press('Tab');
          expect(await page.evaluate('document.activeElement?.tagName')).not.toBe('BODY');
        }
      }
    await ctx.close();
    process.stdout.write(
      `Sprint 5 ${locale}: U01-U06/U09/U10/F10 plan create/approve/preview/activate, visit assign, leave flag, reassignment and route matrix passed\n`,
    );
  }
  expect(browserErrors).toEqual([]);
} finally {
  await browser?.close();
  next.kill();
  await new Promise<void>((resolve) => ingress.close(() => resolve()));
  if (tenantId) {
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId } });
    await db.visitTask.deleteMany({ where: { tenantId } });
    await db.visitReminder.deleteMany({ where: { tenantId } });
    await db.visit.deleteMany({ where: { tenantId } });
    await db.carePlanVersion.deleteMany({ where: { tenantId } });
    await db.carePlan.deleteMany({ where: { tenantId } });
    await db.availabilityException.deleteMany({ where: { tenantId } });
    await db.availabilitySlot.deleteMany({ where: { tenantId } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId } });
    await db.caregiverQualification.deleteMany({ where: { tenantId } });
    await db.caregiver.deleteMany({ where: { tenantId } });
    await db.agencyService.deleteMany({ where: { tenantId } });
    await db.idempotencyKey.deleteMany({ where: { tenantId } });
    await db.patient.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.authSession.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await disconnectPrisma();
}
