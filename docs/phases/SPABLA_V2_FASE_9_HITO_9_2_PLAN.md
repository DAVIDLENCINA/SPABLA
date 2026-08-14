# SPABLA V2 — Fase 9 — Plan Hito 9.2

**Experiencia visible y estabilidad del cliente**

**Tipo**: Plan de hito (retrospectivo consolidado 9.2.1–9.2.3 + apertura autorizada del 9.2.4).
**Versión**: V1.1.
**Fecha**: 2026-08-14.
**Estado**: **APROBADO Y CONGELADO**.
**Rama documental**: `spabla-v2/plan-hito-9-2-4-client-stability`.
**Rama oficial de fase**: `spabla-v2/thirteen-languages-activation`.
**HEAD base**: `8947fe13e0fff1f390bfd6bb265e0ac9cb302739`.
**Plan padre de Fase 9**: `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1 (APROBADO Y CONGELADO).
**ADRs gobernantes**: ADR-003 (Estratégica), ADR-005 (Catálogo de idiomas), ADR-008 (Persistencia y multi-tenancy).
**Estándares transversales**: `docs/SPABLA_V2_DOCUMENTATION_STANDARD.md`, `docs/standards/SPABLA_V2_CODE_STANDARD.md`, `docs/standards/SPABLA_V2_RELEASE_STANDARD.md`.

> **Autoridad**: Este plan autoriza el alcance normativo del Hito 9.2.4, pero la implementación sólo comenzará mediante una orden operativa separada de Dirección. Su aprobación aquí NO abre por sí sola la rama de trabajo, NO autoriza commits fuera del alcance documental, NO autoriza tocar código y NO autoriza tocar `main`.

---

## §0. Historial de versiones

- **V1.0 — 2026-08-14**: propuesta inicial. Consolida retrospectivamente los Hitos 9.2.1, 9.2.2 y 9.2.3 (todos cerrados y promocionados) y define el alcance autorizado del futuro Hito 9.2.4 «Client Stability Gate». PROPUESTO PARA APROBACIÓN DE DIRECCIÓN.
- **V1.1 — 2026-08-14**: revisión adversarial y endurecimiento por Dirección. Cambios materiales:
  - **AUTH-RECOVERY** (§5.2, §8.D, §9): sustituye la validación «sólo con fake» por **dos niveles obligatorios** — (1) tests unitarios / con fake para las transiciones internas y (2) al menos una prueba de **integración obligatoria contra Supabase local** que demuestre el ciclo completo sesión válida → 401 → recuperación → cero bucle → cero fuga cross-actor → preferencias conservadas. Elimina toda referencia a «prueba destructiva» y la sustituye por **prueba aislada y no destructiva** con fixtures propios, IDs temporales y cleanup limitado a sus propios datos (prohibido `supabase db reset`, prohibido borrar volúmenes, prohibido borrar datos de otras pruebas, prohibido reutilizar conversaciones con mensajes históricos, prohibido tocar Supabase productivo).
  - **PREF-ACCEPTANCE** (§5.3, §8.B, §9): elimina la cláusula «si se automatiza». La aceptación integrada pasa a ser **obligatoria** con orden de preferencia — (1) prueba automatizada de navegador; (2) si requiere una dependencia desproporcionada, prueba manual controlada y documentada. En ambos casos con checklist explícito (§5.3).
  - **Secretos** (§7.3, §9): sustituye «cero secretos en navegador» por regla precisa — cero secretos **productivos** / `service_role` / tokens administrativos / claves OpenAI / contraseñas reales en navegador, logs o repositorio. Las credenciales fixture del seed local sólo se exponen bajo doble gate `NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1` (endpoint devuelve 404 si cualquiera falta), y quedan excluidas de bundles productivos.
  - **Baselines de tests** (§7.4): aclara que **cero tests fallidos es obligatorio**; una reducción del número total requiere justificación explícita y revisión, y no se permite borrar tests únicamente para mantener el CI verde.
  - **LINT** (§5.1, §9): añade prohibiciones específicas — no rebajar severidad, no añadir `eslint-disable-*` sin excepción técnica individual, documentada y aprobada por Dirección; para `react-hooks/set-state-in-effect` exige **corrección estructural** (prohibido mover el mismo `setState` a otro efecto para silenciar la regla sin resolver el ciclo de estado).
  - **Estado**: PROPUESTO → **APROBADO Y CONGELADO**.
  - **Autoridad**: reforzada — la aprobación NO abre implementación; sólo una orden operativa separada de Dirección la abre.

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
  - Desactivar reglas de ESLint (globalmente o por directorio).
  - **Rebajar la severidad** de cualquier regla actualmente `error` a `warn`, `off` o similar.
  - Añadir `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line` o cualquier variante **sin una excepción técnica individual, documentada línea a línea, con justificación no genérica, y aprobada por Dirección** en la propia orden operativa que autorice el hito.
  - Modificar archivos de V1 (`app/chat/**`, `app/call/**`, `app/api/translate/**`, `server/**`, etc.) salvo dependencia demostrable directamente del cambio autorizado.
  - Cambiar comportamiento visible existente.
  - Introducir nuevas librerías o dependencias.
- **Corrección estructural obligatoria para `react-hooks/set-state-in-effect`**: la solución debe **resolver el ciclo de estado** (moviendo el estado derivado a render con `useMemo`, extrayéndolo a una función pura invocada en el momento adecuado, usando `useSyncExternalStore` cuando la fuente sea externa, o consolidando en un `useReducer`). **Prohibido** desplazar el mismo `setState` a otro efecto — o al mismo con dependencias distintas — únicamente para silenciar la regla sin resolver la cascada de renders subyacente. Todo `setState` que sobreviva dentro de un `useEffect` debe hacerlo con justificación técnica explícita en comentario de código y quedar cubierto por la excepción individual aprobada del punto anterior.
- **Aproximación técnica preferida**: patrón oficial de React 19 — estado derivado en render, reducer para transiciones acopladas, `useSyncExternalStore` para fuentes externas (por ejemplo la sesión Supabase o `window.localStorage`). La decisión concreta por caso pertenece a la implementación; el plan sólo obliga a que el resultado sea semánticamente equivalente al comportamiento actual y a que la nueva forma no introduzca regresiones en las suites verdes.

### §5.2 AUTH-RECOVERY — Recuperación determinista de autenticación

- **Objetivo**: diagnosticar y cerrar los caminos actuales de recuperación ante sesión ausente, token caducado o token inválido, garantizando que:
  - **No se producen bucles de respuestas 401** ni loops de polling infinito.
  - **No se muestran datos de otra sesión ni de otro actor** durante la transición (regresión potencial ya cubierta parcialmente en Hito 9.1.1 con `sessionExpiredRef` y drop de `actorId` divergente en `fetchMessages`).
  - **No se borran las preferencias locales de idioma persistidas por el Hito 9.2.3.**
  - La UX ante expiración es determinista: el usuario recibe un aviso claro y una vía de recuperación única.
- **Estado actual documentado**: deuda §35 del Plan LANG13 V1.1 «AUTH-RECOVERY: recuperación 401 sin prueba end-to-end contra Supabase local». El comportamiento actual del cliente incluye la clasificación en `engine/src/utils/polling-response-classifier.ts`, el `sessionExpiredRef` de `page.tsx`, el `signOut({scope:"local"})` tras 401, y el runner de polling con `createPollingRunner`. Falta cobertura de integración obligatoria en local.
- **Salida técnica no impuesta**: este plan **no** decide todavía si la recuperación final es (a) refresh silencioso de token vía Supabase Auth, (b) cierre de sesión controlado + prompt de re-autenticación, (c) nueva autenticación forzada, u otra vía. La elección corresponde a la inspección técnica durante la implementación, siempre que respete las restricciones anteriores.
- **Cobertura de tests en dos niveles obligatorios**:
  1. **Tests unitarios / con fake** de las transiciones internas: clasificador de respuesta (`classifyPollingResponse`), guardia `sessionExpiredRef`, cancelación del runner de polling, no-borrado de preferencias locales, y cualquier función pura nueva que la implementación introduzca. Ejecutados por `npm run test:client` y por `cd engine && npx vitest run` según ubicación.
  2. **Al menos una prueba de integración contra Supabase local**, **obligatoria** — un fake por sí solo NO cierra AUTH-RECOVERY. La prueba debe demostrar la cadena completa:
     - sesión válida establecida contra `spabla-hito-8-2-local`;
     - token invalidado o sesión expirada simulada de forma controlada (por ejemplo, mediante `admin_deactivate_membership` sobre un actor fixture, o revocación del `access_token` inyectado, o cierre de sesión server-side inducido);
     - respuesta HTTP 401 real desde el endpoint autenticado (`/api/v2/messages` GET) — no simulada;
     - recuperación conforme a la decisión de la implementación;
     - **ausencia de bucle de polling** verificable por contador (p.ej. cero tics adicionales tras el 401);
     - **ausencia de fuga entre actores** verificable comparando `actorId` esperado vs observado;
     - **conservación de las preferencias locales de idioma** verificable leyendo la clave `spabla_v2:language-preferences:v1:<actorId>` antes y después.
  3. **Prueba aislada y no destructiva**: la integración local usa **actores y conversación fixture aislados**, con IDs temporales anotados, y **limpia únicamente sus propios datos** al terminar. **Prohibido** ejecutar `supabase db reset`, `supabase db reset --local`, borrado de volúmenes Docker, `docker volume rm supabase_db_*`, `TRUNCATE` sobre tablas ajenas al fixture, borrado de datos generados por otras pruebas, y reutilización de conversaciones con mensajes históricos. **Prohibido en cualquier fase** tocar Supabase productivo.

### §5.3 PREF-ACCEPTANCE — Aceptación integrada de preferencias

- **Objetivo**: verificar operativamente y de forma **obligatoria** el flujo completo de preferencias locales del Hito 9.2.3 en un entorno real (`Next dev` + Supabase local) sin coste al proveedor y sin depender de conversaciones con mensajes históricos. La aceptación integrada es **condición necesaria** para cerrar el hito; los tests deterministas ya presentes en `lib/v2/client/language-preference-store.test.ts` y `language-preference-hydration.test.ts` NO la sustituyen por sí solos.
- **Escenarios obligatorios (checklist demostrable)**: la prueba (automatizada o manual controlada) debe evidenciar **todos** los siguientes puntos, cada uno con captura, log o assertion que lo respalde:
  1. Actor A guarda un par de idiomas claramente distinto (por ejemplo `ca / de`) a través de la UI real.
  2. Recarga la página y conserva exactamente el mismo par.
  3. Logout + login del mismo actor A y conserva exactamente el mismo par.
  4. Actor B, en sesión separada, guarda un par distinto (por ejemplo `pt / fr`).
  5. Actor B NO recibe el par de Actor A.
  6. Volver a Actor A recupera exclusivamente el par de Actor A.
  7. Con storage `unavailable` (modo privado, quota, política de seguridad, o probe fallando) el chat degrada a defaults y sigue funcionando, sin error visible al usuario y sin romper la sesión.
  8. Cero llamadas a OpenAI durante todo el flujo (verificable por ausencia de tráfico saliente hacia `api.openai.com` en logs de `Next dev` + ausencia de nuevas filas en `spabla_v2.message_translations` para la conversación fixture).
- **Restricciones operativas**:
  - **Cero llamadas a OpenAI**. La verificación de `targetLanguage` sólo puede cambiarse contra combinaciones que ya estén en caché de `spabla_v2.message_translations` para la conversación fixture, o bien contra una **conversación local vacía**. En su defecto, contra un **proveedor bloqueado de forma determinista** (fake local o env `OPENAI_API_KEY` intencionalmente ausente + captura del error `openai_key_missing` sin producir traducción).
  - **Prohibido** depender de una conversación con mensajes históricos que fuerce cache-miss en un idioma no persistido.
  - **Prohibido** aceptar como criterio final la modificación manual de `localStorage` desde DevTools; debe ejercerse a través de la UI real.
- **Orden de preferencia (elimina toda ambigüedad de «si se automatiza»)**:
  1. **Prueba automatizada de navegador** (headless, contra `Next dev` + `spabla-hito-8-2-local`), preferida siempre que sea viable. La elección de herramienta (Playwright, Puppeteer, o similar) y la introducción como devDependency raíz requieren autorización explícita de Dirección en la orden operativa que abra el hito.
  2. **Si la introducción de dependencia resulta desproporcionada** para el alcance del hito — a juicio documentado de la implementación y ratificado por Dirección —, la aceptación puede cerrarse mediante **prueba manual controlada y documentada** (acta firmada por el operador que registre precondiciones, pasos, resultado y capturas). La prueba manual sigue estando sujeta a todos los escenarios y restricciones anteriores.
  En ambos casos, la prueba se ejerce sobre **actores y conversación fixture aislados** (creados para la prueba o preexistentes en estado limpio), con **cleanup limitado a los datos generados por la propia prueba**. Prohibiciones idénticas a las de AUTH-RECOVERY §5.2 punto 3.

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

### §7.3 Presupuesto, coste y secretos

- **Cero llamadas reales a OpenAI** durante cualquier fase de implementación o de tests del Hito 9.2.4.
- **Cero conexión a Supabase productivo** desde ninguna fase del hito (implementación, tests unitarios, tests de integración, CI, prueba manual).
- **Cero secretos productivos, `service_role`, tokens administrativos, claves OpenAI o contraseñas reales** en el navegador, en logs, en artefactos de CI ni en el repositorio.
- **Credenciales fixture del seed local**: las contraseñas de los actores demo generadas por `POST /api/v2/seed` sólo pueden mostrarse (y el endpoint sólo puede responder con éxito) bajo el **doble gate**:
  - `NODE_ENV=development`, y
  - `SPABLA_V2_ENABLE_DEV_SEED=1`.
  Si cualquiera de los dos gates falta, el endpoint devuelve **`404 Not Found`** (opaco; nunca 401/403 con detalles). Estas credenciales fixture **no pueden aparecer en bundles productivos** ni en respuestas fuera de ese entorno; las rutas y componentes que las consumen deben ser tree-shakeables o bloqueadas por el mismo gate en tiempo de build.
- **Cero secretos en artefactos de CI**: los tokens de Supabase local extraídos en Job B siguen enmascarados por `::add-mask::` (patrón vigente en `.github/workflows/ci.yml`). Cualquier nuevo test de integración que necesite credenciales fixture las obtiene por el mismo mecanismo, sin registrarlas literales.

### §7.4 Suites de tests como salvaguarda

- **Baseline actual congelado en este plan**:
  - Suite engine: **1057 passed / 62 skipped / 0 failed**.
  - Suite cliente (`npm run test:client`): **39 passed / 0 failed**.
- **Cero tests fallidos es obligatorio** al cerrar el hito.
- **Crecimiento admisible** por tests nuevos que documenten explícitamente una invariante del hito (AUTH-RECOVERY, PREF-ACCEPTANCE, o correcciones estructurales LINT-9.1).
- **Reducción del número total de tests**: admisible **únicamente** si deriva de consolidación legítima sin pérdida de cobertura (por ejemplo, dos tests redundantes que se funden en uno más completo). Requiere justificación explícita en el mensaje del commit y en la orden operativa, más revisión de Dirección antes de proponer promoción.
- **Prohibido borrar tests únicamente para mantener el CI verde**, así como marcar tests verdes existentes como `skip`, `todo` o `only` para ocultarlos.

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
- Nuevos tests unitarios/con fake de AUTH-RECOVERY (nivel 1 de §5.2) — mínimo uno determinista.
- Nuevos tests o acta de PREF-ACCEPTANCE conforme al orden de preferencia de §5.3. Si la automatización de navegador se autoriza, aquí; si se aprueba la acta manual, se adjunta como artefacto documental separado.

### §8.C Suite engine (`cd engine && npx vitest run`)

- 1057 passed, 62 skipped (baseline; skipped puede reducirse si el hito consolida), 0 failed.
- Crecimiento admisible únicamente por tests nuevos que documenten explícitamente una invariante del hito.

### §8.D Integración Supabase local (obligatoria)

- **Job B «Supabase integration» verde en CI**.
- **Al menos una prueba de integración AUTH-RECOVERY contra Supabase local** (§5.2 nivel 2), **obligatoria** — un fake por sí solo NO cubre este apartado.
- La prueba de integración es **aislada y no destructiva**: usa actores y conversación fixture propios, IDs temporales anotados, y hace cleanup limitado a sus propios datos. Prohibiciones idénticas a §5.2 punto 3 (sin `supabase db reset`, sin borrado de volúmenes, sin datos de otras pruebas, sin conversaciones con mensajes históricos, sin Supabase productivo).
- **Cero conexión a Supabase remoto** desde el flujo local o de CI del hito.
- **Verificación operativa** de que un 401 no entra en bucle: cubierta por la prueba de integración anterior mediante contador de tics de polling tras la respuesta 401.

### §8.E CI oficial

- Job A — engine + Client Vitest: verde.
- Job B — Supabase integration: verde.
- Job C — phase-8 restore drill: verde.

---

## §9. Criterio objetivo de cierre del Hito 9.2.4

El Hito 9.2.4 sólo podrá considerarse cerrado y proponerse a promoción cuando se cumplan **todos** los siguientes puntos, sin excepción y verificados en la rama candidata:

1. **Cero errores** y **cero warnings** de lint en `app/v2/**` y `lib/v2/**` (`npx eslint app/v2 lib/v2`). Prohibido rebajar severidad; prohibido `eslint-disable-*` sin excepción técnica individual, documentada y aprobada por Dirección; corrección estructural obligatoria para `react-hooks/set-state-in-effect` (§5.1).
2. Recuperación **AUTH probada en dos niveles** (§5.2): (i) tests unitarios/con fake para las transiciones internas; (ii) **al menos una prueba de integración obligatoria contra Supabase local** que cubra sesión válida → 401 real → recuperación → cero bucle → cero fuga cross-actor → preferencias conservadas. Nunca Supabase productivo.
3. **Cero bucle de respuestas 401** demostrado por contador en la prueba de integración anterior (nunca por prueba destructiva ni por reset de infraestructura).
4. **PREF-ACCEPTANCE completado** conforme al checklist §5.3 (8 puntos), mediante prueba automatizada de navegador o, si Dirección lo ratifica por dependencia desproporcionada, mediante acta de prueba manual controlada firmada por el operador. Las preferencias del Actor A sobreviven recarga y nueva sesión del mismo actor en el mismo navegador; las del Actor B permanecen aisladas; storage `unavailable` degrada a defaults sin romper el chat.
5. **Cero llamadas a OpenAI** durante toda la fase de implementación y de pruebas del hito, verificable por ausencia de tráfico saliente hacia `api.openai.com` y por ausencia de nuevas filas en `spabla_v2.message_translations` para la conversación fixture.
6. **Cero secretos productivos, `service_role`, tokens administrativos, claves OpenAI o contraseñas reales** en navegador, logs, artefactos de CI o repositorio; credenciales fixture bajo doble gate `NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1` con `404` si falta cualquiera; cero fixtures en bundles productivos (§7.3).
7. TypeScript raíz, TypeScript engine, `npm run test:client`, `cd engine && npx vitest run` y `npm run build` **todos verdes**; **cero tests fallidos**; ninguna reducción del número total sin justificación explícita y ratificación de Dirección (§7.4).
8. CI oficial completo con los tres Jobs (A, B, C) en verde.
9. **Revisión manual únicamente si aporta evidencia no cubierta por la automatización**; toda prueba manual queda documentada como acta con precondiciones, pasos, resultado y capturas.

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

1. Este documento se congela en V1.1 tras la revisión adversarial de Dirección (2026-08-14). Cambios materiales posteriores exigen V1.2, V2.0, etc., con historial explícito en §0.
2. La aprobación **autoriza el alcance normativo** del Hito 9.2.4. La **implementación sólo comenzará mediante una orden operativa separada** de Dirección que abra la rama de trabajo. Ninguna línea de código puede tocarse bajo esta aprobación.

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

- **Plan**: `SPABLA_V2_FASE_9_HITO_9_2_PLAN.md` V1.1 (APROBADO Y CONGELADO 2026-08-14).
- **Rama documental**: `spabla-v2/plan-hito-9-2-4-client-stability`.
- **HEAD base**: `8947fe13e0fff1f390bfd6bb265e0ac9cb302739`.
- **Hitos consolidados**: 9.2.1 (`c2884c2` + `01d736b`), 9.2.2 (`9cc0d89` + `3474d53`), 9.2.3 (`d4ec4e7` + `8947fe1`, CI `31821933661`).
- **Hito futuro autorizable**: 9.2.4 «Client Stability Gate».
- **Frentes del 9.2.4**: LINT-9.1, AUTH-RECOVERY, PREF-ACCEPTANCE.
- **Deudas registradas**: OBS-PROVIDER (aplazada por Dirección), SEC-DEPS (V1 legacy, fuera de alcance), POLLING (fuera de alcance), Detección automática de idioma (aplazada §35 LANG13), Screen-reader phonetics (aceptado con limitación §14 LANG13), Web-fonts adicionales (§15.9 LANG13).
- **Baseline suite engine**: 1057 passed / 62 skipped / 0 failed.
- **Baseline suite cliente**: 39 passed.
- **Baseline lint V2 al abrir el hito**: 6 errores + 2 warnings en `app/v2/**` y `lib/v2/**`.
