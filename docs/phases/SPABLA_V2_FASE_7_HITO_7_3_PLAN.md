# PLAN CANDIDATO DE IMPLEMENTACIÓN — HITO 7.3 (Disponibilidad de la semántica del default `supports(lang)`)

## §1. Título

Plan Candidato de Implementación — Fase 7 · Hito 7.3 — Materialización runtime interna del default `supports(lang)` dentro del dominio `engine/src/adapters/`.

## §2. Tipo documental

Plan de hito (implementación de código). Documento derivado exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1 (APROBADA Y CONGELADA), del Plan Oficial de Fase 7 (congelado), del Plan Oficial del Hito 7.2 V1.3 (APROBADO Y CONGELADO en `7e896c5`) y del contrato interno `engine/src/adapters/CONTRACT.md` (congelado en `55f050f`). No introduce decisiones arquitectónicas nuevas.

## §3. Estado

**APROBADO Y CONGELADO — V1.1 (Plan Oficial vinculante del Hito 7.3, tras reauditoría independiente con veredicto APTO PARA CONGELACIÓN).**

Este plan es **vinculante**. La versión congelada es V1.1. La observación no bloqueante O1 de la reauditoría queda aceptada sin corrección conforme a autorización expresa del Jefe de Proyecto.

## §4. Fecha

2026-07-17.

## §5. Rama y commit base

- Rama: `spabla-v2/fase-7-adapters-domain`.
- HEAD base: `55f050f503128528b0969d0cd125f4bfd27ad90b` (commit `docs(engine): fase 7 hito 7.2 — stabilise adapters domain contract`).
- Base tag de referencia: `spabla-v2-phase-7-plan-2026-07-11` (Plan Oficial de Fase 7 congelado).

## §6. Dependencias normativas

- `ADR-003-STRATEGIC-VISION` (congelado).
- `ADR-004-FOUNDATION-EVOLUTION-2` (congelado).
- `ADR-005-LANGUAGE-CATALOG` (congelado).
- `ADR-006-RUNTIME-ADAPTER-RESOLUTION` (congelado).
- `ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION` **V1.1** (APROBADA Y CONGELADA en `6f49b92`).
- `SPABLA_V2_FASE_7_PLAN.md` (congelado el 2026-07-11).
- `SPABLA_V2_FASE_7_HITO_7_2_PLAN.md` V1.3 (APROBADO Y CONGELADO en `7e896c5`).
- `engine/src/adapters/CONTRACT.md` (congelado en `55f050f`).
- Plan Foundation Evolution 2 (congelado).

## §7. Historial de correcciones

- **V1.0 (2026-07-17)** — redacción inicial. Recibió veredicto NO APTO PARA CONGELACIÓN por auditoría independiente con dos hallazgos medios: M1 (firma TypeScript no fijada) y M2 (expresiones abiertas sin criterios mecánicos), más tres bajos (B1, B2, B3) y tres observaciones (O1, O2, O3).
- **V1.1 (2026-07-17)** — corrección obligatoria contra la auditoría previa. Aplicadas todas las correcciones autorizadas:
  - **M1 resuelto**: firma TypeScript literal fijada en §14.
  - **M2 resuelto**: nombres de archivo exactos fijados en §15; `engine/src/adapters/index.ts` prohibido en §16.
  - **B1 resuelto**: eliminado argumento "primera opción canónica" de §8.4.
  - **B2 resuelto**: renombrado `resolveSupport` → `resolveLanguageSupport` y `resolve-support.ts` → `resolve-language-support.ts` en todo el documento.
  - **B3 resuelto**: §20 expandido a 14 tests dedicados mínimos.
  - **O3 resuelto**: §28 amplía criterios de detención con "contradicción ADR-006/ADR-007", "firma no implementable con tipos existentes", "renombrar símbolo o archivos", "cambiar orden de parámetros", "añadir parámetros", "cambiar retorno", "usar forma distinta de F1", "introducir fallback tras supports=false", "crear nuevo tipo o contrato".
  - **O1 y O2**: aceptadas sin cambio (defensivas / duplicación necesaria por diseño).
  - Cero cambio en la elección normativa (F1 sigue siendo la forma canónica adoptada). Cero decisiones arquitectónicas nuevas.

## §8. Contexto

El Hito 7.2 congeló el contrato interno documental del dominio `engine/src/adapters/` (commit `55f050f`). Foundation permanece intacta; la salvaguarda §2.7 de Foundation Evolution 2 sigue verde sin modificación; el barrel público `engine/src/index.ts` no ha sido tocado. Basal actual: **544 tests verdes** (529 basal + 15 del Hito 7.2).

El **Hito 7.3** — *"Disponibilidad de la semántica del default `supports(lang)`"* — se define en el Plan Oficial de Fase 7 §7 (líneas 81–84):

> *"Objetivo funcional: la semántica del default `supports(lang)` queda disponible dentro del dominio de adapters, sin ampliar la superficie pública de Foundation ni del engine."*
> *"Resultado esperado: cualquier adapter real del dominio puede apoyarse en la semántica prevista por ADR-004 §2.3 y ADR-006 §2 sin necesidad de duplicarla."*
> *"Criterio de finalización: auditoría APTO; disponibilidad demostrada mediante pruebas dedicadas; ningún símbolo del mecanismo interno aparece en el barrel público."*

Este plan materializa esa disponibilidad como **una función pura interna** al dominio, sin modificar Foundation ni ampliar la superficie pública.

## §9. Análisis literal de F1/F2/F3 (ADR-007 V1.1 §9.3)

### 9.1 Formas canónicas transcritas

**F1 — Variable intermedia legible**:
```ts
const supported = adapter.getSupportedLanguages();
return supported.has(lang);
```

**F2 — Iteración explícita**:
```ts
for (const supported of adapter.getSupportedLanguages()) {
  if (supported === lang) return true;
}
return false;
```

**F3 — Conversión explícita**:
```ts
return Array.from(adapter.getSupportedLanguages()).includes(lang);
```

### 9.2 Tabla comparativa (20 dimensiones)

| # | Dimensión | F1 | F2 | F3 |
|---|---|---|---|---|
| 1 | Ubicación mecanismo | `engine/src/adapters/` (interno) | Igual | Igual |
| 2 | Superficie pública afectada | Cero | Cero | Cero |
| 3 | Compatibilidad con `AdapterBase` | Sí (usa miembros opcionales) | Sí | Sí |
| 4 | Compat. opcionalidad `supports?` | Sí | Sí | Sí |
| 5 | Compat. `getSupportedLanguages?` | Sí | Sí | Sí |
| 6 | Aplicación precedencia (supports → gSL → false) | Sí (chequeo previo antes de F1) | Sí (idem) | Sí (idem) |
| 7 | Default fail-closed `false` | Sí | Sí | Sí |
| 8 | Riesgo Foundation | Cero | Cero | Cero |
| 9 | Riesgo ampliar API pública | Cero (no re-exportado) | Cero | Cero |
| 10 | Riesgo ADR-004 §2.7 | Bajo — dominio MATERIALIZADOR autorizado por ADR-007 V1.1 §8 (no consumer); F1 permitida por ADR-007 V1.1 §9.4 | Igual | Igual |
| 11 | Riesgo helper en `AdapterRegistry` | Cero (no toca Registry) | Cero | Cero |
| 12 | Riesgo consumer externo | Cero | Cero | Cero |
| 13 | Facilidad de test unitario | Alta (2 líneas legibles) | Media (loop imperativo) | Alta (una línea) |
| 14 | Facilidad de evolución futura | Alta (fácil sustitución sin cambio de superficie) | Alta | Alta |
| 15 | Riesgo duplicación | Bajo | Bajo | Bajo |
| 16 | Riesgo divergencia semántica | Bajo (idéntico a `getSupportedLanguages().has()`) | Bajo (equivalente vía loop) | Bajo (equivalente vía array) |
| 17 | Impacto sobre Hito 7.4 | Compat — F1 facilita comparación semántica reutilizable | Compat | Compat |
| 18 | Impacto sobre Hito 7.5 | Compat — F1 no bloquea escenarios sintéticos | Compat | Compat |
| 19 | Impacto sobre providers futuros | Compat — cualquier adapter real puede delegar al mecanismo | Compat | Compat |
| 20 | Reversibilidad | Alta (sustituible por F2 o F3 sin cambio de superficie) | Alta | Alta |
| — | Complejidad temporal | **O(1) via `Set.has`** | O(n) via loop | O(n) via `Array.from` + O(n) via `.includes` |
| — | Legibilidad | **Muy alta** | Media | Alta |
| — | Precedente literal en basal | **Sí** (`engine/src/types/adapters.test.ts:68`) | No | Sí (`engine/src/types/adapters.test.ts:77`) |

### 9.3 Opción recomendada

**F1 — Variable intermedia legible.**

### 9.4 Justificación (técnica y normativa)

La elección de F1 se sustenta exclusivamente en los siguientes criterios, todos verificables e independientes del orden de enumeración en ADR-007 V1.1 §9.3:

1. **Está expresamente autorizada por ADR-007 V1.1 §9.3** como forma canónica válida dentro del dominio interno.
2. **Usa la semántica natural de `ReadonlySet.has`** — método idiomático del tipo devuelto por `getSupportedLanguages()`.
3. **Complejidad temporal O(1) esperada** — Set.has() es constante en el tiempo; F2 y F3 son O(n).
4. **Evita conversión intermedia a Array** — F3 requiere `Array.from` + `.includes`, doble sobrecarga innecesaria.
5. **Es más legible y menos verbosa que F2** — dos líneas idiomáticas frente a un loop imperativo de cuatro líneas con `return` intermedio.
6. **Tiene precedente textual dentro de la basal congelada** — `engine/src/types/adapters.test.ts:68` contiene exactamente la construcción `const set = adapter.getSupportedLanguages();` seguida de `expect(set.has("es")).toBe(true);`; ADR-007 V1.1 §9.3 lo cita como respaldo idiomático.
7. **No modifica Foundation** — sólo utiliza tipos y miembros ya presentes en `AdapterBase`.
8. **No amplía la API pública** — el símbolo es interno al dominio y no se re-exporta desde `engine/src/index.ts`.
9. **No exige ampliar la lista blanca de ADR-004 §2.7** — la variable intermedia evita el patrón textual literal detectado por la salvaguarda; ADR-007 V1.1 §9.4 la autoriza como forma canónica.
10. **Es totalmente reversible dentro del dominio interno** — el mecanismo puede sustituirse por F2 o F3 en el futuro sin cambio de superficie ni ADR nueva.

**F2 y F3 siguen siendo formas normativamente válidas** conforme a ADR-007 V1.1 §9.3. Son descartadas mediante una **decisión técnica explícita** de este Plan basada en (2), (3), (4) y (5), no por preferencia normativa de ADR-007 (que no establece orden de preferencia).

### 9.5 Riesgos de la opción recomendada F1

- **RT-F1-1 — Interpretación errónea como evasión de la salvaguarda §2.7**: mitigada por (a) precedente literal en `engine/src/types/adapters.test.ts:68`; (b) autorización expresa de ADR-007 V1.1 §9.3 y §9.4; (c) JSDoc del símbolo interno citará ADR-006 §1, §2(b), ADR-007 V1.1 §8, §9.3 justificando el rol de MATERIALIZADOR.
- **RT-F1-2 — Fuga del símbolo al barrel público**: mitigada por test dedicado que verifica ausencia de re-export en `engine/src/index.ts`.
- **RT-F1-3 — Reproducción del patrón por consumers no autorizados**: mitigada por (a) prohibición dura de CONTRACT.md §8 y §11; (b) revisión de diff en cada auditoría; (c) salvaguarda §2.7 congelada sigue detectando el patrón literal `getSupportedLanguages().has(` en cualquier archivo `.ts` fuera de los dos contextos autorizados.

## §10. Objetivo funcional

Materializar dentro del dominio interno `engine/src/adapters/` una **función pura interna** que resuelva el soporte lingüístico declarado por un adapter, conforme a la precedencia y default fijados por ADR-007 V1.1 §§5–6 y expresando la derivación (rama b) mediante la forma canónica **F1** autorizada por ADR-007 V1.1 §9.3. La función permanece interna al dominio; no forma parte de la superficie pública del engine; no toca Foundation ni la salvaguarda §2.7.

## §11. Resultado esperado

- Existe una función pura interna en `engine/src/adapters/` con firma literal fijada en §14 que, dada `(adapter, lang)`, retorna un booleano determinista según la precedencia normativa ADR-007 V1.1 §5 y el default fail-closed ADR-007 V1.1 §6.
- La derivación (rama b) se expresa mediante F1 (variable intermedia legible) conforme a ADR-007 V1.1 §9.3.
- **Foundation permanece intacta sin excepción.** `engine/src/types/*` (incluyendo `engine/src/types/adapters.test.ts`) no se modifica bajo ningún concepto.
- **La salvaguarda §2.7 congelada por Foundation Evolution 2 permanece intacta**, con su lista blanca original.
- Cero ampliación de la superficie pública del engine (`engine/src/index.ts` sin cambios).
- El símbolo interno del mecanismo NO se re-exporta desde `engine/src/index.ts`.
- Suite del engine 100% verde tras la implementación; delta positivo controlado por los tests dedicados del Hito 7.3.

## §12. Alcance permitido

- Introducir dentro de `engine/src/adapters/` **el archivo nuevo de producción** `engine/src/adapters/resolve-language-support.ts` que materializa la función pura descrita en §14.
- Introducir dentro de `engine/src/adapters/` **el archivo nuevo de tests** `engine/src/adapters/resolve-language-support.test.ts` que cubre los casos exigidos en §20.
- Verificar por compilación TypeScript y por suite completa que la basal se preserva y que Foundation no ha sido tocada.

## §13. Fuera de alcance

- Cualquier consulta o dependencia de `capabilities.languages` (ADR-007 V1.1 §4 lo excluye).
- Cualquier fuente de declaración de soporte distinta a `adapter.supports(lang)` y `adapter.getSupportedLanguages()`.
- Cualquier validación runtime de coherencia entre `supports(lang)` y `getSupportedLanguages()` (ADR-007 V1.1 §7 la excluye del resolver; corresponde a tests de conformidad del Hito 7.4).
- Cualquier lógica de selección de adapters, prioridad, fallback o registro (ADR-004 §2.6, ADR-007 V1.1 §11).
- **Cualquier fallback desde `supports(lang) === false` hacia `getSupportedLanguages()`** — sería violación de precedencia (ADR-007 V1.1 §5(a)).
- Cualquier proveedor concreto (bloqueado por B1 de ADR-006).
- Cualquier nuevo `AdapterKind` (requiere ADR aditiva a ADR-004 §2.1).
- **Cualquier modificación de `engine/src/types/*`** (Foundation congelada; ADR-007 V1.1 §11 y §14 lo prohíben expresamente).
- **Cualquier modificación de `engine/src/types/adapters.test.ts`** (parte de Foundation Evolution 2 congelada).
- **Cualquier modificación de `engine/src/adapters/index.ts`** (congelado por Hito 7.2 en `55f050f`).
- **Cualquier modificación de `engine/src/adapters/CONTRACT.md`** (congelado por Hito 7.2 en `55f050f`).
- **Cualquier modificación de `engine/src/adapters/contract.test.ts`** (congelado por Hito 7.2 en `55f050f`).
- **Cualquier ampliación de la lista blanca de la salvaguarda §2.7**.
- **Cualquier ajuste, debilitamiento o excepción a la salvaguarda §2.7 congelada**.
- Cualquier modificación de Managers, `AdapterRegistry`, Engine, Pipeline, PipelineOrchestrator, Core API.
- Cualquier modificación de V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- Cualquier ampliación de la superficie pública (`engine/src/index.ts`).
- Cualquier introducción de dependencias nuevas.
- Cualquier cambio de configuración (`engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`).
- **Infraestructura reutilizable de verificación por equivalencia semántica** (entregable del Hito 7.4, no del 7.3).
- **Escenarios sintéticos que demuestren viabilidad de (a), (b), (c)** (entregable del Hito 7.5, no del 7.3).
- Cualquier caché, observabilidad, telemetría, logging, rate limiting, métricas, alertas, persistencia, RLS, red, disco, variables de entorno, secretos.
- Cualquier decisión anticipada del SDK, de la API pública o de ADRs futuras.
- Cualquier Change Request al Plan Oficial de Fase 7 o al Plan del Hito 7.2.

## §14. Semántica normativa y firma exacta

### 14.1 Semántica normativa

Derivada literalmente de ADR-007 V1.1. La función pura interna cumple:

1. **Fuentes válidas** (ADR-007 V1.1 §4): únicamente `adapter.supports(lang)` y `adapter.getSupportedLanguages()`. `capabilities.languages` NO participa.
2. **Precedencia** (ADR-007 V1.1 §5):
   - (a) si `adapter.supports(lang)` está definido, el resultado es el valor devuelto por `adapter.supports(lang)`.
   - (b) si `adapter.supports(lang)` NO está definido y `adapter.getSupportedLanguages()` está definido, el resultado es la pertenencia de `lang` al conjunto retornado por `adapter.getSupportedLanguages()`, expresada mediante F1.
   - (c) si ninguna de las dos está definida, el resultado es `false`.
3. **Default sin declaración** (ADR-007 V1.1 §6): `false` (fail-closed).
4. **Incoherencias** (ADR-007 V1.1 §7): el resolver NO comprueba ambas fuentes en cada llamada; NO lanza por divergencia; NO valida en runtime. Usa `supports(lang)` conforme a la precedencia. La coherencia es responsabilidad de las pruebas de conformidad del adapter (ADR-006 §5) y de la auditoría documental.
5. **Ausencia de fallback desde `supports(lang) === false`**: el resultado de `adapter.supports(lang)` es final; NO se cae a la derivación por `getSupportedLanguages()` cuando `supports` devuelve `false`.
6. **Consumer autorizado** (ADR-007 V1.1 §8): exclusivamente el dominio `engine/src/adapters/`.
7. **Superficie** (ADR-006 §3, §4; ADR-007 V1.1 §9.1, §12): interna. Cero re-exports desde `engine/src/index.ts`. Cero modificación de Foundation.

### 14.2 Firma TypeScript literal (vinculante)

La firma del símbolo interno es **exactamente**:

```ts
import type {
  AdapterBase,
  AdapterKind,
} from "../types/adapters";
import type { LangCode } from "../types/language";

export function resolveLanguageSupport<K extends AdapterKind>(
  adapter: AdapterBase<K>,
  lang: LangCode,
): boolean
```

Reglas duras sobre la firma (todas vinculantes):

- **`K` debe extender `AdapterKind`** (genérico obligatorio).
- El primer parámetro es exactamente `adapter` con tipo `AdapterBase<K>`.
- El segundo parámetro es exactamente `lang` con tipo `LangCode`.
- El tipo de retorno es exactamente `boolean`.
- **No se admiten overloads**.
- **No se admiten parámetros adicionales** (ni `capabilities`, ni `registry`, ni `provider`, ni cualquier otro).
- **No se admiten parámetros con valores por defecto**.
- **No se crean tipos nuevos** (`type`, `interface`, `enum`).
- **No se modifica `AdapterBase`** ni ningún tipo de Foundation.
- **Los imports son exclusivamente los dos declarados arriba** (`AdapterBase`, `AdapterKind` desde `../types/adapters`; `LangCode` desde `../types/language`).
- El símbolo es exportable desde su módulo interno **exclusivamente** con `export function` a nivel de módulo, para facilitar tests unitarios e importación interna dentro del dominio.
- **NO se re-exporta desde `engine/src/index.ts`** bajo ningún concepto.
- **No forma parte de la API pública** del engine.

### 14.3 Estructura funcional del cuerpo

La implementación DEBE consistir exactamente en tres ramas evaluadas en orden:

1. **Rama (a) — supports presente**: si `typeof adapter.supports === "function"`, retornar `adapter.supports(lang)`. Esta rama es final; no cae a rama (b) aunque `supports` devuelva `false`.
2. **Rama (b) — derivación F1**: si `typeof adapter.getSupportedLanguages === "function"`, aplicar F1 (variable intermedia legible sobre el `ReadonlySet<LangCode>` retornado) y retornar `supported.has(lang)`.
3. **Rama (c) — default fail-closed**: retornar `false`.

### 14.4 Propiedades operativas

- Pura (mismo input → mismo output).
- Cero mutación del adapter.
- Cero mutación del `ReadonlySet<LangCode>` retornado.
- Cero estado global.
- Cero red, cero disco, cero variables de entorno.
- Cero logging.
- Cero conocimiento de proveedores.
- Cero lógica de selección, `AdapterRegistry` ni Engine.
- Cero dependencias nuevas.
- Cero caché.

### 14.5 JSDoc del símbolo

Debe citar expresamente ADR-006 §1 (ubicación), ADR-006 §2(b) (opción autorizada), ADR-007 V1.1 §5 (precedencia), §6 (default fail-closed), §7 (no validación), §8 (materializador autorizado), §9.3 (forma canónica F1) y remitir al contrato interno `engine/src/adapters/CONTRACT.md`.

## §15. Archivos permitidos

Lista **cerrada y exacta**. La implementación del Hito 7.3 puede crear o modificar **exclusivamente**:

**Archivos nuevos**:
- `engine/src/adapters/resolve-language-support.ts` — archivo de producción que materializa `resolveLanguageSupport`.
- `engine/src/adapters/resolve-language-support.test.ts` — archivo de tests del mecanismo interno.

**Archivos modificados**: ninguno.

Cualquier archivo adicional no listado aquí produce **detención inmediata** de la implementación y **reevaluación** por el Jefe de Proyecto.

## §16. Archivos prohibidos

La implementación **no puede** crear, modificar, mover, eliminar ni tocar:

- **`engine/src/adapters/index.ts`** (congelado por Hito 7.2 en `55f050f`; NO se modifica durante el Hito 7.3).
- **`engine/src/adapters/CONTRACT.md`** (congelado por Hito 7.2 en `55f050f`).
- **`engine/src/adapters/contract.test.ts`** (congelado por Hito 7.2 en `55f050f`).
- **`engine/src/types/adapters.test.ts`** (test §2.7 congelado por Foundation Evolution 2; ADR-007 V1.1 §11, §12).
- **`engine/src/types/adapters.ts`** (Foundation congelada).
- **`engine/src/types/language.ts`** (Foundation congelada).
- **Cualquier archivo bajo `engine/src/types/`** (Foundation congelada).
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
- El Plan Oficial del Hito 7.2 (`docs/phases/SPABLA_V2_FASE_7_HITO_7_2_PLAN.md`).
- Cualquier archivo bajo `docs/drafts/`.

## §17. Forma canónica adoptada

**F1 — Variable intermedia legible** (ADR-007 V1.1 §9.3).

La materialización de la rama (b) de la precedencia se expresa exclusivamente como:

```ts
const supported = adapter.getSupportedLanguages();
return supported.has(lang);
```

Reglas duras aplicables (ADR-007 V1.1 §9.4):

- **PROHIBIDO** escribir el patrón textual literal `getSupportedLanguages()` encadenado con `.has(...)` en cualquier archivo del engine fuera de los dos contextos autorizados por Foundation Evolution 2 §2.7 (`types/adapters.ts`, `types/adapters.test.ts`).
- **PROHIBIDO** aliases opacos, wrappers triviales sin propósito o indirecciones ocultantes.
- **PROHIBIDO** fragmentar la derivación en pasos ilegibles.
- **PROHIBIDO** invocar dinámicamente `has` mediante acceso `[..]` para eludir la detección estática.
- **PROHIBIDO** reproducir la derivación fuera de `engine/src/adapters/`.

## §18. Ausencia de validación por incoherencia

El mecanismo NO comprueba coherencia entre `supports(lang)` y `getSupportedLanguages()` en runtime. Cuando ambos existan y difieran, el mecanismo devuelve el valor de `supports(lang)` conforme a la precedencia (ADR-007 V1.1 §7). La divergencia observable es responsabilidad de las pruebas de conformidad (Hito 7.4) y de la auditoría documental. El resolver es puramente resolutorio.

## §19. Validación TypeScript

Tras la implementación, ejecutar desde `engine/`:

```
npx tsc --noEmit
```

Criterio: exit 0. Cero errores. Cero warnings. Compilación en modo `strict` con `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` (configuración actual congelada, no se modifica).

## §20. Estrategia de tests

Los tests del Hito 7.3 verifican el comportamiento runtime de `resolveLanguageSupport`. **Mínimo obligatorio: 14 tests funcionales dedicados**.

### 20.1 Tests funcionales dedicados (mínimo 14)

1. **`supports` existe y devuelve `true`** → `resolveLanguageSupport` retorna `true`.
2. **`supports` existe y devuelve `false`** → `resolveLanguageSupport` retorna `false`.
3. **Ambas declaraciones existen, `supports` tiene precedencia** → el resultado coincide con `supports`, no con la derivación desde el Set.
4. **`getSupportedLanguages` NO se invoca cuando `supports` existe** — verificable mediante contador de invocaciones sobre el fake, sin modificar Foundation.
5. **Derivación F1 positiva**: `supports` ausente, `getSupportedLanguages` presente, `lang` ∈ set → `true`.
6. **Derivación F1 negativa**: `supports` ausente, `getSupportedLanguages` presente, `lang` ∉ set → `false`.
7. **`getSupportedLanguages` devuelve `Set` vacío** → `resolveLanguageSupport` retorna `false`.
8. **Ausencia de ambas declaraciones** (adapter legacy sin `supports` ni `getSupportedLanguages`) → `resolveLanguageSupport` retorna `false` (fail-closed).
9. **Incoherencia positiva**: `supports` devuelve `true` y el Set NO contiene el idioma → prevalece `true` (no fallback a la derivación).
10. **Incoherencia negativa**: `supports` devuelve `false` y el Set SÍ contiene el idioma → prevalece `false` (no fallback tras `supports=false`).
11. **Cero mutación del adapter**: comparación de referencia y de forma del adapter antes/después.
12. **Cero mutación del `Set` devuelto por `getSupportedLanguages`**: comparación del tamaño y contenido del Set antes/después.
13. **Pureza/determinismo**: invocar `resolveLanguageSupport(adapter, lang)` dos veces con las mismas entradas produce el mismo resultado en ambas invocaciones.
14. **Cero re-export desde `engine/src/index.ts`**: verificación estática sobre el barrel público (el símbolo `resolveLanguageSupport` NO aparece en el barrel).

### 20.2 Validaciones adicionales (no sustituyen los 14 tests funcionales)

Como controles complementarios que operan sobre la suite completa:

- La suite congelada de ADR-004 §2.7 (`engine/src/types/adapters.test.ts`) debe continuar verde sin modificación.
- Ausencia de `capabilities.languages` en cualquier archivo tocado por el Hito 7.3.
- Ausencia del patrón textual literal `getSupportedLanguages\s*\(\s*\)\s*\.\s*has\s*\(` en `engine/src/adapters/resolve-language-support.ts` (garantía por diseño F1; control defensivo).
- Compilación TypeScript `npx tsc --noEmit` sin errores.
- Suite completa del engine `npx vitest run` verde.

**Estas validaciones adicionales NO deben convertirse en infraestructura reutilizable del Hito 7.4** (helpers exportables, factories de conformidad, suites parametrizadas). Son verificaciones locales del Hito 7.3.

### 20.3 Tests explícitamente NO exigidos

- Cualquier test que consulte `capabilities.languages`.
- Cualquier test que espere excepciones nuevas.
- Cualquier test de validación runtime de coherencia entre `supports` y `getSupportedLanguages`.
- Cualquier test con proveedores concretos.
- Cualquier test con mocks de red.
- Cualquier test snapshot.
- Suites parametrizadas reutilizables (pertenecen al Hito 7.4).
- Factories de conformidad o helpers exportables (Hito 7.4).
- Tests de viabilidad de F1/F2/F3 sobre escenarios sintéticos (Hito 7.5).

## §21. Validación de suite

Tras la implementación, ejecutar desde `engine/`:

```
npx vitest run src/adapters
npx vitest run
```

Criterios:

- Suite específica del dominio de adapters: verde.
- Suite completa del engine: verde.
- **Foundation Evolution 2 permanece intacta**: los 526 tests basales de Foundation Evolution 2 pasan sin modificación.
- **Test §2.7 original debe seguir verde sin cambios** (F1 evita el patrón literal por diseño).
- **Basal actual de 544 tests preservada** (529 basal previa + 3 Hito 7.1 + 15 Hito 7.2 = 544).
- Delta esperado: 544 basal preservado + N tests nuevos del Hito 7.3 (N ≥ 14 conforme a §20.1), todos ubicados dentro de `engine/src/adapters/`.
- Cero regresión.

## §22. Seguridad

- Cero secretos.
- Cero claves.
- Cero credenciales.
- Cero `process.env`.
- Cero red.
- Cero disco (salvo controles estáticos sobre el propio repo justificados en §20.2).
- Cero logging.
- Cero dependencias externas nuevas.
- Cero incremento de superficie de ataque (dominio interno no público).
- Default fail-closed §14.1(3) refuerza la postura de seguridad en runtime: adapters incompletos no reportan soporte por accidente.

## §23. Compatibilidad

- **Foundation intacta sin excepción**: `engine/src/types/*` sin cambios.
- **Lista blanca §2.7 intacta**.
- **`AdapterBase` intacto**.
- **`AdapterKind` intacto**.
- **`LangCode` intacto**.
- **`AdapterCapabilities` intacto** (vacía; `capabilities.languages` no existe y no se introduce).
- **`AdapterRegistry` intacto** (ADR-004 §2.6).
- **Superficie pública del engine intacta**: `engine/src/index.ts` sin cambios.
- **`engine/src/adapters/index.ts` intacto** (congelado por Hito 7.2).
- **`CONTRACT.md` intacto** (congelado por Hito 7.2).
- **`contract.test.ts` intacto** (congelado por Hito 7.2; sus 15 tests continúan verdes).
- **Managers, Engine, Pipeline, PipelineOrchestrator, Core API** intactos.
- **V1** intacto.
- **Adapters legacy (Fases 1–6)** siguen siendo válidos por opcionalidad de tipo (ADR-004 §2.4); `resolveLanguageSupport` retorna `false` para ellos conforme a §14.1(3).
- **Basal 544 tests** preservada bit-a-bit; delta positivo controlado por los tests nuevos de §20.
- **Configuración de build/test** intacta.
- **Cero breaking changes**.

## §24. Separación con Hito 7.4

Este plan NO introduce infraestructura reutilizable de verificación por equivalencia semántica. El Hito 7.4 tomará `resolveLanguageSupport` como base y construirá encima helpers/frameworks de conformidad reutilizables por cualquier adapter futuro. El Hito 7.3 se limita a materializar la función pura y sus 14 tests funcionales dedicados.

## §25. Separación con Hito 7.5

Este plan NO introduce escenarios sintéticos que demuestren viabilidad de las opciones (a), (b), (c). El Hito 7.5 tomará el mecanismo del Hito 7.3 y la infraestructura del Hito 7.4 para producir evidencia de viabilidad. El Hito 7.3 se limita a la materialización.

## §26. Riesgos

**Técnicos**:
- **RT1 — Fuga del símbolo interno al barrel público**. **Mitigación**: test 14 de §20.1 verifica ausencia de re-export en `engine/src/index.ts`; diff explícito sobre el barrel en cada auditoría.
- **RT2 — Divergencia entre F1 y `getSupportedLanguages().has(lang)`**. **Mitigación**: F1 es la construcción canónica idéntica al patrón salvaguardado; tests 5-6 verifican equivalencia semántica sobre casos positivos/negativos; ADR-007 V1.1 §9.3 declara el precedente idéntico en la basal congelada.
- **RT3 — Modificación accidental de Foundation**. **Mitigación**: diff explícito sobre `engine/src/types/` en la validación pre-commit; criterio de detención inmediata (§28).
- **RT4 — Aparición del patrón textual literal en `resolve-language-support.ts`**. **Mitigación**: F1 evita el patrón por diseño (variable intermedia); §20.2 verifica estáticamente su ausencia.
- **RT5 — Alias opacos o sintaxis evasiva**. **Mitigación**: prohibición expresa (§17); revisión estática del código.
- **RT6 — Superficie interna del dominio inflada por sobre-diseño**. **Mitigación**: cap de 300 líneas por archivo de producción (Code Standard §3); una única responsabilidad por módulo; el plan sólo requiere una función pura.
- **RT7 — Modificación accidental de `CONTRACT.md`, `contract.test.ts` o `index.ts`**. **Mitigación**: §16 los lista como prohibidos; diff explícito en cada auditoría.
- **RT8 — Fallback ilegítimo tras `supports(lang) === false`**. **Mitigación**: §13 lo excluye taxativamente; test 10 de §20.1 lo verifica.

**Operativos**:
- **RO1 — Presión para adelantar Hitos 7.4–7.5 aprovechando el mismo commit**. **Mitigación**: §13 lo excluye taxativamente; §28 obliga a detenerse.
- **RO2 — Interpretación divergente de la elección F1**. **Mitigación**: §9 documenta el análisis comparativo completo con 10 criterios técnicos/normativos; los descartes de F2/F3 son decisiones técnicas explícitas de este Plan, no derivadas del orden de enumeración de ADR-007.

## §27. Criterios de aceptación

- Función pura interna `resolveLanguageSupport` implementada dentro de `engine/src/adapters/` conforme a §14 (firma literal + estructura funcional).
- **Uso exclusivo de F1** conforme a §17 y ADR-007 V1.1 §9.3.
- **Tests §20.1.1–§20.1.14 verdes** (mínimo 14 tests funcionales dedicados).
- Suite completa del engine verde (544 basales preservados + N ≥ 14 nuevos, todos dentro de `engine/src/adapters/`).
- Compilación TypeScript sin errores (`npx tsc --noEmit` exit 0).
- **Cero cambios en `engine/src/types/*`**.
- **Cero cambios en `engine/src/types/adapters.test.ts`**.
- **Cero cambios en `engine/src/adapters/index.ts`**.
- **Cero cambios en `engine/src/adapters/CONTRACT.md`**.
- **Cero cambios en `engine/src/adapters/contract.test.ts`**.
- **Cero ampliación de la lista blanca §2.7**.
- **Foundation intacta sin excepción**.
- **Salvaguarda original §2.7 verde y sin modificación**.
- **Derivación exclusivamente en `engine/src/adapters/`**.
- Cero exports nuevos desde `engine/src/index.ts`.
- Cero modificaciones a archivos prohibidos (§16).
- Cero introducción de dependencias nuevas.
- Cumplimiento del Code Standard §3 (una responsabilidad por módulo; máximo 300 líneas por archivo de producción).
- Cumplimiento estricto de la semántica de §14 sin invención adicional.
- Firma TypeScript de §14.2 respetada literalmente (nombre, genérico, parámetros, retorno, imports).

## §28. Criterios de detención

La implementación debe detenerse inmediatamente y emitir NO APTO en cualquiera de los siguientes casos:

**Alcance de archivos**:
- Aparición de un archivo tocado no listado en §15.
- Necesidad de modificar `engine/src/types/*`.
- Necesidad de modificar `engine/src/types/adapters.test.ts`.
- Necesidad de modificar `engine/src/adapters/index.ts`.
- Necesidad de modificar `engine/src/adapters/CONTRACT.md` o `engine/src/adapters/contract.test.ts`.
- Aparición de un export nuevo en `engine/src/index.ts`.
- Modificación de cualquier archivo listado en §16.

**Alcance normativo**:
- Necesidad de ampliar la lista blanca §2.7.
- Detección de consulta a `capabilities.languages`.
- **Detección de contradicción entre ADR-006 y ADR-007 V1.1**.
- Contradicción con ADR-007 V1.1, ADR-006, ADR-004, ADR-005 o `CONTRACT.md`.
- Necesidad de Change Request al Plan Oficial de Fase 7 o al Plan del Hito 7.2.
- Cualquier ambigüedad no cubierta por ADR-007 V1.1 que exija criterio propio → detener y elevar al Jefe de Proyecto.

**Alcance de forma canónica**:
- **Imposibilidad de usar F1**; necesidad de cambiar a F2 o F3.
- Necesidad de una cuarta forma no autorizada por ADR-007 V1.1 §9.3.
- Detección de derivación fuera de `engine/src/adapters/`.
- Detección de alias opaco en el código de producción.
- Detección de fragmentación deliberada e ilegible.
- Detección de invocación dinámica de `has` (`set["has"](lang)` y similares).

**Alcance de firma y semántica**:
- **Firma literal de §14.2 no puede implementarse utilizando exclusivamente los tipos existentes** (`AdapterBase`, `AdapterKind`, `LangCode`).
- Necesidad de modificar `AdapterBase`, `AdapterKind` o `LangCode`.
- Necesidad de cambiar el nombre del símbolo `resolveLanguageSupport`.
- Necesidad de cambiar los nombres de archivo `resolve-language-support.ts` o `resolve-language-support.test.ts`.
- Necesidad de cambiar el orden de parámetros (`adapter`, `lang`).
- Necesidad de añadir parámetros adicionales al símbolo.
- Necesidad de cambiar el tipo de retorno (distinto de `boolean`).
- Necesidad de introducir fallback desde `supports(lang) === false` hacia la derivación por `getSupportedLanguages()`.
- Necesidad de crear un nuevo tipo, `interface`, `enum` o contrato.

**Alcance de build y suite**:
- Introducción de dependencia nueva en `engine/package.json`.
- Modificación de `engine/tsconfig.json` o `engine/vitest.config.ts`.
- Detección de logging, red, disco no controlado, `process.env`, secretos.
- Regresión en la suite basal de 544 tests.
- Fallo de compilación TypeScript.

## §29. Secuencia de implementación futura

1. **Verificar rama, HEAD y working tree** post-cierre del Hito 7.2: HEAD `55f050f`, 544 tests verdes.
2. **Releer** ADR-007 V1.1, CONTRACT.md, contract.test.ts, index.ts y adapters.ts (Foundation).
3. **Crear** `engine/src/adapters/resolve-language-support.ts` con la función pura `resolveLanguageSupport` conforme a §14.2 (firma literal) y §14.3 (estructura funcional), con JSDoc citando ADRs conforme a §14.5.
4. **Crear** `engine/src/adapters/resolve-language-support.test.ts` con los 14 tests dedicados de §20.1.
5. **Verificar** que `engine/src/types/*` permanece intacto (`git diff -- engine/src/types/` vacío).
6. **Verificar** que `engine/src/adapters/index.ts`, `CONTRACT.md` y `contract.test.ts` permanecen intactos.
7. **Ejecutar** `npx tsc --noEmit` desde `engine/`.
8. **Ejecutar** `npx vitest run src/adapters` y `npx vitest run`.
9. **Auditar diffs** (`git status --short`, `git diff --stat`, `git diff --name-only`, `git diff --check`).
10. **Entregar** reporte de implementación para auditoría independiente.
11. **Detenerse** sin commit, sin push, sin tag hasta autorización expresa.

## §30. Secuencia de auditoría y cierre

1. Auditoría independiente completa contra Plan del Hito 7.3, ADRs, `CONTRACT.md` y basal.
2. Veredicto formal (APTO / APTO CON OBSERVACIONES / NO APTO).
3. Corrección expresa si aplica, seguida de reauditoría.
4. Autorización expresa del JP para cierre.
5. Staging estricto de los 2 archivos autorizados.
6. Verificación de staging (cero archivos adicionales).
7. Commit atómico con mensaje: `feat(engine): fase 7 hito 7.3 — provide default language support semantics`.
8. Push a `origin/spabla-v2/fase-7-adapters-domain`.
9. Verificación local === remoto.
10. Sin tag (política del proyecto: tag al cierre de fase, no de hito).

## §31. Veredicto documental

**PLAN OFICIAL DEL HITO 7.3 V1.1 APROBADO Y CONGELADO.**

Este plan es **vinculante**. **Sustituye cualquier borrador o versión previa** del Plan del Hito 7.3 (V1.0); esa versión anterior queda como referencia histórica exclusivamente en §7 y no tiene validez normativa. **Cualquier modificación posterior de este plan requiere una versión nueva formalmente auditada y aprobada** conforme al proceso de gobernanza vigente.

**La congelación de este plan NO equivale a iniciar la implementación del Hito 7.3.** El inicio de la implementación requiere una **orden expresa posterior** del Jefe de Proyecto que autorice específicamente la ejecución del Hito 7.3 conforme al plan aquí congelado. Hasta que exista esa orden expresa:

- ninguna implementación del mecanismo `resolveLanguageSupport` puede comenzar;
- ningún archivo `engine/src/adapters/resolve-language-support.ts` puede crearse;
- ningún archivo `engine/src/adapters/resolve-language-support.test.ts` puede crearse;
- ninguna rama nueva, ningún commit y ningún push relacionados con la ejecución material del Hito 7.3 pueden ejecutarse;
- ningún avance sobre los Hitos 7.4 o 7.5 puede iniciarse.

**Estado**: APROBADO Y CONGELADO. Aún no INICIADO. La siguiente acción autorizada por esta congelación es exclusivamente la emisión, por parte del Jefe de Proyecto, de una orden separada de implementación del Hito 7.3 conforme a este plan.

Justificación:
- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1, Plan Oficial de Fase 7, Plan del Hito 7.2 V1.3 y `CONTRACT.md`.
- Alineamiento literal con Plan Oficial de Fase 7 §7 Hito 7.3 (líneas 81–84).
- Selecciona **F1 justificadamente** con análisis comparativo de 20 dimensiones y 10 criterios técnicos/normativos, sin apelar al orden de enumeración de ADR-007 V1.1 §9.3.
- **Firma TypeScript literal fijada** en §14.2 con reglas duras vinculantes.
- **Nombres de archivo exactos fijados** en §15 (`resolve-language-support.ts` y `resolve-language-support.test.ts`); `engine/src/adapters/index.ts` explícitamente prohibido en §16.
- **Renombrado global** `resolveSupport` → `resolveLanguageSupport` para eliminar ambigüedad respecto a "soporte general".
- **14 tests funcionales dedicados mínimos** listados en §20.1, más validaciones adicionales en §20.2 sin invadir el Hito 7.4.
- **§28 criterios de detención ampliados** con contradicciones ADR-006/ADR-007, firma no implementable, renombrado, cambio de parámetros/retorno, fallback ilegítimo, creación de tipos nuevos.
- Alcance estrictamente circunscrito a la materialización runtime de la función pura y sus tests dedicados.
- Cero solapamiento con Hito 7.4 (infraestructura reutilizable) ni con Hito 7.5 (escenarios sintéticos).
- Cero autorización explícita o implícita para modificar `engine/src/types/*`, `CONTRACT.md`, `contract.test.ts`, `index.ts` del dominio ni el Plan del Hito 7.2.
- Cero decisiones arquitectónicas nuevas: toda la semántica es cita literal de ADR-007 V1.1 §§4–9.
- Cero cambios de código, tests o configuración como parte de esta corrección documental.
- **No autoriza implementación por sí mismo**: requiere autorización expresa del Jefe de Proyecto y reauditoría independiente previa.
