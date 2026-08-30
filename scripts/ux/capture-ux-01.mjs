#!/usr/bin/env node
/**
 * SPABLA · UX-01 · Screenshot harness.
 *
 * Uses Playwright's Chromium (already vendored for the E2E suites)
 * to open each demonstrable state of the prototype at the
 * appropriate viewport and save a PNG to /tmp/spabla-ux-01/.
 *
 * Zero real permissions requested: the prototype never asks for
 * camera/microphone and Playwright's default Chromium honours that.
 */

import { chromium } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.UX01_BASE ?? "http://127.0.0.1:3141";
const OUT = process.env.UX01_OUT ?? "/tmp/spabla-ux-01";

const shots = [
  {
    name: "01-chat-text-desktop",
    url: `${BASE}/v2/design/chat?original=visible`,
    viewport: { width: 1440, height: 900 },
    fullPage: false,
  },
  {
    name: "02-voice-call-desktop",
    url: `${BASE}/v2/design/chat?call=voice`,
    viewport: { width: 1440, height: 900 },
    fullPage: false,
  },
  {
    name: "03-video-call-desktop",
    url: `${BASE}/v2/design/chat?call=video&subs=on`,
    viewport: { width: 1440, height: 900 },
    fullPage: false,
  },
  {
    name: "04-chat-text-mobile",
    url: `${BASE}/v2/design/chat?device=mobile&original=visible`,
    viewport: { width: 390, height: 844 },
    fullPage: false,
    isMobile: true,
    deviceScaleFactor: 2,
  },
  {
    name: "05-video-call-mobile",
    url: `${BASE}/v2/design/chat?device=mobile&call=video&subs=on`,
    viewport: { width: 390, height: 844 },
    fullPage: false,
    isMobile: true,
    deviceScaleFactor: 2,
  },
  {
    name: "06-translator-tablet",
    url: `${BASE}/v2/design/translator`,
    viewport: { width: 1194, height: 834 },
    fullPage: false,
  },
  {
    name: "07-translator-mobile",
    url: `${BASE}/v2/design/translator?device=mobile`,
    viewport: { width: 390, height: 844 },
    fullPage: false,
    isMobile: true,
    deviceScaleFactor: 2,
  },
  {
    name: "08-inbox-mobile",
    url: `${BASE}/v2/design/inbox`,
    viewport: { width: 390, height: 844 },
    fullPage: false,
    isMobile: true,
    deviceScaleFactor: 2,
  },
];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.deviceScaleFactor ?? 1,
      isMobile: shot.isMobile ?? false,
      hasTouch: shot.isMobile ?? false,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    const response = await page.goto(shot.url, { waitUntil: "networkidle" });
    if (!response || !response.ok()) {
      errors.push(`http ${response ? response.status() : "no-response"}`);
    }
    // Extra settle for fonts / async layout
    await page.waitForTimeout(400);
    const filePath = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: filePath, fullPage: shot.fullPage });
    await context.close();
    results.push({ name: shot.name, path: filePath, errors });
    console.log(`[ux01] ${shot.name} → ${filePath}${errors.length ? ` (issues: ${errors.length})` : ""}`);
    if (errors.length) {
      for (const e of errors) console.log(`  · ${e}`);
    }
  }
  await browser.close();
  const failed = results.filter((r) => r.errors.length > 0);
  if (failed.length > 0) {
    console.error(`[ux01] ${failed.length} screenshots reported console/page errors`);
    process.exit(1);
  }
  console.log(`[ux01] ${results.length} screenshots saved to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
