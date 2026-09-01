# AUDIT · SPABLA V2 · Hito UX-02 — Integración visual del chat productivo

**Fecha**: 2026-08-31
**Rama**: `spabla-v2/ux-02-integrate-chat-visual`
**Commit de implementación**: `52ecd9d feat(v2): integrate UX-01 visual language into productive chat`

---

## 1. Objetivo del hito

Trasladar el lenguaje visual aprobado en UX-01-R2 (prototipo aislado bajo `app/v2/design/**`) a la superficie productiva `/v2/chat`, sin alterar comportamiento, contratos ni dependencias reales. La cabecera, la barra de idiomas, la timeline traducida y el compositor debían adoptar la paleta, tokens, radios y jerarquía visual promovidos desde el prototipo, manteniendo cada regla productiva byte-idéntica.

## 2. Principio rector

> **UX-01 aporta presentación · `/v2/chat` conserva comportamiento.**

Los componentes productivos siguen siendo la autoridad de sesión, bootstrap, polling, sendMessage, política de idiomas y traducción. UX-02 sólo promueve tokens y aplica estilos sobre estructuras JSX ya existentes. Ningún archivo bajo `app/v2/design/**` puede ser importado por código productivo; el aislamiento se preserva por doc-comments de guardia negativa en cada componente promovido.

## 3. Alcance exacto de archivos (8 paths)

Modificados dentro de `app/v2/chat/**`:
- `app/v2/chat/components/AppHeader.tsx`
- `app/v2/chat/components/ChatPageFrame.tsx`
- `app/v2/chat/components/ConversationHeader.tsx`
- `app/v2/chat/components/LanguageControls.tsx`
- `app/v2/chat/components/MessageComposer.tsx`
- `app/v2/chat/page.tsx`

Nuevos:
- `app/v2/chat/styles.ts` — tokens productivos (`chatColor`, `chatRadius`, `chatSpace`, `chatFont`) promovidos desde UX-01-R2.
- `public/SPABLA_LOGO_HORIZONTAL.png` — único asset autorizado fuera de `app/v2/chat/**` (§ acta de excepción, ver §5).

Balance del commit: **8 files changed, 416 insertions(+), 315 deletions(-)**.

## 4. Cambios visuales integrados

- **Shell (`ChatPageFrame`)**: contenedor `100dvh` en columna con `overflow:hidden`, main centrada `maxWidth: 1080`, fondo blanco sobre superficie alt.
- **AppHeader**: cabecera blanca de una sola marca (sin duplicaciones), logo horizontal transparente sin recortes ni filtros.
- **ConversationHeader**: header-row plano con `borderBottom` (sin card), chip idiomático con flecha cyan (`spablaCyan`), botón de cerrar sesión coral (`spablaCoral`).
- **LanguageControls**: barra clara con `borderBottom`, captions en muted, selectores con radios y tokens uniformes.
- **MessageComposer**: textarea pill (Enter envía · Shift+Enter salto), botón cyan sobre navy, caption y errores humanizados.
- **Timeline (`page.tsx`)**: `flex:1 minHeight:0 overflowY:auto` (scroll propio), burbujas UX-01-R2 (`bubbleSelfBg` cyan / `bubbleOtherBg` gris), separador de traducción con borde punteado / sólido según autoría, meta hora en muted. Los patrones LANG13-03 sobre `<span lang={m.originalLanguage} dir="auto">{m.originalText}</span>` y `<span lang={m.targetLanguage} dir="auto">{m.translation}</span>` se conservan byte-idénticos. Estados de `!canOperate` diferenciados por fase de bootstrap; cuando `!session` la placeholder queda como espacio vacío para no duplicar el mensaje que ya emite `UnauthGate`.

## 5. Asset productivo `SPABLA_LOGO_HORIZONTAL.png`

Durante FASE 1 se detectó que `public/SPABLA_LOGO.png` traía un fondo Negro Profundo baked-in que sobre la nueva cabecera blanca leía como un rectángulo oscuro. Bajo autorización explícita del jefe de proyecto se copió el PNG horizontal transparente (RGBA 2172×724, SHA-1 `3c95db14…`) al espacio productivo:

- Origen (histórico UX-01, intacto): `public/design/spabla-logo-horizontal-provisional.png`.
- Destino productivo (nombre inequívoco): `public/SPABLA_LOGO_HORIZONTAL.png`.

`AppHeader` referencia exclusivamente `src="/SPABLA_LOGO_HORIZONTAL.png"`. Cero código en `app/v2/chat/**` alcanza `/design/` ni `app/v2/design`.

## 6. Validaciones ejecutadas

| Barrera | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 ✅ |
| `app/v2/chat/page.behavioral.test.tsx` | 8 / 8 ✅ |
| `app/v2/design/chat/prototype.behavioral.test.tsx` | 17 / 17 ✅ |
| `app/v2/design/chat/state.test.ts` | 4 / 4 ✅ |
| `engine/src/utils/chat-message-semantics.test.ts` (LANG13-03) | 34 / 34 ✅ |
| `git diff --check` | exit 0 ✅ |

## 7. Gate visual (unauth) en 1440 / 768 / 390 px

Capturas ejecutadas con Chromium (Playwright vendored) sobre `next dev` real. Medición DOM confirmó en las tres vistas:

- Un único `img[alt="SPABLA"]` sirviendo `/SPABLA_LOGO_HORIZONTAL.png`, ~34 px de alto, sin rectángulo ni halo.
- `data-role="productive-brand-header"` con `background: rgb(255,255,255)`.
- Sin `overflow-x` (excedente = 0) en las tres viewports.
- Sin solapamientos; en móvil el chip idiomático baja de línea sin colisión.
- Timeline con `flex:1 + overflowY:auto` medida y funcional.
- Post-restauración: `UnauthGate → OtpForm` renderiza limpio en las tres vistas.

## 8. Regresiones conocidas

Ninguna vigente. Se documenta una regresión detectada y ya corregida durante el gate OTP E2E — ver §9.

## 9. Gate OTP E2E autenticado — reserva LEVANTADA

### 9.1 Gate inicial (2026-08-31) — 4/17

Ejecutado `scripts/e2e/run-otp-browser-e2e.sh` con Docker/Supabase/Mailpit locales operativos.

- **Verdes (4/17)**: S4, S6, S9, S17 (escenarios que no atraviesan el flujo autenticado exitoso).
- **Rojos (13/17)**: S1, S2, S3, S5, S7, S8, S10, S11, S12, S13, S14, S15, S16 — todos con el mismo símbolo `expect(locator).toBeVisible() failed / Timeout: 30000ms / element(s) not found` en `page.locator('section[aria-label="Cabecera de la conversación"]')` (helper `expectAuthenticatedChat`, `e2e/otp-signin.spec.ts:121`).
- **Causa raíz**: en el commit `52ecd9d` (UX-02 FASE 1) se cambió accidentalmente el elemento raíz de `app/v2/chat/components/ConversationHeader.tsx` de `<section aria-label="Cabecera de la conversación">` a `<header … aria-label="Cabecera de la conversación">`. El `aria-label` se preservó, pero el selector CSS del E2E era tag-específico (`section[…]`), rompiendo el contrato observable del landmark autenticado.
- **Clasificación**: regresión de contrato observable introducida por UX-02 (fuera del principio "solo presentación" — la etiqueta HTML de un landmark accesible es contrato productivo).

### 9.2 Corrección quirúrgica (2026-09-01)

- **Commit**: `b32dbbc fix(v2): restore productive conversation header landmark`.
- **Alcance**: exclusivamente restauración de `<section>` / `</section>` en `app/v2/chat/components/ConversationHeader.tsx` (2 ins / 2 del, 1 archivo). Cero cambios en lógica, props, aria-label, textos, estilos, auth, Supabase, bootstrap, polling, idiomas, traducción ni composer.

### 9.3 Revalidaciones estáticas post-fix

| Barrera | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 ✅ |
| `page.behavioral` | 8 / 8 ✅ |
| `prototype.behavioral` | 17 / 17 ✅ |
| `state` | 4 / 4 ✅ |
| LANG13-03 (`chat-message-semantics.test.ts`) | 34 / 34 ✅ |
| `git diff --check` | exit 0 ✅ |

### 9.4 Gate OTP E2E final (2026-09-01) — 17/17

Reejecutado el mismo runner oficial `scripts/e2e/run-otp-browser-e2e.sh` (sin flags, sin mocks, sin bypass, sin credenciales productivas, Docker/Supabase/Mailpit local operativo, mismo mecanismo existente sin modificar):

- **17 / 17 escenarios verdes** en 3.4 min.
- Playwright exit code 0.
- Todos los `expectAuthenticatedChat` localizan el landmark correctamente: S1 1.6s · S2 3.1s · S3 625ms · S4 573ms · S5 1.0m · S6 1.1m · S7 636ms · S8 594ms · S9 33ms · S10 837ms · S11 574ms · S12 2.9s · S13 1.0m · S14 2.9s · S15 819ms · S16 901ms · S17 46ms.

**Reserva formal LEVANTADA**. El requisito operativo previo al merge queda satisfecho por evidencia real: OTP E2E completo verde bajo stack local operativo, mismo runner del proyecto, cero desviación del contrato de auth.

## 10. Confirmación de invariantes preservadas

Ningún cambio en UX-02 alteró:

- Autenticación (Supabase Auth, OTP, password, política `useAuthMethod`).
- Cliente Supabase (`useSupabaseBrowserClient`, `useSyncExternalStore`).
- Bootstrap server-authoritative (`fetchBootstrap`, `bootstrapPhase`).
- Polling (`createPollingRunner`, `POLL_INTERVAL_MS`, guardias actor-scoped).
- Persistencia (fetch `/api/v2/*`, `fetchWithAuthRetry`, `applyAuth401Recovery`).
- Política de idiomas (`UI_LANGUAGE_OPTIONS`, `planPreferenceHydration`, `initialLanguagesFor`, `saveLanguagePreference`).
- Traducción (`translation`, `translationError`, `translationPassthrough`, `humanizeTranslationError`).
- `sendMessage` (idempotencia por `clientMessageId`, retry helper, mismos códigos de error).
- Reglas LANG13-02 (13 idiomas §14) y LANG13-03 (spans `lang={…} dir="auto"`).

Todo lo anterior queda cubierto por barreras deterministas ya verdes y por lectura estructural del `page.tsx` post-cambio.

---

## 11. Custodia de publicación

- **Rama**: `spabla-v2/ux-02-integrate-chat-visual`.
- **Commits del hito (orden cronológico)**: `52ecd9d` (implementación) · `dff9c33` (acta inicial con reserva) · `b32dbbc` (fix landmark) · commit de esta actualización (levantamiento de reserva).
- **NO se ha hecho push · NO se ha hecho merge · NO se ha publicado.**

---

**Estado del hito**: UX-02 CERRADO Y APROBADO TÉCNICAMENTE PARA PRE-MERGE.
