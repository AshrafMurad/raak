// Real Express/PostgreSQL/Next/installed Chrome. Synthetic capture email and
// explicit in-memory storage/scanner doubles; never evidence of a live scan.
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
import ar from '../../../frontend/messages/ar/people.json';
import en from '../../../frontend/messages/en/people.json';
import arCatalog from '../../../frontend/messages/ar/catalog.json';
import enCatalog from '../../../frontend/messages/en/catalog.json';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { hashPassword } from '../../src/modules/auth/crypto';
import {
  deliverRequestEmail,
  type RequestEmail,
} from '../../src/modules/notifications/request-email';

const db = getPrisma();
const slug = `browser-s4-${randomUUID().slice(0, 8)}`;
const base = `http://${slug}.localhost:3120`;
const key = 'synthetic-browser-sprint4-encryption-key';
const password = 'Synthetic-Browser-Only-1!';
const ownerEmail = 'owner@example.invalid';
const objects = new Map<string, Buffer>();
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: key }),
  db,
  now: () => new Date(),
  logger: createLogger({ service: 'browser-test', write: () => {} }),
  health: { checkDatabase: async () => true },
  privateStorage: {
    putImmutable: async (key, bytes) => {
      if (objects.has(key)) throw new Error('Immutable');
      objects.set(key, Buffer.from(bytes));
    },
    read: async (key, max) => {
      const b = objects.get(key);
      if (!b || b.length > max) throw new Error('Unavailable');
      return b;
    },
  },
  malwareScanner: async (bytes) =>
    bytes.includes(Buffer.from('SYNTHETIC_QUARANTINE')) ? 'QUARANTINED' : 'CLEAN', // Explicit synthetic test double only.
});
const next = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../../../frontend/node_modules/next/dist/bin/next', import.meta.url)),
    'start',
    '-p',
    '3121',
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
    { hostname: '127.0.0.1', port: 3121, path: req.url, method: req.method, headers: req.headers },
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
async function login(page: Page, email: string, locale: string) {
  await page.goto(`${base}/${locale}/login`);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await action(page, '/auth/login', () => page.locator('button[type=submit]').click());
  await expect(page).toHaveURL(`${base}/${locale}/workspace/requests`);
}
async function emailLink(customerId: string, purpose: string, locale: string) {
  const token = await db.customerCapability.findFirstOrThrow({
    where: { tenantId, customerId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const event = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId, aggregateId: token.id },
  });
  const captured: RequestEmail[] = [];
  await deliverRequestEmail({
    db,
    eventId: event.id,
    encryptionKey: key,
    now: () => new Date(),
    send: async (mail) => {
      captured.push(mail);
    },
    buildLink: (_slug, _locale, secret, context) =>
      `${base}/${locale}/account#token=${secret}&purpose=${context!.purpose}${context!.requestId ? `&request=${context!.requestId}` : ''}`,
  });
  expect(captured.length).toBe(1);
  expect(captured[0]!.text).not.toContain('Synthetic beneficiary');
  return captured[0]!.text.match(/http:\/\/\S+/)![0];
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
  await new Promise<void>((resolve) => ingress.listen(3120, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3121/en/login')).ok) {
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
        legalName: 'Synthetic Sprint 4 browser agency',
        displayName: 'Synthetic agency',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const passwordHash = await hashPassword(password);
  await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: ownerEmail,
      passwordHash,
      status: 'ACTIVE',
      role: 'AGENCY_OWNER',
      emailVerifiedAt: new Date(),
    },
  });
  const caregiverStaff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'caregiver@example.invalid',
      passwordHash,
      status: 'ACTIVE',
      role: 'CAREGIVER',
      emailVerifiedAt: new Date(),
    },
  });
  const caregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: caregiverStaff.id,
      name: 'Synthetic caregiver',
      professionalCategory: 'SYNTHETIC_SUPPORT',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  const service = await db.agencyService.create({
    data: {
      tenantId,
      slug: 'synthetic-service',
      isPublished: true,
      config: {
        nameAr: 'خدمة اصطناعية',
        nameEn: 'Synthetic service',
        summaryAr: 'ملخص',
        summaryEn: 'Summary',
        descriptionAr: 'للتجربة فقط',
        descriptionEn: 'Synthetic only',
        durationMin: 60,
        clinicalClass: 'CLINICAL',
        requiredQualificationCodes: ['SYNTHETIC_SUPPORT'],
        serviceAreaIds: ['central'],
        allowStandalone: true,
        allowRecurring: false,
        pricingType: 'FIXED',
        priceMinor: 0,
        pricingUnit: 'VISIT',
      },
    },
  });
  await db.patient.create({
    data: {
      tenantId,
      displayName: 'Unrelated synthetic patient',
      normalizedName: 'unrelated synthetic patient',
      areaId: 'central',
    },
  });
  browser = await chromium.launch({
    channel: 'chrome',
    headless: !process.argv.includes('--headed'),
  });
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    const cc = locale === 'ar' ? arCatalog : enCatalog;
    const customerEmail = `customer-${locale}@example.invalid`;
    const request = await db.serviceRequest.create({
      data: {
        tenantId,
        agencyServiceId: service.id,
        reference: `REQ-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        payloadHash: 'synthetic',
        requesterName: 'Synthetic requester',
        requesterEmailNormalized: customerEmail,
        requesterPhone: '',
        beneficiaryName: 'Synthetic beneficiary',
        relationship: 'FAMILY',
        areaId: 'central',
        preferredWindowJson: {},
        notesRestricted: '',
        locale,
        privacyVersion: 'test',
        serviceSnapshot: { pricingType: 'FIXED', priceMinor: 0 },
        priceAcknowledged: true,
        status: 'APPROVED',
      },
    });
    const customerContext = await browser.newContext();
    const page = await customerContext.newPage();
    page.on('pageerror', (e) => browserErrors.push(e.name));
    await page.goto(`${base}/${locale}/account`);
    await page.locator('#customer-email').fill(customerEmail);
    await page.locator('#customer-password').fill(password);
    await action(
      page,
      '/portal/accounts/register',
      () => page.getByRole('button', { name: c.register, exact: true }).click(),
      202,
    );
    await expect(page.getByText(c.verificationSent, { exact: true })).toBeVisible();
    const customer = await db.customerAccount.findFirstOrThrow({
      where: { tenantId, emailNormalized: customerEmail },
    });
    await page.goto(await emailLink(customer.id, 'VERIFY_EMAIL', locale));
    await expect(page.locator('#customer-token')).not.toHaveValue('');
    expect(new URL(page.url()).hash).toBe('');
    await action(page, '/portal/accounts/verify-email', () =>
      page.getByRole('button', { name: c.verify, exact: true }).click(),
    );
    await page.goto(`${base}/${locale}/account`);
    await page.locator('#customer-login-email').fill(customerEmail);
    await page.locator('#customer-login-password').fill(password);
    await action(page, '/portal/accounts/login', () =>
      page.getByRole('button', { name: c.login, exact: true }).click(),
    );
    await page.locator('#claim-reference').fill(request.reference);
    await action(
      page,
      '/portal/accounts/claim-link',
      () => page.getByRole('button', { name: c.claimLink, exact: true }).click(),
      202,
    );
    await page.goto(await emailLink(customer.id, 'CLAIM_REQUEST', locale));
    await expect(page.locator('#claim-request')).toHaveValue(request.id);
    await action(page, `/portal/my/requests/${request.id}/claim`, () =>
      page.getByRole('button', { name: c.claim, exact: true }).click(),
    );
    await expect(page.getByText(c.claimed, { exact: true })).toBeVisible();
    expect(
      await db.patientAccess.count({ where: { tenantId, customerAccountId: customer.id } }),
    ).toBe(0);
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    staffPage.on('pageerror', (e) => browserErrors.push(e.name));
    await login(staffPage, ownerEmail, locale);
    await staffPage.goto(`${base}/${locale}/workspace/patients?request=${request.id}`);
    await expect(staffPage.locator('#patient-displayName')).toHaveValue('Synthetic beneficiary');
    await staffPage.locator('#patient-displayName').fill(`${locale} Synthetic Person One`);
    await staffPage.locator('#patient-dateOfBirth').fill('1960-02-20');
    await action(staffPage, '/agency/patients/duplicates/check', () =>
      staffPage.getByRole('button', { name: c.duplicateCheck }).click(),
    );
    // The other locale's synthetic patient is a probable duplicate by DOB.
    for (const input of await staffPage.locator('input[id^="duplicate-"]').all())
      await input.fill('Independently reviewed synthetic distinct person');
    await action(
      staffPage,
      `/agency/requests/${request.id}/create-patient`,
      () =>
        staffPage
          .locator('form')
          .filter({ has: staffPage.locator('#patient-displayName') })
          .getByRole('button', { name: c.save, exact: true })
          .click(),
      201,
    );
    const linked = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(linked.patientId).toBeTruthy();
    expect(
      (await db.patient.findUniqueOrThrow({ where: { id: linked.patientId! } })).displayName,
    ).toBe(`${locale} Synthetic Person One`);
    await staffPage.goto(`${base}/${locale}/workspace/patients`);
    await staffPage.locator('#patient-displayName').fill(`${locale} Synthetic Person Two`);
    await staffPage.locator('#patient-dateOfBirth').fill('1960-02-20');
    await staffPage.locator('#patient-areaId').fill('central');
    await action(staffPage, '/agency/patients/duplicates/check', () =>
      staffPage.getByRole('button', { name: c.duplicateCheck }).click(),
    );
    for (const input of await staffPage.locator('input[id^="duplicate-"]').all())
      await input.fill('Agency reviewed a distinct synthetic identity');
    await action(
      staffPage,
      '/agency/patients',
      () =>
        staffPage
          .locator('form')
          .filter({ has: staffPage.locator('#patient-displayName') })
          .getByRole('button', { name: c.save, exact: true })
          .click(),
      201,
    );
    for (const name of [`${locale} Synthetic Person One`, `${locale} Synthetic Person Two`]) {
      await staffPage
        .locator('article.raak-card')
        .filter({ has: staffPage.getByRole('heading', { name, exact: true }) })
        .first()
        .getByRole('button', { name: c.detail })
        .click();
      await expect(staffPage.locator('#patient-displayName')).toHaveValue(name);
      await expect(staffPage.locator('#grant-email')).toBeVisible();
      await staffPage.locator('#grant-email').fill(customerEmail);
      const patient = await db.patient.findFirstOrThrow({ where: { tenantId, displayName: name } });
      await action(
        staffPage,
        `/agency/patients/${patient.id}/access-grants`,
        () => staffPage.getByRole('button', { name: c.issueGrant }).click(),
        201,
      );
    }
    await page.goto(`${base}/${locale}/my/patients`);
    await expect(
      page.getByRole('heading', { name: `${locale} Synthetic Person One`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `${locale} Synthetic Person Two`, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Unrelated synthetic patient', { exact: true })).toHaveCount(0);
    const ownContext = await browser.newContext({ reducedMotion: 'reduce' });
    const ownPage = await ownContext.newPage();
    ownPage.on('pageerror', (e) => browserErrors.push(e.name));
    await login(ownPage, 'caregiver@example.invalid', locale);
    // All new routes + selected patient/grant state across the approved matrix.
    for (const width of [390, 1440])
      for (const dark of [false, true]) {
        await staffPage.setViewportSize({ width, height: 900 });
        for (const route of ['/account', '/workspace/patients', '/workspace/caregivers']) {
          await staffPage.goto(`${base}/${locale}${route}`);
          await expect(staffPage.getByRole('heading', { level: 1 })).toBeVisible();
          if (route === '/workspace/patients') {
            await staffPage
              .locator('article.raak-card')
              .filter({
                has: staffPage.getByRole('heading', {
                  name: `${locale} Synthetic Person One`,
                  exact: true,
                }),
              })
              .first()
              .getByRole('button', { name: c.detail })
              .click();
            await expect(staffPage.locator('#grant-email')).toBeVisible();
          }
          if (route === '/workspace/caregivers') {
            await staffPage
              .locator('article.raak-card')
              .filter({
                has: staffPage.getByRole('heading', { name: caregiver.name, exact: true }),
              })
              .getByRole('button', { name: c.detail })
              .click();
            await expect(staffPage.locator('#caregiver-name')).toBeVisible();
            await staffPage.locator('#caregiver-status').focus();
            await staffPage.keyboard.press('Space');
            await expect(
              staffPage.getByRole('option', { name: c.states.ACTIVE, exact: true }),
            ).toBeVisible();
            await staffPage.keyboard.press('Escape');
            await expect(staffPage.locator('#caregiver-status')).toBeFocused();
          }
          if (dark) await staffPage.getByRole('button', { name: cc.theme, exact: true }).click();
          expect(await staffPage.locator('html').getAttribute('dir')).toBe(
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          await noOverflow(staffPage);
          await staffPage.keyboard.press('Tab');
          expect(await staffPage.evaluate('document.activeElement?.tagName')).not.toBe('BODY');
        }
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/${locale}/my/patients`);
        await expect(
          page.getByRole('heading', { name: `${locale} Synthetic Person One`, exact: true }),
        ).toBeVisible();
        if (dark) await page.getByRole('button', { name: cc.theme, exact: true }).click();
        await noOverflow(page);
        await ownPage.setViewportSize({ width, height: 900 });
        await ownPage.goto(`${base}/${locale}/caregiver/profile`);
        await expect(
          ownPage.getByRole('heading', { name: c.ownProfile, exact: true }),
        ).toBeVisible();
        await expect(
          ownPage.getByRole('heading', { name: c.availability, exact: true }),
        ).toBeVisible();
        if (dark) await ownPage.getByRole('button', { name: cc.theme, exact: true }).click();
        await noOverflow(ownPage);
      }
    await staffPage.goto(`${base}/${locale}/workspace/patients`);
    await staffPage
      .locator('article.raak-card')
      .filter({
        has: staffPage.getByRole('heading', {
          name: `${locale} Synthetic Person One`,
          exact: true,
        }),
      })
      .first()
      .getByRole('button', { name: c.detail })
      .click();
    const grant = await db.patientAccess.findFirstOrThrow({
      where: { tenantId, customerAccountId: customer.id, patientId: linked.patientId! },
    });
    await staffPage.locator(`#revoke-${grant.id}`).fill('Agency revoked synthetic authorization');
    await action(staffPage, `/agency/patient-access/${grant.id}/revoke`, () =>
      staffPage.getByRole('button', { name: c.revoke }).click(),
    );
    await expect(staffPage.locator(`#revoke-${grant.id}`)).toHaveCount(0);
    await page.goto(`${base}/${locale}/my/patients`);
    await expect(
      page.getByRole('heading', { name: `${locale} Synthetic Person Two`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `${locale} Synthetic Person One`, exact: true }),
    ).toHaveCount(0);
    await ownContext.close();
    await staffContext.close();
    await customerContext.close();
    process.stdout.write(
      `Sprint 4 ${locale}: E04/F05/F06 create-from-approved, duplicate review, two grants, revocation and 20 viewport/theme route checks passed\n`,
    );
  }
  // Caregiver qualification/authorization/availability form interactions.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, ownerEmail, 'en');
  await page.goto(`${base}/en/workspace/caregivers`);
  await page
    .locator('article.raak-card')
    .filter({ has: page.getByRole('heading', { name: caregiver.name, exact: true }) })
    .getByRole('button', { name: en.detail })
    .click();
  await page.locator('#q-code').fill('SYNTHETIC_SUPPORT');
  await page.locator('#q-issuer').fill('Synthetic issuer');
  await page.locator('#q-license').fill('Synthetic-only');
  await page.locator('#q-validThrough').fill('2027-12-31');
  await action(
    page,
    `/agency/caregivers/${caregiver.id}/qualifications`,
    () => page.getByRole('button', { name: en.addQualification }).click(),
    201,
  );
  const q = await db.caregiverQualification.findFirstOrThrow({
    where: { tenantId, caregiverId: caregiver.id },
  });
  await action(page, `/agency/qualifications/${q.id}/verify`, () =>
    page.getByRole('button', { name: en.verifyQualification }).click(),
  );
  await expect(page.getByRole('button', { name: en.verifyQualification })).toHaveCount(0);
  await page.locator(`#service-${service.id}`).check();
  await action(page, `/agency/caregivers/${caregiver.id}/service-authorizations`, () =>
    page
      .locator('form#caregiver-services')
      .getByRole('button', { name: en.save, exact: true })
      .click(),
  );
  await expect(page.locator(`section[data-caregiver-id="${caregiver.id}"]`)).toHaveAttribute(
    'data-caregiver-version',
    '2',
  );
  await page.locator('#day-1').check();
  await action(page, `/agency/caregivers/${caregiver.id}/availability`, () =>
    page
      .locator('form')
      .filter({ has: page.locator('#day-1') })
      .getByRole('button', { name: en.save, exact: true })
      .click(),
  );
  await expect(page.locator(`section[data-caregiver-id="${caregiver.id}"]`)).toHaveAttribute(
    'data-availability-revision',
    '2',
  );
  await page.locator('#eligibility-serviceId').click();
  await page.getByRole('option', { name: 'Synthetic service', exact: true }).click();
  await page.locator('#eligibility-date').fill('2026-12-07');
  await page.locator('#eligibility-start').fill('09:00');
  await page.locator('#eligibility-end').fill('10:00');
  await action(page, `/agency/caregivers/${caregiver.id}/eligibility`, () =>
    page.getByRole('button', { name: en.eligibility, exact: true }).click(),
  );
  await expect(page.getByText(en.eligible, { exact: true })).toBeVisible();
  await page.locator(`#file-${caregiver.id}`).setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic only\n%%EOF'),
  });
  await action(
    page,
    '/documents/upload-intent',
    () => page.getByRole('button', { name: en.upload, exact: true }).click(),
    201,
  );
  await expect(page.getByText(en.states.CLEAN, { exact: false })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: en.download, exact: true }).click(),
  ]);
  expect(await download.failure()).toBeNull();
  await page.locator(`#file-${caregiver.id}`).setInputFiles({
    name: 'synthetic-quarantine.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSYNTHETIC_QUARANTINE\n%%EOF'),
  });
  await action(
    page,
    '/documents/upload-intent',
    () => page.getByRole('button', { name: en.upload, exact: true }).click(),
    201,
  );
  await expect(page.getByText(en.states.QUARANTINED, { exact: false })).toBeVisible();
  await db.caregiverQualification.create({
    data: {
      tenantId,
      caregiverId: caregiver.id,
      code: 'X'.repeat(64),
      licenseIssuer: 'Synthetic long-content fixture',
      licenseNumberRestricted: 'SYNTHETIC-ONLY',
    },
  });
  const denseOwnContext = await browser.newContext({ reducedMotion: 'reduce' });
  const denseOwnPage = await denseOwnContext.newPage();
  await login(denseOwnPage, 'caregiver@example.invalid', 'en');
  for (const locale of ['ar', 'en'] as const)
    for (const width of [360, 1440])
      for (const dark of [false, true]) {
        const copy = locale === 'ar' ? ar : en;
        const catalog = locale === 'ar' ? arCatalog : enCatalog;
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/${locale}/workspace/caregivers`);
        await page
          .locator('article.raak-card')
          .filter({ has: page.getByRole('heading', { name: caregiver.name, exact: true }) })
          .getByRole('button', { name: copy.detail })
          .click();
        await expect(page.getByText(copy.states.VERIFIED, { exact: false })).toBeVisible();
        await expect(page.getByText(copy.states.QUARANTINED, { exact: false })).toBeVisible();
        if (dark) await page.getByRole('button', { name: catalog.theme, exact: true }).click();
        await noOverflow(page);
        await denseOwnPage.setViewportSize({ width, height: 900 });
        await denseOwnPage.goto(`${base}/${locale}/caregiver/profile`);
        await expect(denseOwnPage.getByText(copy.states.VERIFIED, { exact: false })).toBeVisible();
        if (dark)
          await denseOwnPage.getByRole('button', { name: catalog.theme, exact: true }).click();
        await noOverflow(denseOwnPage);
      }
  await denseOwnContext.close();
  await ctx.close();
  expect(browserErrors).toEqual([]);
  process.stdout.write(
    'Sprint 4 caregiver qualification, service authorization, availability, eligibility and private-file test-double workflow passed\n',
  );
  process.stdout.write(
    'Sprint 4 populated caregiver/private-file/long-content matrix: 16 AR/EN light/dark mobile/desktop checks passed\n',
  );
} finally {
  await browser?.close();
  next.kill();
  await new Promise<void>((resolve) => ingress.close(() => resolve()));
  if (tenantId) {
    await db.documentTicket.deleteMany({ where: { tenantId } });
    await db.document.deleteMany({ where: { tenantId } });
    await db.patientDuplicateReview.deleteMany({ where: { tenantId } });
    await db.patientAccess.deleteMany({ where: { tenantId } });
    await db.customerCapability.deleteMany({ where: { tenantId } });
    await db.serviceRequest.deleteMany({ where: { tenantId } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId } });
    await db.agencyService.deleteMany({ where: { tenantId } });
    await db.patient.deleteMany({ where: { tenantId } });
    await db.caregiverQualification.deleteMany({ where: { tenantId } });
    await db.availabilitySlot.deleteMany({ where: { tenantId } });
    await db.availabilityException.deleteMany({ where: { tenantId } });
    await db.caregiver.deleteMany({ where: { tenantId } });
    await db.emailDelivery.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.authSession.deleteMany({ where: { tenantId } });
    await db.customerAccount.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await disconnectPrisma();
}
