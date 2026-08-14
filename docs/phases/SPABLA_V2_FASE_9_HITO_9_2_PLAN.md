# SPABLA V2 — Fase 9 — Plan Hito 9.2

**Experiencia visible y estabilidad del cliente**

**Tipo**: Plan de hito (retrospectivo consolidado 9.2.1–9.2.3 + apertura autorizada del 9.2.4).
**Versión**: V1.0 — Propuesta para aprobación de Dirección.
**Fecha**: 2026-08-14.
**Estado**: PROPUESTO. NO CONGELADO. NO AUTORIZA IMPLEMENTACIÓN.
**Rama documental**: `spabla-v2/plan-hito-9-2-4-client-stability`.
**Rama oficial de fase**: `spabla-v2/thirteen-languages-activation`.
**HEAD base**: `8947fe13e0fff1f390bfd6bb265e0ac9cb302739`.
**Plan padre de Fase 9**: `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1 (APROBADO Y CONGELADO).
**ADRs gobernantes**: ADR-003 (Estratégica), ADR-005 (Catálogo de idiomas), ADR-008 (Persistencia y multi-tenancy).
**Estándares transversales**: `docs/SPABLA_V2_DOCUMENTATION_STANDARD.md`, `docs/standards/SPABLA_V2_CODE_STANDARD.md`, `docs/standards/SPABLA_V2_RELEASE_STANDARD.md`.
**Autoridad**: Este documento no autoriza por sí solo la implementación del Hito 9.2.4. La autorización sólo puede emitirla Dirección mediante orden operativa posterior.

---

## §0. Historial de versiones

- **V1.0 — 2026-08-14**: propuesta inicial. Consolida retrospectivamente los Hitos 9.2.1, 9.2.2 y 9.2.3 (todos cerrados y promocionados) y define el alcance autorizado del futuro Hito 9.2.4 «Client Stability Gate». PROPUESTO PARA APROBACIÓN DE DIRECCIÓN.

---

## §1. Propósito

Consolidar en un único documento normativo el bloque de hitos 9.2.x de Fase 9, cerrar la deuda de estabilidad conocida del cliente SPABLA V2 y establecer la puerta de calidad (`Client Stability Gate`) que debe cruzar el chat antes de que Dirección autorice ampliaciones de producto — multi-conversación, invitaciones, Realtime, SDK público.

Este plan no describe la implementación paso a paso. Fija alcance, invariantes, matriz de pruebas y criterios objetivos de cierre. La implementación queda diferida a una orden operativa posterior de Dirección.

---

## §2. Contexto

- La rama oficial `spabla-v2/thirteen-languages-activation` acumula, sobre la promoción de los siete atómicos LANG13-01…07 (Plan LANG13 V1.1, APROBADO Y CONGELADO), tres hitos ejecutivos abiertos por órdenes operativas de Dirección sin plan formal previo: 9.2.1 (shell corporativo), 9.2.2 (componentes reales de conversación) y 9.2.3 (preferencias locales de idioma por actor).
- El único documento formal de Fase 9 hasta ahora es `SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md`, cuyo §37 declara literalmente que su aprobación no autoriza «la apertura arbitraria de un nuevo hito». Este Plan de Hito 9.2 sana esa laguna documental al consolidar los tres hitos ya cerrados y al fijar por escrito el alcance del siguiente.
- El trabajo de instrumentación contable del proveedor de traducción (`usage_ledger.provider_call`) fue **aplazado explícitamente por Dirección** tras el informe adversarial. NO es un Hito 9.2.3 alternativo. Se registra como deuda **OBS-PROVIDER** (§4.4) y queda fuera del alcance del 9.2.4.
- La rama oficial mantiene main intacta en `e6128433d42e1e105529ed2f64212ca527034b6a` desde el cierre de Fase 8.

---

## §3. Alcance del documento

Este documento cubre exclusivamente:

1. Historial consolidado y ya cerrado de los Hitos 9.2.1, 9.2.2 y 9.2.3 (§4).
2. Alcance autorizado del futuro Hito 9.2.4 «Client Stability Gate» (§5).
3. Trabajo expresamente fuera de alcance del 9.2.4 (§6).
4. Invariantes protegidas por el 9.2.4 (§7).
5. Matriz mínima de pruebas del 9.2.4 (§8).
6. Criterio objetivo de cierre del 9.2.4 (§9).
7. Orientación no autorizada sobre el bloque productivo posterior (§10).
8. Procedimiento de aprobación e implementación del 9.2.4 (§11).

Este documento **no** cubre ni autoriza:

- El diseño ni la implementación de multi-conversación, directorio de usuarios, invitaciones, Realtime, SDK público, contable de proveedor, upgrade de dependencias V1 legacy, migraciones productivas.
- Cambios visuales o rediseños de UI ajenos a corregir errores de estabilidad.
- Ninguna decisión estratégica que corresponda a un ADR nuevo.

---

## §4. Historial consolidado (9.2.1 – 9.2.3)

Los tres hitos siguientes están **cerrados y promocionados a la rama oficial**. Este bloque los registra sin alterar la historia y sin renumerar.

### §4.1 Hito 9.2.1 — Shell corporativo SPABLA

- **Objetivo**: introducir la envoltura visual estable (`AppHeader`, `ChatPageFrame`, `ChatSection`) que aloja el chat de Fase 9 sin acoplar componentes productivos al pixel-perfect anterior.
- **SHAs**: `c2884c2` (feat) + `01d736b` (test).
- **CI oficial**: incluido en el histórico previo a `31737965653`.
- **Estado**: **CERRADO Y PROMOCIONADO**.
- **Contratos afectados**: sólo composición visual en `app/v2/chat/components/`. Sin cambios en engine, en API HTTP ni en persistencia.

### §4.2 Hito 9.2.2 — Componentes reales de conversación

- **Objetivo**: descomponer la conversación en componentes presentacionales explícitos (`ConversationHeader`, `LanguageControls`, `MessageComposer`, `SessionArea`, `DeveloperPanel`) preservando literales locked de LANG13-02 y LANG13-03.
- **SHAs**: `9cc0d89` (feat) + `3474d53` (fix compact unauthenticated).
- **CI oficial**: verde en el push que dejó la rama en `3474d53`.
- **Estado**: **CERRADO Y PROMOCIONADO**.
- **Contratos afectados**: `app/v2/chat/page.tsx` y `app/v2/chat/components/*.tsx`. Timeline JSX preservado inline en `page.tsx` para respetar los locks de `engine/src/utils/chat-message-semantics.test.ts`. Sin cambios en engine, API HTTP ni persistencia.

### §4.3 Hito 9.2.3 — Preferencias locales de idioma por actor

- **Objetivo**: persistir `myLanguage` y `targetLanguage` por actor en el navegador (localStorage) de forma que sobrevivan a recargas y a re-inicios de sesión del mismo actor en el mismo dispositivo, con degradación silenciosa ante storage bloqueado, y sin filtrar preferencias entre actores.
- **SHAs**: `d4ec4e7` (feat) + `8947fe1` (fix carrera pending→available).
- **CI oficial**: run `31821933661` — `success` (Jobs A, B, C).
- **Estado**: **CERRADO, PROMOCIONADO Y VERDE**.
- **Único Hito 9.2.3 reconocido en el proyecto.** No se reconoce ningún «Hito 9.2.3» alternativo asociado a `usage_ledger.provider_call`; ese trabajo se aplazó explícitamente por Dirección y se registra en §4.4 como deuda OBS-PROVIDER.
- **Contratos añadidos**: `lib/v2/client/ui-languages.ts`, `lib/v2/client/language-preference-store.ts`, `lib/v2/client/language-preference-hydration.ts`, sus tests. Runner cliente mínimo (`vitest.client.config.ts` + script raíz `test:client` + step añadido a Job A). Cero migraciones, cero cambios en API HTTP, cero cambios en engine productivo.
- **Cierra la deuda §35** del Plan LANG13 V1.1 «Preferencias persistentes cross-session: aplazado».

### §4.4 Deuda OBS-PROVIDER — Observabilidad durable del proveedor

- **Descripción**: observabilidad durable, reconciliación y cálculo de consumo del proveedor de traducción (tokens, intentos, coste ex-post con tarifa versionada, retención, atribución tenant/actor, seguridad de RPC, relación con `usage_ledger`).
- **Estado**: **APLAZADO POR DIRECCIÓN**. No es un hito; es una deuda futura pendiente de que Dirección autorice un plan formal cuando exista tráfico productivo o requisito contable formal.
- **Fuera del Hito 9.2.4** (§6).
- **Diseño previo entregado**: el informe adversarial que documenta modelos A/B/C, la máquina de estados `provider_attempts`, la relación con `usage_ledger.provider_call` y las diez decisiones pendientes queda como material técnico de partida cuando Dirección decida abrir esa deuda.

---

## §5. Hito 9.2.4 — Client Stability Gate (alcance autorizado)

El futuro Hito 9.2.4 autorizará exclusivamente tres frentes de trabajo, mutuamente compatibles y de alcance cerrado. Ningún frente introduce funciones de producto nuevas.

### §5.1 LINT-9.1 — Cliente V2 sin errores de lint

- **Objetivo**: eliminar los errores `react-hooks/set-state-in-effect` presentes en `app/v2/chat/page.tsx`. El baseline al abrir el hito documenta **6 errores** (líneas 116, 145, 236, 258, 297, 309 respecto a `HEAD = 8947fe1…`), evolución de los 4 originales de LANG13 §35 más 2 introducidos por Hito 9.2.3 en el efecto de hidratación y en el efecto de reset al logout. Además, existen **2 warnings** `@typescript-eslint/no-unused-vars` en `lib/v2/client/language-preference-hydration.test.ts` (líneas 5 y 368) que deben cerrarse en el mismo hito.
- **Resultado exigido**: `npx eslint app/v2 lib/v2` termina con **cero errores y cero warnings** dentro de `app/v2/**` y `lib/v2/**`.
- **Prohibido**:
  - Desactivar reglas de ESLint globalmente.
  - Añadir `eslint-disable-*` con o sin comentario justificativo.
  - Modificar archivos de V1 (`app/chat/**`, `app/call/**`, `app/api/translate/**`, `server/**`, etc.) salvo dependencia demostrable directamente del cambio autorizado.
  - Cambiar comportamiento visible existente.
  - Introducir nuevas librerías o dependencias.
- **Aproximación técnica preferida**: mover las llamadas `setState` fuera del cuerpo del efecto usando el patrón oficial de React 19 (extraer a función pura, usar reducer o `useSyncExternalStore` cuando la fuente sea externa, o consolidar el estado derivado con `useMemo`/valores calculados en render). La decisión concreta por caso pertenece a la implementación; el plan sólo obliga a que el resultado sea semánticamente equivalente al comportamiento actual y a que la nueva forma no introduzca regresiones en las suites verdes.

### §5.2 AUTH-RECOVERY — Recuperación determinista de autenticación

- **Objetivo**: diagnosticar y cerrar los caminos actuales de recuperación ante sesión ausente, token caducado o token inválido, garantizando que:
  - **No se producen bucles de respuestas 401** ni loops de polling infinito.
  - **No se muestran datos de otra sesión ni de otro actor** durante la transición (regresión potencial ya cubierta parcialmente en Hito 9.1.1 con `sessionExpiredRef` y drop de `actorId` divergente en `fetchMessages`).
  - **No se borran las preferencias locales de idioma persistidas por el Hito 9.2.3.**
  - La UX ante expiración es determinista: el usuario recibe un aviso claro y una vía de recuperación única.
- **Estado actual documentado**: deuda §35 del Plan LANG13 V1.1 «AUTH-RECOVERY: recuperación 401 sin prueba destructiva end-to-end». El comportamiento actual del cliente incluye la clasificación en `engine/src/utils/polling-response-classifier.ts`, el `sessionExpiredRef` de `page.tsx`, el `signOut({scope:"local"})` tras 401, y el runner de polling con `createPollingRunner`. Falta prueba destructiva end-to-end.
- **Salida técnica no impuesta**: este plan **no** decide todavía si la recuperación final es (a) refresh silencioso de token vía Supabase Auth, (b) cierre de sesión controlado + prompt de re-autenticación, (c) nueva autenticación forzada, u otra vía. La elección corresponde a la inspección técnica durante la implementación, siempre que respete las prohibiciones anteriores.
- **Prueba automatizada obligatoria**: al menos una prueba determinista que reproduzca la transición «sesión válida → token invalidado → intento de fetch → recuperación» sin bucles, sin fugas de estado y sin borrado de preferencias. La prueba **debe usar Supabase local** (`spabla-hito-8-2-local`) o, alternativamente, un fake determinista del cliente Supabase Auth. **Prohibido** usar Supabase productivo en cualquier fase.

### §5.3 PREF-ACCEPTANCE — Aceptación integrada de preferencias

- **Objetivo**: verificar operativamente el flujo completo de preferencias locales del Hito 9.2.3 en un entorno real (`Next dev` + Supabase local) sin coste al proveedor y sin depender de conversaciones con mensajes históricos.
- **Escenarios a cubrir**:
  1. Actor A selecciona un par claramente distinto (por ejemplo `ca / de`), recarga la página, cierra sesión y vuelve a iniciar sesión como A — recupera exactamente su preferencia.
  2. Actor B, en sesión separada, selecciona otro par (`pt / fr`), recarga y confirma persistencia.
  3. Vuelta a Actor A: sigue recuperando `ca / de` (no se contamina con la preferencia de B).
- **Restricciones operativas**:
  - **Cero llamadas a OpenAI**. La prueba de `targetLanguage` sólo puede cambiarse contra combinaciones que ya estén en caché de `spabla_v2.message_translations` para la conversación usada, o bien contra una **conversación local vacía**. En su defecto, contra un **proveedor bloqueado de forma determinista** (fake local o env `OPENAI_API_KEY` intencionalmente ausente + captura del error `openai_key_missing` sin producir traducción).
  - **Prohibido** depender de una conversación con mensajes históricos que fuerce cache-miss en un idioma no persistido (bloqueo aplicado ya en el propio Hito 9.2.3 por presencia de 64 mensajes en la conversación demo local).
  - **Prohibido** aceptar como criterio final la modificación manual de `localStorage` desde DevTools; debe ejercerse a través de la UI real.
- **Automatización preferida**: si la infraestructura del proyecto permite añadir una prueba de navegador headless sin introducir una dependencia desproporcionada, la implementación **debe** proponerla. La elección de herramienta (Playwright, Puppeteer, o similar) y la decisión de instalarla como devDependency raíz queda expresamente a discreción de la implementación, condicionada a autorización de Dirección durante la orden operativa. Si esa autorización no se concede, la aceptación puede quedar cubierta por (i) los tests deterministas ya presentes en `lib/v2/client/language-preference-store.test.ts` y `language-preference-hydration.test.ts` más (ii) una acta de prueba manual firmada por el operador que cumpla las restricciones anteriores.

---

## §6. Fuera de alcance del Hito 9.2.4

Se declara expresa e inequívocamente **fuera del alcance**:

- Nuevos códigos de idioma (más allá de los 13 activados por LANG13-02).
- Detección automática de idioma o cambio silencioso del idioma seleccionado por el usuario.
- Cambios visuales o rediseño ajenos a corregir errores de estabilidad.
- Multi-conversación.
- Directorio de usuarios.
- Invitaciones a otros usuarios.
- Modelo de participantes por conversación (`conversation_participants` o análogo).
- Realtime Supabase — publicación, suscripción, sustitución del polling.
- Sustitución del polling actual (1,5 s) por cualquier alternativa.
- SDK público `@spabla/sdk` (Fase 9 arquitectónica de ADR-003 §11).
- Instrumentación `usage_ledger.provider_call` — mantenida como deuda OBS-PROVIDER (§4.4).
- Upgrade de dependencias V1 legacy (`socket.io`, `engine.io`, `ws`) — mantenida como deuda SEC-DEPS de LANG13 §35.
- Migraciones productivas o cambios en `spabla_v2` schema, RLS, grants o funciones SECURITY DEFINER.
- Conexión a Supabase productivo desde cualquier fase de implementación o prueba.
- Cualquier modificación de `main`.
- Cualquier nueva función de producto no explícitamente listada en §5.

---

## §7. Invariantes protegidas

La implementación del Hito 9.2.4 **debe preservar íntegramente** los siguientes invariantes. Cualquier cambio que los rompa invalida el hito.

### §7.1 Contratos de dominio

- Los **13 idiomas UI canónicos** definidos en `lib/v2/client/ui-languages.ts` (orden Plan LANG13 V1.1 §14, etiquetas byte-idénticas §8).
- El catálogo técnico de 55 códigos ISO 639-1 congelado por ADR-005 §5.
- La marca `CURRENT_TRANSLATION_VERSION = "v2"` en `lib/v2/server/translation-runtime.ts`.
- La cache-key `(tenant_id, message_id, target_language, translation_version)` de `spabla_v2.message_translations`.
- El contrato public de `PersistencePort` y el patrón single-flight + caché servidos por `SupabaseTranslationStore` + `resolveTranslatedMessages`.

### §7.2 Aislamiento y seguridad

- **Actor-scope** de las preferencias locales: la clave `spabla_v2:language-preferences:v1:<actorId>` y su valor `{myLanguage, targetLanguage}` — sin ampliaciones — introducidos por Hito 9.2.3.
- La separación **tenant / actor** vigente en `TenantContext` y en el sistema de membresías activo (ADR-008).
- La política RLS existente sobre `spabla_v2.*` (Fase 8 · Hito 8.2, migración `20260730160000_phase8_bootstrap.sql`).
- La compatibilidad UI-observable de `/v2/chat`, incluyendo los locks textuales de LANG13-02 (orden de los 13 idiomas) y LANG13-03 (`<span lang={m.originalLanguage} dir="auto">` y su análogo para la traducción).

### §7.3 Presupuesto y coste

- **Cero llamadas reales a OpenAI** durante cualquier fase de implementación o de tests del Hito 9.2.4.
- Cero secretos en el navegador, en logs o en el repositorio.
- Cero conexión a Supabase productivo desde ninguna fase del hito.

### §7.4 Suites de tests como salvaguarda

- La suite engine debe permanecer, como mínimo, en **1057 passed / 62 skipped / 0 failed** frente al baseline actual del cierre 9.2.3.
- La suite cliente (`npm run test:client`) debe permanecer, como mínimo, en **39 passed** frente al baseline actual, admitiendo crecimiento por los tests nuevos que el hito introduzca en AUTH-RECOVERY y PREF-ACCEPTANCE.
- No se autoriza el borrado ni el skip de ningún test verde existente.

---

## §8. Matriz mínima de pruebas del Hito 9.2.4

### §8.A Verificaciones estáticas

- `git diff --check` limpio.
- `npx tsc --noEmit -p tsconfig.json` exit 0.
- `cd engine && npx tsc --noEmit` exit 0.
- **`npx eslint app/v2 lib/v2` con cero errores y cero warnings** (exigencia LINT-9.1).
- `npm run build` verde (12/12 rutas).

### §8.B Suite cliente (`npm run test:client`)

- Los 39 tests deterministas actuales (21 store + 18 hydration) continúan verdes.
- Nuevos tests de recuperación de autenticación AUTH-RECOVERY (mínimo uno determinista).
- Nuevos tests integrados de preferencia por actor PREF-ACCEPTANCE, si la aproximación elegida permite automatizarlos sin introducir dependencia desproporcionada.

### §8.C Suite engine (`cd engine && npx vitest run`)

- 1057 passed, 62 skipped (máximo aceptable), 0 failed.
- Crecimiento admisible únicamente por tests nuevos que documenten explícitamente una invariante del hito.

### §8.D Supabase local (Job B)

- Job B «Supabase integration» verde en CI.
- **Cero conexión a Supabase remoto** desde el flujo local o de CI del hito.
- **Verificación operativa** de que un 401 no entra en bucle: bien como test determinista en la suite cliente (fake del cliente Supabase), bien como prueba destructiva en el engine sobre el stack local. La forma exacta la elige la implementación; el plan exige que quede cubierta.

### §8.E CI oficial

- Job A — engine + Client Vitest: verde.
- Job B — Supabase integration: verde.
- Job C — phase-8 restore drill: verde.

---

## §9. Criterio objetivo de cierre del Hito 9.2.4

El Hito 9.2.4 sólo podrá considerarse cerrado y proponerse a promoción cuando se cumplan **todos** los siguientes puntos, sin excepción y verificados en la rama candidata:

1. **Cero errores** y **cero warnings** de lint en `app/v2/**` y `lib/v2/**` (`npx eslint app/v2 lib/v2`).
2. Recuperación **AUTH probada de forma determinista** por al menos una prueba automatizada nueva, contra Supabase local o fake — nunca productivo.
3. **Cero bucle de respuestas 401** demostrado por la prueba anterior o por prueba destructiva análoga.
4. Las preferencias del Actor A **sobreviven recarga y nueva sesión** del mismo actor en el mismo navegador.
5. Las preferencias del Actor B **permanecen aisladas** — cambio de actor no filtra estado ni escritura.
6. **Cero llamadas a OpenAI** durante toda la fase de implementación y de pruebas del hito.
7. TypeScript raíz, TypeScript engine, `npm run test:client`, `cd engine && npx vitest run` y `npm run build` **todos verdes**.
8. CI oficial completo con los tres Jobs (A, B, C) en verde.
9. **Revisión manual únicamente si aporta evidencia no cubierta por la automatización**; toda prueba manual queda documentada como acta con precondiciones y resultado.

Cualquier incumplimiento parcial obliga a REQUIRE CORRECCIÓN antes de proponer promoción.

---

## §10. Orientación no autorizada sobre el siguiente bloque productivo

**No autoriza implementación. Registro orientativo únicamente.**

Tras el cierre del Hito 9.2.4, Dirección evaluará abrir un bloque productivo de experiencia de conversación segura, cuya arquitectura deberá resolver antes de cualquier UI:

- Modelo formal de **participantes por conversación** (`conversation_participants` o análogo), superior al mecanismo actual «cualquier miembro del tenant ve cualquier conversación».
- Definición de **permisos por conversación** (roles, invitaciones aceptadas, expulsiones).
- Separación **tenant / conversation** más granular en RLS: hoy `spabla_v2.messages` sólo comprueba membresía activa en el tenant, sin acotar por conversación.
- Modelo de **creación y apertura de conversaciones** desde la UI del cliente (endpoints, formularios, flujo de invitación).
- Análisis explícito del **riesgo de que cualquier miembro del tenant pueda leer cualquier conversación** en el estado actual y decisión sobre cómo mitigar antes de exponer directorio o invitaciones a producción.

Este bloque **no se diseña ni se implementa en el Hito 9.2.4**. Requiere ADR previa cuando Dirección lo autorice.

---

## §11. Procedimiento de aprobación e implementación

### §11.1 Aprobación de este Plan

1. Este documento se propone en V1.0. Su aprobación por Dirección lo congela materialmente; cambios posteriores exigen V1.1, V2.0, etc., con historial explícito en §0.
2. La aprobación autoriza a Dirección a emitir una **orden operativa posterior** que abra el Hito 9.2.4 sobre la rama oficial. Ninguna implementación puede empezar antes de esa orden.

### §11.2 Implementación autorizada (futura, no ahora)

Cuando Dirección autorice el 9.2.4, la implementación deberá:

1. Crearse desde el HEAD oficial vigente en el momento de la autorización.
2. Ejecutarse en una **rama de trabajo** con nombre asignado por Dirección (patrón `spabla-v2/9.2.4-*`).
3. Producir commits atómicos con mensaje descriptivo por cada frente (LINT-9.1, AUTH-RECOVERY, PREF-ACCEPTANCE), sin `--amend`, sin rebase, sin squash, sin force, sin tags.
4. Alcanzar CI verde (Jobs A, B, C) antes de proponer promoción.
5. Promocionar a la rama oficial `spabla-v2/thirteen-languages-activation` únicamente mediante **fast-forward** (`git merge --ff-only`).
6. Conservar la rama de trabajo tras la promoción. No borrarla. No tocar `main`.

### §11.3 Prohibiciones vigentes durante la implementación futura

- Cero ampliación de dependencias no expresamente autorizada por Dirección en la orden operativa.
- Cero llamada a OpenAI real.
- Cero conexión a Supabase productivo.
- Cero cambio en `main`.
- Cero cambio en migraciones aplicadas, en RLS ni en policies existentes.
- Cero apertura de otro hito de Fase 9 bajo esta autorización.

---

## Anexo A — Índice de identificadores del Plan

- **Plan**: `SPABLA_V2_FASE_9_HITO_9_2_PLAN.md` V1.0.
- **Rama documental**: `spabla-v2/plan-hito-9-2-4-client-stability`.
- **HEAD base**: `8947fe13e0fff1f390bfd6bb265e0ac9cb302739`.
- **Hitos consolidados**: 9.2.1 (`c2884c2` + `01d736b`), 9.2.2 (`9cc0d89` + `3474d53`), 9.2.3 (`d4ec4e7` + `8947fe1`, CI `31821933661`).
- **Hito futuro autorizable**: 9.2.4 «Client Stability Gate».
- **Frentes del 9.2.4**: LINT-9.1, AUTH-RECOVERY, PREF-ACCEPTANCE.
- **Deudas registradas**: OBS-PROVIDER (aplazada por Dirección), SEC-DEPS (V1 legacy, fuera de alcance), POLLING (fuera de alcance), Detección automática de idioma (aplazada §35 LANG13), Screen-reader phonetics (aceptado con limitación §14 LANG13), Web-fonts adicionales (§15.9 LANG13).
- **Baseline suite engine**: 1057 passed / 62 skipped / 0 failed.
- **Baseline suite cliente**: 39 passed.
- **Baseline lint V2 al abrir el hito**: 6 errores + 2 warnings en `app/v2/**` y `lib/v2/**`.
