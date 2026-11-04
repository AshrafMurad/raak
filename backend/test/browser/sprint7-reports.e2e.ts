// Synthetic fixtures, real Express/PostgreSQL/Next, installed Chrome. No mail/storage I/O.
import '../../src/env-load';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const {
  chromium,
  expect,
}: typeof import('../../../frontend/node_modules/@playwright/test/index.js') = createRequire(
  import.meta.url,
)('../../../frontend/node_modules/@playwright/test');
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { createSession } from '../../src/modules/auth/session.service';
import ar from '../../../frontend/messages/ar/reporting.json';
import en from '../../../frontend/messages/en/reporting.json';

const db = getPrisma();
const suffix = randomUUID().slice(0, 8);
const slugA = `browser-reports-a-${suffix}`;
const slugB = `browser-reports-b-${suffix}`;
const base = `http://${slugA}.localhost:3152`;
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
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
    '3153',
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
    { hostname: '127.0.0.1', port: 3153, path: req.url, method: req.method, headers: req.headers },
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
const tenantIds: string[] = [];
try {
  await new Promise<void>((resolve) => ingress.listen(3152, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3153/en/login')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Run frontend npm run build:browser before this suite');

  const seed = async (prefix: 'a' | 'b') => {
    const tenant = await db.tenant.create({
      data: {
        slug: prefix === 'a' ? slugA : slugB,
        legalName: `Synthetic Reports Browser ${prefix.toUpperCase()}`,
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: `support-${prefix}@example.invalid`,
      },
    });
    tenantIds.push(tenant.id);
    const owner = await db.staffAccount.create({
      data: {
        tenantId: tenant.id,
        role: 'AGENCY_OWNER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailNormalized: `owner-${prefix}-${suffix}@example.invalid`,
        passwordHash: 'unused',
      },
    });
    return { tenant, owner };
  };
  const a = await seed('a');
  const b = await seed('b');

  const coordinator = await db.staffAccount.create({
    data: {
      tenantId: a.tenant.id,
      role: 'CARE_COORDINATOR',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      emailNormalized: `coordinator-${suffix}@example.invalid`,
      passwordHash: 'unused',
    },
  });
  const patientA = await db.patient.create({
    data: {
      tenantId: a.tenant.id,
      displayName: 'Synthetic beneficiary',
      normalizedName: 'synthetic beneficiary',
      areaId: 'central',
    },
  });
  const patientB = await db.patient.create({
    data: {
      tenantId: b.tenant.id,
      displayName: 'Synthetic beneficiary',
      normalizedName: 'synthetic beneficiary',
      areaId: 'central',
    },
  });
  const config = { nameAr: 'رعاية منزلية', nameEn: 'Home care' };
  const configTwo = { nameAr: 'علاج طبيعي', nameEn: 'Physiotherapy' };
  const serviceOne = await db.agencyService.create({
    data: { tenantId: a.tenant.id, slug: 'home-care', config },
  });
  const serviceTwo = await db.agencyService.create({
    data: { tenantId: a.tenant.id, slug: 'physiotherapy', config: configTwo },
  });
  const otherService = await db.agencyService.create({
    data: { tenantId: b.tenant.id, slug: 'home-care', config },
  });

  const caregiverOne = await db.caregiver.create({
    data: {
      tenantId: a.tenant.id,
      name: 'Caregiver One',
      professionalCategory: 'NURSE',
      operationalStatus: 'ACTIVE',
    },
  });
  const caregiverTwo = await db.caregiver.create({
    data: {
      tenantId: a.tenant.id,
      name: 'Caregiver Two',
      professionalCategory: 'NURSE',
      operationalStatus: 'ACTIVE',
    },
  });
  await db.caregiver.create({
    data: {
      tenantId: b.tenant.id,
      name: 'Caregiver One',
      professionalCategory: 'NURSE',
      operationalStatus: 'ACTIVE',
    },
  });

  const requestBase = (tenantId: string, serviceId: string) => ({
    tenantId,
    agencyServiceId: serviceId,
    requesterName: 'Synthetic requester',
    requesterEmailNormalized: `requester-${randomUUID().slice(0, 8)}@example.invalid`,
    requesterPhone: '+966500000000',
    beneficiaryName: 'Synthetic beneficiary',
    relationship: 'OTHER',
    areaId: 'central',
    preferredWindowJson: {},
    notesRestricted: '',
    locale: 'en',
    privacyVersion: 'test',
    serviceSnapshot: { pricingType: 'FIXED', priceMinor: 0 },
    priceAcknowledged: true,
  });
  for (const [status, serviceId, submittedAt] of [
    ['SUBMITTED', serviceOne.id, '2026-11-02T09:00:00Z'],
    ['UNDER_REVIEW', serviceOne.id, '2026-11-03T09:00:00Z'],
    ['APPROVED', serviceTwo.id, '2026-11-04T09:00:00Z'],
    ['REJECTED', serviceTwo.id, '2026-11-05T09:00:00Z'],
    ['SUBMITTED', serviceOne.id, '2026-11-20T09:00:00Z'],
  ] as const) {
    await db.serviceRequest.create({
      data: {
        ...requestBase(a.tenant.id, serviceId),
        status,
        submittedAt: new Date(submittedAt),
        reference: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash: 'synthetic',
      },
    });
  }
  await db.serviceRequest.create({
    data: {
      ...requestBase(b.tenant.id, otherService.id),
      status: 'APPROVED',
      submittedAt: new Date('2026-11-04T09:00:00Z'),
      reference: randomUUID(),
      idempotencyKey: randomUUID(),
      payloadHash: 'synthetic',
    },
  });

  const visitBase = (tenantId: string, serviceId: string, start: string, end: string) => ({
    tenantId,
    agencyServiceId: serviceId,
    areaId: 'central',
    serviceNameSnapshot: { nameAr: 'زيارة اصطناعية', nameEn: 'Synthetic visit' },
    scheduledStartUtc: new Date(start),
    scheduledEndUtc: new Date(end),
    timezoneSnapshot: 'Asia/Riyadh',
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceOne.id, '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z'),
      patientId: patientA.id,
      status: 'SCHEDULED',
      assignedCaregiverId: caregiverOne.id,
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceOne.id, '2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z'),
      patientId: patientA.id,
      status: 'COMPLETED',
      assignedCaregiverId: caregiverOne.id,
      actualStartAt: new Date('2026-11-03T08:00:00Z'),
      actualEndAt: new Date('2026-11-03T09:05:00Z'),
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-04T08:00:00Z', '2026-11-04T10:00:00Z'),
      patientId: patientA.id,
      status: 'COMPLETED',
      assignedCaregiverId: caregiverTwo.id,
      actualStartAt: new Date('2026-11-04T08:10:00Z'),
      actualEndAt: new Date('2026-11-04T10:00:00Z'),
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-05T08:00:00Z', '2026-11-05T09:00:00Z'),
      patientId: patientA.id,
      status: 'PLANNED',
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceOne.id, '2026-11-06T08:00:00Z', '2026-11-06T09:00:00Z'),
      patientId: patientA.id,
      status: 'CANCELLED',
      assignedCaregiverId: caregiverOne.id,
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceOne.id, '2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z'),
      patientId: patientA.id,
      status: 'SCHEDULED',
      assignedCaregiverId: caregiverOne.id,
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-02T12:00:00Z', '2026-11-02T13:00:00Z'),
      patientId: patientA.id,
      status: 'MISSED',
      assignedCaregiverId: caregiverTwo.id,
    },
  });
  await db.visit.create({
    data: {
      ...visitBase(b.tenant.id, otherService.id, '2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z'),
      patientId: patientB.id,
      status: 'COMPLETED',
      assignedCaregiverId: null,
      actualStartAt: new Date('2026-11-03T08:00:00Z'),
      actualEndAt: new Date('2026-11-03T09:00:00Z'),
    },
  });

  for (let i = 0; i < 25; i++) {
    await db.auditEvent.create({
      data: {
        tenantId: a.tenant.id,
        actorType: 'AGENCY_STAFF',
        actorId: a.owner.id,
        action: `synthetic.browser.reports.${i}`,
        subjectType: 'visit',
        subjectId: randomUUID(),
        reason: `Synthetic reason ${i}`,
        metadataJson: { internalSecret: 'never-surface' },
      },
    });
  }
  await db.auditEvent.create({
    data: {
      tenantId: b.tenant.id,
      actorType: 'AGENCY_STAFF',
      actorId: b.owner.id,
      action: 'synthetic.browser.reports.other',
      subjectType: 'visit',
      reason: 'Other tenant only',
      metadataJson: { internalSecret: 'never-surface' },
    },
  });

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 },
      });
      const session = await createSession(db, {
        principalId: coordinator.id,
        principalType: 'AGENCY_STAFF',
        tenantId: a.tenant.id,
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
      await page.goto(`${base}/${locale}/workspace/reports${mobile ? '?theme=dark' : ''}`);
      // All-time totals reconcile with the seeded source rows (E08).
      await expect(page.locator('[data-count="requests-total"]')).toHaveText('5');
      await expect(page.locator('[data-count="visits-total"]')).toHaveText('7');
      // Period filter drives both reports and is URL-backed.
      await page.locator('#report-from').fill('2026-11-01');
      await page.locator('#report-to').fill('2026-11-07');
      await expect(page.locator('[data-count="requests-total"]')).toHaveText('4');
      await expect(page.locator('[data-count="visits-total"]')).toHaveText('6');
      await expect(page).toHaveURL(/from=2026-11-01/);
      // Request status filter narrows the funnel.
      await page.locator('#request-status').click();
      await page.getByRole('option', { name: c.statuses.APPROVED, exact: true }).click();
      await expect(page.locator('[data-count="requests-total"]')).toHaveText('1');
      await expect(page).toHaveURL(/requestStatus=APPROVED/);
      // Caregiver load minutes: cancelled excluded; tenant B rows never merge.
      const one = page.locator(
        `[data-caregiver-row="${caregiverOne.id}"] [data-count="caregiver-minutes"]`,
      );
      const two = page.locator(
        `[data-caregiver-row="${caregiverTwo.id}"] [data-count="caregiver-minutes"]`,
      );
      await expect(one).toHaveText('120');
      await expect(two).toHaveText('180');
      // Service filter keeps tenant B's same-slug service out of A's counts.
      await page.locator('#report-service').click();
      await page
        .getByRole('option', { name: locale === 'ar' ? config.nameAr : config.nameEn, exact: true })
        .click();
      await expect(page.locator('[data-count="requests-total"]')).toHaveText('0');
      await page.locator('#report-service').click();
      await page
        .getByRole('option', {
          name: locale === 'ar' ? configTwo.nameAr : configTwo.nameEn,
          exact: true,
        })
        .click();
      await expect(page.locator('[data-count="requests-total"]')).toHaveText('1');
      // Narrowed to physiotherapy, only the second caregiver still carries load.
      await expect(page.locator('[data-caregiver-row]')).toHaveCount(1);
      await expect(two).toHaveText('180');
      // Visit status filter SCHEDULED only: nothing scheduled for this service.
      await page.locator('#visit-status').click();
      await page.getByRole('option', { name: c.statuses.SCHEDULED, exact: true }).click();
      await expect(page.locator('[data-count="visits-total"]')).toHaveText('0');
      await expect(page.locator('[data-caregiver-row]')).toHaveCount(0);
      // Failed filters must never leave old totals presented as current data.
      await page.locator('#report-from').fill('2026-11-08');
      await expect(page.getByText(c.validation, { exact: true })).toBeVisible();
      await expect(page.locator('[data-count="visits-total"]')).toHaveCount(0);
      await page.getByRole('button', { name: c.reset, exact: true }).click();
      await expect(page.locator('[data-count="visits-total"]')).toHaveText('7');
      await expect(page.getByText(c.validation, { exact: true })).toHaveCount(0);
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(
        true,
      );
      // Audit view is administrator-only: the coordinator sees the denial copy.
      await page.goto(`${base}/${locale}/workspace/audit`);
      await expect(page.getByText(c.auditDenied, { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      console.log(
        `PASS reports filters/reconciliation ${locale} ${mobile ? '360px dark' : 'desktop light'}`,
      );
      await context.close();
    }
  }
  // Owner walks the audit trail with cursor pagination in both locales.
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const session = await createSession(db, {
      principalId: a.owner.id,
      principalType: 'AGENCY_STAFF',
      tenantId: a.tenant.id,
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
    await page.goto(`${base}/${locale}/workspace/audit`);
    await expect(page.locator('[data-audit-row]')).toHaveCount(20);
    await expect(page.getByRole('button', { name: c.next, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: c.next, exact: true }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(page.locator('[data-audit-row]')).toHaveCount(5);
    await expect(page.getByRole('button', { name: c.next, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: c.first, exact: true }).click();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect(page.locator('[data-audit-row]')).toHaveCount(20);
    // Safe summaries only: metadata never reaches the DOM; other tenant absent.
    const html = await page.content();
    expect(html).not.toContain('never-surface');
    expect(html).not.toContain('synthetic.browser.reports.other');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(
      true,
    );
    expect(errors).toEqual([]);
    console.log(`PASS audit pagination/safe summaries ${locale}`);
    await context.close();
  }
} finally {
  await browser?.close();
  next.kill();
  await new Promise<void>((resolve) => ingress.close(() => resolve()));
  for (const tenantId of tenantIds) {
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.visit.deleteMany({ where: { tenantId } });
    await db.serviceRequest.deleteMany({ where: { tenantId } });
    await db.caregiver.deleteMany({ where: { tenantId } });
    await db.agencyService.deleteMany({ where: { tenantId } });
    await db.patient.deleteMany({ where: { tenantId } });
    await db.authSession.deleteMany({ where: { tenantId } });
    await db.staffAccount.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
  }
  await disconnectPrisma();
}
