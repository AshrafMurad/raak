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
import ar from '../../../frontend/messages/ar/notifications.json';
import en from '../../../frontend/messages/en/notifications.json';

const db = getPrisma();
const slug = `browser-inbox-${randomUUID().slice(0, 8)}`;
const base = `http://${slug}.localhost:3150`;
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
    '3151',
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
    { hostname: '127.0.0.1', port: 3151, path: req.url, method: req.method, headers: req.headers },
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
try {
  await new Promise<void>((resolve) => ingress.listen(3150, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3151/en/login')).ok) {
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
        legalName: 'Synthetic Inbox Browser',
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
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
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic beneficiary',
      normalizedName: 'synthetic beneficiary',
      areaId: 'central',
    },
  });
  const service = await db.agencyService.create({
    data: { tenantId, slug: 'synthetic', config: {} },
  });
  const visit = await db.visit.create({
    data: {
      tenantId,
      patientId: patient.id,
      agencyServiceId: service.id,
      areaId: 'central',
      serviceNameSnapshot: { nameAr: 'زيارة اصطناعية', nameEn: 'Synthetic visit' },
      scheduledStartUtc: new Date('2026-12-01T08:00:00Z'),
      scheduledEndUtc: new Date('2026-12-01T09:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
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
        principalId: owner.id,
        principalType: 'AGENCY_STAFF',
        tenantId,
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
      await db.notification.updateMany({
        where: { tenantId, recipientPrincipalId: owner.id },
        data: { readAt: new Date() },
      });
      const event = await db.outboxEvent.create({
        data: { tenantId, eventType: 'synthetic', aggregateId: visit.id, payloadMinimal: {} },
      });
      const notice = await db.notification.create({
        data: {
          tenantId,
          eventId: event.id,
          principalType: 'AGENCY_STAFF',
          recipientPrincipalId: owner.id,
          eventType: 'VISIT_NEEDS_REVIEW',
          entityType: 'visit',
          entityId: visit.id,
        },
      });
      await page.goto(`${base}/${locale}/workspace/settings${mobile ? '?theme=dark' : ''}`);
      await expect(page.locator('[data-notification-badge]')).toHaveAccessibleName(
        c.badge.replace('{count}', '1'),
      );
      await page.locator('[data-notification-badge]').click();
      await expect(page.getByRole('heading', { name: c.title, exact: true })).toBeVisible();
      await page.getByLabel(c.unreadOnly, { exact: true }).check();
      await expect(page).toHaveURL(/unreadOnly=true/);
      const item = page.locator(`[data-notification-id="${notice.id}"]`);
      await item.getByRole('button', { name: c.markRead, exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
      await expect(page.getByLabel(c.unreadOnly, { exact: true })).toBeFocused();
      await expect(page.locator('[data-notification-badge]')).toHaveAccessibleName(
        c.badge.replace('{count}', '0'),
      );
      await page.getByLabel(c.unreadOnly, { exact: true }).uncheck();
      await item.getByRole('button', { name: c.open, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/workspace/visits\\?visit=${visit.id}`));
      await page.goto(`${base}/${locale}/workspace/notifications/preferences`);
      const reminder = page.locator('#VISIT_REMINDER-EMAIL');
      await expect(reminder).toBeVisible();
      await reminder.uncheck();
      await page.getByRole('button', { name: c.save, exact: true }).click();
      await expect(page.getByText(c.saved, { exact: true })).toBeVisible();
      await page.reload();
      await expect(reminder).not.toBeChecked();
      await page.goto(`${base}/${locale}/workspace/settings/notifications`);
      await expect(page.locator('#VISIT_CANCELLED-EMAIL')).toBeDisabled();
      await expect(page.locator('#VISIT_CANCELLED-EMAIL')).toBeChecked();
      await page.locator('#VISIT_REMINDER-IN_APP').uncheck();
      await page.getByRole('button', { name: c.save, exact: true }).click();
      await expect(page.getByText(c.saved, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.locator('#VISIT_REMINDER-IN_APP')).not.toBeChecked();
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(
        true,
      );
      // A self-owned stale target stays generic even after a formerly valid link changes.
      await db.notification.update({ where: { id: notice.id }, data: { entityId: randomUUID() } });
      await page.goto(`${base}/${locale}/workspace/notifications`);
      await item.getByRole('button', { name: c.open, exact: true }).click();
      await expect(page.getByText(c.unavailable, { exact: true })).toBeVisible();
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(
        true,
      );
      expect(errors).toEqual([]);
      console.log(
        `PASS inbox/read/target/preferences/policy ${locale} ${mobile ? '360px dark' : 'desktop light'}`,
      );
      await context.close();
    }
  }
  // Customer portal entry and grant revocation are checked in the browser too.
  const customer = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: 'customer@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const grant = await db.patientAccess.create({
    data: {
      tenantId,
      patientId: patient.id,
      customerAccountId: customer.id,
      scopes: ['VIEW_VISITS'],
      authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
      verifiedByStaffId: owner.id,
      verifiedAt: new Date(),
    },
  });
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const session = await createSession(db, {
      tenantId,
      principalId: customer.id,
      principalType: 'AGENCY_CUSTOMER',
      sessionVersion: 0,
      ttlSeconds: 3600,
    });
    await context.addCookies([
      { name: 'raak_session_agency', value: session.sessionToken, url: base },
      { name: 'raak_csrf_agency', value: session.csrfToken, url: base },
    ]);
    const event = await db.outboxEvent.create({
      data: { tenantId, eventType: 'synthetic', aggregateId: visit.id, payloadMinimal: {} },
    });
    const row = await db.notification.create({
      data: {
        tenantId,
        eventId: event.id,
        principalType: 'AGENCY_CUSTOMER',
        recipientPrincipalId: customer.id,
        eventType: 'VISIT_CHANGED',
        entityType: 'visit',
        entityId: visit.id,
      },
    });
    const page = await context.newPage();
    await page.goto(`${base}/${locale}/notifications`);
    await page
      .locator(`[data-notification-id="${row.id}"]`)
      .getByRole('button', { name: c.open, exact: true })
      .click();
    if (locale === 'ar') {
      await expect(page).toHaveURL(new RegExp(`/my/visits\\?visit=${visit.id}`));
      await db.patientAccess.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), status: 'REVOKED' },
      });
    } else await expect(page.getByText(c.unavailable, { exact: true })).toBeVisible();
    await page.goto(`${base}/${locale}/notifications/preferences`);
    await page.locator('#VISIT_REMINDER-IN_APP').uncheck();
    await page.getByRole('button', { name: c.save, exact: true }).click();
    await expect(page.getByText(c.saved, { exact: true })).toBeVisible();
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(
      true,
    );
    console.log(`PASS customer inbox/preferences/grant check ${locale} 360px`);
    await context.close();
  }
} finally {
  await browser?.close();
  next.kill();
  await new Promise<void>((resolve) => ingress.close(() => resolve()));
  if (tenantId) {
    await db.notification.deleteMany({ where: { tenantId } });
    await db.notificationPreference.deleteMany({ where: { tenantId } });
  }
  await disconnectPrisma();
}
