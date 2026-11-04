// Real Express + PostgreSQL + installed Next/Chrome. Synthetic fixtures only.
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
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { hashPassword } from '../../src/modules/auth/crypto';
import { addDays, utcLocalDate, localToUtc } from '../../src/modules/common/local-time';
import arCaregiver from '../../../frontend/messages/ar/caregiver-visits.json';
import enCaregiver from '../../../frontend/messages/en/caregiver-visits.json';
import arCustomer from '../../../frontend/messages/ar/customer-visits.json';
import enCustomer from '../../../frontend/messages/en/customer-visits.json';
import arVisits from '../../../frontend/messages/ar/visits.json';
import enVisits from '../../../frontend/messages/en/visits.json';
import arSettings from '../../../frontend/messages/ar/settings.json';
import enSettings from '../../../frontend/messages/en/settings.json';
import arCatalog from '../../../frontend/messages/ar/catalog.json';
import enCatalog from '../../../frontend/messages/en/catalog.json';

const db = getPrisma();
const slug = `browser-s6-${randomUUID().slice(0, 8)}`;
const base = `http://${slug}.localhost:3140`;
const password = 'Synthetic-Browser-Only-1!';
const zone = 'Asia/Riyadh';
const today = utcLocalDate(new Date(), zone);
const app = buildApp({
  env: loadApiEnv({
    BASE_DOMAIN: 'localhost',
    SESSION_SECRET: 'synthetic-browser-sprint6-session-secret',
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
    '3141',
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
    { hostname: '127.0.0.1', port: 3141, path: req.url, method: req.method, headers: req.headers },
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
}
async function approveInBrowser(page: Page, changeId: string, copy: typeof enVisits, status = 200) {
  await page
    .locator(`[data-change-id="${changeId}"]`)
    .getByRole('button', { name: copy.changes.approve, exact: true })
    .click();
  // Opening the consequence dialog must not itself decide the request.
  expect((await db.visitChangeRequest.findUniqueOrThrow({ where: { id: changeId } })).status).toBe(
    'PENDING',
  );
  return action(
    page,
    `/agency/visit-change-requests/${changeId}/approve`,
    () =>
      page
        .getByRole('dialog')
        .getByRole('button', { name: copy.changes.confirm, exact: true })
        .click(),
    status,
  );
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
    page.url(),
  ).toBe(true);
}
function instant(date: string, clock: string) {
  const result = localToUtc(date, clock, zone);
  if (result.status !== 'UNIQUE') throw new Error('Synthetic fixture local time invalid');
  return result.instant;
}

try {
  await new Promise<void>((resolve) => ingress.listen(3140, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3141/en/login')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for installed Next */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready)
    throw new Error('Browser build unavailable on 3141; run frontend npm run build:browser');
  const passwordHash = await hashPassword(password);
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Sprint 6 Browser Agency',
        displayName: 'Synthetic agency',
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
      emailNormalized: 'owner@example.invalid',
      passwordHash,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const service = await db.agencyService.create({
    data: {
      tenantId,
      slug: 'synthetic-execution',
      config: {
        nameAr: 'زيارة اصطناعية',
        nameEn: 'Synthetic visit',
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
        pricingType: 'CUSTOM_QUOTE',
        priceMinor: null,
        pricingUnit: null,
      },
    },
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [index, locale] of (['ar', 'en'] as const).entries()) {
    const c = locale === 'ar' ? arCaregiver : enCaregiver;
    const customerCopy = locale === 'ar' ? arCustomer : enCustomer;
    const v = locale === 'ar' ? arVisits : enVisits;
    const s = locale === 'ar' ? arSettings : enSettings;
    const staff = await db.staffAccount.create({
      data: {
        tenantId,
        emailNormalized: `caregiver-${locale}@example.invalid`,
        passwordHash,
        role: 'CAREGIVER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const caregiver = await db.caregiver.create({
      data: {
        tenantId,
        staffAccountId: staff.id,
        name: `Synthetic caregiver ${locale}`,
        professionalCategory: 'Synthetic',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
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
    const patient = await db.patient.create({
      data: {
        tenantId,
        displayName: `Synthetic patient ${locale}`,
        normalizedName: `synthetic patient ${locale}`,
        areaId: 'central',
      },
    });
    const customer = await db.customerAccount.create({
      data: {
        tenantId,
        emailNormalized: `customer-${locale}@example.invalid`,
        passwordHash,
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
    const makeVisit = async (date: string, clock = '09:00') => {
      const start = instant(date, clock);
      return db.visit.create({
        data: {
          tenantId,
          patientId: patient.id,
          agencyServiceId: service.id,
          assignedCaregiverId: caregiver.id,
          areaId: 'central',
          status: 'SCHEDULED',
          scheduledStartUtc: start,
          scheduledEndUtc: new Date(start.getTime() + 3_600_000),
          timezoneSnapshot: zone,
          serviceNameSnapshot: { nameAr: 'زيارة اصطناعية', nameEn: 'Synthetic visit' },
        },
      });
    };
    const execution = await makeVisit(today);
    const futureDate = addDays(today, 3 + index * 8);
    const proposedDate = addDays(today, 5 + index * 8);
    const future = await makeVisit(futureDate);
    const decline = await makeVisit(addDays(today, 6 + index * 8));
    const tasks = await db.visitTask.createManyAndReturn({
      data: [1, 2].map((order) => ({
        tenantId,
        visitId: execution.id,
        order,
        descriptionSnapshot: `Synthetic required task ${order}`,
        isRequired: true,
      })),
    });
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const caregiverPage = await ctx.newPage();
    caregiverPage.on('pageerror', (e) => browserErrors.push(e.name));
    await login(caregiverPage, staff.emailNormalized, locale);
    await expect(caregiverPage).toHaveURL(new RegExp(`/${locale}/caregiver/visits`));
    await caregiverPage.getByRole('button', { name: c.open, exact: true }).click();
    const dialog = caregiverPage.getByRole('dialog');
    await action(caregiverPage, `/caregiver/my/visits/${execution.id}/start`, () =>
      dialog.getByRole('button', { name: c.start, exact: true }).click(),
    );
    await expect(dialog.locator('[data-visit-status]')).toHaveAttribute(
      'data-visit-status',
      'IN_PROGRESS',
    );
    await action(caregiverPage, `/caregiver/my/visits/${execution.id}/tasks/${tasks[0]!.id}`, () =>
      dialog
        .locator(`[data-task="${tasks[0]!.id}"]`)
        .getByRole('button', { name: c.markDone, exact: true })
        .click(),
    );
    const second = dialog.locator(`[data-task="${tasks[1]!.id}"]`);
    await second.locator('textarea').fill('Synthetic task exception for coordinator review.');
    await action(caregiverPage, `/caregiver/my/visits/${execution.id}/tasks/${tasks[1]!.id}`, () =>
      second.getByRole('button', { name: c.markNotDone, exact: true }).click(),
    );
    await dialog.locator('#visit-note').fill(`Synthetic finalized ${locale} note.`);
    await action(caregiverPage, `/caregiver/my/visits/${execution.id}/note`, () =>
      dialog.getByRole('button', { name: c.saveNote, exact: true }).click(),
    );
    await action(caregiverPage, `/caregiver/my/visits/${execution.id}/complete`, () =>
      dialog.getByRole('button', { name: c.complete, exact: true }).click(),
    );
    await expect(dialog.locator('[data-visit-status]')).toHaveAttribute(
      'data-visit-status',
      'COMPLETED',
    );
    await expect(dialog.locator('#visit-note')).toBeDisabled();
    await expect(dialog.getByText(c.review.NEEDS_REVIEW, { exact: true })).toBeVisible();
    await noOverflow(caregiverPage);
    const completed = await db.visit.findUniqueOrThrow({ where: { id: execution.id } });
    expect(completed.actualStartAt).not.toBeNull();
    expect(completed.actualEndAt).not.toBeNull();
    expect(completed.completionSnapshotJson).toMatchObject({
      notes: [expect.objectContaining({ bodyRestricted: `Synthetic finalized ${locale} note.` })],
    });
    await dialog.getByRole('button', { name: c.close, exact: true }).click();

    const coordinatorCtx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const staffPage = await coordinatorCtx.newPage();
    staffPage.on('pageerror', (e) => browserErrors.push(e.name));
    await login(staffPage, owner.emailNormalized, locale);
    await staffPage.goto(`${base}/${locale}/workspace/visits?visit=${execution.id}`);
    await expect(
      staffPage
        .getByRole('region', { name: v.review.notes })
        .getByText(v.review.states.NEEDS_REVIEW, { exact: false }),
    ).toBeVisible();
    await staffPage
      .locator('#review-note')
      .fill('Synthetic coordinator review, separate from execution.');
    await action(staffPage, `/agency/visits/${execution.id}/review`, () =>
      staffPage.getByRole('button', { name: v.review.markReviewed, exact: true }).click(),
    );
    await staffPage.locator('#correction-body').fill(`Synthetic appended ${locale} correction.`);
    await staffPage
      .locator('#correction-reason')
      .fill('Synthetic clarification preserving original.');
    await action(
      staffPage,
      `/agency/visits/${execution.id}/corrections`,
      () => staffPage.getByRole('button', { name: v.review.addCorrection, exact: true }).click(),
      201,
    );
    await expect(
      staffPage.getByText(`Synthetic appended ${locale} correction.`, { exact: true }),
    ).toBeVisible();
    expect(
      (await db.visit.findUniqueOrThrow({ where: { id: execution.id } })).completionSnapshotJson,
    ).toEqual(completed.completionSnapshotJson);
    process.stdout.write(
      `PASS E06 ${locale}: mobile caregiver start → DONE/NOT_DONE+reason → draft → completion snapshot → separate review → append-only correction\n`,
    );

    const customerCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const customerPage = await customerCtx.newPage();
    customerPage.on('pageerror', (e) => browserErrors.push(e.name));
    await customerPage.goto(`${base}/${locale}/account`);
    await customerPage.locator('#customer-login-email').fill(customer.emailNormalized);
    await customerPage.locator('#customer-login-password').fill(password);
    await action(customerPage, '/portal/accounts/login', () =>
      customerPage.locator('#customer-login button[type=submit]').click(),
    );
    await customerPage.goto(`${base}/${locale}/my/visits`);
    // Cards are identified by the authorized visit id, never by patient-name uniqueness.
    await customerPage
      .locator(`[data-customer-visit="${future.id}"]`)
      .getByRole('button', { name: customerCopy.open, exact: true })
      .click();
    const customerDialog = customerPage.getByRole('dialog');
    await customerDialog.locator('#proposed-date').fill(proposedDate);
    await customerDialog.locator('#proposed-time').fill('11:00');
    await customerDialog.locator('#change-reason').fill('Synthetic customer reschedule request.');
    const submitted = await action(
      customerPage,
      `/portal/my/visits/${future.id}/change-requests`,
      () =>
        customerDialog
          .getByRole('button', { name: customerCopy.submitRequest, exact: true })
          .click(),
      201,
    );
    const changeId = (await submitted.json()).data.id as string;
    expect(
      (await db.visit.findUniqueOrThrow({ where: { id: future.id } })).scheduledStartUtc,
    ).toEqual(future.scheduledStartUtc);
    await expect(
      customerDialog.getByText(customerCopy.pendingChange, { exact: true }),
    ).toBeVisible();
    await noOverflow(customerPage);
    // Introduce a real booking conflict after submission. Failed approval
    // must preserve both the pending request and the original booking (I13).
    const conflicting = await makeVisit(proposedDate, '11:00');
    await staffPage.goto(`${base}/${locale}/workspace/changes`);
    await approveInBrowser(staffPage, changeId, v, 409);
    expect(
      (await db.visitChangeRequest.findUniqueOrThrow({ where: { id: changeId } })).status,
    ).toBe('PENDING');
    expect(
      (await db.visit.findUniqueOrThrow({ where: { id: future.id } })).scheduledStartUtc,
    ).toEqual(future.scheduledStartUtc);
    await db.visit.delete({ where: { id: conflicting.id } });
    await approveInBrowser(staffPage, changeId, v);
    const moved = await db.visit.findUniqueOrThrow({ where: { id: future.id } });
    expect(moved.scheduledStartUtc).toEqual(instant(proposedDate, '11:00'));
    await customerPage.reload();
    await expect(
      customerPage.getByRole('dialog').getByText(new RegExp(customerCopy.changeStatus.APPROVED)),
    ).toBeVisible();
    await customerPage
      .getByRole('dialog')
      .getByRole('button', { name: customerCopy.close, exact: true })
      .click();
    await caregiverPage.reload();
    await caregiverPage.locator('#visit-date').fill(proposedDate);
    await expect
      .poll(() => new URL(caregiverPage.url()).searchParams.get('date'))
      .toBe(proposedDate);
    await caregiverPage.reload();
    await expect(caregiverPage.getByRole('button', { name: c.open, exact: true })).toBeVisible();
    await caregiverPage.getByRole('button', { name: c.open, exact: true }).click();
    const displayedTime = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: zone,
    }).format(moved.scheduledStartUtc);
    await expect(
      caregiverPage.getByRole('dialog').getByText(displayedTime, { exact: true }),
    ).toBeVisible();
    await caregiverPage
      .getByRole('dialog')
      .getByRole('button', { name: c.close, exact: true })
      .click();
    await customerPage
      .locator(`[data-customer-visit="${decline.id}"]`)
      .getByRole('button', { name: customerCopy.open, exact: true })
      .click();
    await customerPage
      .getByRole('dialog')
      .getByRole('button', { name: customerCopy.requestCancel, exact: true })
      .click();
    await customerPage.locator('#change-reason').fill('Synthetic cancellation later declined.');
    const rejectSubmission = await action(
      customerPage,
      `/portal/my/visits/${decline.id}/change-requests`,
      () =>
        customerPage
          .getByRole('dialog')
          .getByRole('button', { name: customerCopy.submitRequest, exact: true })
          .click(),
      201,
    );
    const rejectedId = (await rejectSubmission.json()).data.id as string;
    await staffPage.reload();
    await staffPage.locator(`#decline-${rejectedId}`).fill('Synthetic coordinator decline reason.');
    await action(staffPage, `/agency/visit-change-requests/${rejectedId}/reject`, () =>
      staffPage
        .locator(`[data-change-id="${rejectedId}"]`)
        .getByRole('button', { name: v.changes.reject, exact: true })
        .click(),
    );
    expect(
      (await db.visit.findUniqueOrThrow({ where: { id: decline.id } })).scheduledStartUtc,
    ).toEqual(decline.scheduledStartUtc);
    expect(
      (await db.visitChangeRequest.findUniqueOrThrow({ where: { id: rejectedId } })).status,
    ).toBe('REJECTED');
    await customerPage.reload();
    await noOverflow(customerPage);
    await staffPage.goto(`${base}/${locale}/workspace/settings`);
    await staffPage.locator('#changeCancelCutoffHours').fill('12');
    await action(staffPage, '/agency/settings', () =>
      staffPage.getByRole('button', { name: s.save, exact: true }).click(),
    );
    await expect(staffPage.getByRole('status')).toContainText(
      locale === 'ar' ? 'تم التحديث' : 'Updated',
    );
    for (const width of [360, 1440]) {
      await caregiverPage.setViewportSize({ width, height: 900 });
      await noOverflow(caregiverPage);
    }
    expect(await customerPage.locator('html').getAttribute('dir')).toBe(
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    const themeLabel = (locale === 'ar' ? arCatalog : enCatalog).theme;
    for (const [page, route] of [
      [caregiverPage, '/caregiver/visits'],
      [customerPage, '/my/visits'],
      [staffPage, '/workspace/changes'],
      [staffPage, '/workspace/settings'],
    ] as const) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/${locale}${route}`);
        const root = page.locator('.rv-root').first();
        await expect(root).toHaveAttribute('data-theme', 'light');
        await noOverflow(page);
        await page.getByRole('button', { name: themeLabel, exact: true }).click();
        await expect(root).toHaveAttribute('data-theme', 'dark');
        await noOverflow(page);
      }
    }
    await staffPage.goto(`${base}/${locale}/design-preview`);
    await noOverflow(staffPage);
    await caregiverPage.goto(`${base}/${locale}/caregiver/visits`);
    const openCompleted = caregiverPage.getByRole('button', { name: c.open, exact: true });
    await openCompleted.click();
    await caregiverPage.keyboard.press('Tab');
    expect(
      await caregiverPage.evaluate("Boolean(document.activeElement?.closest('[role=dialog]'))"),
    ).toBe(true);
    await caregiverPage.keyboard.press('Escape');
    await expect(caregiverPage.getByRole('dialog')).toHaveCount(0);
    await expect(openCompleted).toBeFocused();
    process.stdout.write(
      `PASS E07 ${locale}: customer pending preserves original → conflict rollback → approval → customer/caregiver updated → decline preserves booking; settings and 360/390/1440px reflow\n`,
    );
    await ctx.close();
    await coordinatorCtx.close();
    await customerCtx.close();
  }
  expect(browserErrors).toEqual([]);
} finally {
  await browser?.close();
  ingress.close();
  ingress.closeAllConnections();
  next.kill();
  if (tenantId) {
    await db.visitReview.deleteMany({ where: { tenantId } });
    await db.visitNote.deleteMany({ where: { tenantId } });
    await db.visitChangeRequest.deleteMany({ where: { tenantId } });
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId } });
    await db.visitTask.deleteMany({ where: { tenantId } });
    await db.visit.deleteMany({ where: { tenantId } });
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
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await disconnectPrisma();
}
