# Plan breve de implementación — SPABLA V2 · Fase 7 · Hito 7.5

**Estado**: APROBADO — V1.0 (aprobación del Jefe de Proyecto el 2026-07-18).
**Versión**: V1.0.
**Fecha**: 2026-07-18.

## §1. Estado verificable

- Rama: `spabla-v2/fase-7-adapters-domain`.
- HEAD base: `3296c9b8b67a28fc71e7aec23c323bf63df734b4` (`feat(engine): fase 7 hito 7.4 — reusable adapter conformance infrastructure`).
- Basal: **575 tests verdes** en 21 archivos, `tsc --noEmit` exit 0.
- Hito 7.3 cerrado en `0c17872`. Hito 7.4 cerrado en `3296c9b`.
- Working tree inicial: limpio.

## §2. Fuentes vinculantes

- `docs/phases/SPABLA_V2_FASE_7_PLAN.md` §7 L91–L95 — definición literal del Hito 7.5.
- `docs/decisions/ADR-006-RUNTIME-ADAPTER-RESOLUTION.md` §2 — opciones (a), (b), (c).
- `docs/decisions/ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION.md` V1.1 §4–§9 — precedencia, fail-closed, materializador, formas canónicas (aplicables sólo para verificar que las opciones no reabren decisiones congeladas).
- `docs/phases/SPABLA_V2_FASE_7_HITO_7_4_PLAN.md` §29 — frontera con el Hito 7.4.
- `engine/src/adapters/resolve-language-support.ts` — resolver congelado (Hito 7.3).
- `engine/src/adapters/conformance.ts` — infraestructura de conformidad congelada (Hito 7.4).
- `engine/src/adapters/CONTRACT.md` — contrato interno.
- Foundation: `engine/src/types/adapters.ts` (`AdapterBase<K>`, `AdapterKind`), `engine/src/types/language.ts` (`LangCode`, `isLangCode`).

## §3. Objetivo literal

Demostrar mediante escenarios sintéticos internos al dominio `engine/src/adapters/` que un adapter real puede adoptar cualquiera de las tres opciones autorizadas por ADR-006 §2 —**(a)**, **(b)** o **(c)**— sin violar el contrato interno, sin ampliar la superficie pública y sin depender de un proveedor concreto.

## §4. Distinción normativa

- **Opciones (a)/(b)/(c)** (ADR-006 §2) — **objeto del Hito 7.5**. Modos autorizados de declaración de soporte por el adapter.
- **Formas canónicas F1/F2/F3** (ADR-007 V1.1 §9.3) — **fuera del objeto** del Hito 7.5. Ya cerradas: F1 congelada en `resolveLanguageSupport` (Hito 7.3). F2 y F3 no se implementan ni se comparan en esta ejecución.

## §5. Alcance técnico

**Un único archivo nuevo**:
- `engine/src/adapters/options-viability.test.ts`.
- Justificación del nombre: (i) declara alcance explícito ("options" = opciones de ADR-006 §2, "viability" = criterio del Hito 7.5); (ii) sufijo `.test.ts` deja fuera del build de producción; (iii) ubicación co-localizada dentro del dominio interno (`engine/src/adapters/`), coherente con `conformance.test.ts` y `resolve-language-support.test.ts`.

**Cero código productivo nuevo**. Cero módulo `.ts` fuera de tests. Cero export.

## §6. Escenarios sintéticos (fakes locales al test)

Tres clases privadas no exportadas, ejemplificando cada opción:

- **`SyntheticAdapterOptionA` (opción a)** — `readonly kind`, implementa `supports(lang)` consultando su propio catálogo local (delegación al mecanismo interno del propio adapter conforme a ADR-006 §2(a)). Omite `getSupportedLanguages`.
- **`SyntheticAdapterOptionB` (opción b)** — `readonly kind`, implementa exclusivamente `getSupportedLanguages()` retornando `ReadonlySet<LangCode>`. Omite `supports`. Consumidor autorizado: `resolveLanguageSupport` (interno al dominio, ADR-007 V1.1 §8).
- **`SyntheticAdapterOptionC` (opción c)** — `readonly kind`, implementa `supports(lang)` con optimización propia (ejemplo mínimo: array plano precomputado en lugar de reconstruir el Set) y declara también `getSupportedLanguages()` para permitir verificación de equivalencia semántica (ADR-006 §5).

Los tres fakes usan `AdapterKind = "mt"`. Cero proveedor real, cero credenciales, cero red, cero disco, cero I/O.

## §7. Matriz de evidencia y derivación exacta del número de tests

Requisitos de evidencia por opción (E1–E7):

| # | Evidencia | Cubierto por |
|---|---|---|
| E1 | Compatibilidad estructural con `AdapterBase<K>` | Compilación TS + `evaluateConformanceCase` kind check |
| E2 | Resolución positiva correcta | `evaluateConformanceCase` sobre casos `expectation.expected = true` |
| E3 | Resolución negativa correcta | Ídem con `expected = false` |
| E4 | Conformidad completa vía `conformance.ts` | `buildConformanceCases` + iterar |
| E5 | Ausencia de divergencia (sólo aplica a (c), única opción con ambas fuentes) | `evaluateConformanceCase` precedencia 7 (§14.8 Hito 7.4) |
| E6 | Determinismo | `evaluateConformanceCase` precedencia 12 |
| E7 | Ausencia de mutación (adapter + Set) | `evaluateConformanceCase` precedencias 10–11 |

`buildConformanceCases` + `evaluateConformanceCase` cubren E1–E7 en una sola invocación por perfil. Por tanto **1 test por opción** basta para E1+E2+E3+E4+E6+E7. E5 aplica exclusivamente a (c) y ya queda cubierto por la iteración interna del evaluador — no requiere test adicional dedicado si el perfil (c) incluye ≥1 lang en `positiveLangs ∪ negativeLangs`.

Salvaguardas estructurales adicionales:
- **SE1** — Superficie e higiene: cero re-export del archivo nuevo desde `engine/src/index.ts` ni `engine/src/adapters/index.ts`; cero patrón prohibido `getSupportedLanguages().has(` en el archivo nuevo; cero mención de proveedor concreto (`openai`, `google`, `azure`, `elevenlabs`, `whisper`, `deepgram`, `anthropic`).
- **SE2** — Preservación de Hitos 7.3 y 7.4: presencia intacta de firmas distintivas `export function resolveLanguageSupport` en `resolve-language-support.ts` y `export function evaluateConformanceCase` en `conformance.ts` (verificación estática mínima).

**Número exacto de tests: 5**:
1. Viabilidad opción (a) — perfil `"supports"` conforme → todos los casos generados retornan `{ ok: true }`. Cubre E1+E2+E3+E4+E6+E7 para (a).
2. Viabilidad opción (b) — perfil `"gsl"` conforme → ídem. Cubre E1+E2+E3+E4+E6+E7 para (b).
3. Viabilidad opción (c) — perfil `"both"` con `positiveLangs` y `negativeLangs` no vacíos → ídem. Cubre E1+E2+E3+E4+E5+E6+E7 para (c).
4. Salvaguarda SE1 (superficie e higiene).
5. Salvaguarda SE2 (preservación).

Cada test aporta evidencia distinta y no se puede fusionar sin ocultar qué evidencia falla. No se admiten combinaciones que oculten fallos individuales.

## §8. Imports y superficie del archivo de tests

Derivados de necesidades reales:
- `vitest` — `describe`, `it`, `expect`.
- `node:fs`, `node:path`, `node:url` — lectura estática para SE1 y SE2.
- `../types/adapters` — `type AdapterBase`.
- `../types/language` — `type LangCode`.
- `./conformance` — `buildConformanceCases`, `evaluateConformanceCase`, `type ConformanceProfile`.

**Cero import de `./resolve-language-support`**: la infraestructura del Hito 7.4 consume el resolver internamente; no se necesita acceso directo.

Cero export. Fakes no exportados. Cero función/tipo productivo. Cero re-export del archivo nuevo desde ningún barrel.

## §9. Archivos prohibidos

Todo excepto los dos autorizados. Declarados expresamente **intactos**:

Foundation, `resolve-language-support.ts` y su test, `conformance.ts` y su test, `CONTRACT.md`, `contract.test.ts`, `engine/src/adapters/index.ts`, `engine/src/index.ts`, ADRs, planes congelados, Managers, `AdapterRegistry`, Providers, Engine, Pipeline, `PipelineOrchestrator`, Core API, V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`), `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`.

## §10. Criterios de aceptación

1. Exactamente un archivo de test nuevo durante la implementación: `engine/src/adapters/options-viability.test.ts`.
2. Los tres escenarios (a)/(b)/(c) demostrados por los tests 1, 2 y 3.
3. Los 5 tests de §7 verdes.
4. `npx tsc --noEmit` exit 0 en modo strict con `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
5. Basal 575 tests preservada.
6. Nuevo total: **580 tests verdes** en 22 archivos (575 basales + 5 nuevos exactos).
7. Cero regresiones en ninguna suite existente.
8. Cero modificación de archivos prohibidos (`git diff` post-implementación excluye cualquier archivo distinto del autorizado).
9. Cero superficie pública nueva (`engine/src/index.ts` y `engine/src/adapters/index.ts` sin cambios).
10. `git diff --check` exit 0 sobre el diff staged.
11. Revisión técnica final: APTO.

## §11. Criterios de detención

Detención inmediata sin aplicar cambios si:

- Alguna de las 3 opciones (a)/(b)/(c) no puede compilar contra `AdapterBase<K>`.
- Alguna opción viola ADR-006 §2 o ADR-007 V1.1 §4–§9.
- `conformance.ts` no puede verificar una opción sin ser modificado.
- `resolveLanguageSupport` necesita ser modificado.
- Aparece divergencia semántica no resoluble en el fake (c).
- Se requiere modificar Foundation, contratos internos, ADRs o superficie pública.
- Las fuentes normativas se contradicen entre sí sobre el alcance del Hito 7.5.
- La evidencia sintética no puede demostrar la viabilidad reclamada por el Plan Oficial de Fase 7 §7 L91–L95.

## §12. Frontera con Hito 7.6

- Hito 7.5 produce **evidencia** y obtiene **auditoría APTO** exigida por el Plan Oficial.
- Hito 7.5 **no inicia** el cierre documental de la Fase 7.
- El cierre de Fase 7 (documento final bajo `docs/phases/`, verificación de basal completa, autorización de commit/push/tag consolidado) pertenece al **Hito 7.6**.
