# PREF-ACCEPTANCE · Acta de comprobación integrada del Hito 9.2.4

**Fecha**: 2026-08-14.
**Rama candidata**: `spabla-v2/hito-9-2-4-client-stability`.
**HEAD base auditado**: `03d7773` (fix AUTH-RECOVERY) sobre `e2e5a6e` (fix LINT-9.1) sobre `3c4526c` (plan V1.1) sobre `8947fe1` (base oficial de Fase 9).
**Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_PLAN.md` V1.1 (APROBADO Y CONGELADO), §5.3 PREF-ACCEPTANCE.
**Fuente automatizada**: `lib/v2/client/preference-acceptance.test.ts` (9 tests) + `lib/v2/client/language-preference-store.test.ts` (21 tests) + `lib/v2/client/language-preference-hydration.test.ts` (18 tests).
**Firma del operador**: pendiente de ratificación de Dirección.

---

## §1. Motivación de este acta

El Plan Hito 9.2 V1.1 §5.3 exige que la aceptación integrada de las preferencias locales de idioma se cubra **obligatoriamente** con **orden de preferencia**:

1. Prueba automatizada de navegador.
2. Si la introducción de la dependencia (Playwright, Puppeteer, o similar) resulta desproporcionada para el alcance del hito — a juicio documentado de la implementación y ratificado por Dirección —, la aceptación puede cerrarse mediante **prueba manual controlada y documentada** (acta firmada por el operador con precondiciones, pasos, resultado y capturas).

Esta implementación adopta la **modalidad mixta permitida por §5.3**:

- Los invariantes **semánticos** del checklist (§5.3 puntos 1–8) están cubiertos por 9 tests deterministas en `lib/v2/client/preference-acceptance.test.ts`, ejecutados por el runner cliente (`npm run test:client`) integrado en CI Job A. Estos tests ejercitan las mismas funciones puras (`saveLanguagePreference`, `loadLanguagePreference`, `planPreferenceHydration`) que consume `app/v2/chat/page.tsx` en producción, con `MinimalStorage` inyectado. La lógica de aislamiento por actor, la degradación silenciosa ante `storage=unavailable`, y el ciclo A→B→A quedan blindados por assertions unitarias.
- Las verificaciones **visuales** que sólo un humano frente al navegador puede firmar (recarga real de página, logout/login vía UI, ausencia de tráfico saliente hacia `api.openai.com` en la pestaña Network) se cubren con este acta.

**Justificación para no añadir Playwright/Puppeteer en 9.2.4**: la orden operativa del hito prohíbe explícitamente introducir frameworks E2E en esta ejecución («No añadir Playwright, Puppeteer ni otra dependencia de navegador en esta ejecución»). La combinación cobertura automatizada + acta manual respeta el plan V1.1.

---

## §2. Precondiciones operativas

Antes de ejecutar el acta, el operador debe verificar:

1. Repositorio en `/Users/davidlencina/SPABLA`, rama activa `spabla-v2/hito-9-2-4-client-stability`, working tree limpio.
2. Stack Supabase local `spabla-hito-8-2-local` sano (`docker ps | grep supabase`).
3. `.env.development.local` **NO** debe contener `OPENAI_API_KEY` con un valor real productivo. Para esta acta se **omite** por completo (proveedor bloqueado de forma determinista → cualquier intento de traducción devolvería `openai_key_missing`).
4. `SPABLA_V2_ENABLE_DEV_SEED=1` habilitado localmente (para poder crear el seed fixture desde la UI).
5. `NODE_ENV=development` (por defecto en `next dev`).
6. Conversación fixture **vacía**: si el fixture demo actual contiene mensajes (por ejemplo 64 detectados en la ejecución del Hito 9.2.3), el operador debe:
   - Ejecutar `POST /api/v2/seed` una vez para regenerar el fixture. Alternativamente, `admin_purge_usage_by_tenant` sobre el tenant demo antes del acta y una limpieza manual limitada al fixture.
   - Verificar `SELECT count(*) FROM spabla_v2.messages` = 0 sobre la conversación fixture antes de continuar.
7. Contador snapshot **antes**: `SELECT count(*) FROM spabla_v2.message_translations` = N_before.

---

## §3. Pasos manuales controlados

Todos los pasos se ejecutan en **Chrome desktop local**, con la pestaña **Network** abierta filtrando por `api.openai.com` (debe permanecer vacía durante todo el acta).

### §3.1 Ciclo Actor A (§5.3 puntos 1–3)

| Paso | Acción | Verificación |
|---|---|---|
| A.1 | Abrir `http://localhost:3000/v2/chat` sin sesión. | La página carga; se muestra el bloque `SessionArea` con los campos de sign-in. |
| A.2 | Ejecutar `POST /api/v2/seed` desde el `DeveloperPanel` (dev only). | Response 200 con `{tenantId, conversationId, actorA, actorB}`. Preferencias del navegador NO alteradas. |
| A.3 | Sign-in con `actorA.email` / `actorA.password`. | UI muestra los selectores; por D1 aparecen `es/es` (defaults canónicos si no hay preferencia guardada). |
| A.4 | Cambiar «Yo escribo en» a **Català**. | Selector se actualiza; DevTools → Application → Local Storage muestra clave `spabla_v2:language-preferences:v1:<actorA.actorId>` con valor `{"myLanguage":"ca","targetLanguage":"es"}`. |
| A.5 | Cambiar «Leer mensajes en» a **Deutsch**. | Valor actualizado a `{"myLanguage":"ca","targetLanguage":"de"}`. |
| A.6 | **Recargar la página** (Cmd+R). | Los selectores vuelven exactamente a **Català / Deutsch**; no hay flicker a `es/es` ni a los defaults del seed. |
| A.7 | Sign-out por el botón de la cabecera. | La sesión se cierra; se muestra `SessionArea` de nuevo. La clave `spabla_v2:language-preferences:v1:<actorA.actorId>` **sigue presente** en localStorage con el valor previo. |
| A.8 | Sign-in de nuevo con `actorA.email` / `actorA.password`. | Los selectores vuelven a mostrar **Català / Deutsch**. |

### §3.2 Ciclo Actor B (§5.3 puntos 4–5)

| Paso | Acción | Verificación |
|---|---|---|
| B.1 | Sign-out del actor A. | Preferencia de A conservada. |
| B.2 | Sign-in con `actorB.email` / `actorB.password`. | Selectores muestran los defaults canónicos del seed (por D1). NO muestran `Català / Deutsch` (aislamiento). |
| B.3 | Cambiar a **Português / Français**. | Nueva clave `spabla_v2:language-preferences:v1:<actorB.actorId>` creada con `{"myLanguage":"pt","targetLanguage":"fr"}`. La clave de A permanece intacta. |
| B.4 | Recargar. | Selectores permanecen en **Português / Français**. |

### §3.3 Vuelta a Actor A (§5.3 punto 6)

| Paso | Acción | Verificación |
|---|---|---|
| C.1 | Sign-out de B. | Ambas claves persisten en localStorage. |
| C.2 | Sign-in como A. | Selectores vuelven a **Català / Deutsch** — exclusivamente el par de A. |

### §3.4 Storage bloqueado (§5.3 punto 7)

| Paso | Acción | Verificación |
|---|---|---|
| D.1 | Abrir una **ventana privada** de Chrome (o Firefox con storage bloqueado por política). | La UI carga sin errores visibles. |
| D.2 | Sign-in con actor A. | Selectores caen a **defaults canónicos** (`es/en` por seed). No aparece banner de error. |
| D.3 | Cambiar selectores a **Català / Deutsch**. | Los selectores cambian en memoria pero NO se persiste (el `saveLanguagePreference` es un no-op silencioso). |
| D.4 | Recargar. | Vuelve a defaults canónicos. **La UI sigue operativa** (input de mensaje activo, envío disponible). |

### §3.5 Cero llamadas a OpenAI (§5.3 punto 8)

- **Durante todo el acta**, la pestaña Network filtrada por `api.openai.com` debe permanecer **vacía**. Cualquier request es un fallo del acta.
- **Contador post-acta**: `SELECT count(*) FROM spabla_v2.message_translations WHERE tenant_id = <fixture tenantId>` debe ser **igual a N_before** — cero filas nuevas.
- Los cambios de idioma no envían mensajes (§5.3 «no depender de mensajes históricos»); por diseño, sólo el envío explícito de un mensaje al cambiar target podría disparar cache-miss y llamada al proveedor. **El acta no envía mensajes**.

---

## §4. Cobertura automatizada equivalente

| Checklist §5.3 | Test determinista |
|---|---|
| 1. Actor A guarda ca/de | `preference-acceptance.test.ts` (1) + `store.test.ts` «persists and recovers both languages» |
| 2. Recarga lógica recupera ca/de | `preference-acceptance.test.ts` (2) — planner sobre storage con preferencia guardada |
| 3. Logout/login del mismo actor conserva ca/de | `preference-acceptance.test.ts` (3) — planner devuelve noop en logout y recupera en re-login |
| 4. Actor B guarda pt/fr | `preference-acceptance.test.ts` (4) + `store.test.ts` «isolates actor A from actor B» |
| 5. B NO recibe ca/de | `preference-acceptance.test.ts` (5) — planner de B devuelve pt/fr, no ca/de |
| 6. Vuelta a A recupera ca/de | `preference-acceptance.test.ts` (6) — ciclo A→B→A completo |
| 7. Storage unavailable degrada a defaults | `preference-acceptance.test.ts` (7) + (7-bis) — planner aplica defaults + save silent no-op |
| 8. Cero llamadas a OpenAI | `preference-acceptance.test.ts` (8) — mock global `fetch` throws si el planner intenta usarlo |

Los 9 tests corren en cada CI Job A. La acta manual queda subordinada a que Dirección ratifique que los ítems D.1–D.4 y §3.5 son las únicas verificaciones que requieren observador humano.

---

## §5. Resultado del acta

**Formato**: el operador (o Dirección) que ejecute el acta rellenará esta tabla con la fecha, la observación y su firma. Sin firma la acta es una propuesta; con firma es evidencia auditable del cumplimiento §5.3.

| Sección | Ejecutado el | Resultado | Firma |
|---|---|---|---|
| §3.1 Ciclo Actor A | | | |
| §3.2 Ciclo Actor B | | | |
| §3.3 Vuelta a Actor A | | | |
| §3.4 Storage bloqueado | | | |
| §3.5 Cero llamadas a OpenAI | | | |

---

## §6. Cumplimiento de prohibiciones

- Cero conexión a Supabase productivo.
- Cero llamada a OpenAI.
- Cero envío de mensajes.
- Cero modificación manual de `localStorage` desde DevTools como criterio de aceptación (todas las escrituras se hacen a través de la UI real; DevTools se usa **sólo** como observador de las claves, no como productor).
- Cero reutilización de conversaciones con mensajes históricos (§2 precondiciones exige conversación vacía).
- Cero borrado destructivo (sin `supabase db reset`, sin `docker volume rm`).
- Cero credencial productiva o `service_role` expuesta al navegador.
