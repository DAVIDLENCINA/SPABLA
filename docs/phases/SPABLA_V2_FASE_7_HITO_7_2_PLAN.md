# PLAN OFICIAL DE IMPLEMENTACIÓN — HITO 7.2 (Contrato interno del dominio estabilizado)

## §1. Título

Plan Oficial de Implementación — Fase 7 · Hito 7.2 — Contrato interno del dominio de adapters estabilizado dentro de `engine/src/adapters/`.

## §2. Tipo documental

Plan de hito (implementación documental). Documento derivado exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1 (APROBADA Y CONGELADA) y del Plan Oficial de Fase 7 (congelado 2026-07-11). No introduce decisiones arquitectónicas nuevas. No anticipa el mecanismo runtime del Hito 7.3.

## §3. Estado

APROBADO Y CONGELADO — V1.3 (Plan Oficial vinculante del Hito 7.2, tras auditoría final independiente APTA y congelación de ADR-007 V1.1 en `6f49b92`).

## §4. Fecha

2026-07-17.

## §5. Rama y commit base

- Rama: `spabla-v2/fase-7-adapters-domain`.
- HEAD base: `6f49b925104282b8c1c4ba61cd4666f4a46ad551` (commit `docs(adr): freeze ADR-007 V1.1 — adapter language support resolution`).
- Base tag de referencia: `spabla-v2-phase-7-plan-2026-07-11` (Plan Oficial de Fase 7 congelado).

## §6. Dependencias normativas

- `ADR-003-STRATEGIC-VISION` (congelado).
- `ADR-004-FOUNDATION-EVOLUTION-2` (congelado).
- `ADR-005-LANGUAGE-CATALOG` (congelado).
- `ADR-006-RUNTIME-ADAPTER-RESOLUTION` (congelado).
- `ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION` **V1.1** (APROBADA Y CONGELADA en `6f49b92`).
- `SPABLA_V2_FASE_7_PLAN.md` (congelado el 2026-07-11).
- Plan Foundation Evolution 2 (congelado).

## §7. Historial de correcciones

- **V1.0 (2026-07-17)** — redacción inicial con bloqueo §0 provisional; se apoyaba en ADR-007 V1.0 (borrador).
- **V1.1 (2026-07-17)** — corrección obligatoria contra ADR-007 V1.1 borrador con formas canónicas F1/F2/F3 y Foundation intacta; alcance seguía dirigido a materializar una función pura runtime (desviación posteriormente detectada).
- **V1.2 (2026-07-17)** — actualización de trazabilidad de base normativa; incorporación del commit `6f49b92` como base vinculante tras la congelación de ADR-007 V1.1. Alcance funcional mantenido (con la desviación pendiente).
- **V1.3 (2026-07-17)** — **realineación al alcance oficial del Hito 7.2** definido en el Plan Oficial de Fase 7 §7 líneas 76–79. Se retira toda propuesta de materializar función pura runtime (esa materialización es entregable del **Hito 7.3**, no del 7.2). El Hito 7.2 queda estrictamente circunscrito al **contrato interno normativo documental** del dominio de adapters, verificable mecánicamente. §9, §10, §11, §14, §15, §19, §24, §25, §26, §27 se reescriben para reflejar el alcance documental. §12, §13, §16, §17, §21, §22 se realinean sin cambio funcional. F1/F2/F3 se **referencian** como opciones normativamente válidas cuya elección corresponde al Plan del Hito 7.3, **sin implementar ninguna** en el Hito 7.2. Cero cambio en las decisiones vinculantes de ADR-007 V1.1. Cero decisiones arquitectónicas nuevas.

**Nota histórica sobre el bloqueo §0**: entre 2026-07-17 y la congelación de ADR-007 V1.1 este plan contuvo formalmente un bloqueo §0 (`SUSPENDIDO — HITO 7.2 BLOQUEADO POR ADR-007 (BORRADOR)`) que impedía cualquier ejecución hasta la congelación de ADR-007. Con `6f49b92` — congelación efectiva de ADR-007 V1.1 — dicho bloqueo queda **levantado**. Se conserva esta nota como antecedente histórico; el estado actual del plan es §3.

## §8. Contexto

El Hito 7.1 estableció la existencia arquitectónica del dominio `engine/src/adapters/` (commit `5c66392`). ADR-007 V1.1 quedó APROBADA Y CONGELADA en `6f49b92` y fija: (a) las fuentes válidas de declaración de soporte (§4); (b) la precedencia normativa entre `adapter.supports(lang)`, derivación desde `adapter.getSupportedLanguages()` y default (§5); (c) el comportamiento fail-closed cuando no hay declaración (§6); (d) el tratamiento de incoherencias (§7); (e) el dominio interno como **materializador autorizado** del default (§8); y (f) las **formas canónicas F1, F2, F3** dentro del dominio (§9.3), con Foundation intacta sin excepción.

Bajo el Plan Oficial de Fase 7 (§7 líneas 76–79), el **Hito 7.2** — *"Contrato interno del dominio estabilizado"* — tiene por objetivo funcional **explicitar las reglas normativas internas** que gobiernan cómo un adapter real elige entre las opciones (a), (b), (c) de ADR-006 §2, dejándolas accesibles internamente desde el propio dominio. El objetivo NO es materializar la función pura de resolución (eso pertenece al **Hito 7.3** según el Plan Oficial §7 líneas 81–84). Este plan honra esa separación.

## §9. Objetivo funcional

Explicitar dentro del dominio `engine/src/adapters/` el **contrato interno normativo** que gobierna cómo un adapter real cumple con las opciones (a), (b), (c) de ADR-006 §2 y con las decisiones §4–§9 de ADR-007 V1.1, de forma que:

- cualquier adapter futuro pueda **consultar el contrato interno desde el propio dominio**, con las ADRs aplicables correctamente referenciadas;
- las reglas quedan **explícitas, citables y auditables**, con cero decisiones arquitectónicas implícitas;
- ninguna decisión arquitectónica nueva se introduce: el contrato consolida y cita ADRs ya congeladas.

El Hito 7.2 **no materializa el mecanismo runtime del default `supports(lang)`** (eso es Hito 7.3), **no introduce infraestructura de verificación reutilizable** (eso es Hito 7.4) y **no demuestra viabilidad sobre escenarios sintéticos** (eso es Hito 7.5).

## §10. Resultado esperado

- Existe dentro de `engine/src/adapters/` un **documento normativo interno** (Markdown) que consolida las reglas aplicables al dominio: ubicación de la materialización (ADR-006 §1), tres opciones autorizadas (ADR-006 §2), superficie pública (ADR-006 §3, ADR-004 §2.7), prohibiciones duras (ADR-006 §4), equivalencia semántica (ADR-006 §5, ADR-004 §2.3), catálogo canónico (ADR-005 §5), ausencia de helper de resolución en el registry (ADR-004 §2.6), decisiones vinculantes de ADR-007 V1.1 §4–§9 (fuentes válidas, precedencia, fail-closed, incoherencias, materializador autorizado, formas canónicas F1/F2/F3, salvaguarda dentro del dominio).
- El punto de entrada del dominio (`engine/src/adapters/index.ts`) referencia el documento normativo en su JSDoc con citas ADR precisas.
- Existe una **verificación mecánica** dentro del dominio (test de invariantes) que garantiza mecánicamente que el documento cita las ADRs obligatorias y contiene las marcas normativas mínimas; falla si el contrato se muta u omite una cita obligatoria.
- **Foundation permanece intacta sin excepción.** `engine/src/types/*` (incluyendo `engine/src/types/adapters.test.ts`) no se modifica bajo ningún concepto.
- **La salvaguarda §2.7 congelada por Foundation Evolution 2 permanece intacta**, con su lista blanca original (`types/adapters.ts` + `types/adapters.test.ts`) sin ampliación.
- Cero ampliación de la superficie pública del engine.
- Cero introducción de lógica ejecutable de soporte lingüístico (no hay resolver, no hay helpers, no hay factories, no hay registries en este hito).
- Suite del engine 100% verde tras el cierre; delta positivo controlado por el test de invariantes del contrato dentro de `engine/src/adapters/`.

## §11. Alcance permitido

- Introducir dentro de `engine/src/adapters/` un **documento normativo** (Markdown) que materialice el contrato interno descrito en §14.
- Introducir dentro de `engine/src/adapters/` un **test de invariantes** que verifique mecánicamente la coherencia del documento normativo con las ADRs aplicables (§19).
- **Ampliar mínimamente el JSDoc** de `engine/src/adapters/index.ts` para citar ADR-007 V1.1 §4–§9 y remitir al documento normativo, **sin añadir exports públicos** y **sin modificar el cuerpo del módulo** (permanece `export {};`).
- Verificar por compilación TypeScript y por suite completa que la basal se preserva y que Foundation no ha sido tocada.

## §12. Fuera de alcance

- **Materialización de la función pura de resolución de soporte lingüístico** (entregable del Hito 7.3, no del 7.2). Este plan NO introduce resolver, helpers, factories, registries ni lógica ejecutable de soporte lingüístico.
- **Elección concreta de F1, F2 o F3**: la selección corresponde al Plan del Hito 7.3, no a este plan. En el Hito 7.2 las tres se **referencian** como opciones normativamente válidas (documentales); ninguna se implementa.
- **Infraestructura reutilizable de verificación por equivalencia semántica** (entregable del Hito 7.4).
- **Escenarios sintéticos que demuestren viabilidad de (a), (b), (c)** (entregable del Hito 7.5).
- Cualquier consulta o dependencia de `capabilities.languages` (ADR-007 V1.1 §4 lo excluye).
- Cualquier fuente de declaración de soporte distinta a `adapter.supports(lang)` y `adapter.getSupportedLanguages()`.
- Cualquier validación runtime de coherencia entre `supports(lang)` y `getSupportedLanguages()` (ADR-007 V1.1 §7 la excluye del resolver; corresponde a tests de conformidad).
- Cualquier lógica de selección de adapters, prioridad, fallback o registro (ADR-004 §2.6, ADR-007 V1.1 §11).
- Cualquier proveedor concreto (bloqueado por B1 de ADR-006).
- Cualquier nuevo `AdapterKind` (requiere ADR aditiva a ADR-004 §2.1).
- **Cualquier modificación de `engine/src/types/*`** (Foundation congelada; declarada *"Sin cambios (fuera de alcance, prohibido tocarlos)"* por el Plan Oficial de Fase 7 §Lista de archivos; ADR-007 V1.1 §11 y §14 lo prohíben expresamente).
- **Cualquier modificación de `engine/src/types/adapters.test.ts`** (parte de Foundation Evolution 2 congelada).
- **Cualquier ampliación de la lista blanca de la salvaguarda §2.7** (ADR-007 V1.1 §12 exige que permanezca con su forma original).
- **Cualquier ajuste, debilitamiento o excepción a la salvaguarda §2.7 congelada**.
- Cualquier modificación de Managers, `AdapterRegistry`, Engine, Pipeline, PipelineOrchestrator, Core API.
- Cualquier modificación de V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- Cualquier ampliación de la superficie pública (`engine/src/index.ts`).
- Cualquier introducción de dependencias nuevas.
- Cualquier cambio de configuración (`engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`).
- Cualquier caché, observabilidad, telemetría, logging, rate limiting, métricas, alertas, persistencia, RLS, red, disco, variables de entorno, secretos.
- Cualquier decisión anticipada del SDK, de la API pública o de ADRs futuras.
- Cualquier avance sobre Hito 7.3, 7.4, 7.5 o Fase 7-B.
- Cualquier Change Request al Plan Oficial de Fase 7.

## §13. Semántica normativa a documentar

El contrato interno del dominio (documento normativo Markdown) debe **explicitar** las siguientes reglas, todas derivadas literalmente de ADRs congeladas. El Hito 7.2 no **implementa** estas reglas; las **explicita** en el propio dominio para que cualquier adapter futuro (materializado por el Hito 7.3 o posteriores) las consulte desde el dominio en el que trabaja.

1. **Fuentes válidas** (ADR-007 V1.1 §4): únicamente `adapter.supports(lang)` y `adapter.getSupportedLanguages()`. `capabilities.languages` no participa.
2. **Precedencia** (ADR-007 V1.1 §5, ADR-006 §2):
   - (a) si `adapter.supports(lang)` está definido, el resultado normativo es `adapter.supports(lang)`;
   - (b) si `adapter.supports(lang)` NO está definido y `adapter.getSupportedLanguages()` está definido, el resultado normativo es la pertenencia de `lang` al conjunto retornado por `adapter.getSupportedLanguages()`, expresada mediante una forma canónica F1, F2 o F3 (ADR-007 V1.1 §9.3) elegida por el Plan del Hito 7.3;
   - (c) si ninguna de las dos está definida, el resultado normativo es el default de §13.3.
3. **Default fail-closed** (ADR-007 V1.1 §6): `false`. Sin excepciones nuevas, sin cambio de tipo de retorno.
4. **Incoherencias** (ADR-007 V1.1 §7): el resolver del Hito 7.3 seguirá la precedencia normativa sin ejecutar validación en runtime; la coherencia es responsabilidad de las pruebas de conformidad del adapter (ADR-006 §5) y de la auditoría documental. El resolver es puramente resolutorio, no validador.
5. **Materializador autorizado** (ADR-007 V1.1 §8, ADR-006 §1, §2(b)): exclusivamente el dominio `engine/src/adapters/`. La autorización **no se extiende** a Managers, `AdapterRegistry`, Engine, Pipeline, Pipeline Orchestrator, Core API, V1 ni SDK futuro. El dominio NO es consumer, NO es AdapterRegistry, NO es Manager, NO es Engine, NO es SDK.
6. **Formas canónicas F1, F2, F3** (ADR-007 V1.1 §9.3): opciones normativamente válidas dentro del dominio interno para expresar la equivalencia semántica sin modificar Foundation. El Hito 7.2 las referencia; el Plan del Hito 7.3 elegirá una para la materialización de la función pura runtime.
7. **Salvaguarda dentro del dominio** (ADR-007 V1.1 §9.1, §9.2, §9.4): Foundation intacta sin excepción; salvaguarda §2.7 congelada intacta; lista blanca original preservada; prohibiciones anti-workaround (patrón textual `getSupportedLanguages().has(`, aliases opacos, fragmentación deliberada, invocación dinámica de `has`, reproducción en consumers no autorizados).
8. **Superficie** (ADR-006 §3, §4; ADR-007 V1.1 §9.1, §12): interna. Cero re-exports desde `engine/src/index.ts`. Cero modificación de Foundation.
9. **Catálogo canónico de idiomas** (ADR-005 §5): fuente única. Los adapters expresan capacidad sobre él sin reinventarlo.

Cada afirmación normativa del documento debe estar respaldada por una **cita literal a una sección de ADR congelada**. Ninguna afirmación puede aparecer sin cita.

## §14. Diseño mínimo previsto

Estructura mínima del contrato documental dentro del dominio `engine/src/adapters/`:

- **Un documento normativo Markdown** (por ejemplo `engine/src/adapters/CONTRACT.md` o nombre equivalente elegido durante la implementación) que consolide las nueve reglas de §13 con citas literales a ADR-003, ADR-004, ADR-005, ADR-006 y ADR-007 V1.1. Marca `INTERNAL` en cabecera. Cero autorización para citarse como superficie pública.
- **Ampliación mínima del JSDoc** en el módulo existente `engine/src/adapters/index.ts` para citar ADR-007 V1.1 §4–§9 y remitir al documento normativo. Cuerpo del módulo intacto (`export {};`). Cero exports públicos nuevos.
- **Un test de invariantes** dentro de `engine/src/adapters/` que verifique mecánicamente:
  - existencia del documento normativo;
  - presencia de la marca `INTERNAL`;
  - presencia de citas literales a ADR-003, ADR-004 (con §2.3, §2.6, §2.7 al menos), ADR-005 (con §5 al menos), ADR-006 (con §1, §2, §3, §4, §5 al menos) y ADR-007 V1.1 (con §4, §5, §6, §7, §8, §9 al menos);
  - referencia explícita a las opciones (a), (b), (c) de ADR-006 §2 y a las formas canónicas F1/F2/F3 de ADR-007 V1.1 §9.3 como referencias normativas (no implementación);
  - referencia a la equivalencia semántica con `getSupportedLanguages().has(lang)`;
  - remisión desde `engine/src/adapters/index.ts` (JSDoc) al documento normativo;
  - cero re-export del documento desde `engine/src/index.ts`.

Cero función pura, cero resolver, cero materialización runtime de soporte lingüístico. Estos elementos pertenecen al **Hito 7.3**.

## §15. Archivos permitidos

Lista cerrada. La implementación del Hito 7.2 puede crear o modificar **exclusivamente**:

**Archivos documentales**:

- Un documento normativo Markdown dentro de `engine/src/adapters/` (por ejemplo `engine/src/adapters/CONTRACT.md`).

**Archivos TypeScript permitidos únicamente para verificación del contrato**:

- `engine/src/adapters/index.ts` (existente; se permite ampliación mínima del JSDoc **sólo para citar ADR-007 V1.1 y remitir al documento normativo**; cuerpo del módulo intacto `export {};`; sin exports públicos nuevos).
- Un archivo de test de invariantes dentro de `engine/src/adapters/` (por ejemplo `engine/src/adapters/contract.test.ts` u homólogo) que verifique mecánicamente el contrato conforme a §19.

**No autorizados en el Hito 7.2**:

- Cualquier archivo con lógica runtime de resolución de soporte lingüístico.
- Resolvers, helpers, factories, registries.
- Modificación de `engine/src/types/*`.
- Modificación de `engine/src/adapter-registry/*`.
- Modificación de Managers, Engine, Pipeline, Pipeline Orchestrator, Core API, SDK.
- Exports públicos nuevos.

Cualquier archivo adicional no listado aquí produce **detención inmediata** y **reevaluación** por el Jefe de Proyecto.

## §16. Archivos prohibidos

La implementación **no puede** crear, modificar, mover, eliminar ni tocar:

- **`engine/src/types/adapters.test.ts`** (test §2.7 congelado por Foundation Evolution 2; ADR-007 V1.1 §11, §12).
- **`engine/src/types/adapters.ts`** (Foundation congelada).
- **`engine/src/types/language.ts`** (Foundation congelada).
- **Cualquier archivo bajo `engine/src/types/`** (Foundation congelada; declarada *"Sin cambios"* por el Plan Oficial de Fase 7).
- Cualquier ampliación de la lista blanca de la salvaguarda §2.7.
- Cualquier ajuste al patrón regex del test §2.7.
- `engine/src/adapter-registry/**` (ADR-004 §2.6).
- Cualquier Manager (`stt/`, `translation/`, `tts/`, `messaging/`, `session-manager/`, `conversation-manager/`, `participant-manager/`, `language-manager/`).
- `engine/src/engine/**`.
- `engine/src/pipeline/**`, `engine/src/pipeline-orchestrator/**`.
- `engine/src/core-api/**`.
- `engine/src/event-bus/**`, `engine/src/state-machine/**`.
- `engine/src/index.ts` (barrel público).
- V1: `app/**`, `server/**`, `lib/**`, `public/**`, `supabase/**`.
- `engine/package.json`.
- `engine/tsconfig.json`.
- `engine/vitest.config.ts`.
- Cualquier ADR bajo `docs/decisions/`.
- El Plan Oficial de Fase 7 (`docs/phases/SPABLA_V2_FASE_7_PLAN.md`).
- Cualquier archivo bajo `docs/drafts/`.

## §17. Salvaguarda dentro del dominio

ADR-007 V1.1 §9 establece que la salvaguarda de derivación reside **íntegramente** dentro de `engine/src/adapters/`. Este plan la traduce a reglas ejecutables para el alcance documental del Hito 7.2:

**A. Foundation permanece intacta sin excepción.** Ningún archivo bajo `engine/src/types/*` se modifica. La salvaguarda §2.7 congelada por Foundation Evolution 2 se preserva bit-a-bit.

**B. El test §2.7 permanece intacto**, con su lista blanca original (`types/adapters.ts` + `types/adapters.test.ts`). No se amplía, no se debilita, no se ajusta la regex.

**C. Referencias a formas canónicas F1/F2/F3** en el documento normativo del Hito 7.2 (autorizadas por ADR-007 V1.1 §9.3):

- **F1 — Variable intermedia legible**:
  ```ts
  const supported = adapter.getSupportedLanguages();
  return supported.has(lang);
  ```

- **F2 — Iteración explícita**:
  ```ts
  for (const supported of adapter.getSupportedLanguages()) {
    if (supported === lang) return true;
  }
  return false;
  ```

- **F3 — Conversión explícita**:
  ```ts
  return Array.from(adapter.getSupportedLanguages()).includes(lang);
  ```

Estas tres formas se **citan como referencia normativa** en el contrato del Hito 7.2. **Ninguna se implementa** en este hito. La elección de una para materialización runtime corresponde al **Plan del Hito 7.3**.

**D. El documento normativo no debe redactar como si estuviera escribiendo la función pura.** Debe describir las tres formas como opciones normativamente válidas y remitir al Plan del Hito 7.3 para la selección concreta.

**E. El dominio se considera MATERIALIZADOR autorizado** (ADR-006 §1, ADR-006 §2(b), ADR-007 V1.1 §8), **no consumer distribuido**. El documento normativo debe dejar esa distinción explícita.

**F. Managers, `AdapterRegistry`, Engine, Pipeline, PipelineOrchestrator, Core API, V1 y SDK futuro continúan sin autorización para derivar soporte** (ADR-004 §2.7, ADR-007 V1.1 §8, §9.4). Estos consumers siguen usando exclusivamente `adapter.supports(lang)`.

Cualquier desviación de las reglas A–F produce detención inmediata.

## §18. Validación TypeScript

Tras la actualización de JSDoc en `engine/src/adapters/index.ts` y la creación del test de invariantes, ejecutar desde `engine/`:

```
npx tsc --noEmit
```

Criterio: exit 0. Cero errores. Cero warnings. Compilación en modo `strict` con `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` (configuración actual congelada del engine, no se modifica).

## §19. Estrategia de tests

Los tests del Hito 7.2 son **tests de invariantes documentales**, no tests de runtime de resolver. Verifican mecánicamente que el contrato documental es coherente con las ADRs vinculantes y no puede regresar silenciosamente.

Casos mínimos exigidos:

1. **El documento normativo existe** dentro de `engine/src/adapters/`.
2. **El documento contiene la marca `INTERNAL`** en cabecera.
3. **El documento cita literalmente ADR-003** al menos por su identificador `ADR-003`.
4. **El documento cita literalmente ADR-004** con al menos §2.3, §2.6 y §2.7.
5. **El documento cita literalmente ADR-005** con al menos §5 (catálogo canónico).
6. **El documento cita literalmente ADR-006** con al menos §1, §2, §3, §4 y §5.
7. **El documento cita literalmente ADR-007 V1.1** con al menos §4, §5, §6, §7, §8 y §9.
8. **El documento enumera las tres opciones `(a)`, `(b)`, `(c)`** autorizadas por ADR-006 §2.
9. **El documento referencia las tres formas canónicas F1, F2, F3** de ADR-007 V1.1 §9.3.
10. **El documento cita ADR-004 §2.7** (consumers usan siempre `supports(lang)`) y ADR-004 §2.6 (sin helper de resolución en el registry).
11. **El documento cita la equivalencia semántica** con `getSupportedLanguages().has(lang)` (ADR-006 §5, ADR-004 §2.3).
12. **El documento cita la prohibición dura** de re-export desde el barrel público del engine (ADR-006 §4).
13. **El JSDoc de `engine/src/adapters/index.ts` referencia el documento normativo** y cita ADR-007 V1.1.
14. **El barrel público `engine/src/index.ts` no importa** el documento normativo ni el test de invariantes.

**TEST DE FOUNDATION INTACTA**

Verificar que la salvaguarda §2.7 original continúa ejecutándose verde durante `npx vitest run` sin necesidad de crear tests paralelos redundantes; la propia basal existente garantiza que `engine/src/types/adapters.test.ts` no ha sido modificado.

Tests explícitamente **no exigidos** (fuera de alcance):

- Cualquier test que ejecute lógica runtime de resolución de soporte lingüístico (Hito 7.3).
- Cualquier test que instancie un resolver, helper, factory o registry (Hito 7.3).
- Cualquier test de equivalencia semántica sobre catálogo probe (Hito 7.4).
- Cualquier test de viabilidad de F1/F2/F3 sobre escenarios sintéticos (Hito 7.5).
- Cualquier test que consulte `capabilities.languages`.
- Cualquier test con proveedores concretos.
- Cualquier test con mocks de red.
- Cualquier test snapshot.

## §20. Validación de suite

Tras la implementación documental, ejecutar desde `engine/`:

```
npx vitest run src/adapters
npx vitest run
```

Criterios:

- Suite específica del dominio de adapters: verde.
- Suite completa del engine: verde.
- **Foundation Evolution 2 permanece intacta**: los 526 tests basales pasan sin modificación.
- **Test §2.7 original debe seguir verde sin cambios**.
- **Basal de 529 tests debe preservarse** (los 3 tests del Hito 7.1 permanecen intactos).
- Delta esperado: 529 tests basales preservados + N tests nuevos del Hito 7.2 (N ≥ 14 conforme a §19), todos ubicados dentro de `engine/src/adapters/`.
- Cero regresión.

## §21. Seguridad

- Cero secretos.
- Cero claves.
- Cero credenciales.
- Cero `process.env`.
- Cero red.
- Cero disco (salvo controles estáticos sobre el propio repo justificados en §19).
- Cero logging.
- Cero dependencias externas nuevas.
- Cero incremento de superficie de ataque (contrato interno no público; sin código ejecutable de resolución).
- Default fail-closed §13.3 refuerza la postura de seguridad **documentalmente**; el runtime que lo materialice es entregable del Hito 7.3.

## §22. Compatibilidad

- **Foundation intacta sin excepción**: `engine/src/types/*` sin cambios; incluye `engine/src/types/adapters.test.ts`.
- **Lista blanca §2.7 intacta**: se preserva con su forma original.
- **`AdapterBase` intacto**.
- **`AdapterCapabilities` intacto** (vacía; `capabilities.languages` no existe y no se introduce).
- **`AdapterRegistry` intacto** (ADR-004 §2.6).
- **Superficie pública del engine intacta**: `engine/src/index.ts` sin cambios.
- **Managers, Engine, Pipeline, PipelineOrchestrator, Core API** intactos.
- **V1** intacto.
- **SDK futuro (Fase 9)** intacto; el contrato interno no anticipa decisiones del SDK.
- **Adapters legacy (Fases 1–6)** siguen siendo válidos por opcionalidad de tipo (ADR-004 §2.4).
- **Basal 529 tests** preservada bit-a-bit; delta positivo controlado por el test de invariantes de §19.
- **Configuración de build/test** intacta.
- **Cero breaking changes**.

## §23. Riesgos

**RT1 — Deriva hacia el alcance del Hito 7.3**. Un implementador podría reintroducir una función pura runtime "porque el contrato la describe". **Mitigación**: §9, §10, §11, §14 y §15 excluyen taxativamente la implementación runtime; §26 lo lista como criterio de detención inmediata; el título del hito ("Contrato interno del dominio estabilizado") lo refuerza.

**RT2 — Cita ADR incorrecta o desactualizada** en el documento normativo. **Mitigación**: el test de invariantes §19 verifica presencia literal de las citas ADR obligatorias; una omisión hace fallar el test.

**RT3 — Introducción implícita de una regla nueva** en el documento normativo sin respaldo ADR. **Mitigación**: cada afirmación normativa debe estar respaldada por cita literal (§13); la revisión de auditoría lo verifica.

**RT4 — Modificación accidental de Foundation**. Un touch involuntario a `engine/src/types/*` violaría ADR-007 V1.1 §11 y el Plan Oficial de Fase 7. **Mitigación**: diff explícito sobre `engine/src/types/` en la validación pre-commit; §26 lo lista como criterio de detención inmediata.

**RT5 — Fuga del documento o del test al barrel público**. Un descuido de export materializaría superficie pública indeseada. **Mitigación**: test 14 de §19 verifica ausencia de re-export en `engine/src/index.ts`.

**RT6 — Ambigüedad terminológica MATERIALIZADOR vs CONSUMER** en la redacción del documento. **Mitigación**: §17.E fija la distinción explícitamente; el documento normativo cita ADR-007 V1.1 §9.3 línea que lo declara.

**RT7 — Confusión entre "referenciar F1/F2/F3" (Hito 7.2) e "implementar una" (Hito 7.3)**. **Mitigación**: §17.C, §17.D y §12 lo separan explícitamente.

**RO1 — Presión para adelantar Hito 7.3 aprovechando el mismo commit**. **Mitigación**: §12 lo excluye taxativamente; §26 obliga a detenerse.

**RO2 — Interpretación divergente del alcance del Hito 7.2 respecto al borrador huérfano archivado en `docs/drafts/`**. **Mitigación**: el borrador es material de consulta obsoleto; §15 y §16 fijan los archivos permitidos y prohibidos con precisión.

## §24. Criterios de aceptación

1. **ADR-007 V1.1 correctamente citada** en el documento normativo y en el JSDoc del punto de entrada del dominio.
2. **Contrato interno explícito y accesible dentro del dominio** (`engine/src/adapters/`).
3. **Cero decisiones arquitectónicas implícitas**: cada afirmación normativa respaldada por cita literal ADR.
4. **Cero lógica runtime del Hito 7.3** (sin resolver, helpers, factories ni registries; sin función pura de resolución).
5. **Cero exports públicos nuevos**.
6. **Cero cambios en Foundation** (`engine/src/types/*` intacto bit-a-bit).
7. **Cero cambios en `AdapterRegistry`** (`engine/src/adapter-registry/*` intacto).
8. **Cero cambios en Managers**.
9. **Cero cambios en Engine, Pipeline, Pipeline Orchestrator, Core API**.
10. **Cero cambios en V1**.
11. **SDK reservado para Fase 9**: el contrato no anticipa decisiones del SDK.
12. **`capabilities.languages` fuera del contrato** (ADR-007 V1.1 §4 lo excluye; el documento no lo cita como fuente válida).
13. **Fail-closed correctamente documentado** (ADR-007 V1.1 §6): resultado `false` cuando no hay declaración.
14. **Precedencia correctamente documentada** (ADR-007 V1.1 §5, ADR-006 §2): (a) `supports(lang)`; (b) derivación desde `getSupportedLanguages()`; (c) default fail-closed.
15. **Formas canónicas F1/F2/F3 correctamente referenciadas** como opciones normativamente válidas cuya elección corresponde al Plan del Hito 7.3 (no al 7.2).
16. **Suite basal intacta**: 529 tests basales preservados sin regresión; test §2.7 congelado ejecuta verde sin modificación.
17. **Auditoría independiente con veredicto APTO** sobre el conjunto entregado.
18. **Diff limitado a la lista cerrada de archivos** de §15.

## §25. Secuencia de implementación

1. **Verificar rama, HEAD y working tree**: `git status --short`, `git rev-parse HEAD`, `git log -1 --oneline`. Confirmar working tree limpio en `6f49b92`, 529 tests verdes.
2. **Leer ADR-007 V1.1 congelada** (`docs/decisions/ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION.md`).
3. **Inspeccionar el dominio existente** (`engine/src/adapters/index.ts`, `engine/src/adapters/index.test.ts`).
4. **Redactar el documento normativo** en `engine/src/adapters/` consolidando las nueve reglas de §13 con citas literales a ADRs. Cada afirmación normativa respaldada por cita.
5. **Ampliar mínimamente el JSDoc** de `engine/src/adapters/index.ts` para citar ADR-007 V1.1 §4–§9 y remitir al documento normativo. Cuerpo del módulo intacto (`export {};`).
6. **Añadir el test de invariantes** dentro de `engine/src/adapters/` conforme a §19.
7. **Verificar que `engine/src/types/*` permanece intacto** mediante `git diff -- engine/src/types/`.
8. **Ejecutar TypeScript**: `npx tsc --noEmit` desde `engine/`.
9. **Ejecutar tests específicos**: `npx vitest run src/adapters`.
10. **Ejecutar suite completa**: `npx vitest run`.
11. **Auditar diffs**: `git status --short`, `git diff --stat`, `git diff --name-only`, `git diff --check`.
12. **Entregar reporte** conforme a §27 para auditoría independiente.
13. **Detenerse sin commit, sin push, sin tag** hasta autorización expresa.

## §26. Criterios de detención

La implementación debe detenerse inmediatamente y emitir NO APTO en cualquiera de los siguientes casos:

- Aparición de un archivo tocado no listado en §15.
- **Necesidad de modificar `engine/src/types/*`**.
- **Necesidad de modificar `engine/src/types/adapters.test.ts`**.
- **Necesidad de ampliar la lista blanca §2.7**.
- **Introducción de lógica runtime de resolución de soporte lingüístico** en el Hito 7.2 (pertenece al Hito 7.3; produce detención inmediata).
- **Introducción de resolver, helper, factory o registry** en el Hito 7.2 (pertenece al Hito 7.3).
- **Selección concreta de F1, F2 o F3 como implementación** en el Hito 7.2 (pertenece al Hito 7.3).
- Aparición de un export nuevo en `engine/src/index.ts`.
- Modificación de cualquier archivo listado en §16.
- Introducción de dependencia nueva en `engine/package.json`.
- Modificación de `engine/tsconfig.json` o `engine/vitest.config.ts`.
- Contradicción con ADR-007 V1.1.
- Necesidad de Change Request al Plan Oficial de Fase 7.
- Detección de consulta a `capabilities.languages`.
- Detección de logging, red, disco no controlado, `process.env`, secretos.
- Regresión en la suite basal de 529 tests.
- Fallo de compilación TypeScript.
- Cualquier ambigüedad no cubierta por ADR-007 V1.1 que exija criterio propio → detener y elevar al Jefe de Proyecto.

## §27. Entregable de implementación

La ejecución del Hito 7.2 debe entregar exclusivamente:

- Inspección previa (rama, HEAD, working tree, basal).
- Archivos creados y modificados (con conteo de líneas por archivo).
- Justificación mínima por archivo.
- Confirmación de que el documento normativo cita cada ADR obligatoria conforme al test de invariantes §19.
- Resultado de `npx tsc --noEmit`.
- Resultado de la suite específica (`npx vitest run src/adapters`).
- Resultado de la suite completa (`npx vitest run`).
- Comparación contra la basal (529 tests).
- Confirmación expresa de cumplimiento de §13, §17, §21, §22, §24.
- Confirmación expresa de que **`engine/src/types/*` permanece bit-a-bit intacto** (`git diff -- engine/src/types/` vacío).
- Confirmación de que no se ha modificado ningún archivo prohibido (§16).
- Confirmación de que no se han introducido dependencias nuevas.
- **Confirmación expresa de cero lógica runtime del Hito 7.3** en el diff entregado.
- Hallazgos clasificados (críticos / altos / medios / bajos).
- Veredicto: APTO PARA AUDITORÍA DEL HITO 7.2 / NO APTO PARA AUDITORÍA.

## §28. Veredicto documental

**PLAN OFICIAL DEL HITO 7.2 V1.3 APROBADO Y CONGELADO.**

Este plan es **vinculante**. **Sustituye cualquier borrador o versión previa** del Plan del Hito 7.2 (V1.0, V1.1, V1.2, así como cualquier borrador huérfano bajo `docs/drafts/`); esas versiones anteriores quedan como referencia histórica exclusivamente en §7 y no tienen validez normativa. **Cualquier modificación posterior de este plan requiere una versión nueva formalmente auditada y aprobada** conforme al proceso de gobernanza vigente (ADR de sustitución cuando corresponda; auditoría independiente en todo caso).

**La congelación de este plan NO equivale a iniciar la implementación del Hito 7.2.** El inicio de la implementación requiere una **orden expresa posterior** del Jefe de Proyecto que autorice específicamente la ejecución del Hito 7.2 conforme al plan aquí congelado. Hasta que exista esa orden expresa:

- ninguna implementación del contrato normativo (`engine/src/adapters/CONTRACT.md` o nombre equivalente) puede comenzar;
- ninguna ampliación del JSDoc de `engine/src/adapters/index.ts` puede realizarse;
- ningún test de invariantes (`engine/src/adapters/contract.test.ts` o nombre equivalente) puede añadirse;
- ninguna rama nueva, ningún commit y ningún push relacionados con la ejecución material del Hito 7.2 pueden ejecutarse.

**Estado**: APROBADO Y CONGELADO. Aún no INICIADO. La siguiente acción autorizada por esta congelación es exclusivamente la emisión, por parte del Jefe de Proyecto, de una orden separada de implementación del Hito 7.2 conforme a este plan.

Justificación:

- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1 (APROBADA Y CONGELADA en `6f49b92`) y del Plan Oficial de Fase 7 congelado.
- **Alcance estrictamente circunscrito al objetivo oficial del Hito 7.2** ("Contrato interno del dominio estabilizado", Plan Oficial de Fase 7 §7 líneas 76–79): documentación normativa + verificación mecánica del contrato + JSDoc mínimo. Cero lógica runtime.
- **Separación limpia entre Hito 7.2 (contrato documental) y Hito 7.3 (materialización runtime del default)** conforme al Plan Oficial de Fase 7 §7. F1/F2/F3 se referencian; ninguna se implementa.
- **Bloqueo formal de V1.0 levantado**: ADR-007 V1.1 congelada en `6f49b92`. Se conserva registro histórico en §7.
- Cero autorización explícita o implícita para modificar `engine/src/types/*`.
- Cero autorización para ampliar la lista blanca del test §2.7.
- Cero decisiones arquitectónicas nuevas: toda la semántica es cita literal de ADR-007 V1.1 §4–§9 y ADRs previas congeladas.
- Cero cambios de código, tests, borrador archivado ni configuración como parte de esta actualización documental del plan.
- **No autoriza implementación por sí mismo**: requiere autorización expresa del Jefe de Proyecto y auditoría final independiente previa.
