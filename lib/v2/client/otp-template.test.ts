/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · Static template guard.
 *
 * Refuses any regression that:
 *   · removes `{{ .Token }}` from the OTP body;
 *   · re-introduces `{{ .ConfirmationURL }}` or any auth-verify URL
 *     (which would resurrect the magic-link default the audit Q1 §4
 *     T17 flagged as blocking);
 *   · omits the `[auth.email.template.magic_link]` block in
 *     `supabase/config.toml` that points at the custom template.
 *
 * These are STATIC assertions on file contents. No Supabase invoked.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const TEMPLATE_PATH = resolve(REPO_ROOT, "supabase", "templates", "otp_email.html");
const CONFIG_PATH = resolve(REPO_ROOT, "supabase", "config.toml");

describe("otp email template · static guard", () => {
  it("contiene {{ .Token }} para renderizar el código de 6 dígitos", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).toMatch(/\{\{ \.Token \}\}/);
  });

  it("NO contiene {{ .ConfirmationURL }} ni magic link funcional", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).not.toMatch(/\{\{ \.ConfirmationURL \}\}/);
    expect(html).not.toMatch(/\/auth\/v1\/verify/);
    // Prohibición sintáctica de variables GoTrue no autorizadas
    // (RedirectTo, ConfirmationURL, TokenHash …). Las únicas
    // variables permitidas son `.Token` y el subject fijo. Si futuras
    // versiones de GoTrue añaden `.Data` o similares y las
    // necesitamos, hay que actualizar esta whitelist conscientemente.
    const authorised = new Set(["Token"]);
    const found = Array.from(html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)).map((m) => m[1]);
    for (const variable of found) {
      expect(authorised).toContain(variable);
    }
  });

  it("marca SPABLA correctamente escrita", () => {
    const html = readFileSync(TEMPLATE_PATH, "utf8");
    expect(html).toMatch(/SPABLA/);
    expect(html).not.toMatch(/spabla|Spabla|SpablA/);
  });
});

describe("supabase/config.toml · template pointer", () => {
  it("declara [auth.email.template.magic_link] apuntando a otp_email.html", () => {
    const toml = readFileSync(CONFIG_PATH, "utf8");
    expect(toml).toMatch(/\[auth\.email\.template\.magic_link\]/);
    expect(toml).toMatch(/content_path = "\.\/supabase\/templates\/otp_email\.html"/);
  });

  it("mantiene [local_smtp] enabled = true para el flujo local", () => {
    const toml = readFileSync(CONFIG_PATH, "utf8");
    // Bloque `[local_smtp]` con `enabled = true` en la MISMA sección
    // (permitiendo comentarios entre líneas).
    const smtpBlock = toml.split(/\[local_smtp\]/)[1]?.split(/^\[/m)[0] ?? "";
    expect(smtpBlock).toMatch(/enabled\s*=\s*true/);
  });
});
