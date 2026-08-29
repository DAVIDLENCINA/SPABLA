# HITO 9.3.2-B-Q3-R2 · LOGOUT PRODUCTIVO Y CIERRE DOCUMENTAL OTP

Fecha: 2026-08-29
Rama: `spabla-v2/hito-9-3-2-b-q3-r2-productive-logout`
Base exacta: `683eb9357a76d4755fa79e0d88028e5ae6e87a25` (candidato Q3-R)
Oficial invariante durante Q3-R2: `spabla-v2/thirteen-languages-activation` @ `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7`
Main invariante durante Q3-R2: `e6128433d42e1e105529ed2f64212ca527034b6a`
Run autorizante Q3-R (verde): `33211333024`
Contrato gobernante: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md`

## 1 · Objetivo

Q3-R declaró en su acta §5.1 que "el wiring `resetOnLogout` no está cableado" y en su reporte final §23 que no había bloqueos de producción. Ambas afirmaciones eran incorrectas. Q3-R2 rectifica ambas por vía de evidencia ejecutable + acta documental:

1. El botón productivo "Cerrar sesión" (`app/v2/chat/components/ConversationHeader.tsx:124`) SÍ vuelve a OTP: el handler `signOut` en `app/v2/chat/page.tsx:542` invoca explícitamente `resetAuthMethodOnLogout()` en la línea 569 después del `supabase.auth.signOut({scope:"local"})`. La contradicción de Q3-R vino de que S16 llamó al SDK directamente saltándose el wrapper, y por eso observó "queda en password". El logout voluntario ya estaba correctamente cableado.
2. La barrera OTP existe únicamente sobre stack local. Los bloqueos productivos reales (SMTP, DNS, dominio, plantilla Cloud, expiración, rate limits, entregabilidad, monitorización) se enumeran en §5 y quedan pendientes.

Sin promoción, sin diseño, sin otro hito, sin Cloud, sin cambio de arquitectura de sesión. Cero cambio de producto en Q3-R2.

## 2 · Auditoría del logout real — los tres caminos

Los tres caminos que fabrican SIGNED_OUT en el SDK NO son equivalentes. Q3-R los trató como uno y por eso concluyó mal.

### A. Logout voluntario mediante UI

**Entry point**: `<button type="button" onClick={onSignOut}>Cerrar sesión</button>` en `ConversationHeader` (line 124), renderizado por `page.tsx` con `onSignOut={session ? signOut : undefined}` (line 631).

**Handler productivo** (`page.tsx#signOut`, lines 542-570):

```ts
const signOut = useCallback(async () => {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
  sessionExpiredRef.current = false;
  setSessionExpired(false);
  setSession(null);
  setRawMessages({ items: [], forActor: null });
  setRawPollError(null);
  setRawSendError(null);
  setBootstrap(null);
  setBootstrapForActor(null);
  setBootstrapPhase("idle");
  // Q2-R3 · Al cerrar sesión aplicamos la política de reset del
  // hook productivo (autoridad única de la decisión).
  resetAuthMethodOnLogout();
}, [...]);
```

**Comportamiento observable**: se vacía `localStorage["spabla_v2_fase9_auth"]`, se descarta el bootstrap, y `authMethod` vuelve a `"otp"`. La UI muestra el OTP form. Password form deja de estar visible.

### B. SIGNED_OUT del SDK por expiración, recuperación o pérdida

**Entry point**: `supabase.auth.onAuthStateChange((evt, s) => {...})` en `page.tsx` (line 272ish). Fires cuando el SDK detecta refresh_token inválido / access_token expirado terminal / cualquier otra ruta interna que emite `SIGNED_OUT` fuera del wrapper.

**Handler del listener** (line 279-286):

```ts
if (evt === "SIGNED_OUT") {
  setBootstrap(null);
  setBootstrapPhase("idle");
  setBootstrapForActor(null);
}
```

**Comportamiento observable**: se limpia el snapshot de bootstrap. `authMethod` NO se resetea — se preserva la última elección del usuario. La UI sigue en el mismo método (password → SessionArea con banner "Sesión expirada"; OTP → OtpForm). Esta política respeta el contrato histórico probado por `e2e/auth-continuity.spec.ts` §20-10 desde Q3-E2E-R.

### C. `supabase.auth.signOut()` llamado directamente por tests

**Entry point**: `page.evaluate` que invoca `window.__spablaSupabase.auth.signOut({scope:"local"})`. Atajo del wrapper. Semánticamente equivale al camino B — el SDK emite `SIGNED_OUT` pero el productivo `page.tsx#signOut` no participa. `authMethod` NO se resetea.

Este camino es lo que S16 usaba en Q3-R, y por eso observó "queda en password form después del logout". Diagnóstico erróneo cerrado en Q3-R2.

## 3 · S16 rectificado

Cambios en `e2e/otp-signin.spec.ts` sobre el bloque S16:

1. Paso 7 pulsa `page.getByRole("button", { name: /^Cerrar sesión$/i }).click()` en vez de `page.evaluate(...auth.signOut...)`. Ese botón es exactamente el rendered en `ConversationHeader` cuando `isAuthenticated=true`, y ejerce el productivo `page.tsx#signOut` completo.
2. Paso 8 exige `section[aria-label="Iniciar sesión con código"]` visible **obligatoriamente**, y `section[aria-label="Iniciar sesión"]` (password form) con `toHaveCount(0)`. No hay más "acepta cualquiera de los dos" — Q3-R2 lo prohíbe explícitamente para el logout voluntario.
3. Paso 8 también verifica `postLogoutStorage`: cero `spabla_v2_fase9_auth`, cero patrón `\b\d{6}\b`.
4. Paso 9 pulsa "Acceder con contraseña" (switch productivo, no signOut).
5. Paso 10 segundo login real con misma contraseña → misma actor / tenant / membership.
6. Paso 11 vuelve a exigir cero código 6d en localStorage.
7. Nuevo paso 11-bis: segundo logout usando el mismo botón productivo → OTP obligatorio de nuevo. Cerró el ciclo dos veces para probar reproducibilidad.
8. Paso 12 conserva 1 mapping / 1 membership.

Cero llamada directa a `__spablaSupabase.auth.signOut()` en S16 (verificable con `grep -n "__spablaSupabase\.auth\.signOut" e2e/otp-signin.spec.ts` — sólo aparece en S3, S15 y S1's SDK-based hook uses which model B/C paths intencionalmente).

## 4 · Auth continuity §20-10 preservada

Q3-R2 explícitamente prohíbe modificar el listener central para satisfacer el logout voluntario. La política diferenciada A/B/C ya existía en el producto; sólo faltaba probarla correctamente. Verificación:

- `e2e/auth-continuity.spec.ts:546 §20-10 · 401 irrecuperable (refresh terminal_invalid → Expired)` — el escenario simula expiración vía `page.route` sobre `**/auth/v1/token**grant_type=refresh_token**` → 400 invalid_grant. El SDK emite `SIGNED_OUT` (camino B). El listener limpia bootstrap. `authMethod` se preserva en password. `SessionArea` renderiza `section[aria-label="Iniciar sesión"]` + banner "Sesión expirada". PASA verde en Q3-R2 sin ningún cambio.

Cero cambio de producto en Q3-R2. La política existente basta.

## 5 · Bloqueos productivos reales

Q3-R declaró incorrectamente "cero bloqueos de producción". Q3-R2 lo rectifica: SPABLA NO está preparada para OTP en producción por los siguientes bloqueos pendientes. Ninguno de ellos se puede acreditar contra Supabase local + Mailpit local + Kong local.

| # | Bloqueo | Owner | Descripción | Acreditación pendiente |
|---|---|---|---|---|
| 1 | **SMTP transaccional real** | Ops | Supabase local usa Mailpit (sink no productivo). Producción requiere proveedor SMTP transaccional (SES/Postmark/Mailgun/Resend/etc.) configurado en Supabase Cloud Dashboard → Auth → SMTP Settings. | Configurar en Cloud, verificar envío end-to-end a inbox real. |
| 2 | **Dominio remitente** | Ops | El `from_email` (`admin@email.com` por defecto local) debe reemplazarse por un dominio productivo (`no-reply@spabla.com` o similar) del que se controle DNS. | Registro DNS propio + validación en el proveedor SMTP. |
| 3 | **DKIM** | Ops | Firma DKIM del dominio remitente. Sin DKIM el correo cae a spam en Gmail/Outlook. Añadir CNAME/TXT records según instrucciones del proveedor. | Verificar cabeceras `DKIM-Signature` con `d=<dominio>` y `authentication-results: dkim=pass` en un mail real recibido. |
| 4 | **SPF** | Ops | Registro TXT `v=spf1 include:<proveedor> ~all` en el DNS del dominio remitente. Necesario para que los MX aliados acepten los mensajes. | Verificar `spf=pass` en cabeceras `authentication-results` de un mail real. |
| 5 | **DMARC** | Ops (cuando SPF+DKIM operativos) | Registro TXT `_dmarc.<dominio>` con política `p=quarantine` o `p=reject` alineada con DKIM+SPF. | Verificar `dmarc=pass` + monitor de reportes agregados. |
| 6 | **Plantilla OTP en Cloud Dashboard** | Ops | La plantilla local vive en `supabase/templates/otp_email.html` y se aplica sólo a Supabase local. En Cloud hay que configurar la misma en Auth → Email Templates → Magic Link (o el template al que Supabase mapee el OTP puro). Debe respetar contrato §4 (cero `ConfirmationURL`, sólo `{{ .Token }}`). | Copiar cuerpo, guardar, enviar OTP real, inspeccionar mail entregado. |
| 7 | **`otp_expiry` Cloud recomendado** | Ops | Local usa 60 s (`supabase/config.toml`) para poder probar expiración en CI. Producción recomienda 300 s (contrato §3, audit Q1 §16). Se cambia en Cloud Dashboard → Auth → Email Auth → OTP Expiration. | Aplicar 300 s en Cloud, comprobar comportamiento observable. |
| 8 | **Rate limits Cloud medidos** | Ops + eng | Supabase Cloud aplica quotas propias distintas del local (`GOTRUE_SMTP_MAX_FREQUENCY=1s` local): `over_email_send_rate_limit` a nivel de dirección, `over_request_rate_limit` a nivel de IP. Antes de anunciar OTP a usuarios hay que medir los límites reales para el plan contratado y ajustar UX del cooldown. | Contrato con Supabase para el plan, valores documentados. |
| 9 | **Monitorización** | Ops | Supabase Cloud expone métricas de Auth (peticiones/OTP enviados/errores). Hay que suscribir dashboards internos + alertas para: caída de entregabilidad, subida de 5xx, subida de `over_email_send_rate_limit`. | Panel + alertas activas antes de exponer OTP a usuarios. |
| 10 | **Alertas** | Ops | Route de PagerDuty/OpsGenie para SEV-2 (entregabilidad <90 %), SEV-3 (rate limit sostenido). | Runbook + on-call. |
| 11 | **Entregabilidad** | Ops | Test manual desde 5-10 direcciones de proveedores distintos (Gmail, Outlook, iCloud, Yahoo, Proton, Zoho, mails corporativos). | Reporte de deliverability + inbox rate ≥ 95 %. |
| 12 | **Rebotes y reputación** | Ops | Ver dashboard SES/Postmark de bounces + complaints + reputation score. Alerta si complaint >0.1 % o bounce >2 %. | Threshold configurado, alertas activas. |
| 13 | **Validación productiva** | Producto + Ops | Test end-to-end contra Cloud real, mail real, actor real, con checklist §1-12 verificados. | Rondas manuales documentadas + luz verde de producto y ops. |

**Conclusión**: SPABLA NO está lista para OTP productivo sólo por haber superado la barrera local. Los 13 bloqueos son responsabilidad de Ops (con soporte de Producto para §13) y quedan **fuera del alcance de Q3-R2**. Q3-R2 acota la evidencia local; la producción requiere hito(s) Ops dedicado(s).

## 6 · Resultados verificación (Ronda 1)

Todas contra `supabase db reset --local` fresco:

| Suite | Resultado |
|---|---|
| tsc root | ✓ 0 errores |
| tsc engine | ✓ 0 errores |
| engine vitest | ✓ 1057 passed / 63 skipped (41 archivos) |
| client vitest | ✓ 309 passed / 69 skipped (32 archivos) |
| SQL integration | ✓ SUITES OK |
| onboarding-auth-race | ✓ 3/3 PASS |
| OTP browser E2E (17 tests) | ✓ 17 passed en 3.6m (S16 usando botón productivo) |
| auth-continuity | ✓ 14/14 en 28.1s (§20-10 preservado) |
| onboarding E2E | ✓ 13/13 |
| Aislamiento | ✓ 0 procesos, puerto 3131 libre |
| git diff --check | ✓ 0 conflict markers |
| grep secretos/tokens/OTP/skip/only/retry | ✓ 0 matches |
| Restore drill | ⊘ macOS local (BSD sed) — CI Job C lo cubre |

## 7 · Resultados verificación (Ronda 2)

*Pendiente al momento de escribir esta acta — se ejecuta a continuación y se anota en el reporte final.*

## 8 · Prohibiciones — cero infracciones

- [x] Cero promoción a `spabla-v2/thirteen-languages-activation` (SHA `6a4bb5a` invariante).
- [x] Cero modificación de `main` (SHA `e6128433` invariante).
- [x] Cero Supabase Cloud.
- [x] Cero cambio de arquitectura de sesión.
- [x] Cero cambio del contrato OTP.
- [x] Cero cambio del listener `onAuthStateChange` (que preserva la política B).
- [x] Cero cambio del handler `signOut` (que ya cableaba `resetOnLogout`).
- [x] Cero valor OTP fijo versionado.
- [x] Cero `test.only`, cero `test.skip`, cero `test.fixme`, cero retries.
- [x] Cero `.claude/` tocado.
- [x] Cero llamada directa a `__spablaSupabase.auth.signOut()` desde S16.
- [x] Cero cambio de producto — sólo tests + acta.

## 9 · Handoff

Q3-R2 acredita:
- El logout voluntario funciona correctamente (S16 lo prueba con el botón real).
- Los 3 caminos SIGNED_OUT tienen semánticas distintas por diseño (documentado §2).
- SPABLA no está lista para OTP productivo (13 bloqueos §5).

Ningún hito nuevo iniciado.
