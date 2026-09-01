// @vitest-environment happy-dom

/**
 * SPABLA · UX-01 · Behavioural render tests for the visual prototype.
 *
 * Renders each state and asserts:
 *   · fixed identity (Laura self / Takashi peer) never swaps;
 *   · translation + original toggle;
 *   · call surfaces mount when requested;
 *   · timeline picks up finished-call events;
 *   · Modo Traductor exposes both zones and role labels;
 *   · productive route `/v2/chat` is not imported here.
 *
 * No Supabase, no network. `next/image` and `next/link` are stubbed
 * because happy-dom does not run the Next.js server pipeline.
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// Stub next/image and next/link so happy-dom can render the prototype.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) =>
    React.createElement("img", { src, alt, width, height }),
}));
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { DesignShell } from "./components/DesignShell";
import { TranslatorShell } from "../translator/components/TranslatorShell";
import { DEFAULT_STATE, parsePrototypeState } from "./state";

afterEach(() => cleanup());

function shell(overrides: Record<string, string> = {}): React.JSX.Element {
  return <DesignShell state={parsePrototypeState({ ...overrides })} />;
}

function translator(overrides: Record<string, string> = {}): React.JSX.Element {
  return <TranslatorShell state={parsePrototypeState({ view: "translator", ...overrides })} />;
}

describe("UX-01 · DesignShell", () => {
  it("renders the header for Takashi Mori and never mislabels Laura as the peer", () => {
    render(shell());
    // Header uses Takashi as the interlocutor
    const header = screen.getByRole("banner", { hidden: true }) as HTMLElement | null
      ?? screen.getByRole("navigation", { name: /navegación principal/i }).parentElement!;
    // Instead of relying on ARIA landmarks, target the data-role marker.
    const conversationHeader = document.querySelector('[data-role="conversation-header"]');
    expect(conversationHeader).not.toBeNull();
    expect(conversationHeader!.textContent).toContain("Takashi Mori");
    expect(conversationHeader!.textContent).not.toContain("Laura Martín");
    void header;
  });

  it("keeps the language pair selector without country flags", () => {
    const { container } = render(shell());
    expect(screen.getByRole("group", { name: /par de idiomas/i })).toBeTruthy();
    // No flag emojis or <img alt="España"> tricks
    const html = container.innerHTML;
    expect(html).not.toMatch(/🇪🇸|🇯🇵|España|Japón/i);
  });

  it("shows Spanish translation for the peer's Japanese message with the original hidden by default", () => {
    render(shell());
    const timeline = document.querySelector('[data-role="timeline"]')!;
    // Peer's message displays Spanish translation as primary content
    expect(within(timeline as HTMLElement).getAllByText(/Hola Laura, ¿cómo estás\?/).length).toBeGreaterThan(0);
    // "Ver original" button exists on peer's bubble when hidden
    expect(within(timeline as HTMLElement).getAllByRole("button", { name: /ver original/i }).length).toBeGreaterThan(0);
    // Self's message advertises "Ver traducción" for the Japanese send
    expect(within(timeline as HTMLElement).getAllByRole("button", { name: /ver traducción/i }).length).toBeGreaterThan(0);
    // Secondary Japanese content not visible (hidden state)
    expect((timeline as HTMLElement).textContent).not.toContain("こんにちは、ラウラさん");
  });

  it("reveals the secondary text when ?original=visible", () => {
    render(shell({ original: "visible" }));
    const timeline = document.querySelector('[data-role="timeline"]')!;
    // Original Japanese line for m1 (peer)
    expect(within(timeline as HTMLElement).getAllByText(/こんにちは、ラウラさん。お元気ですか？/).length).toBeGreaterThan(0);
    // Translation Japanese line for m2 (self's Spanish message → JP)
    expect(within(timeline as HTMLElement).getAllByText(/こんにちは、タカシさん。元気です、ありがとう。/).length).toBeGreaterThan(0);
    // The action toggles to "Ocultar" when visible
    expect(within(timeline as HTMLElement).getAllByRole("button", { name: /ocultar (original|traducción)/i }).length).toBeGreaterThan(0);
  });

  it("mounts the voice call surface with live transcript when ?call=voice", () => {
    render(shell({ call: "voice" }));
    expect(screen.getByRole("region", { name: /llamada de voz activa/i })).toBeTruthy();
    expect(screen.getByRole("log", { name: /transcripción en vivo/i })).toBeTruthy();
    expect(screen.getByLabelText(/finalizar llamada/i)).toBeTruthy();
    // Timeline is still there — the call is IN the conversation.
    expect(document.querySelector('[data-role="timeline"]')).not.toBeNull();
    // Composer remains visible.
    expect(document.querySelector('[data-role="composer"]')).not.toBeNull();
  });

  it("shows Laura's transcript in Spanish (primary) with `Enviado en japonés` and Takashi's in Spanish translation with `Original: japonés`", () => {
    render(shell({ call: "voice" }));
    const transcript = screen.getByRole("log", { name: /transcripción en vivo/i });
    // Takashi's line "会えてとても嬉しいです。お元気ですか？" — his ES translation is
    // "Me alegra mucho verte. ¿Cómo estás?", which MUST be primary,
    // and "Original: japonés" is the secondary label.
    expect(transcript.textContent).toContain("Me alegra mucho verte. ¿Cómo estás?");
    expect(transcript.textContent).toContain("Original: japonés");
    // Laura's response — her ES "Yo también me alegro. Estoy muy
    // bien, gracias." is the primary; her JA translation is only
    // exposed via the "Enviado en japonés" label.
    expect(transcript.textContent).toContain("Yo también me alegro. Estoy muy bien, gracias.");
    expect(transcript.textContent).toContain("Enviado en japonés");
    // The transcript must NOT surface Laura's JA translation as
    // primary content anywhere in this region.
    expect(transcript.textContent).not.toContain("私も嬉しいです。とても元気です、ありがとう。");
    // The label must NOT read "Original: español" on Laura's turn
    // (that was the incorrect polarity in UX-01-R).
    expect(transcript.textContent).not.toContain("Original: español");
  });

  it("adds a finished voice call event to the timeline when ?call=voice-ended", () => {
    render(shell({ call: "voice-ended" }));
    const cards = document.querySelectorAll('[data-role="timeline"] [aria-label*="Llamada de voz finalizada"]');
    expect(cards.length).toBeGreaterThanOrEqual(2); // pre-existing BASE + just-ended
  });

  it("mounts the video call surface with subtitles when ?call=video&subs=on", () => {
    render(shell({ call: "video", subs: "on" }));
    expect(screen.getByRole("region", { name: /videollamada activa/i })).toBeTruthy();
    expect(screen.getByLabelText(/subtítulos de la videollamada/i)).toBeTruthy();
    expect(screen.getByLabelText(/ocultar subtítulos/i)).toBeTruthy();
    expect(screen.getByLabelText(/finalizar videollamada/i)).toBeTruthy();
  });

  it("hides subtitles when ?subs=off", () => {
    render(shell({ call: "video", subs: "off" }));
    expect(screen.queryByLabelText(/subtítulos de la videollamada/i)).toBeNull();
    expect(screen.getByLabelText(/mostrar subtítulos/i)).toBeTruthy();
  });

  it("renders the minimized video PiP and keeps the timeline in scope", () => {
    render(shell({ call: "video-min" }));
    expect(screen.getByRole("region", { name: /videollamada minimizada/i })).toBeTruthy();
    expect(document.querySelector('[data-role="timeline"]')).not.toBeNull();
    expect(screen.getByLabelText(/expandir vídeo/i)).toBeTruthy();
  });

  it("swaps to mobile shell with bottom tab bar when ?device=mobile", () => {
    render(shell({ device: "mobile" }));
    const shellNode = document.querySelector('[data-role="shell"]');
    expect(shellNode?.getAttribute("data-device")).toBe("mobile");
    expect(screen.getByRole("navigation", { name: /navegación inferior/i })).toBeTruthy();
    // Desktop sidebar is not present.
    expect(document.querySelector('[data-role="sidebar-rail"]')).toBeNull();
  });
});

describe("UX-01 · TranslatorShell", () => {
  it("shows both zones with Laura (self, blue) and other person (coral) role labels", () => {
    render(translator());
    expect(screen.getByRole("region", { name: /zona de tú/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /zona de otra persona/i })).toBeTruthy();
    // Language swap control
    expect(screen.getByRole("link", { name: /intercambiar idiomas/i })).toBeTruthy();
    // Finalizar footer
    expect(screen.getByRole("link", { name: /finalizar modo traductor/i })).toBeTruthy();
  });

  it("marks the active turn accessibly", () => {
    render(translator({ turn: "other" }));
    const otherZone = screen.getByRole("region", { name: /zona de otra persona/i });
    const otherMic = within(otherZone).getByRole("button", { name: /detener escucha/i });
    expect(otherMic.getAttribute("aria-pressed")).toBe("true");
  });

  it("swaps the language pair without moving the role assignments", () => {
    render(translator({ swap: "1" }));
    // With swap=1: self should now speak Japanese, other Spanish
    const selfZone = screen.getByRole("region", { name: /zona de tú/i });
    expect(selfZone.textContent).toContain("Japonés");
    const otherZone = screen.getByRole("region", { name: /zona de otra persona/i });
    expect(otherZone.textContent).toContain("Español");
  });

  it("uses the face-to-face layout on mobile", () => {
    render(translator({ device: "mobile" }));
    const shellNode = document.querySelector('[data-role="translator-shell"]');
    expect(shellNode?.getAttribute("data-device")).toBe("mobile");
  });

  it("defaults are Spanish-self / Japanese-other", () => {
    expect(DEFAULT_STATE.translatorTurn).toBe("self");
    expect(DEFAULT_STATE.swapped).toBe(false);
  });
});

describe("UX-01 · isolation from productive code", () => {
  it("the design tree does not import productive `/v2/chat` symbols", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = path.resolve(__dirname);
    async function walk(dir: string): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(p)));
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
          out.push(p);
        }
      }
      return out;
    }
    const files = await walk(path.resolve(root, ".."));
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      // Zero import from /v2/chat productive tree
      expect(src, `${f} must not import productive chat symbols`).not.toMatch(/from ["'](?:@\/)?app\/v2\/chat\//);
      // Zero import from Supabase-related productive helpers
      expect(src, `${f} must not import supabase browser client`).not.toMatch(/from ["'](?:@\/)?lib\/v2\/client\/supabase-browser-client/);
      // Zero real onboarding / auth deps
      expect(src, `${f} must not import onboarding client helpers`).not.toMatch(/from ["'](?:@\/)?lib\/v2\/client\/otp/);
    }
  });
});
