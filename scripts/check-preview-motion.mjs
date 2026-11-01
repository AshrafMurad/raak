// Preview-only motion checks; uses installed Chrome and existing Playwright.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const frontend = new URL("../frontend/", import.meta.url);
const require = createRequire(new URL("package.json", frontend));
const { chromium, expect } = require("@playwright/test");
const base = "http://127.0.0.1:3108";
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "-p",
    "3108",
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: fileURLToPath(frontend),
    stdio: "pipe",
    windowsHide: true,
  },
);
let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk;
});
server.stderr.on("data", (chunk) => {
  output += chunk;
});
let browser;
const settle = async (page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
};
// Capture inside the browser's first frame, not after a cross-process round trip.
const pressAndFreeze = async (page, key, selector) => {
  await page.evaluate((selector) => {
    window.previewMotionFrame = new Promise((resolve) => {
      document.addEventListener(
        "keyup",
        () =>
          requestAnimationFrame(() => {
            const animations =
              document.querySelector(selector)?.getAnimations() ?? [];
            animations.forEach((animation) => animation.pause());
            resolve(
              animations.map((animation) => ({
                name: animation.animationName,
                duration: animation.effect.getTiming().duration,
              })),
            );
          }),
        { once: true },
      );
    });
  }, selector);
  await page.keyboard.press(key);
  return page.evaluate(() => window.previewMotionFrame);
};

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      ready = (await fetch(`${base}/en/design-preview`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, output);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const locale of ["ar", "en"]) {
    const copy = require(`./messages/${locale}/design-preview.json`);
    for (const width of [1440, 390]) {
      for (const theme of ["light", "dark"]) {
        for (const reducedMotion of ["no-preference", "reduce"]) {
          const page = await browser.newPage({
            viewport: { width, height: 1000 },
            reducedMotion,
          });
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(
            `${base}/${locale}/design-preview${theme === "dark" ? "?theme=dark" : ""}`,
            { waitUntil: "networkidle" },
          );
          await page.evaluate(() => document.fonts.ready);
          const moving = reducedMotion === "no-preference";
          const toggle = page.locator(".rv-theme-toggle");
          const originalBox = await toggle.boundingBox();
          const originalColor = await page
            .locator(".rv-header")
            .evaluate((node) => getComputedStyle(node).backgroundColor);
          await toggle.focus();
          const themeAnimations = await pressAndFreeze(
            page,
            "Space",
            ".rv-header",
          );
          assert.equal(
            themeAnimations.some((animation) => animation.duration === 180),
            moving,
            "Theme interpolates only with motion enabled",
          );
          await page
            .locator(".rv-header")
            .evaluate((node) =>
              node.getAnimations().forEach((animation) => animation.play()),
            );
          await settle(page);
          assert.notEqual(
            await page
              .locator(".rv-header")
              .evaluate((node) => getComputedStyle(node).backgroundColor),
            originalColor,
          );
          assert.deepEqual(
            await toggle.boundingBox(),
            originalBox,
            "Theme label changes do not shift the control",
          );
          await page.keyboard.press("Space");
          await settle(page);

          // Press feedback must not move surrounding layout or animate disabled controls.
          await toggle.hover();
          await page.mouse.down();
          assert.equal(
            await toggle.evaluate(
              (node) => getComputedStyle(node).scale !== "none",
            ),
            moving,
          );
          await page.mouse.up();
          await settle(page);
          await page.keyboard.press("Space");
          await settle(page);

          const category = page
            .locator(".rv-filters button")
            .filter({ hasText: copy.late });
          await category.focus();
          const filterFeedback = await pressAndFreeze(
            page,
            "Space",
            ".rv-exceptions",
          );
          assert.equal(
            filterFeedback.some((animation) => animation.duration === 140),
            moving,
          );
          await page
            .locator(".rv-exceptions")
            .evaluate((node) =>
              node.getAnimations().forEach((animation) => animation.play()),
            );
          await expect(category).toBeFocused();
          await expect(page.locator(".rv-exception")).toHaveCount(1);
          await settle(page);
          const inspect = page.locator(".rv-exception button");
          await inspect.focus();
          const dialog = page.locator(".rv-dialog");
          const entrance = await pressAndFreeze(page, "Enter", ".rv-dialog");
          assert.equal(
            entrance.some((animation) => animation.name === "rv-dialog-in"),
            moving,
          );
          await dialog.evaluate((node) =>
            node.getAnimations().forEach((animation) => animation.play()),
          );
          await settle(page);
          const detailText = await dialog.innerText();
          for (const key of ["Tab", "Shift+Tab"]) {
            await page.keyboard.press(key);
            assert(
              await page.evaluate(() =>
                Boolean(document.activeElement?.closest(".rv-dialog")),
              ),
            );
          }
          // Freeze the first exit frame to inspect actual retained content and paired backdrop.
          const exit = await page.evaluate(() => {
            document.querySelector(".rv-dialog button").click();
            return new Promise((resolve) =>
              requestAnimationFrame(() => {
                const dialog = document.querySelector(".rv-dialog");
                const overlay = document.querySelector(".rv-overlay");
                const animations = [dialog, overlay].flatMap(
                  (node) => node?.getAnimations() ?? [],
                );
                animations.forEach((animation) => animation.pause());
                resolve({
                  text: dialog?.innerText,
                  names: animations.map((animation) => animation.animationName),
                });
              }),
            );
          });
          if (moving) {
            assert.equal(
              exit.text,
              detailText,
              "Closing keeps the inspected record intact",
            );
            assert(exit.names.includes("rv-dialog-out"));
            assert(exit.names.includes("rv-overlay-out"));
          }
          await page.evaluate(() =>
            document.getAnimations().forEach((animation) => animation.play()),
          );
          await expect(dialog).toHaveCount(0);
          await expect(inspect).toBeFocused();
          // Repeated open/dismiss remains responsive and returns focus.
          await page.keyboard.press("Enter");
          await expect(dialog).toHaveAttribute("data-state", "open");
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(inspect).toBeFocused();

          const select = page.getByRole("combobox", { name: copy.filter });
          await select.focus();
          const listbox = page.getByRole("listbox");
          const selectEntrance = await pressAndFreeze(
            page,
            "Space",
            ".rv-select-content",
          );
          assert.equal(
            selectEntrance.some(
              (animation) => animation.name === "rv-select-in",
            ),
            moving,
          );
          await listbox.evaluate((node) =>
            node.getAnimations().forEach((animation) => animation.play()),
          );
          await settle(page);
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("Enter");
          await expect(listbox).toHaveCount(0);
          await expect(select).toBeFocused();
          await select.press("Space");
          await page.keyboard.press("Escape");
          await expect(listbox).toHaveCount(0);
          await expect(select).toBeFocused();

          const system = page.locator(".rv-view-switch button").last();
          await system.focus();
          const viewFeedback = await pressAndFreeze(
            page,
            "Space",
            ".rv-view-content",
          );
          assert.equal(
            viewFeedback.some((animation) => animation.duration === 140),
            moving,
          );
          if (moving) {
            await page.emulateMedia({ reducedMotion: "reduce" });
            await expect
              .poll(() =>
                page
                  .locator(".rv-view-content")
                  .evaluate((node) => node.getAnimations().length),
              )
              .toBe(0);
            await page.emulateMedia({ reducedMotion });
          }
          await expect(system).toBeFocused();
          await expect(system).toHaveAttribute("aria-pressed", "true");
          await expect(
            page.getByRole("heading", { name: copy.boardTitle }),
          ).toBeVisible();
          await settle(page);
          const checkbox = page.getByRole("switch");
          await checkbox.focus();
          await page.keyboard.press("Space");
          await settle(page);
          await expect(checkbox).not.toBeChecked();
          await page.keyboard.press("Space");
          await settle(page);
          const thumb = await checkbox.evaluate(
            (node) => getComputedStyle(node, "::after").translate,
          );
          assert.equal(
            thumb,
            locale === "ar" ? "-14px" : "14px",
            "Switch movement follows reading direction",
          );
          await expect(checkbox).toBeFocused();
          if (width === 390) {
            await page.locator(".rv-mobile-nav summary").focus();
            await page.keyboard.press("Enter");
            const overview = page.locator(".rv-mobile-nav button").first();
            await overview.focus();
            await page.keyboard.press("Enter");
            await expect(page.locator(".rv-mobile-nav summary")).toBeFocused();
          }
          await settle(page);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          if (!moving) {
            assert.equal(
              await page.evaluate(() => document.getAnimations().length),
              0,
              "Reduced motion disables CSS and scripted animations, including portals",
            );
          }
          assert.deepEqual(errors, []);
          console.log(
            `PASS motion ${locale} ${width} ${theme} ${reducedMotion}: theme geometry, press, filters, dialog enter/exit/content/focus, select, view, RTL switch, reduced motion`,
          );
          await page.close();
        }
      }
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
