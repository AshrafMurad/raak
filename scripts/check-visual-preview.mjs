// Owner installs @playwright/test in frontend/. Uses installed Chrome, never downloads a browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const frontend = new URL("frontend/", root);
const require = createRequire(new URL("package.json", frontend));
const { chromium, expect } = require("@playwright/test");
const artifacts = new URL(process.env.RAAK_PREVIEW_ARTIFACTS ?? ".impeccable/review/", root);
await mkdir(artifacts, { recursive: true });
const port = 3107;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "-p",
    String(port),
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: fileURLToPath(frontend),
    stdio: "pipe",
    windowsHide: true,
  },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});
let browser;
const layoutFailures = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      ready = (await fetch(`${base}/en/design-preview`)).ok;
    } catch {
      /* server is starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, `Preview server did not become ready: ${serverOutput}`);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const locale of ["ar", "en"]) {
    const copy = require(`./messages/${locale}/design-preview.json`);
    for (const width of [1440, 390]) {
      for (const theme of ["light", "dark"]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: "reduce",
        });
        const errors = [];
        const apiRequests = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          if (new URL(request.url()).pathname.startsWith("/v1/"))
            apiRequests.push(request.url());
        });
        const path = `/${locale}/design-preview${theme === "dark" ? "?theme=dark" : ""}`;
        const html = await (await page.request.get(`${base}${path}`)).text();
        assert(
          html.includes(`data-theme="${theme}"`),
          "Requested theme is present before hydration",
        );
        await page.goto(`${base}${path}`, {
          waitUntil: "networkidle",
        });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(
          page.getByRole("heading", { name: copy.greeting }),
        ).toBeVisible();
        const preview = page.locator(".rv-root").first();
        await expect(preview).toHaveAttribute("data-theme", theme);
        const changeTheme = page.getByRole("button", {
          name: theme === "dark" ? copy.switchToLight : copy.switchToDark,
          exact: true,
        });
        await changeTheme.click();
        await expect(preview).toHaveAttribute(
          "data-theme",
          theme === "dark" ? "light" : "dark",
        );
        // The focused toggle works with the keyboard and retains an explicit accessible action name.
        await page.keyboard.press("Space");
        await expect(preview).toHaveAttribute("data-theme", theme);
        await page.reload({ waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await expect(preview).toHaveAttribute("data-theme", theme);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (overflow) {
          const layout = await page.evaluate(() => {
            return [
              ...document.querySelectorAll(
                "html, body, .rv-root, .rv-body, .rv-main, .rv-section, .rv-table-scroll, .rv-table, caption",
              ),
            ].map((node) => ({
              tag: node.tagName,
              className: node.className,
              client: node.clientWidth,
              scroll: node.scrollWidth,
              x: node.getBoundingClientRect().x,
              width: node.getBoundingClientRect().width,
              overflow: getComputedStyle(node).overflowX,
              position: getComputedStyle(node).position,
            }));
          });
          console.log("LAYOUT", layout);
          const offenders = await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((node) => {
                const box = node.getBoundingClientRect();
                return (
                  box.width > 0 &&
                  (box.left < -1 || box.right > innerWidth + 1) &&
                  !node.closest(".rv-table-scroll")
                );
              })
              .map((node) => ({
                element: node.tagName,
                className: node.className,
                width: node.getBoundingClientRect().width,
              }))
              .slice(0, 12),
          );
          console.log("OVERFLOW", locale, width, offenders);
          layoutFailures.push(`${locale} ${width}: workspace overflow`);
        }
        const stem = `${locale}-${width}-${theme}`;
        if (theme === "dark") {
          const surfaces = await page.evaluate(() =>
            [".rv-root", ".rv-sidebar", ".rv-exceptions"].map(
              (selector) =>
                getComputedStyle(document.querySelector(selector))
                  .backgroundColor,
            ),
          );
          assert.equal(
            new Set(surfaces).size,
            3,
            "Canvas, sidebar and panel have distinct dark surfaces",
          );
        }
        if (!process.env.PREVIEW_DIAGNOSTICS)
          await page.screenshot({
            path: fileURLToPath(new URL(`${stem}-workspace.png`, artifacts)),
            fullPage: true,
            animations: "disabled",
          });

        // Queue category, search and state filters work together; late is not a visit state.
        await page
          .locator(".rv-filters button")
          .filter({ hasText: copy.late })
          .click();
        await expect(page.locator(".rv-exception")).toHaveCount(1);
        const inspect = page.locator(".rv-exception button");
        await inspect.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveAttribute(
          "data-theme",
          theme,
        );
        await expect(page.getByRole("dialog")).toHaveCSS("color-scheme", theme);
        await expect
          .poll(async () => {
            const box = await page.getByRole("dialog").boundingBox();
            return box ? Math.abs(box.y + box.height / 2 - 500) : Infinity;
          })
          .toBeLessThanOrEqual(1);
        const dialogBox = await page.getByRole("dialog").boundingBox();
        assert(dialogBox, "Dialog has visible geometry");
        assert(
          Math.abs(dialogBox.x + dialogBox.width / 2 - width / 2) <= 1,
          "Dialog is horizontally centered",
        );
        assert(
          Math.abs(dialogBox.y + dialogBox.height / 2 - 500) <= 1,
          `Dialog is vertically centered: ${JSON.stringify(dialogBox)}`,
        );
        assert.equal(
          await page
            .locator(".rv-detail-list")
            .evaluate(
              (node) =>
                getComputedStyle(node).gridTemplateColumns.split(" ").length,
            ),
          width > 620 ? 2 : 1,
          "Overview columns adapt to the viewport",
        );
        for (let step = 0; step < 5; step++) {
          await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(() =>
              Boolean(document.activeElement?.closest('[role="dialog"]')),
            ),
            true,
            "Focus stays inside the centered Dialog",
          );
        }
        await expect(
          page
            .getByRole("dialog")
            .getByText(copy.statusesMap.SCHEDULED, { exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(inspect).toBeFocused();
        await page
          .getByRole("searchbox", { name: copy.search })
          .fill("VIS-1042");
        await expect(page.locator(".rv-table tbody tr")).toHaveCount(1);
        const stateSelect = page.getByRole("combobox", { name: copy.filter });
        await stateSelect.click();
        await expect(page.getByRole("listbox")).toHaveAttribute(
          "data-theme",
          theme,
        );
        await expect(page.getByRole("listbox")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.getByRole("listbox")).toHaveCSS(
          "color-scheme",
          theme,
        );
        if (!process.env.PREVIEW_DIAGNOSTICS && width === 1440)
          await page.screenshot({
            path: fileURLToPath(new URL(`${stem}-select.png`, artifacts)),
            fullPage: false,
            animations: "disabled",
          });
        await page
          .getByRole("option", {
            name: copy.statusesMap.SCHEDULED,
            exact: true,
          })
          .click();
        await expect(stateSelect).toContainText(copy.statusesMap.SCHEDULED);
        await stateSelect.click();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Escape");
        await expect(stateSelect).toBeFocused();
        await expect(stateSelect).toContainText(copy.statusesMap.SCHEDULED);
        await expect(page.locator(".rv-table tbody tr")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: copy.emptyTitle }),
        ).toBeVisible();
        await page.getByRole("button", { name: copy.reset }).click();
        await expect(page.locator(".rv-table tbody tr")).toHaveCount(6);
        const badgeWidths = await page
          .locator(".rv-table .rv-status")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().width),
          );
        assert(
          badgeWidths.every(
            (value) => value >= 116 && Math.abs(value - badgeWidths[0]) < 1,
          ),
          "Table badges share a minimum width and alignment",
        );
        await expect(page.locator(".rv-table td").first()).toHaveCSS(
          "padding-block-start",
          "13px",
        );

        // Inspecting a planned fixture never claims confirmation or triggers a mutation.
        const row = page
          .locator(".rv-table tbody tr")
          .filter({ hasText: "VIS-1042" });
        await row.getByRole("button").first().click();
        await expect(
          page
            .getByRole("dialog")
            .getByText(copy.statusesMap.PLANNED, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("dialog").getByText(copy.planNote),
        ).toBeVisible();
        if (
          !process.env.PREVIEW_DIAGNOSTICS &&
          (theme === "dark" || width === 1440)
        )
          await page.screenshot({
            path: fileURLToPath(new URL(`${stem}-detail.png`, artifacts)),
            fullPage: false,
            animations: "disabled",
          });
        // Header and close action remain visible while the body scrolls on a short screen.
        await page.setViewportSize({ width, height: 480 });
        const shortBox = await page.getByRole("dialog").boundingBox();
        assert(
          shortBox && shortBox.y >= 15 && shortBox.y + shortBox.height <= 465,
          "Dialog stays bounded on short viewports",
        );
        const bodyScrolls = await page
          .locator(".rv-dialog-body")
          .evaluate((node) => node.scrollHeight > node.clientHeight);
        assert(bodyScrolls, "Only the dialog body scrolls on short viewports");
        await expect(
          page.getByRole("button", { name: copy.close, exact: true }),
        ).toBeInViewport();
        await expect(
          page.getByRole("button", { name: copy.understood, exact: true }),
        ).toBeInViewport();
        await page.setViewportSize({ width, height: 1000 });
        await page
          .getByRole("button", { name: copy.close, exact: true })
          .click();

        await page
          .locator(".rv-view-switch")
          .getByRole("button", { name: copy.system, exact: true })
          .click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(
          page.getByRole("heading", { name: copy.boardTitle }),
        ).toBeVisible();
        await expect(
          page.getByRole("textbox", { name: copy.emailLabel }),
        ).toHaveAttribute("aria-invalid", "true");
        const serviceSelect = page.getByRole("combobox", {
          name: copy.selectLabel,
          exact: true,
        });
        await serviceSelect.focus();
        await page.keyboard.press("Space");
        await expect(page.getByRole("listbox")).toBeVisible();
        await expect(page.getByRole("option").first()).toBeFocused();
        await expect(
          page.getByRole("listbox").getByRole("searchbox"),
        ).toHaveCount(0);
        // Playwright inserts non-ASCII text without keydown events; Radix typeahead
        // listens to keydown. Test English typeahead and Arabic arrow-key selection.
        await page.keyboard.press(locale === "en" ? "d" : "ArrowDown");
        await expect(
          page.getByRole("option", {
            name: copy.services.support,
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(serviceSelect).toContainText(copy.services.support);
        await expect(serviceSelect).toBeFocused();
        await expect(
          page.getByRole("combobox", { name: copy.disabledSelectLabel }),
        ).toBeDisabled();
        await expect(
          page.getByRole("textbox", { name: copy.disabledField }),
        ).toBeDisabled();
        await expect(page.locator("select:visible")).toHaveCount(0);
        const selectionExample = page.getByRole("group", {
          name: copy.examples.selection,
        });
        const exampleVisits = selectionExample.getByRole("button", {
          name: copy.visits,
          exact: true,
        });
        await exampleVisits.focus();
        await page.keyboard.press("Space");
        await expect(exampleVisits).toHaveAttribute("aria-pressed", "true");
        await expect(
          selectionExample.getByRole("button", {
            name: copy.overview,
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "false");
        const exampleRow = page.locator(".rv-example-table tbody tr").first();
        const rowCheckbox = exampleRow.getByRole("checkbox");
        await rowCheckbox.focus();
        await page.keyboard.press("Space");
        await expect(rowCheckbox).toBeChecked();
        await expect(exampleRow).toContainText(copy.examples.selected);
        // Theme switching does not reset board state or input drafts.
        await page
          .getByRole("textbox", { name: copy.nameLabel })
          .fill("Synthetic draft");
        await page
          .getByRole("button", {
            name: theme === "dark" ? copy.switchToLight : copy.switchToDark,
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: theme === "dark" ? copy.switchToDark : copy.switchToLight,
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("textbox", { name: copy.nameLabel }),
        ).toHaveValue("Synthetic draft");
        await expect(serviceSelect).toContainText(copy.services.support);
        await expect(rowCheckbox).toBeChecked();
        await expect(exampleVisits).toHaveAttribute("aria-pressed", "true");
        await page.getByRole("textbox", { name: copy.nameLabel }).fill("");
        // Filling the specimen scrolls it into view. Reset before full-page capture so
        // sticky/fixed chrome is measured at the document top rather than the field.
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        const contrastFailures = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context)
            throw new Error("Contrast sampling canvas is unavailable");
          const rgba = (color) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const luminance = (color) =>
            color
              .slice(0, 3)
              .map((value) => {
                const channel = value / 255;
                return channel <= 0.04045
                  ? channel / 12.92
                  : ((channel + 0.055) / 1.055) ** 2.4;
              })
              .reduce(
                (sum, value, index) =>
                  sum + value * [0.2126, 0.7152, 0.0722][index],
                0,
              );
          return [
            ...document.querySelectorAll(
              ".rv-status, .rv-button, .rv-select-trigger, .rv-field-error, .rv-field > p, .rv-section-heading p, .rv-board-label p, .rv-cell-meta, .rv-example-hint, .rv-surface-example p, .rv-surface-example bdi, .rv-selection-example button, .rv-nav > button, .rv-nav > a, .rv-type-arabic, .rv-muted",
            ),
          ].flatMap((node) => {
            if (!node.textContent.trim()) return [];
            let backgroundNode = node;
            let background;
            while (backgroundNode) {
              const candidate = rgba(
                getComputedStyle(backgroundNode).backgroundColor,
              );
              if (candidate[3] === 255) {
                background = candidate;
                break;
              }
              backgroundNode = backgroundNode.parentElement;
            }
            if (!background)
              return [
                {
                  className: node.className,
                  issue: "No opaque background found",
                },
              ];
            const foreground = rgba(getComputedStyle(node).color);
            const a = luminance(foreground),
              b = luminance(background);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            return ratio >= 4.5 ? [] : [{ className: node.className, ratio }];
          });
        });
        assert.deepEqual(
          contrastFailures,
          [],
          `${stem}: sampled control/status/help text, including disabled/loading specimens, must reach 4.5:1`,
        );
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          layoutFailures.push(`${stem}: board overflow`);
        if (
          !process.env.PREVIEW_DIAGNOSTICS &&
          (theme === "dark" || width === 1440)
        )
          await page.screenshot({
            path: fileURLToPath(new URL(`${stem}-board.png`, artifacts)),
            fullPage: true,
            animations: "disabled",
          });
        await page
          .getByRole("textbox", { name: copy.emailLabel })
          .fill("care@example.test");
        await expect(
          page.getByRole("textbox", { name: copy.emailLabel }),
        ).toHaveAttribute("aria-invalid", "false");
        await page.getByRole("switch").uncheck();
        await expect(page.getByRole("switch")).not.toBeChecked();
        await page
          .getByRole("button", { name: copy.retry, exact: true })
          .click();
        await expect(page.getByText(copy.retried)).toBeVisible();
        await expect(
          page.getByRole("button", { name: copy.disabledAction, exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole("button", { name: copy.disabledAction, exact: true }),
        ).toHaveCSS("opacity", "1");
        await expect(
          page.getByRole("button", { name: copy.loadingAction, exact: true }),
        ).toHaveCSS("cursor", "progress");
        await expect(
          page.getByRole("button", { name: copy.loadingAction, exact: true }),
        ).toHaveAttribute("aria-busy", "true");
        if (width === 390) {
          await page.locator(".rv-mobile-nav summary").click();
          await page
            .locator(".rv-mobile-nav")
            .getByRole("button", { name: copy.overview, exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: copy.greeting }),
          ).toBeVisible();
          await expect(page.locator(".rv-mobile-nav")).not.toHaveAttribute(
            "open",
            "",
          );
        }
        await page
          .getByRole("link", { name: copy.language, exact: true })
          .click();
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          locale === "ar" ? "en" : "ar",
        );
        await expect(preview).toHaveAttribute("data-theme", theme);
        assert.deepEqual(
          apiRequests,
          [],
          `${stem}: synthetic preview must not call the API`,
        );
        assert.deepEqual(errors, [], `${stem}: browser errors`);
        console.log(
          `CHECKED ${stem}: centered/bounded Dialog, themed Select/typeahead, badge alignment, readable states, filters, theme/locale, no API/errors`,
        );
        await page.close();
      }
    }
  }
  console.log(`Screenshots: ${fileURLToPath(artifacts)}`);
  assert.deepEqual(
    layoutFailures,
    [],
    "Layout defects captured in the batched inspection",
  );
  console.log(
    "PASS all eight locale/viewport/theme combinations, including theme persistence, hydration, portal and overflow checks.",
  );
} finally {
  await browser?.close();
  server.kill();
}
