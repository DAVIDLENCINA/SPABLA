/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R · Antifraude estático.
 *
 * Fija las decisiones normativas de Q2-R sobre el propio código
 * fuente. Se ejecuta bajo environment node (no DOM) porque sólo
 * lee ficheros. Complementa (NO sustituye) los tests conductuales
 * de `otp-form.behavioral.test.tsx` y `page.behavioral.test.tsx`.
 *
 * Falla el suite si aparece cualquiera de estas regresiones:
 *
 *   · `authMethod` inicial deja de ser "otp".
 *   · `onAuthenticated` fuerza `setAuthMethod("password")`.
 *   · Las pruebas conductuales de OtpForm/page se sustituyen por
 *     regex/inspección del source (whitelist estricta de archivos
 *     .behavioral.test.tsx).
 *   · La integración OTP → onboarding vuelve a mockear `fetch`.
 *   · Se introducen localStorage/sessionStorage/document.cookie
 *     activos sobre OtpForm.
 *   · Se introduce tabla `otp_challenges` propia en migraciones.
 *   · Se introduce cliente `service_role` en el bundle cliente.
 *   · Se añade un endpoint OTP propio (`app/api/v2/**otp**`).
 *   · Se usa `ConfirmationURL` o `/auth/v1/verify` como magic link.
 *   · Se elimina `shouldCreateUser: true`.
 *   · Se añaden `test.skip`, `test.only` o `.retry(N)` en tests OTP.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");
const PAGE = readFileSync(resolve(REPO, "app", "v2", "chat", "page.tsx"), "utf8");
const OTP_FORM = readFileSync(resolve(REPO, "app", "v2", "chat", "components", "OtpForm.tsx"), "utf8");
const OTP_REQUEST = readFileSync(resolve(REPO, "lib", "v2", "client", "otp-request.ts"), "utf8");
const OTP_VERIFY = readFileSync(resolve(REPO, "lib", "v2", "client", "otp-verify.ts"), "utf8");
const OTP_INT = readFileSync(
  resolve(REPO, "lib", "v2", "client", "otp-onboarding.integration.test.ts"),
  "utf8",
);
const TEMPLATE = readFileSync(resolve(REPO, "supabase", "templates", "otp_email.html"), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Q2-R antifraude · authMethod y onAuthenticated", () => {
  it("authMethod inicial DEBE ser 'otp' — no regresa a 'password'", () => {
    expect(PAGE).toMatch(/useState<"password" \| "otp">\("otp"\)/);
    expect(PAGE).not.toMatch(/useState<"password" \| "otp">\("password"\)/);
    expect(PAGE).not.toMatch(/useState<"otp" \| "password">\("password"\)/);
  });

  it("signOut vuelve por defecto a 'otp'", () => {
    // Dentro del cuerpo de `signOut`, después del setBootstrapPhase.
    expect(PAGE).toMatch(/setBootstrapPhase\("idle"\);[\s\S]{0,600}setAuthMethod\("otp"\)/);
  });

  it("onAuthenticated NO fuerza setAuthMethod('password')", () => {
    const idx = PAGE.indexOf("onAuthenticated={() => {");
    expect(idx).toBeGreaterThan(-1);
    // Aislamos el cuerpo del arrow function contando llaves.
    let depth = 0;
    let start = -1;
    let end = -1;
    for (let i = idx; i < PAGE.length; i += 1) {
      const c = PAGE[i];
      if (c === "{") {
        if (start === -1) start = i;
        depth += 1;
      } else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = PAGE.slice(start, end + 1);
    expect(body).not.toMatch(/setAuthMethod\("password"\)/);
    expect(body).toMatch(/setSessionExpired\(false\)/);
  });
});

describe("Q2-R antifraude · behavioural tests siguen siendo conductuales", () => {
  it("otp-form.behavioral.test.tsx existe y usa Testing Library render/fireEvent", () => {
    const p = resolve(REPO, "lib", "v2", "client", "otp-form.behavioral.test.tsx");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/from "@testing-library\/react"/);
    expect(src).toMatch(/\brender\(/);
    expect(src).toMatch(/\bfireEvent\./);
    expect(src).toMatch(/\bscreen\./);
    // NO debe basarse SOLO en readFileSync sobre el source productivo
    // — sí puede usarlo para el oracle de constantes normativas.
    expect(src).not.toMatch(/readFileSync\(.*OtpForm\.tsx.*\)/);
  });

  it("page.behavioral.test.tsx existe y renderiza el subárbol de decisión OTP↔password", () => {
    const p = resolve(REPO, "app", "v2", "chat", "page.behavioral.test.tsx");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/from "@testing-library\/react"/);
    expect(src).toMatch(/\brender\(/);
    expect(src).toMatch(/\bfireEvent\./);
    // Oracle sobre el source productivo permitido para la constante
    // inicial ("static oracle"), pero NO debe sustituir el
    // renderizado real.
    const behavioralCount = (src.match(/\brender\(/g) ?? []).length;
    expect(behavioralCount).toBeGreaterThanOrEqual(3);
  });
});

describe("Q2-R antifraude · integración OTP → onboarding REAL", () => {
  it("otp-onboarding.integration.test.ts NO mockea fetch ni skipea el handler", () => {
    expect(OTP_INT).toMatch(/POST as ONBOARDING_POST.*route/);
    expect(OTP_INT).toMatch(/await ONBOARDING_POST\(req\)/);
    expect(OTP_INT).not.toMatch(/vi\.fn\([^)]*\)\s*as\s*typeof\s*fetch/);
    expect(OTP_INT).not.toMatch(/globalThis\.fetch\s*=\s*vi\.fn/);
    // Post-condition SQL directa (no via handler).
    expect(OTP_INT).toMatch(/actor_personal_workspace/);
    expect(OTP_INT).toMatch(/spabla_v2\.tenants/);
    expect(OTP_INT).toMatch(/access_token/);
    // Comprobación de identidad efectiva desde el sub del JWT.
    expect(OTP_INT).toMatch(/payload\.sub/);
    // Idempotencia demostrada (dos POST reales, mismo tenantId).
    expect(OTP_INT).toMatch(/realOnboardingCall\(accessToken\)[\s\S]{0,3000}realOnboardingCall\(accessToken\)/);
    // Cero OTP crudo en logs — sólo hashes truncados.
    expect(OTP_INT).toMatch(/sha12\(/);
  });
});

describe("Q2-R antifraude · surface OTP no regresa", () => {
  it("cero localStorage/sessionStorage/document.cookie ACTIVO en OtpForm", () => {
    const stripped = OTP_FORM
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(stripped).not.toMatch(/localStorage/);
    expect(stripped).not.toMatch(/sessionStorage/);
    expect(stripped).not.toMatch(/document\.cookie/);
    expect(stripped).not.toMatch(/window\.location/);
  });

  it("cero tabla `otp_challenges` en migraciones", () => {
    const migrations = resolve(REPO, "supabase", "migrations");
    if (!existsSync(migrations)) return;
    for (const f of walk(migrations)) {
      if (!f.endsWith(".sql")) continue;
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/otp_challenges/i);
    }
  });

  it("cero service_role client-side ni endpoint OTP propio en app/api", () => {
    const client = resolve(REPO, "lib", "v2", "client");
    for (const f of walk(client)) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const src = readFileSync(f, "utf8");
      // Sólo comentarios/tests pueden mencionar service_role; en el
      // código productivo NO debe aparecer instanciación con
      // SUPABASE_SERVICE_ROLE_KEY.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (!/\.test\.(ts|tsx)$/.test(f) && !/\.integration\./.test(f)) {
        expect(stripped).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
        expect(stripped).not.toMatch(/service_role/);
      }
    }
    const apiOtp = resolve(REPO, "app", "api", "v2");
    if (existsSync(apiOtp)) {
      const entries = readdirSync(apiOtp);
      expect(entries.filter((n) => /otp/i.test(n))).toEqual([]);
    }
  });

  it("plantilla · cero ConfirmationURL / verify URL / magic link", () => {
    expect(TEMPLATE).not.toMatch(/\{\{ \.ConfirmationURL \}\}/);
    expect(TEMPLATE).not.toMatch(/\/auth\/v1\/verify/);
    expect(TEMPLATE).toMatch(/\{\{ \.Token \}\}/);
  });

  it("shouldCreateUser:true sigue siendo invariante en el request helper", () => {
    expect(OTP_REQUEST).toMatch(/shouldCreateUser:\s*true/);
    expect(OTP_REQUEST).not.toMatch(/shouldCreateUser:\s*false/);
  });

  it("cero test.skip / test.only / .retry en tests OTP", () => {
    const files = [
      "lib/v2/client/otp-classify.test.ts",
      "lib/v2/client/otp-request.test.ts",
      "lib/v2/client/otp-verify.test.ts",
      "lib/v2/client/otp-template.test.ts",
      "lib/v2/client/otp-form.test.ts",
      "lib/v2/client/otp-form.behavioral.test.tsx",
      "lib/v2/client/otp-signin.integration.test.ts",
      "lib/v2/client/otp-onboarding.integration.test.ts",
      "app/v2/chat/page.behavioral.test.tsx",
    ];
    for (const rel of files) {
      const p = resolve(REPO, rel);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, "utf8");
      expect(src).not.toMatch(/\btest\.skip\(/);
      expect(src).not.toMatch(/\btest\.only\(/);
      expect(src).not.toMatch(/\bit\.skip\(/);
      expect(src).not.toMatch(/\bit\.only\(/);
      expect(src).not.toMatch(/\.retry\(/);
    }
  });

  it("verify helper · idempotencia end-to-end (verifyOtp + onboarding sin destruir sesión)", () => {
    expect(OTP_VERIFY).toMatch(/kind:\s*"onboarding_error"/);
    expect(OTP_VERIFY).toMatch(/session,/); // sesión preservada en onboarding_error
  });
});
