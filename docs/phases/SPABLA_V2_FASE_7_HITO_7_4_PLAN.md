# PLAN CANDIDATO DE IMPLEMENTACIÓN — HITO 7.4 (Coherencia del contrato verificable de forma reutilizable)

## §1. Título

Plan Candidato de Implementación — Fase 7 · Hito 7.4 — Infraestructura interna reutilizable de verificación de conformidad de adapters dentro del dominio `engine/src/adapters/`.

## §2. Tipo documental

Plan de hito (implementación de infraestructura interna de tests). Documento derivado exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1 (APROBADA Y CONGELADA), del Plan Oficial de Fase 7 (congelado), del Plan Oficial del Hito 7.2 V1.3 (APROBADO Y CONGELADO en `7e896c5`), del Plan Oficial del Hito 7.3 V1.1 (APROBADO Y CONGELADO en `252e712`), del contrato interno `engine/src/adapters/CONTRACT.md` (congelado en `55f050f`) y de la implementación cerrada del Hito 7.3 (`0c17872`). No introduce decisiones arquitectónicas nuevas.

## §3. Estado

**APROBADO Y CONGELADO — V1.1 (reauditoría APTO el 2026-07-18).**

Este plan es vinculante. Cualquier desviación durante la implementación produce detención inmediata conforme a §25.

## §4. Versión

V1.1.

## §5. Fecha

2026-07-18.

## §6. Rama y commit base

- Rama: `spabla-v2/fase-7-adapters-domain`.
- HEAD base: `0c17872d3db7d96ba82a32f37de8afe8fefc3ed8` (commit `feat(engine): fase 7 hito 7.3 — provide default language support semantics`).
- Base tag de referencia: `spabla-v2-phase-7-plan-2026-07-11` (Plan Oficial de Fase 7 congelado).
- Basal de tests: **558 verdes** en 20 archivos.

## §7. Historial de correcciones

- **V1.0 (2026-07-18)** — redacción inicial. Recibió veredicto NO APTO PARA CONGELACIÓN por auditoría independiente con dos hallazgos críticos (C1, C2), uno alto (A1), dos medios (M1, M2), un bajo (B1) y dos observaciones (O1, O2).
- **V1.1 (2026-07-18)** — corrección obligatoria contra la auditoría previa. Aplicadas todas las correcciones autorizadas:
  - **C1 resuelto**: firmas TypeScript literales y nombres de símbolos fijados en §14.2 (Firmas literales y superficie interna).
  - **C2 resuelto**: eliminado el criterio circular condicionado a la propia auditoría en §24; criterios de aceptación mecánicos exclusivamente derivados de §14.2.
  - **A1 resuelto**: eliminada la contradicción entre §26 y §31; §26 pasa a citar las firmas literales de §14.2; §31 (antiguo Anexo A) sustituido por nota histórica cerrada.
  - **M1 resuelto**: tipos, reason codes, exports y estructura de diagnósticos fijados literalmente en §14.2.
  - **M2 resuelto**: discriminated union `ConformanceDiagnostic<K>` fijada con campos obligatorios y ausencia representada por `null`, eliminando ambigüedad bajo `exactOptionalPropertyTypes: true`.
  - **O1 aplicada**: sustituidas las menciones normativas a "55 códigos" por "el catálogo canónico vigente de LangCode definido en `engine/src/types/language.ts`"; la cifra se conserva únicamente en el historial de V1.0 como dato histórico.
  - **O2 mantenida sin cambio**: el uso ilustrativo de "por ejemplo" en §20 (antiguo) permanece como ejemplo explicativo no normativo.
  - **Corrección adicional del Paso 17 (orden posterior del Jefe de Proyecto)**: §15.1 cerrado normativamente — `conformance.test.ts` NO importa directamente `./resolve-language-support`; la integración con el resolver se verifica indirectamente a través de `evaluateConformanceCase`. Eliminada la frase abierta que autorizaba condicionalmente ese import.
  - Cero cambio en el objetivo arquitectónico. Opción G preservada. Archivos futuros preservados (`conformance.ts` + `conformance.test.ts`). 17 tests mínimos preservados. Hito 7.5 intacto.
- **Congelación V1.1 (2026-07-18)**: reauditoría independiente APTO PARA CONGELAR. Cero defectos materiales. Estado documental transicionado a APROBADO Y CONGELADO por autorización expresa del Jefe de Proyecto.

## §8. Dependencias normativas

- `ADR-003-STRATEGIC-VISION` (congelado).
- `ADR-004-FOUNDATION-EVOLUTION-2` (congelado).
- `ADR-005-LANGUAGE-CATALOG` (congelado; catálogo canónico vigente de LangCode definido en `engine/src/types/language.ts`).
- `ADR-006-RUNTIME-ADAPTER-RESOLUTION` (congelado).
- `ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION` **V1.1** (APROBADA Y CONGELADA en `6f49b92`).
- `SPABLA_V2_FASE_7_PLAN.md` (congelado el 2026-07-11).
- `SPABLA_V2_FASE_7_HITO_7_2_PLAN.md` V1.3 (APROBADO Y CONGELADO en `7e896c5`).
- `SPABLA_V2_FASE_7_HITO_7_3_PLAN.md` V1.1 (APROBADO Y CONGELADO en `252e712`).
- `engine/src/adapters/CONTRACT.md` (congelado en `55f050f`).
- `engine/src/adapters/resolve-language-support.ts` (Hito 7.3 congelado en `0c17872`).
- `engine/src/adapters/resolve-language-support.test.ts` (Hito 7.3 congelado en `0c17872`).
- Plan Foundation Evolution 2 (congelado).

## §9. Cita literal del alcance del Hito 7.4

Plan Oficial de Fase 7 §7 (líneas 86–89):

> **Hito 7.4 — Coherencia del contrato verificable de forma reutilizable**
> - Objetivo funcional: la coherencia entre `supports(lang)` y `getSupportedLanguages().has(lang)` (ADR-006 §5) queda verificable mediante **infraestructura reutilizable** dentro del dominio.
> - Resultado esperado: cualquier adapter futuro puede someter su implementación a **pruebas de equivalencia semántica sin duplicar lógica de verificación**.
> - Criterio de finalización: auditoría APTO; verificabilidad demostrada sobre escenarios controlados dentro del propio dominio.

## §10. Contexto

El Hito 7.3 congeló `resolveLanguageSupport` (commit `0c17872`), función pura interna que implementa la precedencia normativa `supports(lang) → derivación F1 desde getSupportedLanguages() → false`. Sus 14 tests dedicados verifican el comportamiento del resolver sobre fakes específicos. Suite actual: 558 tests verdes.

El **Hito 7.4** materializa **infraestructura interna reutilizable** que permite aplicar el mismo conjunto de comprobaciones de conformidad a cualquier adapter real futuro sin duplicar la lógica de verificación adapter por adapter. Cero materialización runtime nueva; cero cambio en `resolveLanguageSupport`; cero cambio en Foundation; cero superficie pública.

## §11. Problema

### 11.1 Carencia tras el Hito 7.3

Los 14 tests del Hito 7.3 cubren `resolveLanguageSupport` sobre fakes locales, no reutilizables por adapters reales futuros.

### 11.2 Reparto de responsabilidades

- **Adapter individual**: declarar `kind`, opcionalmente `supports?` y/o `getSupportedLanguages?` con equivalencia semántica.
- **Infraestructura común (Hito 7.4)**: función/utilidad reutilizable que reciba el adapter y su perfil declarativo y verifique todas las invariantes normativas aplicables en un solo lugar.
- **Hito 7.5**: escenarios sintéticos que demuestren viabilidad de las opciones (a)/(b)/(c) sin duplicar la infraestructura.

### 11.3 Relación entre `supports(lang)`, `getSupportedLanguages()` y `resolveLanguageSupport(adapter, lang)`

- `supports(lang)`: declaración puntual, opcional (ADR-004 §2.3).
- `getSupportedLanguages()`: declaración conjunta, opcional (ADR-004 §2.3), **fuente única de verdad**.
- `resolveLanguageSupport(adapter, lang)`: resolución determinista con precedencia (a) supports → (b) F1 sobre gSL → (c) false fail-closed (Hito 7.3 congelado).

Equivalencia semántica exigida (ADR-004 §2.3, ADR-006 §5): cuando `supports` y `getSupportedLanguages` están simultáneamente declarados, para todo `lang ∈ LangCode`:

```
adapter.supports(lang) === adapter.getSupportedLanguages().has(lang)
```

### 11.4 Incoherencias detectadas en tests, no en runtime

ADR-007 V1.1 §7 y el Hito 7.3 excluyen validación runtime del resolver. La divergencia entre declaraciones es incumplimiento del adapter (ADR-004 §2.3); su detección corresponde al Hito 7.4.

### 11.5 Prohibiciones sobre alcance

El Hito 7.4 NO modifica `resolveLanguageSupport` (congelado). No anticipa los escenarios sintéticos del Hito 7.5.

## §12. Objetivo funcional

Introducir una **infraestructura interna reutilizable de conformidad** dentro del dominio `engine/src/adapters/` que verifique 9 invariantes normativos: declaraciones (`supports`, `getSupportedLanguages`), precedencia normativa, coherencia semántica bidireccional, comportamiento fail-closed, ausencia de `capabilities.languages`, ausencia de re-export público, compatibilidad estructural con `AdapterBase<K>`/`AdapterKind`, cumplimiento del catálogo canónico vigente de `LangCode`, preservación de Foundation.

## §13. Alternativas de diseño analizadas

7 alternativas (A–G) evaluadas contra 12 dimensiones. **Opción recomendada: G — Combinación mínima**: perfil declarativo + factory ligera + evaluador puro. Alternativas descartadas por razones específicas: A (no reutilizable), B (menos control sobre aislamiento), C (menos flexible), D (desacople excesivo), E (herencia OOP innecesaria), F (viola objetivo del Plan Fase 7).

### 13.1 Justificación técnica y normativa de G

- Cumple objetivo del Plan Oficial de Fase 7 §7 Hito 7.4.
- Cero superficie pública nueva.
- Cero cambio en Foundation ni `resolveLanguageSupport`.
- Compatibilidad con `resolveLanguageSupport` congelado (consumido como caja negra).
- Compatibilidad con Vitest.
- Estrategia de fallos segura (datos, no aserciones).
- Reversibilidad alta.

## §14. Semántica normativa y firmas TypeScript literales

### 14.1 Semántica normativa

Derivada literalmente de ADR-007 V1.1 y ADR-004 §2.3 / ADR-006 §5. La infraestructura:

1. **Fuentes válidas** (ADR-007 V1.1 §4): únicamente `adapter.supports(lang)` y `adapter.getSupportedLanguages()`. `capabilities.languages` NO participa.
2. **Precedencia** (ADR-007 V1.1 §5): (a) supports final si existe; (b) derivación F1 sobre gSL sólo si supports ausente; (c) `false` fail-closed.
3. **Default sin declaración** (ADR-007 V1.1 §6): `false`.
4. **Incoherencias** (ADR-007 V1.1 §7): responsabilidad de la infraestructura del Hito 7.4 (tests), NO del resolver.
5. **Ausencia de fallback tras `supports=false`** (ADR-007 V1.1 §5(a) + Plan Hito 7.3 V1.1 §14.1(5)).
6. **Consumer autorizado** (ADR-007 V1.1 §8): exclusivamente `engine/src/adapters/`.
7. **Superficie** (ADR-006 §3, §4): interna. Cero re-exports desde `engine/src/index.ts`.

### 14.2 Firmas TypeScript literales y superficie interna (vinculante)

**Imports exactos permitidos en `conformance.ts`**:

```ts
import type {
  AdapterBase,
  AdapterKind,
} from "../types/adapters";
import {
  isLangCode,
  type LangCode,
} from "../types/language";
import { resolveLanguageSupport } from "./resolve-language-support";
```

**No se autoriza ningún import adicional en `conformance.ts`.**

**Tipos exportados** (11 símbolos exactos):

```ts
export type ConformanceDeclaration =
  | "supports"
  | "gsl"
  | "both"
  | "none";
```

```ts
export type ConformanceReason =
  | "missing_supports"
  | "missing_gsl"
  | "unexpected_supports"
  | "unexpected_gsl"
  | "supports_gsl_divergence"
  | "positive_resolves_false"
  | "negative_resolves_true"
  | "invalid_langcode_declared"
  | "adapter_mutated"
  | "set_mutated"
  | "kind_mismatch"
  | "nondeterministic";
```

```ts
export type ConformanceProfile<K extends AdapterKind> = {
  readonly kind: K;
  readonly declares: ConformanceDeclaration;
  readonly positiveLangs: ReadonlyArray<LangCode>;
  readonly negativeLangs: ReadonlyArray<LangCode>;
  readonly production: boolean;
};
```

Justificación de `production: boolean` obligatorio (no opcional):
- Evita ambigüedad bajo `exactOptionalPropertyTypes: true`.
- Permite distinguir explícitamente perfiles legacy de uso no productivo.
- Impide que la ausencia del campo se interprete unilateralmente.

```ts
export type ConformanceSourceState = {
  readonly supports: boolean;
  readonly gsl: boolean;
};
```

```ts
export type ConformanceExpectation = {
  readonly lang: LangCode;
  readonly expected: boolean;
};
```

```ts
export type ConformanceCase<K extends AdapterKind> = {
  readonly name: string;
  readonly kind: K;
  readonly declaration: ConformanceDeclaration;
  readonly expectation: ConformanceExpectation | null;
  readonly adapterFactory: () => AdapterBase<K>;
};
```

Reglas duras para `ConformanceCase`:
- `name` es obligatorio.
- `expectation` usa `null` cuando el caso no está vinculado a un idioma; NUNCA `undefined`.
- Cero propiedades opcionales (`field?:` prohibido en este tipo).
- La factory es síncrona.
- La factory no acepta parámetros.
- La factory retorna exactamente `AdapterBase<K>`.
- Cero `Promise`. Cero `async`.

```ts
export type ConformanceSuccess = {
  readonly ok: true;
};
```

```ts
export type ConformanceFailure<K extends AdapterKind> = {
  readonly ok: false;
  readonly reason: ConformanceReason;
  readonly adapterKind: K;
  readonly lang: LangCode | null;
  readonly expected: boolean | null;
  readonly actual: boolean | null;
  readonly sourcesDeclared: ConformanceSourceState;
};
```

```ts
export type ConformanceDiagnostic<K extends AdapterKind> =
  | ConformanceSuccess
  | ConformanceFailure<K>;
```

Reglas absolutas sobre diagnósticos:
- Cero campos opcionales (`field?:` prohibido).
- Cero `unknown`. Cero `any`.
- La ausencia se representa exclusivamente con `null`.
- `expected` y `actual` son exclusivamente `boolean` o `null`.
- `lang` es exclusivamente `LangCode` o `null`.
- `sourcesDeclared` siempre presente en fallos.
- El éxito contiene únicamente `{ readonly ok: true }`.
- Cero mensajes libres, cero `stack`, cero `cause`, cero metadata, cero arrays de errores.
- Un caso produce un único diagnóstico.

**Funciones exportadas** (2 símbolos exactos):

```ts
export function buildConformanceCases<K extends AdapterKind>(
  profile: ConformanceProfile<K>,
  adapterFactory: () => AdapterBase<K>,
): ReadonlyArray<ConformanceCase<K>>;
```

```ts
export function evaluateConformanceCase<K extends AdapterKind>(
  testCase: ConformanceCase<K>,
): ConformanceDiagnostic<K>;
```

**Decisión normativa vinculante**: `evaluateConformanceCase` recibe únicamente `testCase`. **NO recibe un segundo parámetro `adapter`**. La instancia se crea internamente mediante `const adapter = testCase.adapterFactory();`. Justificación:
- Garantiza instancia fresca por evaluación.
- Evita contaminación entre tests.
- Evita contradicción entre el adapter de `testCase` y un adapter externo.
- Concentra la responsabilidad de aislamiento.
- Hace que `ConformanceCase` sea autocontenido.

**Reglas de firma para ambas funciones**:
- `export function` (no arrow).
- Cero overloads.
- Cero parámetros adicionales.
- Cero valores por defecto.
- Cero `Promise`. Cero `async`.
- Cero callbacks adicionales.
- Cero opciones configurables.
- Cero generics adicionales.
- Cero clases.

### 14.3 Exports exactos autorizados

`conformance.ts` exporta **exclusivamente** los siguientes 11 símbolos, en cualquier orden:

- `ConformanceDeclaration`
- `ConformanceReason`
- `ConformanceProfile`
- `ConformanceSourceState`
- `ConformanceExpectation`
- `ConformanceCase`
- `ConformanceSuccess`
- `ConformanceFailure`
- `ConformanceDiagnostic`
- `buildConformanceCases`
- `evaluateConformanceCase`

**Prohibido** exportar cualquier otro símbolo: cero constantes, cero fixtures, cero fakes, cero helpers secundarios. Los helpers internos necesarios permanecen sin `export`.

**Prohibido** re-exportar cualquiera de estos 11 símbolos desde `engine/src/adapters/index.ts` ni desde `engine/src/index.ts`.

### 14.4 Semántica de `buildConformanceCases`

`buildConformanceCases`:

1. Valida estructuralmente el perfil generando casos que verifiquen esa estructura.
2. NO lanza por incumplimientos del adapter.
3. Construye una matriz inmutable de casos.
4. Genera casos para todas las entradas de `positiveLangs`.
5. Genera casos para todas las entradas de `negativeLangs`.
6. Genera casos estructurales correspondientes a `declares` (presencia/ausencia de miembros).
7. Genera caso de coincidencia de `kind`.
8. Genera casos de determinismo.
9. Genera casos de no mutación (adapter y Set).
10. NO ejecuta la factory.
11. NO ejecuta `resolveLanguageSupport`.
12. NO registra tests de Vitest.
13. NO usa `expect`.
14. NO produce diagnósticos.
15. NO muta `profile`.
16. NO muta arrays de entrada.
17. Devuelve `ReadonlyArray<ConformanceCase<K>>`.

**Cobertura garantizada**:
- Todos los idiomas declarados en `positiveLangs`.
- Todos los idiomas declarados en `negativeLangs`.
- Invariantes estructurales del perfil.

**Cobertura NO garantizada**: exhaustividad sobre el catálogo canónico vigente. La responsabilidad de proporcionar `positiveLangs`/`negativeLangs` representativos recae en el perfil.

### 14.5 Semántica de `evaluateConformanceCase`

`evaluateConformanceCase`:

1. Crea exactamente UNA instancia mediante `testCase.adapterFactory()` por evaluación ordinaria.
2. Puede crear una segunda instancia fresca exclusivamente para casos de aislamiento o determinismo.
3. NO comparte instancias entre casos.
4. NO usa estado global.
5. NO usa caché.
6. NO registra tests.
7. NO usa `expect`.
8. NO lanza por incumplimientos de conformidad.
9. Devuelve siempre `ConformanceDiagnostic<K>`.
10. Puede propagar únicamente errores inesperados de ejecución de la propia factory o del adapter; NO los convierte en reason codes nuevos.
11. Consume `resolveLanguageSupport` como caja negra.
12. NO reimplementa el algoritmo de precedencia.
13. Puede invocar directamente `supports` y `getSupportedLanguages` únicamente para: comprobar presencia/ausencia declarativa, verificar equivalencia semántica, contenido del Set, determinismo, no mutación.
14. Debe usar variable intermedia para cualquier Set: `const supported = adapter.getSupportedLanguages();`.
15. **Prohibido** el patrón textual literal `getSupportedLanguages().has(` (ADR-004 §2.7 + ADR-007 V1.1 §9.4).
16. **Prohibido** `capabilities.languages`.
17. **Prohibido** fallback tras `supports=false`.

### 14.6 Semántica por declaración

Para `declares: "supports"`:
- `supports` DEBE existir; `getSupportedLanguages` DEBE estar ausente.
- Todos los `positiveLangs` DEBEN resolver `true` via `resolveLanguageSupport`.
- Todos los `negativeLangs` DEBEN resolver `false`.

Para `declares: "gsl"`:
- `getSupportedLanguages` DEBE existir; `supports` DEBE estar ausente.
- Todos los `positiveLangs` DEBEN pertenecer al Set.
- Todos los `negativeLangs` DEBEN estar ausentes del Set.
- `resolveLanguageSupport` DEBE coincidir con esas expectativas.

Para `declares: "both"`:
- Ambas declaraciones DEBEN existir.
- Para cada idioma en `positiveLangs ∪ negativeLangs`: `adapter.supports(lang) === supported.has(lang)`.
- `resolveLanguageSupport` DEBE coincidir con `supports(lang)`.
- Divergencia produce `supports_gsl_divergence`.
- **Cero fallback** permitido.

Para `declares: "none"`:
- `supports` DEBE estar ausente.
- `getSupportedLanguages` DEBE estar ausente.
- `production` DEBE ser `false`.
- `resolveLanguageSupport` DEBE devolver `false` para todos los idiomas incluidos en `positiveLangs ∪ negativeLangs`.
- `positiveLangs` DEBE estar vacío.
- `negativeLangs` DEBE contener al menos un idioma de prueba.

Si `declares: "none"` y `production === true`: produce diagnóstico de incumplimiento con reason code **`missing_supports`** (decisión normativa: se reutiliza el reason code existente para perfiles productivos sin declaración primaria, evitando ampliar la taxonomía).

### 14.7 Reglas de validación de perfil

1. Para perfiles distintos de `"none"`:
   - `positiveLangs.length >= 1`.
   - `negativeLangs.length >= 1`.
2. Para `"none"`:
   - `positiveLangs.length === 0`.
   - `negativeLangs.length >= 1`.
   - `production === false`.
3. Todos los idiomas declarados DEBEN pasar `isLangCode` (validación runtime importada de Foundation).
4. Prohibido que un mismo `LangCode` aparezca simultáneamente en `positiveLangs` y `negativeLangs`.
5. Prohibidos duplicados dentro de cada array.
6. **Cero catálogo paralelo**.
7. **Cero hardcode** de todos los idiomas.
8. La validación se limita al **catálogo canónico vigente** definido por Foundation (`engine/src/types/language.ts`).

### 14.8 Mapa exacto de reason codes y precedencia

Asignación 1:1 de cada reason code a su condición exacta:

- **`invalid_langcode_declared`**: un valor declarado (en `positiveLangs` o `negativeLangs`) no pasa `isLangCode`.
- **`kind_mismatch`**: `adapter.kind !== profile.kind`.
- **`missing_supports`**: `declares` exige `supports` y el método no existe. **También** para `declares: "none"` con `production === true`.
- **`missing_gsl`**: `declares` exige `getSupportedLanguages` y el método no existe.
- **`unexpected_supports`**: `declares` es `"gsl"` o `"none"` y `supports` existe.
- **`unexpected_gsl`**: `declares` es `"supports"` o `"none"` y `getSupportedLanguages` existe.
- **`supports_gsl_divergence`**: ambas declaraciones existen y difieren para el `LangCode` evaluado.
- **`positive_resolves_false`**: `resolveLanguageSupport` devuelve `false` para un idioma en `positiveLangs`.
- **`negative_resolves_true`**: `resolveLanguageSupport` devuelve `true` para un idioma en `negativeLangs`.
- **`adapter_mutated`**: cambian propiedades enumerables relevantes del adapter fuera de contadores de instrumentación expresamente autorizados en tests.
- **`set_mutated`**: cambia tamaño o contenido del Set retornado por `getSupportedLanguages`.
- **`nondeterministic`**: evaluaciones sucesivas sobre instancias equivalentes y entradas idénticas producen resultados distintos.

**Precedencia exacta** cuando un caso puede incumplir varias reglas (el evaluador aplica esta lista en orden y emite el PRIMER reason code que aplique):

1. `invalid_langcode_declared`
2. `kind_mismatch`
3. `missing_supports`
4. `missing_gsl`
5. `unexpected_supports`
6. `unexpected_gsl`
7. `supports_gsl_divergence`
8. `positive_resolves_false`
9. `negative_resolves_true`
10. `adapter_mutated`
11. `set_mutated`
12. `nondeterministic`

**Prohibido** dejar la elección del reason code a la implementación fuera de esta precedencia.

## §15. Archivos permitidos

Lista **cerrada y exacta**. La implementación del Hito 7.4 puede crear o modificar **exclusivamente**:

**Archivos nuevos**:
- `engine/src/adapters/conformance.ts` — infraestructura interna reutilizable de conformidad. Contiene exclusivamente los 11 símbolos exportados de §14.3 y los helpers internos sin export necesarios para implementar §14.4/§14.5/§14.6/§14.7/§14.8. JSDoc `@internal`. Cero `console.*`, cero `process.env`, cero red, cero disco.
- `engine/src/adapters/conformance.test.ts` — tests dedicados de la propia infraestructura conforme a §22.

**Archivos modificados**: ninguno.

Cualquier archivo adicional produce **detención inmediata**.

### 15.1 Imports autorizados en `conformance.test.ts`

Lista **cerrada y exacta**. Únicamente:

- `vitest` (para `describe`, `it`, `expect`).
- `node:fs`, `node:path`, `node:url` (para verificación estática del barrel público en test 16).
- Tipos de Foundation: `AdapterBase`, `AdapterKind`, `LangCode` (desde `../types/adapters` y `../types/language`).
- `./conformance` (para los 11 símbolos exportados por la infraestructura).

**Decisión normativa cerrada**: `conformance.test.ts` **NO** importa directamente `./resolve-language-support`. La integración con el resolver se verifica indirectamente a través de `evaluateConformanceCase`, que lo consume como caja negra internamente (§14.5(11)). Esta decisión concentra la responsabilidad de invocación del resolver en el evaluador y evita duplicar caminos de acceso al resolver desde los tests.

Cualquier import adicional en `conformance.test.ts` produce detención inmediata (§25).

## §16. Archivos prohibidos

La implementación **no puede** crear, modificar, mover, eliminar ni tocar:

- Cualquier archivo bajo `engine/src/types/` (Foundation congelada; ADR-007 V1.1 §11 y §14).
- `engine/src/adapters/resolve-language-support.ts` (Hito 7.3 congelado en `0c17872`).
- `engine/src/adapters/resolve-language-support.test.ts` (Hito 7.3 congelado).
- `engine/src/adapters/CONTRACT.md` (Hito 7.2 congelado en `55f050f`).
- `engine/src/adapters/contract.test.ts` (Hito 7.2 congelado).
- `engine/src/adapters/index.ts` (Hito 7.1 congelado; protegido por Plan Hito 7.3 §16 y por `contract.test.ts` §14).
- Cualquier ampliación de la lista blanca de la salvaguarda ADR-004 §2.7.
- `engine/src/adapter-registry/**` (ADR-004 §2.6).
- Cualquier Manager (`stt/`, `translation/`, `tts/`, `messaging/`, `session-manager/`, `conversation-manager/`, `participant-manager/`, `language-manager/`).
- `engine/src/engine/**`, `engine/src/pipeline/**`, `engine/src/pipeline-orchestrator/**`, `engine/src/core-api/**`, `engine/src/event-bus/**`, `engine/src/state-machine/**`.
- `engine/src/index.ts` (barrel público).
- V1: `app/**`, `server/**`, `lib/**`, `public/**`, `supabase/**`.
- `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`.
- Cualquier ADR bajo `docs/decisions/`.
- Cualquier plan congelado (`SPABLA_V2_FASE_7_PLAN.md`, Plan Hito 7.2, Plan Hito 7.3).
- Cualquier archivo bajo `docs/drafts/`.

## §17. Superficie y política de exports

- `conformance.ts` exporta los 11 símbolos de §14.3, ni más ni menos.
- **Prohibido** re-export desde `engine/src/index.ts` (barrel público).
- **Prohibido** re-export desde `engine/src/adapters/index.ts` (que sigue siendo `export {};`).
- **Prohibido** importar `conformance.ts` desde Managers, `AdapterRegistry`, Engine, Pipeline, Core API, V1 o cualquier código de producción.
- **Prohibido** convertir la infraestructura en API pública.
- **Prohibido** publicar los tipos internos en el barrel público.
- Ubicación: `engine/src/adapters/`. Extensión `.ts` (no `.test.ts`) justificada por §18.4 del Plan V1.0 preservado sin cambios.

## §18. Forma canónica y prohibiciones ADR-004 §2.7

- Toda derivación desde `getSupportedLanguages()` en `conformance.ts` DEBE usar variable intermedia (F1): `const supported = adapter.getSupportedLanguages(); return supported.has(lang);`.
- **Prohibido** el patrón textual literal `getSupportedLanguages().has(` en cualquier archivo `.ts` del engine fuera de los contextos autorizados por Foundation Evolution 2 §2.7.
- **Prohibido** aliases opacos, fragmentación deliberada ilegible, invocación dinámica de `has`.

## §19. Ausencia de validación runtime en el resolver

El evaluador del Hito 7.4 verifica conformidad. NO modifica `resolveLanguageSupport` ni añade validación runtime al resolver. Consume el resolver congelado como caja negra.

## §20. Validación TypeScript

Tras la implementación, ejecutar desde `engine/`:

```
npx tsc --noEmit
```

Criterio: exit 0. Cero errores. Cero warnings. Compilación en modo `strict` con `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.

## §21. Ejemplo ilustrativo de uso (no normativo)

El siguiente fragmento muestra cómo un adapter real futuro consumiría la infraestructura (por ejemplo, en su propio archivo de tests dentro de `engine/src/adapters/<adapter>/`; ejemplo puramente explicativo, no normativo):

```ts
const profile: ConformanceProfile<"mt"> = { /* ... */ };
const adapterFactory = () => new RealMTAdapter();
const cases = buildConformanceCases(profile, adapterFactory);
for (const testCase of cases) {
  it(testCase.name, () => {
    expect(evaluateConformanceCase(testCase)).toEqual({ ok: true });
  });
}
```

Este fragmento es ilustrativo. La suite principal permanece siempre verde porque los tests aserran sobre el diagnóstico esperado. Cero tests deliberadamente fallidos.

## §22. Estrategia de tests

Los tests del Hito 7.4 verifican la infraestructura. **Mínimo obligatorio: 17 tests funcionales dedicados exactos**.

### 22.1 Tests dedicados (los 17 mínimos, en orden fijo)

1. `supports` conforme produce `{ ok: true }`.
2. `gsl` conforme produce `{ ok: true }`.
3. `both` coherente produce `{ ok: true }`.
4. `none` no productivo produce `{ ok: true }`.
5. Ausencia de `supports` exigido produce `missing_supports`.
6. Ausencia de `gsl` exigido produce `missing_gsl`.
7. Declaración `supports` inesperada produce `unexpected_supports`.
8. Declaración `gsl` inesperada produce `unexpected_gsl`.
9. Divergencia entre `supports` y `gsl` produce `supports_gsl_divergence`.
10. Idioma positivo que resuelve `false` produce `positive_resolves_false`.
11. Idioma negativo que resuelve `true` produce `negative_resolves_true`.
12. Factory produce instancia fresca por evaluación.
13. Mutación del adapter produce `adapter_mutated`.
14. Mutación del Set produce `set_mutated`.
15. `LangCode` inválido de runtime produce `invalid_langcode_declared`.
16. Ausencia de re-export público y ausencia del patrón prohibido `getSupportedLanguages().has(` en `conformance.ts`.
17. Misma infraestructura reutilizada sobre al menos dos `AdapterKind` o dos perfiles distintos sin duplicar lógica del evaluador.

### 22.2 Naturaleza de los tests

- Los tests 5–15 son tests controlados de la infraestructura sobre fixtures no conformes.
- La suite principal permanece verde porque cada test aserra sobre el diagnóstico esperado (por ejemplo: `expect(evaluateConformanceCase(brokenCase)).toEqual({ ok: false, reason: "supports_gsl_divergence", /* ... */ })`).
- **NO registran tests deliberadamente fallidos**.
- **NO pertenecen al Hito 7.5**.

### 22.3 Tests adicionales

Se admiten tests adicionales SÓLO si están **justificados individualmente en el reporte de implementación**. Cualquier test adicional sin justificación específica se considera fuera de alcance.

### 22.4 Validaciones adicionales (no sustituyen los 17 tests)

- La suite congelada de ADR-004 §2.7 (`engine/src/types/adapters.test.ts`) DEBE continuar verde sin modificación.
- Ausencia de `capabilities.languages` en `conformance.ts` (verificable estáticamente).
- Ausencia del patrón textual literal `getSupportedLanguages().has(` en `conformance.ts` (garantía por diseño F1; verificable estáticamente).
- Compilación TypeScript sin errores.
- Suite completa del engine verde.

## §23. Validación de suite

Tras la implementación, ejecutar desde `engine/`:

```
npx vitest run src/adapters/conformance.test.ts
npx vitest run src/adapters
npx vitest run src/types/adapters.test.ts
npx vitest run
```

Criterios:
- Suite específica: verde.
- Suite adapters: verde.
- Foundation `adapters.test.ts`: verde (11/11, salvaguarda §2.7 intacta).
- Suite completa: verde. **Mínimo esperado: 575 tests** (558 basales + 17 exactos). Cualquier delta superior a +17 DEBE explicarse en el reporte.
- Cero regresión.

## §24. Criterios de aceptación

1. Versión documental V1.1 congelada tras reauditoría independiente APTA.
2. Sólo dos archivos futuros autorizados por §15: `conformance.ts` y `conformance.test.ts`.
3. Imports exactos respetados en `conformance.ts` conforme a §14.2.
4. Los 11 exports exactos respetados conforme a §14.3.
5. Tipos literales de §14.2 implementados sin desviación.
6. Firmas exactas de `buildConformanceCases` y `evaluateConformanceCase` respetadas literalmente.
7. Cero overloads.
8. Cero parámetros adicionales.
9. Cero `any`.
10. Cero `unknown`.
11. Cero `as unknown as`.
12. Cero `@ts-ignore`.
13. Cero campos opcionales en diagnósticos.
14. Cero `Promise`.
15. Cero `async`.
16. Exactamente 17 tests mínimos de §22.1.
17. Cualquier test adicional justificado individualmente en el reporte.
18. Basal 558 preservada.
19. Suite completa mínima esperada: 575 tests verdes.
20. TypeScript exit 0 en modo strict con todas las opciones.
21. Salvaguarda ADR-004 §2.7 verde y sin modificación.
22. Cero patrón directo prohibido `getSupportedLanguages().has(` en `conformance.ts` ni en `conformance.test.ts`.
23. Cero `capabilities.languages` en los archivos creados.
24. Cero re-export público (verificación estática sobre `engine/src/index.ts`).
25. Cero modificación de Foundation.
26. Cero modificación de Hito 7.3.
27. Cero modificación de `CONTRACT.md`.
28. Cero modificación de ambos `index.ts`.
29. Cero invasión de Hito 7.5.

## §25. Criterios de detención

La implementación debe detenerse inmediatamente y emitir NO APTO en cualquiera de los siguientes casos:

**Alcance de firmas y tipos**:
- Cualquier firma literal de §14.2 no compila con los tipos existentes.
- Cualquiera de los tipos Foundation referenciados no existe (`AdapterBase`, `AdapterKind`, `LangCode`).
- `isLangCode` no existe o cambia de firma.
- Se necesita un import adicional en `conformance.ts` o en `conformance.test.ts` fuera de §14.2/§15.1.
- Se necesita un export adicional fuera de los 11 de §14.3.
- Se necesita un reason code adicional fuera de los 12 de §14.2.
- Se necesita un campo adicional en diagnósticos.
- Se necesita un campo opcional (`field?:`) en cualquier tipo de §14.2.
- Se necesita `unknown` en cualquier tipo de §14.2.
- Se necesita `any`.
- Se necesita `Promise`. Se necesita `async`.
- Se necesita cambiar la precedencia de reason codes de §14.8.

**Alcance normativo**:
- Se necesita modificar Foundation (`engine/src/types/*`).
- Se necesita modificar Hito 7.3 (`resolve-language-support.ts` o `.test.ts`).
- Se necesita modificar `CONTRACT.md` o `contract.test.ts` (Hito 7.2 congelado).
- Se necesita modificar `engine/src/adapters/index.ts` (Hito 7.1 congelado).
- Se necesita modificar `engine/src/index.ts` (barrel público).
- Se necesita importar `conformance.ts` desde runtime productivo.
- Aparece el patrón directo prohibido `getSupportedLanguages().has(` en cualquier archivo del engine fuera de los contextos autorizados.
- Aparece `capabilities.languages`.
- Aparece un catálogo paralelo de idiomas.
- Se necesitan tests deliberadamente fallidos en la suite principal.
- Se necesita ampliar la lista blanca §2.7.
- Aparece `AdapterRegistry`, Managers, Providers, Engine, Pipeline o Core API.
- Contradicción entre ADR-006 y ADR-007 V1.1.
- Aparece cualquier tercer archivo (fuera de los 2 autorizados por §15).

**Alcance de suite**:
- Falla la basal de 558 tests.
- Falla compilación TypeScript.

**Alcance de fase**:
- Se necesita iniciar Hito 7.5.

## §26. Secuencia de implementación futura

1. **Verificar precondiciones**: rama `spabla-v2/fase-7-adapters-domain`, HEAD `0c17872`, 558 tests verdes, working tree limpio.
2. **Releer** ADR-007 V1.1, CONTRACT.md, `resolve-language-support.ts` y `resolve-language-support.test.ts`.
3. **Crear** exclusivamente `engine/src/adapters/conformance.ts` con:
   - Imports exactos de §14.2.
   - Los 11 exports exactos de §14.3.
   - Firma literal `buildConformanceCases<K extends AdapterKind>(profile: ConformanceProfile<K>, adapterFactory: () => AdapterBase<K>): ReadonlyArray<ConformanceCase<K>>`.
   - Firma literal `evaluateConformanceCase<K extends AdapterKind>(testCase: ConformanceCase<K>): ConformanceDiagnostic<K>`.
   - Semántica de §14.4 (buildConformanceCases) y §14.5 (evaluateConformanceCase).
   - Semántica por declaración de §14.6.
   - Validación de perfil de §14.7 (usando `isLangCode`).
   - Precedencia de reason codes de §14.8.
   - JSDoc `@internal`.
   - Cero `console.*`, cero `process.env`, cero red, cero disco.
4. **Crear** exclusivamente `engine/src/adapters/conformance.test.ts` con los 17 tests exactos de §22.1.
5. **Aplicar** la infraestructura dentro de `conformance.test.ts` sobre los perfiles autorizados. NO añadir aplicación a adapters reales de proveedores concretos.
6. **Verificar** que `engine/src/types/*` permanece intacto (`git diff -- engine/src/types/` vacío).
7. **Ejecutar** `npx tsc --noEmit` desde `engine/`.
8. **Ejecutar** `npx vitest run src/adapters/conformance.test.ts`.
9. **Ejecutar** `npx vitest run src/adapters`.
10. **Ejecutar** `npx vitest run src/types/adapters.test.ts`.
11. **Ejecutar** `npx vitest run`.
12. **Auditar diffs**: `git status --short`, `git diff --stat`, `git diff --name-only`, `git diff --check`.
13. **Entregar** reporte de implementación para auditoría independiente.
14. **Detenerse** sin commit, sin push, sin tag.
15. Auditoría independiente.
16. Corrección expresa si aplica.
17. Reauditoría.
18. Cierre Git autorizado.

## §27. Secuencia de auditoría y cierre

```
PLAN candidato V1.0 → AUDITORÍA → CORRECCIÓN V1.1 → REAUDITORÍA
  → CONGELACIÓN documental
    → IMPLEMENTACIÓN autorizada
      → TESTS
        → AUDITORÍA
          → CORRECCIÓN si aplica
            → REAUDITORÍA
              → COMMIT/PUSH atómicos
                → SIGUIENTE HITO (7.5)
```

Cero salto de fase.

## §28. Frontera con Hito 7.3 congelado

Este plan NO modifica `resolveLanguageSupport` ni sus tests. El evaluador consume `resolveLanguageSupport` como caja negra a través de import interno.

## §29. Frontera con Hito 7.5

| Hito 7.4 | Hito 7.5 |
|---|---|
| Infraestructura reutilizable de conformidad | Escenarios sintéticos que demuestran viabilidad y comportamiento |
| Verifica que un adapter cumple el contrato | Compara opciones (a)/(b)/(c) de ADR-006 §2 |
| Sin benchmarks | Puede incluir mediciones si el Plan del Hito 7.5 las autoriza |
| Sin comparación entre F1/F2/F3 | Su decisión pertenece al Plan del Hito 7.5 |

**Prohibiciones específicas del Hito 7.4**:
- Comparar rendimiento entre F1/F2/F3.
- Ejecutar demostraciones sintéticas comparativas.
- Benchmarks.
- Adoptar F2 o F3 en el evaluador.
- Modificar `resolve-language-support.ts`.
- Introducir decisión nueva sobre formas canónicas.

## §30. Riesgos y mitigaciones

**Técnicos**:
- **RT1 — Falso positivo de conformidad**. Mitigación: §14.7 exige `positiveLangs.length >= 1` y `negativeLangs.length >= 1` para perfiles no-`none`.
- **RT2 — Falso negativo**. Mitigación: tests 1–4 verifican adapters conformes con cada perfil.
- **RT3 — Tests tautológicos**. Mitigación: cada test verifica un comportamiento observable distinto (`{ ok: true }` vs `{ ok: false, reason: ... }`) contra fixtures locales; el evaluador es caja negra.
- **RT4 — Compartición de estado entre tests**. Mitigación: `evaluateConformanceCase` crea instancia fresca por caso vía `testCase.adapterFactory()` (§14.5); test 12 verifica aislamiento.
- **RT5 — Catálogo incompleto**. Mitigación: `isLangCode` valida cada código declarado; el diseño acepta muestras dirigidas.
- **RT6 — Sobreingeniería**. Mitigación: opción G recomendada (perfil + factory ligera + evaluador puro); cap 300 líneas por archivo (Code Standard §3).
- **RT7 — Infraestructura productiva innecesaria**. Mitigación: cero re-export desde barrel público; test 16 lo verifica; JSDoc `@internal`.
- **RT8 — API pública accidental**. Mitigación: idem RT7 + revisión de diff sobre `engine/src/index.ts`.
- **RT9 — Duplicación con Hito 7.3**. Mitigación: el evaluador consume `resolveLanguageSupport` como caja negra.
- **RT10 — Invasión de Hito 7.5**. Mitigación: §29 explícito; §25 lista criterios de detención.
- **RT11 — Mensajes de error opacos**. Mitigación: §14.2 fija `ConformanceFailure` con `reason`, `adapterKind`, `lang`, `expected`, `actual`, `sourcesDeclared`.
- **RT12 — Casts inseguros**. Mitigación: §24 criterio 9–12 exige cero `any`, cero `unknown`, cero `as unknown as`, cero `@ts-ignore`.
- **RT13 — Dependencia de detalles privados**. Mitigación: el evaluador consume sólo `AdapterBase<K>` público.
- **RT14 — Tests que reproducen implementación**. Mitigación: cada test define un fixture local y aserta contra el diagnóstico esperado, no contra `resolveLanguageSupport`.
- **RT15 — Registrar tests fallidos deliberadamente**. Mitigación: §22.2 lo prohíbe; el evaluador devuelve datos, no aserciones.
- **RT16 — Ambigüedad de precedencia de reason codes**. Mitigación: §14.8 fija la precedencia en lista ordenada de 12 elementos.

**Operativos**:
- **RO1 — Presión para adelantar Hito 7.5**. Mitigación: §29 y §25 lo excluyen.
- **RO2 — Elección de alternativa de diseño por preferencia**. Mitigación: §13 documenta análisis comparativo con 7 alternativas.

## §31. Nota histórica sobre firmas TypeScript exactas

En V1.0 las firmas y tipos se dejaron abiertos. La auditoría independiente clasificó esta decisión como bloqueante mediante los hallazgos **C1, C2, A1, M1 y M2**. En V1.1 todas las firmas, tipos, exports, diagnósticos y reason codes quedaron fijados literalmente en §14.2 y se consideran normativos. Cualquier desviación durante la implementación produce detención inmediata conforme a §25.

Esta sección es una **nota histórica cerrada**: no contiene decisiones futuras, propuestas ni alternativas abiertas.

## §32. Compatibilidad

- **Foundation intacta sin excepción**: `engine/src/types/*` sin cambios.
- **Lista blanca §2.7 intacta**.
- **`AdapterBase`, `AdapterKind`, `LangCode`, `isLangCode`** intactos.
- **`AdapterCapabilities` intacto** (vacía; `capabilities.languages` no existe y no se introduce).
- **`AdapterRegistry` intacto** (ADR-004 §2.6).
- **Superficie pública del engine intacta**: `engine/src/index.ts` sin cambios.
- **`resolve-language-support.ts` intacto** (Hito 7.3 congelado en `0c17872`).
- **`resolve-language-support.test.ts` intacto**.
- **`CONTRACT.md` intacto**.
- **`contract.test.ts` intacto**.
- **`adapters/index.ts` intacto**.
- **Managers, Engine, Pipeline, PipelineOrchestrator, Core API** intactos.
- **V1** intacto.
- **Adapters legacy** siguen siendo válidos por opcionalidad de tipo.
- **Basal 558 tests** preservada bit-a-bit; delta positivo controlado por los 17 tests nuevos de §22.1.
- **Configuración de build/test** intacta.
- **Cero breaking changes**.

## §33. Seguridad

- Cero secretos.
- Cero claves.
- Cero credenciales.
- Cero `process.env`.
- Cero red.
- Cero disco (salvo lecturas estáticas justificadas del test 16).
- Cero logging.
- Cero dependencias externas nuevas.
- Cero incremento de superficie de ataque (dominio interno no público).

## §34. Veredicto documental

**APROBADO Y CONGELADO — V1.1 (reauditoría APTO el 2026-07-18).**

Justificación de V1.1:
- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1, Plan Oficial de Fase 7 §7 Hito 7.4, Plan Hito 7.2 V1.3, Plan Hito 7.3 V1.1, `CONTRACT.md`, `resolve-language-support.ts` y sus tests.
- **C1, C2, A1, M1, M2 resueltos**: §14.2 fija literalmente los 11 exports, tipos, reason codes, precedencia y firmas de funciones. §24 elimina el criterio circular. §26 alineado con §14.2. §31 sustituido por nota histórica cerrada.
- **O1 aplicada**: referencias normativas a "55 códigos" sustituidas por "catálogo canónico vigente"; cifra conservada exclusivamente en historial de V1.0.
- **O2 mantenida**: `por ejemplo` en §21 (antigua §20) permanece como ilustración explicativa no normativa.
- Alcance estrictamente circunscrito a la **infraestructura reutilizable de conformidad**.
- Cero solapamiento con Hito 7.5.
- Cero autorización explícita o implícita para modificar Foundation, `resolveLanguageSupport`, `CONTRACT.md`, `contract.test.ts`, `adapters/index.ts`, `engine/src/index.ts`, ADRs ni planes congelados.
- Cero decisiones arquitectónicas nuevas.
- Cero cambios de código, tests o configuración como parte de esta corrección documental.
