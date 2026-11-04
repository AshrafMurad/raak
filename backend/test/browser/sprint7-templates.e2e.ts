// Synthetic records and capture mail only; no external provider or storage calls.
import '../../src/env-load';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, expect }: typeof import('../../../frontend/node_modules/@playwright/test/index.js') = createRequire(import.meta.url)('../../../frontend/node_modules/@playwright/test');
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';
import { hashToken } from '../../src/modules/auth/crypto';
import { replaceVisitReminders } from '../../src/modules/notifications/reminders';
import { dispatchNotificationEvent } from '../../src/modules/notifications/dispatcher';
import { deliverNotificationEmail } from '../../src/modules/notifications/delivery';
import { renderNotification, tenantNotificationUrl } from '../../src/modules/notifications/templates';

const db = getPrisma();
const slug = `template-browser-${randomUUID().slice(0, 8)}`;
const base = `http://${slug}.localhost:3152`;
let clock = new Date();
const now = () => clock;
const app = buildApp({ env: loadApiEnv({ BASE_DOMAIN: 'localhost' }), db, now,
  logger: createLogger({ service: 'browser-test', write: () => {} }), health: { checkDatabase: async () => true } });
const next = spawn(process.execPath, [fileURLToPath(new URL('../../../frontend/node_modules/next/dist/bin/next', import.meta.url)), 'start', '-p', '3153', '-H', '127.0.0.1'],
  { cwd: fileURLToPath(new URL('../../../frontend/', import.meta.url)), stdio: 'ignore', windowsHide: true });
const ingress = http.createServer((req, res) => {
  if (req.url?.startsWith('/v1/')) { app(req, res); return; }
  const proxy = http.request({ hostname: '127.0.0.1', port: 3153, path: req.url, method: req.method, headers: req.headers }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
  });
  proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(proxy);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let tenantId = '';
try {
  await new Promise<void>((resolve) => ingress.listen(3152, '0.0.0.0', resolve));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://127.0.0.1:3153/en/login')).ok) { ready = true; break; } } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Run frontend npm run build:browser before this suite');
  tenantId = (await db.tenant.create({ data: { slug, legalName: 'Synthetic', displayName: 'Synthetic agency', status: 'ACTIVE',
    timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 'synthetic@example.invalid' } })).id;
  const owner = await db.staffAccount.create({ data: { tenantId, emailNormalized: 'owner@example.invalid', passwordHash: 'unused', role: 'AGENCY_OWNER', status: 'ACTIVE', emailVerifiedAt: now() } });
  const customer = await db.customerAccount.create({ data: { tenantId, emailNormalized: 'customer@example.invalid', passwordHash: 'unused', status: 'ACTIVE', emailVerifiedAt: now() } });
  const patient = await db.patient.create({ data: { tenantId, displayName: 'Private synthetic beneficiary', normalizedName: 'synthetic', areaId: 'central' } });
  const service = await db.agencyService.create({ data: { tenantId, slug: 'synthetic', config: {} } });
  const grant = await db.patientAccess.create({ data: { tenantId, patientId: patient.id, customerAccountId: customer.id, scopes: ['VIEW_VISITS'],
    authorizationType: 'AGENCY_VERIFIED_AUTHORITY', verifiedByStaffId: owner.id, verifiedAt: now() } });
  const visit = await db.visit.create({ data: { tenantId, patientId: patient.id, agencyServiceId: service.id, areaId: 'central', status: 'SCHEDULED',
    timezoneSnapshot: 'Asia/Riyadh', serviceNameSnapshot: { nameAr: 'زيارة اصطناعية', nameEn: 'Synthetic visit' },
    scheduledStartUtc: new Date(clock.getTime() + 3 * 3600000), scheduledEndUtc: new Date(clock.getTime() + 4 * 3600000) } });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const locale of ['ar', 'en'] as const) {
    clock = new Date();
    await db.customerAccount.update({ where: { id: customer.id }, data: { notificationLocale: locale } });
    await db.visit.update({ where: { id: visit.id }, data: { scheduledStartUtc: new Date(clock.getTime() + 3 * 3600000), scheduledEndUtc: new Date(clock.getTime() + 4 * 3600000) } });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
      await replaceVisitReminders(tx, tenantId, visit.id, now());
    });
    const reminder = await db.visitReminder.findFirstOrThrow({ where: { tenantId, channel: 'EMAIL', revision: (await db.visit.findUniqueOrThrow({ where: { id: visit.id } })).reminderRevision } });
    clock = reminder.dueAt;
    await dispatchNotificationEvent(db, reminder.id, now);
    const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: reminder.id, recipientPrincipalId: customer.id } });
    let url = '';
    let sends = 0;
    await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now,
      render: (type, context) => {
        if (!context) throw new Error('Missing template context');
        expect(context.locale).toBe(locale);
        url = tenantNotificationUrl({ baseDomain: 'localhost', slug: context.slug, locale: context.locale, path: context.path, production: false, port: 3152 });
        return renderNotification(type, { ...context, url });
      }, send: async (email) => { sends++; expect(email.text).not.toContain(patient.displayName); expect(email.text).toContain(url); } });
    expect(sends).toBe(1);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const session = await createSession(db, { tenantId, principalId: customer.id, principalType: 'AGENCY_CUSTOMER', sessionVersion: 0, ttlSeconds: 7200 });
    await context.addCookies([{ name: 'raak_session_agency', value: session.sessionToken, url: base }, { name: 'raak_csrf_agency', value: session.csrfToken, url: base }]);
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.getByText(patient.displayName, { exact: true }).first()).toBeVisible();
    expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(true);
    const anonymous = await browser.newContext();
    const anonPage = await anonymous.newPage();
    await anonPage.goto(`${base}/${locale}/account`);
    expect(await anonPage.evaluate(async (id) => (await fetch(`/v1/portal/my/visits/${id}`)).status, visit.id)).toBe(401);
    await anonymous.close();
    console.log(`PASS capture reminder → authenticated tenant CTA ${locale} 360px`);
    await context.close();
  }
  await db.patientAccess.update({ where: { id: grant.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
  // A guest session for A must never make B's actual email CTA display A.
  clock = new Date();
  for (const locale of ['ar', 'en'] as const) {
    const requests = [];
    for (const name of ['A', 'B']) {
      const row = await db.serviceRequest.create({ data: { tenantId, agencyServiceId: service.id,
        reference: `SYNTHETIC-${locale}-${name}-${randomUUID()}`, idempotencyKey: randomUUID(), payloadHash: 'synthetic',
        requesterName: 'Synthetic', requesterEmailNormalized: 'guest@example.invalid', requesterPhone: '', beneficiaryName: 'Private synthetic',
        relationship: 'OTHER', areaId: 'central', preferredWindowJson: {}, notesRestricted: '', locale,
        privacyVersion: 'synthetic', serviceSnapshot: { nameAr: 'خدمة اصطناعية', nameEn: 'Synthetic service' }, priceAcknowledged: false, status: 'AWAITING_CUSTOMER' } });
      await db.guestActionToken.create({ data: { tenantId, requestId: row.id, tokenHash: randomUUID(), emailHash: hashToken(row.requesterEmailNormalized),
        expiresAt: new Date(clock.getTime() + 900000), consumedAt: now() } });
      requests.push(row);
    }
    const [a, b] = requests;
    const secretA = randomUUID();
    await db.guestSession.create({ data: { tenantId, requestId: a!.id, secretHash: hashToken(secretA), expiresAt: new Date(clock.getTime() + 1800000) } });
    const event = await db.outboxEvent.create({ data: { tenantId, eventType: 'request.info_needed', aggregateId: b!.id, payloadMinimal: {}, createdAt: now() } });
    await dispatchNotificationEvent(db, event.id, now);
    const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId, eventId: event.id } });
    let url = '';
    await deliverNotificationEmail({ db, tenantId, deliveryId: delivery.id, now,
      render: (type, context) => {
        if (!context) throw new Error('Missing template context');
        url = tenantNotificationUrl({ baseDomain: 'localhost', slug: context.slug, locale: context.locale, path: context.path, production: false, port: 3152 });
        return renderNotification(type, { ...context, url });
      }, send: async () => {} });
    const context = await browser.newContext();
    await context.addCookies([{ name: 'raak_guest', value: secretA, url: base }]);
    const page = await context.newPage();
    await page.goto(url);
    expect(new URL(url).searchParams.get('request')).toBe(b!.id);
    await expect(page.getByText(a!.reference, { exact: true })).toHaveCount(0);
    await expect(page.getByText(b!.reference, { exact: true })).toHaveCount(0);
    const secretB = randomUUID() + randomUUID();
    await db.guestActionToken.create({ data: { tenantId, requestId: b!.id, tokenHash: hashToken(secretB), emailHash: hashToken(b!.requesterEmailNormalized), expiresAt: new Date(clock.getTime() + 900000) } });
    expect(await page.evaluate(async (token) => (await fetch('/v1/portal/requests/access-link/consume', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).status, secretB)).toBe(200);
    await page.reload();
    await expect(page.getByText(b!.reference, { exact: true })).toBeVisible();
    await expect(page.getByText(a!.reference, { exact: true })).toHaveCount(0);
    console.log(`PASS request B email CTA denies guest session A until B verification ${locale}`);
    await context.close();
  }
} finally {
  await browser?.close(); next.kill();
  await new Promise<void>((resolve) => ingress.close(() => resolve()));
  if (tenantId) {
    await db.notificationDelivery.deleteMany({ where: { tenantId } });
    await db.notification.deleteMany({ where: { tenantId } });
    await db.visitReminder.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
  }
  await disconnectPrisma();
}
