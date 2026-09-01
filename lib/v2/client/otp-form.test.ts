/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · Structural guard on OtpForm.
 *
 * The client-side Vitest project runs with `environment=node` and
 * neither `@testing-library/react` nor a DOM. Testing dynamic
 * behaviour lives in the pure helpers (`otp-classify.test.ts`,
 * `otp-request.test.ts`, `otp-verify.test.ts`); this file is the
 * anti-regression barrier on the STRUCTURAL invariants of
 * `OtpForm.tsx` — the ones a UI-less environment can still verify by
 * reading the source.
 *
 * Fails the suite if any of the following degrade:
 *   · component wires up the pure helpers.
 *   · code input carries `inputMode="numeric"`, `autocomplete="one-time-code"`,
 *     `maxLength=6`, `pattern="[0-9]*"`.
 *   · email input carries `autocomplete="email"`, `inputMode="email"`.
 *   · OTP never touches localStorage / sessionStorage / cookies / URL.
 *   · No console.log emits token / code / OTP material.
 *   · Cooldown is presented as UX (60s) not as security.
 *   · Component invokes `onSwitchToPassword` at least once — password
 *     path is preserved and reachable from the OTP UI.
 *   · Concurrency uses a monotonic `latest*OpRef` guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "..", "..", "..", "app", "v2", "chat", "components", "OtpForm.tsx"),
  "utf8",
);
const PAGE_SRC = readFileSync(
  resolve(__dirname, "..", "..", "..", "app", "v2", "chat", "page.tsx"),
  "utf8",
);

describe("OtpForm · structural guard", () => {
  it("importa y usa los helpers puros de OTP", () => {
    expect(SRC).toMatch(/from "@\/lib\/v2\/client\/otp-classify"/);
    expect(SRC).toMatch(/from "@\/lib\/v2\/client\/otp-request"/);
    expect(SRC).toMatch(/from "@\/lib\/v2\/client\/otp-verify"/);
    expect(SRC).toMatch(/requestOtpEmail/);
    expect(SRC).toMatch(/verifyOtpAndOnboard/);
    expect(SRC).toMatch(/onlyDigits/);
  });

  it("input de código con inputMode='numeric', maxLength=6, autocomplete=one-time-code", () => {
    expect(SRC).toMatch(/inputMode="numeric"/);
    expect(SRC).toMatch(/autoComplete="one-time-code"/);
    expect(SRC).toMatch(/maxLength=\{6\}/);
    expect(SRC).toMatch(/pattern="\[0-9\]\*"/);
  });

  it("input de email con inputMode='email' y autocomplete='email'", () => {
    expect(SRC).toMatch(/inputMode="email"/);
    expect(SRC).toMatch(/autoComplete="email"/);
  });

  it("cero persistencia del OTP (ni localStorage, ni sessionStorage, ni cookies, ni URL)", () => {
    // Strip comments/docstrings — menciones descriptivas están
    // permitidas para explicar la política; lo que queremos vetar
    // son accesos activos productivos.
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/\/\/[^\n]*/g, ""); // line comments
    expect(stripped).not.toMatch(/localStorage/);
    expect(stripped).not.toMatch(/sessionStorage/);
    expect(stripped).not.toMatch(/document\.cookie/);
    expect(stripped).not.toMatch(/window\.location/);
    expect(stripped).not.toMatch(/history\.pushState|history\.replaceState/);
  });

  it("cero console.log/console.info/console.debug del OTP/code/token", () => {
    // Nótese: aceptamos que otros ficheros logueen; la barrera es
    // sobre este componente concreto.
    expect(SRC).not.toMatch(/console\.log|console\.info|console\.debug|console\.warn|console\.error/);
  });

  it("cooldown declarado como UX (60s) y no como barrera de seguridad", () => {
    // Constante explícita.
    expect(SRC).toMatch(/RESEND_COOLDOWN_SECONDS\s*=\s*60/);
    // Comentario descriptivo de la naturaleza UX.
    expect(SRC).toMatch(/UX-only|no barrera|NO es una defensa|no es una barrera/i);
    // La barrera real vive server-side.
    expect(SRC).toMatch(/barrera real vive server-side|Supabase Auth/);
  });

  it("expone onSwitchToPassword — el login con contraseña sigue accesible", () => {
    expect(SRC).toMatch(/onSwitchToPassword/);
    expect(SRC).toMatch(/Acceder con contraseña/);
  });

  it("usa refs monotónicos para descartar respuestas obsoletas (concurrencia)", () => {
    expect(SRC).toMatch(/latestRequestOpRef/);
    expect(SRC).toMatch(/latestVerifyOpRef/);
    expect(SRC).toMatch(/opId\s*!==\s*latestRequestOpRef\.current/);
    expect(SRC).toMatch(/opId\s*!==\s*latestVerifyOpRef\.current/);
  });

  it("mountedRef previene setState tras desmontaje", () => {
    expect(SRC).toMatch(/mountedRef/);
    expect(SRC).toMatch(/mountedRef\.current = false/);
  });

  it("limpia el código en memoria tras verificar/reenvíar/cambiar email/éxito", () => {
    // Presencia de al menos 3 setState del código a "" en flows.
    const matches = SRC.match(/setCode\(""\)/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("botón submit con aria-busy cuando está en curso", () => {
    expect(SRC).toMatch(/aria-busy=\{busyRequest \|\| undefined\}/);
    expect(SRC).toMatch(/aria-busy=\{busyVerify \|\| undefined\}/);
  });

  it("aria-live en mensajes de estado/error", () => {
    expect(SRC).toMatch(/aria-live="polite"/);
    expect(SRC).toMatch(/role="alert"/);
  });

  it("aria-describedby vincula el error al campo correspondiente", () => {
    expect(SRC).toMatch(/aria-describedby=\{errorMessage \? "spabla-otp-email-error" : undefined\}/);
    expect(SRC).toMatch(/aria-describedby=\{errorMessage \? "spabla-otp-code-error" : undefined\}/);
  });

  it("mensaje público único (opaco) para wrong/expired/reused/cross-email (no distingue)", () => {
    // El estado público es `code_invalid_or_expired`; verificamos
    // que el classifier lo aplica a todos los casos en el fichero
    // classifier (cubierto en otp-classify.test.ts). Aquí sólo
    // reforzamos que el componente NO distingue en la UI: única
    // rama de mensaje via messageFor(error.public).
    expect(SRC).toMatch(/messageFor\(error\.public\)/);
  });
});

describe("page.tsx · integración con OtpForm sin destruir password", () => {
  it("importa OtpForm/SessionArea via UnauthGate (extraído en Q2-R2)", () => {
    // Q2-R2 · La decisión unauth vive en el componente productivo
    // `UnauthGate` (usado por page.tsx). page.tsx importa OtpForm y
    // SessionArea pero los renderiza a través de UnauthGate.
    expect(PAGE_SRC).toMatch(/from "\.\/components\/OtpForm"/);
    expect(PAGE_SRC).toMatch(/from "\.\/components\/SessionArea"/);
    expect(PAGE_SRC).toMatch(/from "\.\/components\/UnauthGate"/);
    expect(PAGE_SRC).toMatch(/<UnauthGate/);
  });

  it("mantiene authMethod con toggle password/otp (delegado al hook + UnauthGate)", () => {
    // Q2-R3 · La política vive en `useAuthMethod`. `page.tsx`
    // consume el hook y pasa el setter a `UnauthGate`.
    expect(PAGE_SRC).toMatch(/useAuthMethod\(\)/);
    expect(PAGE_SRC).toMatch(/from "@\/lib\/v2\/client\/use-auth-method"/);
    // `setAuthMethod("password")` se llama desde UnauthGate.tsx —
    // verificamos allí que existe la transición.
    const gateSrc = readFileSync(
      resolve(__dirname, "..", "..", "..", "app", "v2", "chat", "components", "UnauthGate.tsx"),
      "utf8",
    );
    expect(gateSrc).toMatch(/setAuthMethod\("password"\)/);
  });

  it("SessionArea recibe los mismos props productivos vía UnauthGate", () => {
    // page.tsx pasa a UnauthGate los mismos props que antes pasaba
    // a SessionArea inline.
    expect(PAGE_SRC).toMatch(/signInEmail=\{signInEmail\}/);
    expect(PAGE_SRC).toMatch(/signInPassword=\{signInPassword\}/);
    expect(PAGE_SRC).toMatch(/onSignIn=\{\(\) => \{ void signIn\(\); \}\}/);
  });

  it("botón 'Acceder con código' visible desde el modo password (dentro de UnauthGate)", () => {
    const gateSrc = readFileSync(
      resolve(__dirname, "..", "..", "..", "app", "v2", "chat", "components", "UnauthGate.tsx"),
      "utf8",
    );
    expect(gateSrc).toMatch(/Acceder con código/);
  });

  it("OtpForm.onAuthenticated NO fuerza retorno a password (Q2-R rectificado)", () => {
    // Rectificado en Q2-R: OTP es método principal; onAuthenticated
    // limpia el aviso de expiración pero deja `authMethod = "otp"`.
    // La barrera antifraude estricta vive en
    // `lib/v2/client/otp-antifraud.test.ts § onAuthenticated NO
    // fuerza setAuthMethod('password')` con parseo balanceado de
    // llaves. Aquí conservamos la comprobación equivalente sin
    // ámbito acotado exhaustivo — sirve como oracle mínimo.
    const idx = PAGE_SRC.indexOf("onAuthenticated={() => {");
    expect(idx).toBeGreaterThan(-1);
    // Restringimos hasta el cierre del arrow con parseo balanceado.
    let depth = 0;
    let end = -1;
    for (let i = idx + "onAuthenticated=".length; i < PAGE_SRC.length; i += 1) {
      const c = PAGE_SRC[i];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    expect(end).toBeGreaterThan(idx);
    const body = PAGE_SRC.slice(idx, end);
    expect(body).not.toMatch(/setAuthMethod\("password"\)/);
    expect(body).toMatch(/setSessionExpired\(false\)/);
  });
});
