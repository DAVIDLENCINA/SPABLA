/**
 * SPABLA V2 · Hito 9.2.1 · Source-level lock de los componentes
 * presentacionales del shell visual seguro.
 *
 * Estrategia idéntica a `lang13-04-provider-prompt.test.ts`: el
 * repositorio NO tiene infraestructura de tests React/DOM
 * (`@testing-library/react`, `jsdom`, `happy-dom` no están instalados
 * y añadirlos violaría FASE 13 de la orden 9.2.1). Bloqueamos por
 * lectura del fichero fuente, que además es la única vía consistente
 * con el precedente LANG13-04.
 *
 * Locks aplicados:
 *
 *   1. AppHeader.tsx contiene `alt="SPABLA"` (accesibilidad + identidad).
 *   2. AppHeader.tsx contiene el título "Chat".
 *   3. ChatSection.tsx renderiza `{title}` y `{children}`.
 *   4. Ningún componente nuevo importa Supabase, translate.ts,
 *      contratos del engine, ni ejecuta fetch.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const COMPONENTS_DIR = resolve(REPO_ROOT, "app/v2/chat/components");
const APP_HEADER = resolve(COMPONENTS_DIR, "AppHeader.tsx");
const CHAT_FRAME = resolve(COMPONENTS_DIR, "ChatPageFrame.tsx");
const CHAT_SECTION = resolve(COMPONENTS_DIR, "ChatSection.tsx");

function readOrThrow(p: string): string {
  if (!existsSync(p)) throw new Error(`missing artifact: ${p}`);
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────
// A · Contratos de contenido (identidad + a11y)
// ────────────────────────────────────────────────────────────────
describe("9.2.1 · AppHeader — identidad SPABLA y accesibilidad", () => {
  const src = readOrThrow(APP_HEADER);

  test("renderiza una imagen con alt=\"SPABLA\"", () => {
    expect(src).toMatch(/alt="SPABLA"/);
  });

  test("renderiza el título \"Chat\"", () => {
    // Cualquier ocurrencia literal — la copia del título es sencilla en
    // este hito y se congela por regression.
    expect(src).toMatch(/>Chat</);
  });

  test("usa el activo oficial /SPABLA_LOGO.png (sin recortes ni variantes)", () => {
    expect(src).toMatch(/src="\/SPABLA_LOGO\.png"/);
  });

  test("emite dimensiones numéricas explícitas (no width='auto' ni height='auto' como props de Image)", () => {
    expect(src).toMatch(/width=\{\d+\}/);
    expect(src).toMatch(/height=\{\d+\}/);
    // Prohibición explícita: nada de props `width="auto"` / `height="auto"`.
    expect(src).not.toMatch(/width="auto"/);
    expect(src).not.toMatch(/height="auto"/);
  });

  test("respeta la paleta oficial: fondo #0B0F19 y texto #FFFFFF", () => {
    expect(src).toContain("#0B0F19");
    expect(src).toContain("#FFFFFF");
  });
});

describe("9.2.1 · ChatPageFrame — envoltura sobria y responsive", () => {
  const src = readOrThrow(CHAT_FRAME);

  test("acepta `header` y `children` como props", () => {
    expect(src).toMatch(/header:\s*ReactNode/);
    expect(src).toMatch(/children:\s*ReactNode/);
  });

  test("usa color de texto principal alineado con la paleta (#0B0F19)", () => {
    expect(src).toContain("#0B0F19");
  });
});

describe("9.2.1 · ChatSection — repetición visual encapsulada", () => {
  const src = readOrThrow(CHAT_SECTION);

  test("acepta `title` (string) y `children`", () => {
    expect(src).toMatch(/title:\s*string/);
    expect(src).toMatch(/children:\s*ReactNode/);
  });

  test("renderiza `{title}` y `{children}` en el árbol JSX", () => {
    expect(src).toMatch(/\{title\}/);
    expect(src).toMatch(/\{children\}/);
  });

  test("acepta `minHeight` opcional (respeta el minHeight: 240 del panel Conversación)", () => {
    expect(src).toMatch(/minHeight\?:/);
  });
});

// ────────────────────────────────────────────────────────────────
// B · Contratos de aislamiento (cero lógica, cero red)
// ────────────────────────────────────────────────────────────────
describe("9.2.1 · componentes son puramente presentacionales", () => {
  const files: ReadonlyArray<{ readonly name: string; readonly src: string }> = [
    { name: "AppHeader.tsx", src: readOrThrow(APP_HEADER) },
    { name: "ChatPageFrame.tsx", src: readOrThrow(CHAT_FRAME) },
    { name: "ChatSection.tsx", src: readOrThrow(CHAT_SECTION) },
  ];

  test("ningún componente ejecuta `fetch(`", () => {
    for (const { name, src } of files) {
      expect(src, `${name} contiene fetch(`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  test("ningún componente importa Supabase", () => {
    for (const { name, src } of files) {
      expect(src, `${name} importa Supabase`).not.toMatch(/@supabase\/supabase-js|from\s+["']@supabase/);
    }
  });

  test("ningún componente importa la ruta productiva de traducción", () => {
    for (const { name, src } of files) {
      expect(src, `${name} importa translate/translation-runtime`).not.toMatch(/translate\.ts|translation-runtime|lib\/v2\/server\/translate/);
    }
  });

  test("ningún componente importa contratos del engine", () => {
    for (const { name, src } of files) {
      expect(src, `${name} importa @engine/*`).not.toMatch(/from\s+["']@engine\//);
    }
  });

  test("ningún componente accede a `process.env`", () => {
    for (const { name, src } of files) {
      expect(src, `${name} accede a process.env`).not.toMatch(/process\.env\./);
    }
  });

  test("ningún componente lee ni escribe `localStorage`", () => {
    for (const { name, src } of files) {
      expect(src, `${name} accede a localStorage`).not.toMatch(/localStorage\./);
    }
  });

  test("ningún componente define `useState`, `useEffect`, `useCallback`, `useRef`, `useMemo` (cero estado local)", () => {
    for (const { name, src } of files) {
      expect(src, `${name} usa hooks de estado/efecto`).not.toMatch(/\buseState\b|\buseEffect\b|\buseCallback\b|\buseRef\b|\buseMemo\b/);
    }
  });
});
