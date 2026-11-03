// Local synthetic browser harness. Starts only installed Next.js and Chrome;
// real Express/PostgreSQL, same-origin host ingress, injected email capture.
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
import en from '../../../frontend/messages/en/catalog.json';
import ar from '../../../frontend/messages/ar/catalog.json';
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
const suffix = randomUUID().slice(0, 8);
const slug = `browser-s2-${suffix}`;
const password = 'Synthetic-Browser-Only-1!';
const key = 'synthetic-browser-encryption-key-32-characters';
const base = (tenant = slug) => `http://${tenant}.localhost:3110`;
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const next = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../../../frontend/node_modules/next/dist/bin/next', import.meta.url)),
    'start',
    '-p',
    '3111',
    '-H',
    '127.0.0.1',
  ],
  { cwd: frontend, stdio: 'pipe', windowsHide: true },
);
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost', SESSION_SECRET: key }),
  logger: createLogger({ service: 'browser-test', write: () => {} }),
  db,
  now: () => new Date(),
  health: { checkDatabase: async () => true },
});
const ingress = http.createServer((req, res) => {
  if (req.url?.startsWith('/v1/')) {
    app(req, res);
    return;
  }
  const proxy = http.request(
    { hostname: '127.0.0.1', port: 3111, path: req.url, method: req.method, headers: req.headers },
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
const operatorEmail = `operator-${suffix}@example.invalid`;
let operatorId = '';
let templateId = '';
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
async function responseAction(
  page: Page,
  path: string,
  action: () => Promise<unknown>,
  status = 200,
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/v1${path}` && r.request().method() !== 'GET',
    ),
    action(),
  ]);
  expect(response.status(), `HTTP ${path}`).toBe(status);
}
async function login(page: Page, tenant: string, email: string, locale = 'en') {
  await page.goto(`${base(tenant)}/${locale}/login`);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await responseAction(page, '/auth/login', () => page.locator('button[type=submit]').click());
}
async function noOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')).toBe(
    true,
  );
}
try {
  await new Promise<void>((resolve) => ingress.listen(3110, '0.0.0.0', resolve));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3111/en/login')).ok) break;
    } catch {
      /* boot */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const passwordHash = await hashPassword(password);
  operatorId = (
    await db.platformOperator.create({
      data: { emailNormalized: operatorEmail, passwordHash, status: 'ACTIVE' },
    })
  ).id;
  const config = {
    nameAr: 'قالب متصفح تجريبي',
    nameEn: 'Synthetic browser template',
    summaryAr: 'ملخص تجريبي',
    summaryEn: 'Synthetic summary',
    descriptionAr: 'وصف تجريبي فقط',
    descriptionEn: 'Synthetic description only',
    durationMin: 60,
    clinicalClass: 'NON_CLINICAL',
    requiredQualificationCodes: [],
    serviceAreaIds: ['central'],
    allowStandalone: true,
    allowRecurring: true,
    pricingType: 'FIXED',
    priceMinor: 15000,
    pricingUnit: 'VISIT',
  };
  templateId = (await db.platformService.create({ data: { code: `BROWSER_${suffix}`, config } }))
    .id;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestStates = new Map<string, Awaited<ReturnType<typeof owner.storageState>>>();
  const page = await owner.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base('platform')}/en/register`);
  for (const [name, value] of Object.entries({
    legalName: 'Synthetic browser agency',
    displayName: 'Synthetic browser agency',
    slug,
    supportEmail: `support-${suffix}@example.invalid`,
    ownerEmail: `owner-${suffix}@example.invalid`,
    ownerPassword: password,
  }))
    await page.locator(`[name=${name}]`).fill(value);
  await responseAction(
    page,
    '/agencies/register',
    () => page.locator('button[type=submit]').click(),
    201,
  );
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
  expect(tenant.status).toBe('PENDING_APPROVAL');
  const ownerEvent = await db.outboxEvent.findFirstOrThrow({
    where: { tenantId: tenant.id, eventType: 'email.owner_verification' },
  });
  const ownerLink = (ownerEvent.payloadMinimal as { link: string }).link.replace(
    'platform.localhost/',
    'platform.localhost:3110/',
  );
  await page.goto(ownerLink);
  await responseAction(page, '/auth/verify-email', () => page.getByRole('button').click());
  await login(page, 'platform', operatorEmail);
  await page.goto(`${base('platform')}/en/platform/tenants`);
  const row = page.getByRole('row').filter({ hasText: slug });
  await row.getByRole('button', { name: 'Activate', exact: true }).click();
  await responseAction(page, `/platform/tenants/${tenant.id}/activate`, () =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm activation', exact: true })
      .click(),
  );
  await login(page, slug, `owner-${suffix}@example.invalid`);
  await page.goto(`${base()}/en/workspace/branding`);
  for (const [field, value] of Object.entries({
    nameAr: 'وكالة متصفح تجريبية',
    nameEn: 'Synthetic branded portal',
    descriptionAr: 'بوابة تجريبية',
    descriptionEn: 'Synthetic portal description',
    areas: 'central | الوسطى | Central',
  }))
    await page.locator(`#${field}`).fill(value);
  const pixels = await browser.newPage({ viewport: { width: 8, height: 8 } });
  const png = await pixels.screenshot();
  await pixels.close();
  await page
    .locator('#logo')
    .setInputFiles({ name: 'synthetic-logo.png', mimeType: 'image/png', buffer: png });
  await page.locator('#primaryColor').click();
  await page.getByRole('option', { name: en.LAVENDER, exact: true }).click();
  await responseAction(page, '/agency/branding', () =>
    page.getByRole('button', { name: en.save, exact: true }).click(),
  );
  await page.goto(`${base()}/en/workspace/services`);
  await page.locator('#slug').fill('browser-service');
  await responseAction(
    page,
    '/agency/services',
    () =>
      page
        .locator('.raak-actions')
        .filter({ hasText: config.nameEn })
        .getByRole('button', { name: en.import, exact: true })
        .click(),
    201,
  );
  await page
    .locator('.raak-actions')
    .filter({ hasText: config.nameEn })
    .getByRole('button', { name: en.edit, exact: true })
    .click();
  await page.locator('#nameEn').fill('Synthetic customized service');
  await page.locator('#nameAr').fill('خدمة مخصصة تجريبية');
  const service = await db.agencyService.findFirstOrThrow({
    where: { tenantId: tenant.id, slug: 'browser-service' },
  });
  await responseAction(page, `/agency/services/${service.id}`, () =>
    page.getByRole('button', { name: en.save, exact: true }).click(),
  );
  await page.getByRole('button', { name: en.publish, exact: true }).click();
  await responseAction(page, `/agency/services/${service.id}/publish`, () =>
    page.getByRole('dialog').getByRole('button', { name: en.confirm, exact: true }).click(),
  );
  await page.goto(`${base()}/en`);
  await expect(
    page.getByRole('link', { name: 'Synthetic branded portal', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Synthetic customized service', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  process.stdout.write(
    'PASS E01 browser: register → verify → pending → operator activation → branding/logo → template import/customize/publish → branded portal\n',
  );
  const coordinatorEmail = `coordinator-${suffix}@example.invalid`;
  await db.staffAccount.create({
    data: {
      tenantId: tenant.id,
      role: 'CARE_COORDINATOR',
      emailNormalized: coordinatorEmail,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    const guest = await browser.newContext({
      viewport: { width: locale === 'ar' ? 390 : 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const g = await guest.newPage();
    g.on('pageerror', (e) => errors.push(e.message));
    await g.goto(`${base()}/${locale}/services/browser-service`);
    await g.getByRole('link', { name: c.request, exact: true }).click();
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await expect(g.locator('#requesterName')).toBeFocused();
    await g.locator('#requesterName').fill('Synthetic requester');
    await g.locator('#requesterEmail').fill(`guest-${locale}-${suffix}@example.invalid`);
    await g.locator('#beneficiaryName').fill('Different synthetic beneficiary');
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.getByRole('button', { name: c.theme, exact: true }).click();
    await g.locator('#areaId').click();
    await g.keyboard.press('Home');
    await g.keyboard.press('Enter');
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    await g.locator('#preferredDate').fill(tomorrow);
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.locator('#privacyAccepted').check();
    await g.locator('#priceAcknowledged').check();
    await responseAction(
      g,
      '/portal/requests',
      () => g.getByRole('button', { name: c.submit, exact: true }).click(),
      201,
    );
    await expect(g.getByRole('heading', { name: c.received, exact: true })).toBeVisible();
    await noOverflow(g);
    const reference = await g.getByTestId('receipt-reference').innerText();
    const requestRow = await db.serviceRequest.findFirstOrThrow({
      where: { tenantId: tenant.id, reference },
    });
    const token = await db.guestActionToken.findFirstOrThrow({
      where: { tenantId: tenant.id, requestId: requestRow.id },
    });
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { tenantId: tenant.id, aggregateId: token.id, eventType: 'email.request_access' },
    });
    const captured: RequestEmail[] = [];
    await deliverRequestEmail({
      db,
      eventId: event.id,
      encryptionKey: key,
      now: () => new Date(),
      buildLink: (s, l, t) => `${base(s)}/${l}/track#token=${t}`,
      send: async (mail) => {
        captured.push(mail);
      },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.text).not.toContain('Different synthetic beneficiary');
    const link = captured[0]!.text.match(/http:\/\/\S+/)![0];
    await g.goto(link);
    await g.getByRole('button', { name: c.verify, exact: true }).click();
    await expect(g.getByRole('heading', { name: c.verified, exact: true })).toBeVisible();
    expect(new URL(g.url()).hash).toBe('');
    await noOverflow(g);
    await g.goto(link);
    await g.getByRole('button', { name: c.verify, exact: true }).click();
    await expect(g.getByText(c.invalidLink, { exact: true })).toBeVisible();
    await g.goto(`${base()}/${locale}/track`);
    await expect(g.getByRole('heading', { name: c.verified, exact: true })).toBeVisible();
    const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const q = await staff.newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    await login(q, slug, coordinatorEmail, locale);
    await q.goto(`${base()}/${locale}/workspace/requests`);
    const article = q.locator('article').filter({ hasText: reference });
    await article.getByRole('button', { name: c.detail, exact: true }).click();
    await expect(q.getByRole('dialog')).toBeVisible();
    await responseAction(q, `/agency/requests/${requestRow.id}/start-review`, () =>
      q.getByRole('dialog').getByRole('button', { name: c.startReview, exact: true }).click(),
    );
    await expect(q.getByRole('dialog').getByText(c.UNDER_REVIEW, { exact: true })).toBeVisible();
    await q.keyboard.press('Escape');
    await expect(article.getByRole('button', { name: c.detail, exact: true })).toBeFocused();
    await noOverflow(q);
    await g.reload();
    await expect(g.getByText(c.UNDER_REVIEW, { exact: true }).first()).toBeVisible();
    guestStates.set(locale, await guest.storageState());
    process.stdout.write(
      `PASS E02 ${locale}: published detail → validated wizard → receipt → captured email → verified status → coordinator notification/queue/detail/start-review → updated guest status\n`,
    );
    await staff.close();
    await guest.close();
  }
  const ownerState = await owner.storageState();
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? ar : en;
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
          storageState: {
            cookies: [...ownerState.cookies, ...(guestStates.get(locale)?.cookies ?? [])],
            origins: [],
          },
        });
        const screen = await context.newPage();
        screen.on('pageerror', (e) => errors.push(e.message));
        for (const path of [
          '/services',
          '/services/browser-service',
          '/request?service=browser-service',
          '/track',
          '/workspace/services',
          '/workspace/branding',
          '/workspace/requests',
        ]) {
          await screen.goto(`${base()}/${locale}${path}`);
          await screen.waitForLoadState('networkidle');
          if (theme === 'dark')
            await screen.getByRole('button', { name: c.theme, exact: true }).click();
          await expect(screen.locator('.rv-root')).toHaveAttribute('data-theme', theme);
          await expect(screen.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          await expect(screen.locator('main h1')).toBeVisible();
          await noOverflow(screen);
          if (path === '/workspace/requests') {
            const trigger = screen.getByRole('button', { name: c.detail, exact: true }).first();
            await trigger.click();
            await expect(screen.getByRole('dialog')).toBeVisible();
            await screen.keyboard.press('Escape');
            await expect(trigger).toBeFocused();
          }
        }
        await context.close();
        process.stdout.write(
          `PASS production UI ${locale} ${width} ${theme}: seven routes, RTL/LTR, no overflow, Dialog dismissal/focus return\n`,
        );
      }
  }
  expect(errors).toEqual([]);
  await owner.close();
} finally {
  await browser?.close();
  ingress.close();
  next.kill();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (tenant) {
    const tenantId = tenant.id;
    for (const cleanup of [
      () => db.requestNotification.deleteMany({ where: { tenantId } }),
      () => db.guestSession.deleteMany({ where: { tenantId } }),
      () => db.guestActionToken.deleteMany({ where: { tenantId } }),
      () => db.requestStatusHistory.deleteMany({ where: { tenantId } }),
      () => db.serviceRequest.deleteMany({ where: { tenantId } }),
      () => db.agencyService.deleteMany({ where: { tenantId } }),
      () => db.emailDelivery.deleteMany({ where: { tenantId } }),
      () => db.outboxEvent.deleteMany({ where: { tenantId } }),
      () => db.auditEvent.deleteMany({ where: { tenantId } }),
      () => db.authSession.deleteMany({ where: { tenantId } }),
      () => db.emailToken.deleteMany({ where: { tenantId } }),
      () => db.staffAccount.deleteMany({ where: { tenantId } }),
      () => db.tenant.delete({ where: { id: tenantId } }),
    ])
      await cleanup();
  }
  if (templateId) await db.platformService.delete({ where: { id: templateId } });
  if (operatorId) {
    await db.authSession.deleteMany({ where: { principalId: operatorId } });
    await db.auditEvent.deleteMany({ where: { actorId: operatorId } });
    await db.platformOperator.delete({ where: { id: operatorId } });
  }
  await disconnectPrisma();
}
