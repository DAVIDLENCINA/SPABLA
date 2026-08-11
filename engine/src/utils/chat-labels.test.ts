/**
 * SPABLA V2 — Fase 9 · Hito 9.1.1 · Chat label regression.
 *
 * The visible labels of `/v2/chat` are load-bearing UX: the D1/UX
 * fixes hinge on a specific wording. Rather than pull in a React
 * testing framework just for a text assertion (the plan forbids new
 * dependencies), we treat `app/v2/chat/page.tsx` as an artifact and
 * assert that the current human-facing strings are present / absent.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// engine/src/utils/  →  repo root  →  app/v2/chat/page.tsx
const CHAT_PAGE = resolve(HERE, "../../..", "app/v2/chat/page.tsx");

function readChatPage(): string {
  if (!existsSync(CHAT_PAGE)) {
    throw new Error(`chat page not found at ${CHAT_PAGE}`);
  }
  return readFileSync(CHAT_PAGE, "utf8");
}

describe("Visible labels on /v2/chat", () => {
  test("the new label 'Leer mensajes en' is present", () => {
    const src = readChatPage();
    expect(src).toContain("Leer mensajes en");
  });

  test("the deprecated label 'Ver traducciones en' has been removed", () => {
    const src = readChatPage();
    expect(src).not.toContain("Ver traducciones en");
  });

  test("the write-side label 'Yo escribo en' is preserved (unchanged)", () => {
    const src = readChatPage();
    expect(src).toContain("Yo escribo en");
  });

  test("session-expiry sentinel is imported and rendered", () => {
    const src = readChatPage();
    // The exact human-facing string lives in `polling-response-classifier`.
    // The chat page MUST import it by name and render it (never inline a
    // second copy that could drift from the sentinel).
    expect(src).toMatch(
      /from\s+["']@engine\/utils\/polling-response-classifier["']/,
    );
    expect(src).toContain("SESSION_EXPIRED_MESSAGE");
    expect(src).not.toContain("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  });

  test("classifyPollingResponse is wired into the polling path", () => {
    const src = readChatPage();
    expect(src).toContain("classifyPollingResponse");
  });
});
