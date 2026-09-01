# SPABLA V2 · Fase 9 · Hito 9.3.2-B · Contrato específico del OTP por email

Fecha de cierre: 2026-08-25
Versión: Q1 (auditoría)
Base: `1c6b26a9e00ca4a4ff4f9ea73b4aae899f03581d` (oficial post-promoción 9.3.2-A)
Fuente de verdad de las mediciones: `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-b-q1-otp-security-audit.md`
Contrato marco: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md`
Contrato del onboarding personal atómico (invariante): `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md`

## §1 · Identidad

- Modalidad principal: OTP de 6 dígitos por email.
- Identificador: email normalizado (cliente-side `email.trim().toLowerCase()`).
- Autoridad del desafío: Supabase Auth (GoTrue v2.195). Prohibida tabla `otp_challenges` propia.
- Convivencia obligatoria con login por email + contraseña.

## §2 · Alcance y exclusiones

Incluye: `signInWithOtp` + `verifyOtp` + session cache SDK + integración con `POST /api/v2/onboarding` promovido en 9.3.2-A.

Excluye: SMS, magic link, passkeys/WebAuthn, OAuth social, teléfono, dispositivos vinculados, multicuenta, apps nativas.

## §3 · Invariantes normativas (fuente: audit Q1 §16)

| Invariante | Valor | Fuente Q1 |
|---|---|---|
| `otp_length` | **6 dígitos** | §2, `GOTRUE_MAILER_OTP_LENGTH` |
| `otp_expiry` producción | **300 s (5 min)** | §6 (balance UX/seguridad) |
| `otp_expiry` test/E2E | **60 s** en proyecto de test | §6 |
| `max_frequency` cooldown SMTP | **60 s** productivo, **1 s** local dev | §7 |
| Cooldown UI (visual) | **60 s** contador; NO barrera de seguridad | §7 |
| Reenvío invalida código anterior | **Sí, server-side** | §7 C |
| Uso único | **Sí, server-side** | §8 K |
| Cross-email verification | **Rechazado 403 `otp_expired`** | §8 F |
| Rate limits Cloud | Ajustables en Dashboard, no en repo | §10 |
| Rate limits locales | `sign_in_sign_ups=30/5min/IP`, `token_verifications=30/5min/IP` | §10 |
| Normalización de email | Cliente-side: `email.trim().toLowerCase()` | §9 T16 |
| `shouldCreateUser` | **Siempre `true`** en `signInWithOtp` | §9 T1 |
| Convivencia password | **Preservada; login password intacto** | §12 |
| Contrato de `/api/v2/onboarding` | **Invariante**: `{tenantId, role, label}` | 9.3.2-A §10 |

## §4 · Plantilla obligatoria del correo

Q2 debe añadir a `supabase/config.toml`:

```toml
[auth.email.template.magic_link]
subject = "Tu código de acceso SPABLA"
content_path = "./supabase/templates/otp_email.html"
```

Y crear `supabase/templates/otp_email.html` con contenido mínimo:

```html
<p>Introduce este código en la pantalla de acceso de SPABLA:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>El código caduca en unos minutos. Si no lo solicitaste, ignóralo.</p>
```

**Prohibido** referenciar `{{ .ConfirmationURL }}` o incluir cualquier enlace clickable en el cuerpo. El default de la CLI 2.113 es magic-link — Q1 lo verificó como defecto bloqueante (audit §4). Q2 corrige.

Para multi-idioma:
- El `subject` es única string por proyecto. Estrategia: subject neutro `"SPABLA: {{ .Token }}"` que porta el código, o mantener castellano y localizar sólo el cuerpo.
- El cuerpo puede tener 13 traducciones y renderizarse por `Accept-Language` en un helper server-side, **si Q2 decide envolver `signInWithOtp` con `/api/v2/auth/otp` propio**. En caso contrario, plantilla única en el idioma por defecto (`en` per contract 9.3.2-A §17-bis 7).

## §5 · API pública (SDK Supabase)

```ts
// Solicitud OTP — SIEMPRE con shouldCreateUser: true
const { error } = await supabase.auth.signInWithOtp({
  email: normalisedEmail,
  options: { shouldCreateUser: true },
});

// Verificación
const { data, error } = await supabase.auth.verifyOtp({
  type: "email",
  email: normalisedEmail,
  token: sixDigitCode,
});
// data.session.access_token válido tras 200
```

## §6 · Alfabeto de errores (cliente)

Recibidos en `verifyOtp` y `signInWithOtp`:

| `error_code` GoTrue | Status | Significado interno | Mensaje público SPABLA |
|---|---|---|---|
| `otp_expired` | 403 | Código incorrecto, caducado, sobrescrito, cross-email, o reusado tras verificar | "El código no es válido. Solicita uno nuevo." |
| `over_email_send_rate_limit` | 429 | Cooldown activo entre envíos | "Espera unos segundos antes de solicitar otro código." |
| `validation_failed` | 400 | Empty string u otro fallo estructural | "Introduce el código de 6 dígitos." |
| `otp_disabled` | 422 | Aparece cuando `shouldCreateUser:false` + email nuevo | **NO debe aparecer**: el cliente siempre usa `shouldCreateUser:true`. Si aparece, log server-side y mensaje genérico. |
| network error / 5xx | — | Infraestructura | "No pudimos enviar el código. Reintenta más tarde." |

## §7 · Convivencia con `/api/v2/onboarding`

- El `access_token` emitido por `verifyOtp` es funcionalmente idéntico al de `signInWithPassword`. `verifyJwt` server-side (JWKS local) lo acepta sin cambios.
- Tras `verifyOtp` exitoso, el cliente invoca `POST /api/v2/onboarding` con `Authorization: Bearer <token>` exactamente como hoy.
- Cero cambio en handler, adaptador, servicio ni RPC. Q2-R3 (`FOR KEY SHARE`) sigue serializando `deleteUser` vs onboarding.
- Los 14 tests Q3-E2E-R (auth-continuity) y 13 tests Q3-R (onboarding E2E) se preservan; Q3-OTP añadirá una barrera E2E adicional específica del flujo OTP.

## §8 · Frontera UI (`OtpForm` — a implementar en Q2)

Requisitos normativos (sin definir implementación):
- Componente separado, no reescribe `LoginForm` password.
- Recibe dependencias inyectables `{signInWithOtp(email), verifyOtp(email, token)}` — permite tests sin SDK real.
- Nunca lee `localStorage` directamente ni cookies.
- Nunca alcanza rutas `/auth/v1/*` hardcoded; sólo el SDK las conoce.
- Aplica normalización cliente-side antes de invocar SDK.
- Muestra input de 6 dígitos con `inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code"`.
- Contador visual de reenvío = 60s **UX** (no barrera; la barrera es server-side).
- Mensajes públicos opacos según §6.
- Cero exposición del código en logs / traces / screenshots / storage adicional.

## §9 · Portabilidad

- Rutas Supabase-específicas encapsuladas en `@supabase/supabase-js`.
- Reemplazo del proveedor requiere sustituir el SDK preservando la superficie `signInWithOtp/verifyOtp`.
- `verifyJwt` server-side depende de JWKS local — cualquier proveedor futuro debe exponer un JWKS compatible ES256.
- `auth.users` schema (PK `id`) es asumido por Q2-R3 row lock. Migrar a proveedor propio requiere preservar esa tabla o adaptar Q2-R3.

## §10 · Threat model resumen (fuente: audit Q1 §14)

Amenazas mitigadas por Supabase o por Q2:
- Reutilización, código anterior, cross-email, race con onboarding, sesiones múltiples, actor eliminado, pestañas concurrentes.

Amenazas mitigadas parcialmente / con riesgo residual documentado:
- Enumeración por status (mitigada con `shouldCreateUser:true`).
- Enumeración por timing (~50ms — residual).
- Brute force por email (limitado por `token_verifications/5min/IP`).

Amenazas de operaciones (bloqueo producción, no implementación):
- Proveedor SMTP con TLS + DKIM/SPF + dominio verificado.
- Rate limits Cloud alineados con proveedor SMTP contratado.
- Monitoring de tasa de intentos fallidos.

Amenazas de plantilla:
- Default CLI 2.113 = magic link (bloqueante Q2 hasta plantilla custom).

## §11 · Checkpoints obligatorios de Q2

Q2 puede declarar GO REVISIÓN sólo si:

1. `supabase/config.toml` incluye `[auth.email.template.magic_link]` con `content_path` a plantilla custom.
2. `supabase/templates/otp_email.html` existe y usa `{{ .Token }}` sin `{{ .ConfirmationURL }}`.
3. `OtpForm` implementado con dependencias inyectables.
4. Normalización cliente-side aplicada antes de cada `signInWithOtp`/`verifyOtp`.
5. `shouldCreateUser: true` en todas las llamadas contractuales.
6. Tests unitarios: `signInWithOtp` felíz, `verifyOtp` felíz, cooldown, código incorrecto, mensaje opaco.
7. Test de integración: OTP real desde Mailpit con `runId`, hash truncado en logs, `DELETE` post-lectura.
8. Test de convivencia: `signInWithPassword` sigue funcionando en el mismo actor tras `verifyOtp`.
9. Cero regresión sobre las 8 suites históricas (§16 orden).
10. `/api/v2/onboarding` invariante (cero cambio de contrato ni implementación).

## §12 · Checkpoints obligatorios de Q3 (E2E)

Q3 debe añadir barrera E2E análoga a las 13 escenarios de 9.3.2-A-Q3-R:

1. Chromium real + Next real + Supabase local con Mailpit.
2. `page.evaluate(() => fetch(...))` para las llamadas SDK (o UI real via clicks).
3. `runId` en emails; helper que consulta Mailpit y redacta el código antes de emitir logs.
4. Escenario nominal: solicita OTP → lee de Mailpit → introduce en UI → recibe sesión → `POST /api/v2/onboarding` → chat.
5. Escenario reenvío: solicita → resenta → verifica que código antiguo falla y nuevo funciona.
6. Escenario código incorrecto: probes 403.
7. Escenario cooldown: dos solicitudes rápidas → 429.
8. Anti-falso-positivo: código nunca aparece en `test-results/`, `playwright-report/`, ni en `console.log`.
9. Convivencia password: paralelo con auth-continuity Q3-E2E-R.

## §13 · Checkpoints exclusivos de producción

No bloquean implementación local; requeridos antes de GO producción:

1. Contratar proveedor SMTP.
2. Configurar `[auth.email.smtp]` en Supabase Cloud Dashboard con credenciales via secrets.
3. Ajustar `[auth.rate_limit]` en Dashboard según capacidad SMTP.
4. Configurar dominio de envío verificado.
5. Configurar plantillas multi-idioma en Cloud (si la estrategia elegida es UI-side).
6. Configurar métricas / alarms de tasa de intentos fallidos.

## §14 · Cierre

Este contrato es autosuficiente para Q2. Se sustenta en mediciones empíricas del audit Q1. NO modifica el plan oficial ni el contrato de onboarding. Cualquier desviación requiere nuevo hito documental antes de codificar.
