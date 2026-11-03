import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Page } from '../../../frontend/node_modules/@playwright/test/index.js';
import en from '../../../frontend/messages/en/visits.json';
const { expect }: typeof import('../../../frontend/node_modules/@playwright/test/index.js') =
  createRequire(import.meta.url)('../../../frontend/node_modules/@playwright/test');

/** Network-controlled production-hook regression tests, using synthetic DTOs only. */
export async function checkVisitListRegressions(
  page: Page,
  base: string,
  locale: string,
  copy: typeof en,
  caregiverName: string,
) {
  const first = {
    id: randomUUID(),
    status: 'PLANNED',
    assignmentHealth: 'OK',
    scheduledStartUtc: '2026-12-01T06:00:00Z',
    scheduledEndUtc: '2026-12-01T07:00:00Z',
    timezoneSnapshot: 'Asia/Riyadh',
    version: 1,
    areaId: 'central',
    carePlanId: null,
    patient: { id: randomUUID(), displayName: 'Synthetic pagination A' },
    assignedCaregiver: null,
  };
  const second = {
    ...first,
    id: randomUUID(),
    patient: { id: randomUUID(), displayName: 'Synthetic pagination B' },
  };
  let assigned = false;
  let listRequests = 0;
  const listUrl = (url: URL) => url.pathname === '/v1/agency/visits';
  await page.route(listUrl, async (route) => {
    listRequests += 1;
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      json: {
        data: {
          items: params.has('cursor')
            ? [second]
            : [{ ...first, status: assigned ? 'SCHEDULED' : 'PLANNED' }],
          nextCursor: params.has('cursor') || assigned ? null : second.id,
          timezone: 'Asia/Riyadh',
          bufferMinutes: 30,
        },
      },
    });
  });
  const bulkPattern = '**/v1/agency/visits/bulk-assign';
  const detailPattern = `**/v1/agency/visits/${first.id}`;
  await page.route(detailPattern, (route) =>
    route.fulfill({
      json: {
        data: {
          ...first,
          reviewStatus: 'NONE',
          occurrenceKey: null,
          cancelledReason: null,
          cancelledAt: null,
          serviceNameSnapshot: { nameAr: 'خدمة اصطناعية', nameEn: 'Synthetic service' },
          carePlan: null,
          tasks: [],
          assignmentHistory: [],
        },
      },
    }),
  );
  await page.route(bulkPattern, async (route) => {
    assigned = true;
    await route.fulfill({
      json: {
        data: {
          results: [
            {
              visitId: first.id,
              ok: true,
              status: 'SCHEDULED',
              version: 2,
              assignedCaregiverId: randomUUID(),
            },
          ],
          summary: { succeeded: 1, failed: 0 },
        },
      },
    });
  });
  try {
    await page.goto(
      `${base}/${locale}/workspace/visits?status=PLANNED&from=2026-12-01&to=2026-12-31`,
    );
    await expect(page.getByText(first.patient.displayName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(page.getByText(first.patient.displayName, { exact: true })).toBeVisible();
    await expect(page.getByText(second.patient.displayName, { exact: true })).toBeVisible();
    const requestsBeforeDetail = listRequests;
    await page
      .locator('tbody tr')
      .filter({ hasText: first.patient.displayName })
      .getByRole('button', { name: copy.open, exact: true })
      .click();
    await expect(page.locator(`section[aria-label="${copy.visitDetail}"]`)).toBeVisible();
    await page.waitForTimeout(100);
    expect(listRequests, 'detail selection must not reset loaded pages').toBe(requestsBeforeDetail);
    await expect(page.getByText(second.patient.displayName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: copy.close, exact: true }).click();
    const queueRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return listUrl(url) && url.searchParams.get('assignmentHealth') === 'NEEDS_REASSIGNMENT';
    });
    await page.getByRole('button', { name: copy.showQueue, exact: true }).click();
    const query = new URL((await queueRequest).url()).searchParams;
    expect(query.get('status')).toBe('PLANNED');
    expect(query.get('from')).toBe('2026-12-01');
    expect(query.get('to')).toBe('2026-12-31');
    await page.reload();
    await expect(page.locator('#visit-from')).toHaveValue('2026-12-01');
    await expect(page.getByRole('button', { name: copy.showAll, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: copy.showQueue, exact: true })).toBeVisible();

    await page.goto(`${base}/${locale}/workspace/visits`);
    const checkbox = page.getByRole('checkbox', {
      name: `${copy.selectVisit}: ${first.patient.displayName}`,
      exact: true,
    });
    await checkbox.check();
    await page.locator('#bulk-caregiver').click();
    await page.getByRole('option', { name: caregiverName, exact: true }).click();
    await page.getByRole('button', { name: `${copy.assignSelected} (1)`, exact: true }).click();
    await expect(
      page.getByRole('button', { name: `${copy.assignSelected} (0)`, exact: true }),
    ).toBeDisabled();
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toBeDisabled();
  } finally {
    await page.unroute(listUrl);
    await page.unroute(bulkPattern);
    await page.unroute(detailPattern);
  }
}
