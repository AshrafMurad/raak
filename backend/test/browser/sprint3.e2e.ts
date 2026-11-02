// Sprint 3 synthetic browser harness (E03 + I10/I11 at the UI level).
// Starts only installed Next.js and Chrome; real Express/PostgreSQL, injected
// email capture; no external network, no real personal data.
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
import enCatalog from '../../../frontend/messages/en/catalog.json';
import arCatalog from '../../../frontend/messages/ar/catalog.json';
import enCommercial from '../../../frontend/messages/en/commercial.json';
import arCommercial from '../../../frontend/messages/ar/commercial.json';
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
const manual = process.argv.includes('--manual');
const suffix = randomUUID().slice(0, 8);
const slug = `browser-s3-${suffix}`;
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
let tenantId = '';
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
  return response;
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
/** Browser-side API call inside the guest cookie context (replay checks). */
async function guestFetch(
  page: Page,
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: { error?: { code?: string }; data?: { status?: string } } }> {
  const result = await page.evaluate(
    async ({ path, body, idempotencyKey }) => {
      const response = await fetch(`/v1${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { path, body, idempotencyKey },
  );
  return result as {
    status: number;
    body: { error?: { code?: string }; data?: { status?: string } };
  };
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
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic commercial browser agency',
        displayName: 'Synthetic commercial browser agency',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: `support-${suffix}@example.invalid`,
      },
    })
  ).id;
  browser = await chromium.launch({
    channel: 'chrome',
    headless: !manual && !process.argv.includes('--headed'),
  });
  const coordinatorEmail = `coordinator-${suffix}@example.invalid`;
  await db.staffAccount.create({
    data: {
      tenantId,
      role: 'CARE_COORDINATOR',
      emailNormalized: coordinatorEmail,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await db.agencyService.create({
    data: {
      tenantId,
      slug: 'quoted-care',
      isPublished: true,
      config: {
        nameAr: 'رعاية بعرض سعر',
        nameEn: 'Synthetic quoted care',
        summaryAr: 'ملخص تجريبي',
        summaryEn: 'Synthetic summary',
        descriptionAr: 'وصف تجريبي فقط',
        descriptionEn: 'Synthetic description only',
        durationMin: 90,
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
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      brandJson: {
        nameAr: 'وكالة تجريبية',
        nameEn: 'Synthetic commercial browser agency',
        descriptionAr: 'بوابة تجريبية',
        descriptionEn: 'Synthetic portal description',
        primaryColor: 'MIDNIGHT',
        areas: [{ id: 'central', nameAr: 'الوسطى', nameEn: 'Central' }],
      },
    },
  });
  for (const locale of ['ar', 'en'] as const) {
    const c = locale === 'ar' ? arCatalog : enCatalog;
    const m = locale === 'ar' ? arCommercial : enCommercial;
    const guest = await browser.newContext({
      viewport: { width: locale === 'ar' ? 390 : 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const g = await guest.newPage();
    g.on('pageerror', (e) => errors.push(e.message));
    await g.goto(`${base()}/${locale}/services/quoted-care`);
    await g.getByRole('link', { name: c.request, exact: true }).click();
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.locator('#requesterName').fill('Synthetic requester');
    await g.locator('#requesterEmail').fill(`guest-s3-${locale}-${suffix}@example.invalid`);
    await g.locator('#beneficiaryName').fill('Distinct synthetic beneficiary');
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.locator('#areaId').click();
    await g.keyboard.press('Home');
    await g.keyboard.press('Enter');
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    await g.locator('#preferredDate').fill(tomorrow);
    await g.getByRole('button', { name: c.next, exact: true }).click();
    await g.locator('#privacyAccepted').check();
    await responseAction(
      g,
      '/portal/requests',
      () => g.getByRole('button', { name: c.submit, exact: true }).click(),
      201,
    );
    const reference = await g.getByTestId('receipt-reference').innerText();
    const requestRow = await db.serviceRequest.findFirstOrThrow({
      where: { tenantId, reference },
    });
    const tokenRow = await db.guestActionToken.findFirstOrThrow({
      where: { tenantId, requestId: requestRow.id },
    });
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { tenantId, aggregateId: tokenRow.id, eventType: 'email.request_access' },
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
    const link = captured[0]!.text.match(/http:\/\/\S+/)![0];
    await g.goto(link);
    await g.getByRole('button', { name: c.verify, exact: true }).click();
    await expect(g.getByRole('heading', { name: c.verified, exact: true })).toBeVisible();
    await noOverflow(g);

    // Coordinator: review, then manage the request end to end in the workspace.
    const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const q = await staff.newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    q.on('dialog', (dialog) => void dialog.accept());
    await login(q, slug, coordinatorEmail, locale);
    await q.goto(`${base()}/${locale}/workspace/requests`);
    if (manual) {
      // Reuse the real intake + verification setup and isolated email capture
      // for local exploration. There is no application auth bypass or dev API.
      process.stdout.write(
        `MANUAL Sprint 3: synthetic request ${reference}\n` +
          `Customer window: ${base()}/${locale}/track\n` +
          `Coordinator window: ${base()}/${locale}/workspace/requests\n` +
          'Use the two open Chrome windows. Refresh after the other person acts.\n' +
          'Resume in Playwright Inspector when finished to remove these temporary fixtures.\n',
      );
      await q.pause();
      await staff.close();
      await guest.close();
      break;
    }
    const article = q.locator('article').filter({ hasText: reference });
    await article.getByRole('button', { name: c.detail, exact: true }).click();
    await responseAction(q, `/agency/requests/${requestRow.id}/start-review`, () =>
      q.getByRole('dialog').getByRole('button', { name: c.startReview, exact: true }).click(),
    );
    await q.getByRole('dialog').getByRole('link', { name: c.manageRequest, exact: true }).click();
    await expect(q.getByRole('heading', { level: 1 })).toContainText(reference);
    // Information requests must be visible to the requester, not just stored.
    const infoNote =
      locale === 'ar'
        ? 'يرجى تحديد الساعات الصباحية المناسبة.'
        : 'Please specify the preferred morning hours.';
    await q.locator('#info-note').fill(infoNote);
    await responseAction(q, `/agency/requests/${requestRow.id}/request-info`, () =>
      q.getByRole('button', { name: m.requestInfo, exact: true }).click(),
    );
    await g.goto(`${base()}/${locale}/track`);
    await expect(g.getByText(infoNote, { exact: true })).toBeVisible();
    await g
      .locator('#respond-note')
      .fill(locale === 'ar' ? 'من التاسعة إلى الحادية عشرة.' : 'Between nine and eleven.');
    await responseAction(g, `/portal/my/requests/${requestRow.id}/respond`, () =>
      g.getByRole('button', { name: m.respond, exact: true }).click(),
    );
    await q.reload();
    await q
      .locator('#item-desc-0')
      .fill(locale === 'ar' ? 'زيارات منزلية أسبوعية' : 'Weekly home visits');
    await q.locator('#item-price-0').fill('15000');
    await q.locator('#item-qty-0').fill('12');
    await q
      .locator('#terms')
      .fill(
        locale === 'ar'
          ? 'النطاق: زيارات أسبوعية لمدة شهر.'
          : 'Scope: weekly visits for one month. Excludes medical supplies.',
      );
    await responseAction(
      q,
      `/agency/requests/${requestRow.id}/quotes`,
      () => q.getByRole('button', { name: m.newDraft, exact: true }).click(),
      201,
    );
    await expect(q.getByRole('button', { name: m.sendQuote, exact: true })).toBeVisible();
    const draftRow = await db.quote.findFirstOrThrow({
      where: { tenantId, requestId: requestRow.id, status: 'DRAFT' },
      select: { id: true },
    });
    await responseAction(q, `/agency/quotes/${draftRow.id}/send`, () =>
      q.getByRole('button', { name: m.sendQuote, exact: true }).click(),
    );
    const quoteV1 = await db.quote.findFirstOrThrow({
      where: { tenantId, requestId: requestRow.id, version: 1 },
    });
    expect(quoteV1.status).toBe('SENT');

    // Verified customer sees the frozen offer and requests a revision.
    await g.goto(`${base()}/${locale}/track`);
    await expect(g.getByRole('heading', { name: m.quotes, exact: true })).toBeVisible();
    await expect(g.getByText(m.notPayment, { exact: true })).toBeVisible();
    await g.getByRole('button', { name: m.requestRevision, exact: true }).click();
    await g
      .locator('[id^="revision-"]')
      .fill(
        locale === 'ar'
          ? 'يرجى تقليل عدد الزيارات إلى ثماني زيارات.'
          : 'Please reduce the visit count to eight visits.',
      );
    await responseAction(
      g,
      `/portal/my/quotes/${quoteV1.id}/revision-requests`,
      () => g.getByRole('button', { name: m.requestRevision, exact: true }).last().click(),
      201,
    );
    await expect(g.getByText(m.revisionSent, { exact: true })).toBeVisible();
    await expect(g.getByRole('button', { name: m.accept, exact: true })).toBeDisabled();
    await g.reload();
    await expect(g.getByRole('button', { name: m.accept, exact: true })).toBeDisabled();
    await expect(g.getByText(m.revisionPending, { exact: true })).toBeVisible();
    const pendingAccept = await guestFetch(
      g,
      `/portal/my/quotes/${quoteV1.id}/accept`,
      { quoteVersion: 1 },
      randomUUID(),
    );
    expect(pendingAccept.status).toBe(409);
    expect(pendingAccept.body.error?.code).toBe('QUOTE_REVISION_PENDING');

    // Coordinator issues the replacement v2 from the pending revision.
    await q.reload();
    await expect(q.getByRole('heading', { name: m.revisions, exact: true })).toBeVisible();
    await q
      .locator('#item-desc-0')
      .fill(locale === 'ar' ? 'زيارات منزلية (معدلة)' : 'Home visits (revised)');
    await q.locator('#item-price-0').fill('15000');
    await q.locator('#item-qty-0').fill('8');
    await q
      .locator('#terms')
      .fill(
        locale === 'ar'
          ? 'النطاق المعدل: ثماني زيارات.'
          : 'Revised scope: eight visits plus assessment.',
      );
    await q.getByRole('button', { name: m.resolveWithReplacement, exact: true }).click();
    await responseAction(
      q,
      `/agency/quote-revisions/${await db.quoteRevisionRequest.findFirstOrThrow({ where: { tenantId, quoteGroupId: quoteV1.quoteGroupId } }).then((r) => r.id)}/resolve-with-replacement`,
      () => q.getByRole('button', { name: m.resolveWithReplacement, exact: true }).last().click(),
      201,
    );
    const quoteV2 = await db.quote.findFirstOrThrow({
      where: { tenantId, requestId: requestRow.id, version: 2 },
    });
    expect(quoteV2.status).toBe('SENT');
    expect((await db.quote.findUniqueOrThrow({ where: { id: quoteV1.id } })).status).toBe(
      'SUPERSEDED',
    );

    // I10 at the browser boundary: accepting superseded v1 is rejected.
    const stale = await guestFetch(
      g,
      `/portal/my/quotes/${quoteV1.id}/accept`,
      { quoteVersion: 1 },
      `stale-${locale}-${randomUUID()}`,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe('QUOTE_SUPERSEDED');

    // I11: acceptance is idempotent — one stored result, one outbox emission.
    const acceptKey = `browser-s3-${locale}-${randomUUID()}`;
    const [first, replay] = await Promise.all([
      guestFetch(g, `/portal/my/quotes/${quoteV2.id}/accept`, { quoteVersion: 2 }, acceptKey),
      guestFetch(g, `/portal/my/quotes/${quoteV2.id}/accept`, { quoteVersion: 2 }, acceptKey),
    ]);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(first.body.data?.status).toBe('ACCEPTED');
    expect(
      await db.outboxEvent.count({
        where: { tenantId, eventType: 'quote.responded', aggregateId: quoteV2.id },
      }),
    ).toBe(1);

    // Coordinator approves the accepted offer; guest sees the final status.
    await q.reload();
    await q.locator('#feasibility').check();
    await responseAction(q, `/agency/requests/${requestRow.id}/approve`, () =>
      q.getByRole('button', { name: m.approve, exact: true }).click(),
    );
    await expect(q.getByText(m.statusApproved, { exact: true }).first()).toBeVisible();
    await g.reload();
    await expect(g.getByText(m.statusAccepted, { exact: true }).first()).toBeVisible();
    await noOverflow(g);
    await noOverflow(q);
    process.stdout.write(
      `PASS E03 ${locale}: quote v1 → revision pending → replacement v2 → v1 accept denied (I10) → v2 idempotent accept (I11) → coordinator approval\n`,
    );
    await staff.close();
    await guest.close();
  }
  // Production route/theme/viewport matrix for the new commercial surfaces.
  const anyRequest = await db.serviceRequest.findFirstOrThrow({ where: { tenantId } });
  for (const locale of manual ? [] : (['ar', 'en'] as const)) {
    const c = locale === 'ar' ? arCatalog : enCatalog;
    for (const width of [390, 1440])
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        const screen = await context.newPage();
        screen.on('pageerror', (e) => errors.push(e.message));
        await login(screen, slug, coordinatorEmail, locale);
        await screen.goto(`${base()}/${locale}/workspace/requests/${anyRequest.id}`);
        await screen.waitForLoadState('networkidle');
        if (theme === 'dark')
          await screen.getByRole('button', { name: c.theme, exact: true }).click();
        await expect(screen.locator('.raak-portal')).toHaveAttribute('data-theme', theme);
        await expect(screen.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(screen.locator('main h1')).toBeVisible();
        await noOverflow(screen);
        await context.close();
        process.stdout.write(
          `PASS commercial workspace ${locale} ${width} ${theme}: request management RTL/LTR, no overflow\n`,
        );
      }
  }
  expect(errors).toEqual([]);
} finally {
  await browser?.close();
  ingress.close();
  next.kill();
  if (tenantId) {
    for (const cleanup of [
      () => db.idempotencyKey.deleteMany({ where: { tenantId } }),
      () => db.requestNotification.deleteMany({ where: { tenantId } }),
      () => db.quoteRevisionRequest.deleteMany({ where: { tenantId } }),
      () => db.quote.deleteMany({ where: { tenantId } }),
      () => db.guestSession.deleteMany({ where: { tenantId } }),
      () => db.guestActionToken.deleteMany({ where: { tenantId } }),
      () => db.requestStatusHistory.deleteMany({ where: { tenantId } }),
      () => db.serviceRequest.deleteMany({ where: { tenantId } }),
      () => db.agencyService.deleteMany({ where: { tenantId } }),
      () => db.emailDelivery.deleteMany({ where: { tenantId } }),
      () => db.outboxEvent.deleteMany({ where: { tenantId } }),
      () => db.auditEvent.deleteMany({ where: { tenantId } }),
      () => db.authSession.deleteMany({ where: { tenantId } }),
      () => db.staffAccount.deleteMany({ where: { tenantId } }),
      () => db.tenant.delete({ where: { id: tenantId } }),
    ])
      await cleanup();
  }
  await disconnectPrisma();
}
