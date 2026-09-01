# ADR-004-FOUNDATION-EVOLUTION-2 — Contrato de capacidades del Adapter

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: aceptada.
**Fecha**: 2026-07-09.
**Base**: `spabla-v2-adr-003-strategic-vision-2026-07-09` @ `09a29ee`.
**Complementaria de**: `ADR-005-LANGUAGE-CATALOG` (pendiente).

Este ADR define la última evolución estructural de Foundation antes de Fase 7. Su alcance es exclusivamente arquitectónico: fija el contrato de capacidades del adapter y la ampliación del tipo `LangCode`. La implementación (archivos, tests, migración, criterios de aceptación) pertenece al futuro **Plan de Foundation Evolution 2**, no a este ADR.

---

## Contexto

El ADR-003 §7 y su análisis de LangCode establecen que el contrato de capacidades del adapter debe estar cerrado antes de abrir Fase 7. Sin él, los adapters reales heredarían un contrato implícito falso corregible sólo mediante refactor retroactivo.

Foundation Evolution 1 (ADR-001) probó que las evoluciones aditivas sobre Foundation son viables sin coste para las Fases congeladas. Este ADR replica esa estrategia con dos cambios acotados: la ampliación de `LangCode` y la incorporación de un contrato mínimo de capacidades en `AdapterBase`.

Este ADR **no decide la lista concreta de idiomas** — corresponde a ADR-005. Este ADR **no describe la implementación** — corresponde al Plan de Foundation Evolution 2.

---

## Decisión

### §1. Ampliación de `LangCode`

- La union `LangCode` en Foundation se amplía para acoger un **catálogo amplio de idiomas, con objetivo inicial de 50–60 o superior**, definido por ADR-005-LANGUAGE-CATALOG.
- El Set `SUPPORTED_LANG_CODES` se amplía en sincronía con la union.
- Los códigos actuales (10) se conservan sin modificación.
- **Cero cambios semánticos**: `isLangCode` y `makeLanguagePair` mantienen su contrato exacto; sólo aceptan más códigos.

### §2. Contrato de capacidades del adapter

**§2.1 — Ampliación aditiva de `AdapterBase`**

`AdapterBase` se amplía con dos métodos y un socket de extensión tipado, todos opcionales en el sistema de tipos por compatibilidad hacia atrás:

- `getSupportedLanguages?(): ReadonlySet<LangCode>`
- `supports?(lang: LangCode): boolean`
- `readonly capabilities?: AdapterCapabilities`

Y se declara la interfaz vacía extensible `interface AdapterCapabilities {}`.

**§2.2 — Semántica**

- `getSupportedLanguages()` retorna el conjunto completo de códigos ISO 639-1 que el adapter puede procesar. Es la **fuente de verdad canónica** y la superficie de descubrimiento e introspección.
- `supports(lang: LangCode): boolean` es la consulta puntual. Foundation provee una implementación por defecto semánticamente equivalente a `getSupportedLanguages().has(lang)`.

Ambos métodos deben ser deterministas, idempotentes y sin efectos secundarios.

**§2.3 — Única fuente de verdad y default centralizado**

- `getSupportedLanguages()` es la única fuente de verdad del contrato de idiomas.
- Foundation garantiza que `supports(lang)` está disponible por defecto sobre todo adapter que implementa `getSupportedLanguages()`, retornando `getSupportedLanguages().has(lang)` para todo `lang`.
- Un adapter real puede sobrescribir `supports(lang)` **únicamente cuando exista una optimización demostrable** (medible, no meramente declarada). El override debe permanecer **semánticamente equivalente** a la implementación por defecto para todo `lang`.
- Cualquier divergencia observable entre override y default invalida el adapter para producción.

**§2.4 — Compatibilidad hacia atrás**

- Adapters existentes (Fases 1–6, principalmente fakes de test): pueden omitir ambos métodos. Permanecen válidos.
- Adapters reales desde Fase 7: deben implementar `getSupportedLanguages()`. Heredan `supports(lang)` de la implementación por defecto de Foundation.
- Un adapter sin `getSupportedLanguages()` es válido sólo para tests o entornos no productivos.
- La obligatoriedad en producción se enforza por política (revisión, lint, tests contract-first del plan de Foundation Evolution 2 y del plan de Fase 7), no por el sistema de tipos.

**§2.5 — `AdapterCapabilities` — capacidades estructurales y estáticas**

`AdapterCapabilities` es un socket de extensión tipado para categorías **estructurales y estáticas** del adapter.

Reglas normativas:

- Ninguna clave queda definida por este ADR.
- Cualquier ampliación futura requiere **ADR específica** que declare la clave, su semántica, su default y sus consumers autorizados.
- La ampliación se realiza exclusivamente mediante **edición aditiva del propio archivo `adapters.ts`**. Prohibido `declare module` desde otros módulos.
- Prohibido incluir en `AdapterCapabilities`: estado runtime, sesiones activas, disponibilidad actual, métricas en tiempo real, latencia observada, errores recientes, idioma activo, configuración mutable, datos de usuario. Toda información dinámica pertenece a runtime, telemetría o estado de sesión, nunca al contrato estático.

**§2.6 — Ausencia de helper de resolución en el registro**

Foundation Evolution 2 **NO** añade `AdapterRegistry.resolveByLanguage(kind, lang)` ni ningún otro helper de resolución por capacidades. Esa responsabilidad pertenece al SDK (Fase 9) por coherencia con ADR-003 §0.3 (SDK First) y §0.4 (Provider Agnostic).

**§2.7 — Regla dura para consumers**

Todos los consumers de adapters — SDK, API pública, CLI, dashboards, tests y cualquier consumer futuro — utilizan **siempre** `supports(lang)`.

**Ningún consumer implementa manualmente `getSupportedLanguages().has(lang)`**.

Justificación normativa: replicar la derivación en cada consumer fragmentaría la fuente única de verdad, invalidaría futuras optimizaciones centralizadas en Foundation y neutralizaría cualquier override justificado de un adapter concreto.

### §3. Alcance estrictamente aditivo

- **Engine** permanece completamente agnóstico.
- **Pipeline** no cambia.
- **SDK** no existe aún; su primera versión heredará el contrato ampliado y la implementación por defecto de `supports(lang)` sin re-implementar.
- **Managers** no cambian.
- **Foundation** sólo recibe cambios aditivos: los tipos existentes se amplían sin retirar ni modificar semántica; la interfaz `AdapterCapabilities` es nueva y vacía; la implementación por defecto de `supports(lang)` es adición pura.
- **Cero dependencias nuevas**.
- **Compatibilidad hacia atrás preservada al 100 %**.

---

## Consecuencias arquitectónicas

1. **Cero duplicación de lógica derivada**: `supports(lang)` vive en un único lugar (Foundation `adapters.ts`). SDK, API pública, CLI, dashboards y clientes futuros heredan sin reimplementar.
2. **Superficie contractual mínima para adapters reales**: sólo `getSupportedLanguages()` es obligatorio; `supports(lang)` disponible por defecto.
3. **Cierre normativo del helper**: la ubicación del default queda decidida por este ADR. No es una decisión abierta para el plan de Foundation Evolution 2, ni para el SDK, ni para consumers.
4. **Consumers uniformes**: cualquier futura optimización centralizada en Foundation beneficia a todos los consumers automáticamente.
5. **Overrides trazables**: cada override de `supports(lang)` requiere justificación explícita (optimización demostrable + equivalencia semántica).
6. **Extensibilidad futura preservada**: `AdapterCapabilities` acoge nuevas categorías estructurales estáticas por ADR aditiva, sin declaration merging distribuido y sin estado dinámico.
7. **Premisas cerradas para Fase 7**: `AdapterBase` está completo, `LangCode` crecerá según ADR-005, la lógica derivada vive en Foundation.
8. **MVP 1:1 → N > 2 sin ruptura**: la ampliación de participantes (ADR-003 §2) no queda bloqueada por este ADR.

---

## Impacto arquitectónico

El cambio afecta únicamente al bloque Foundation: al tipo `LangCode`, al Set `SUPPORTED_LANG_CODES`, a la interfaz `AdapterBase`, y a la nueva interfaz `AdapterCapabilities`. **Cero impacto en Engine, Pipeline, PipelineOrchestrator, Managers, AdapterRegistry, Core API y SpablaCore**. **Cero impacto en superficies aún no existentes** (SDK, API pública, clientes, White Label, Enterprise): éstas nacerán con el contrato ampliado ya vigente. **Cero impacto en adapters existentes** (fakes de test): permanecen válidos por §2.4.

---

## Decisiones abiertas restantes

**§4.1 — Añadir `AdapterRegistry.resolveByLanguage(kind, lang)`**
- §2.6 recomienda **NO añadirlo**; queda para el SDK en Fase 9.
- **Owner**: Jefe de Proyecto. Recomendación: NO añadirlo — respeta ADR-003 §0.3.

**§4.2 — Guards en Managers para validar capacidades del adapter antes de dispatch**
- Fuera de scope de este ADR y de Foundation Evolution 2.
- Se decide en el plan de Fase 7 cuando los Managers reciban adapters reales.
- **Owner**: Jefe de Proyecto. Recomendación: diferir a Fase 7.

**Decisiones ya resueltas por instrucción explícita del JP** (no re-abrir):
- `getSupportedLanguages()` como única obligación de producción y única fuente de verdad.
- `supports(lang)` con implementación por defecto centralizada en Foundation; consumers siempre lo usan.
- `AdapterCapabilities` como interfaz vacía extensible, sin declaration merging distribuido, acotada a capacidades estructurales estáticas.
- Separación contrato / catálogo: ADR-004 / ADR-005.

**Decisiones fuera del alcance** (ADR-005):
- Lista concreta de códigos ISO 639-1.
- Criterio de selección de idiomas.
- Verificación de interoperabilidad por proveedor.

---

## Riesgos arquitectónicos

**R1 — `AdapterCapabilities` como socket sin ADR**: la interfaz vacía puede tentar a ampliaciones ad-hoc, o mediante declaration merging distribuido, o con estado dinámico. **Mitigación**: triple prohibición dura por §2.5.

**R2 — Ampliaciones futuras de `AdapterCapabilities` cascadean**: cada nueva categoría puede necesitar cambios en managers, SDK, clientes. **Mitigación**: cada categoría lleva su propia ADR que declara el alcance de la cascada.

**R3 — Sequencing: bloqueo de Fase 7 por retraso de ADR-005**: sin catálogo estable, los adapters reales no pueden implementar `getSupportedLanguages()`. **Mitigación**: la aprobación de ADR-005 es prerequisito de la apertura del Plan de Foundation Evolution 2 y, por tanto, de la apertura de Fase 7.

**R4 — Superficie contractual mínima puede infra-especificar**: en Fase 7 podría descubrirse la necesidad de otra dimensión de capacidad (variantes regionales, calidad, latencia). **Mitigación**: la extensibilidad por `AdapterCapabilities` (§2.5) permite añadir categorías por ADR aditiva sin tocar la superficie mínima congelada.

**R5 — Override injustificado de `supports(lang)`**: un adapter real podría sobrescribir sin optimización demostrable, introduciendo divergencia con `getSupportedLanguages()`. **Mitigación**: (a) regla §2.3 exige optimización demostrable + JSDoc justificante; (b) tests contract-first del plan de Foundation Evolution 2 verifican equivalencia semántica; (c) plan de Fase 7 refuerza la regla.

**R6 — Consumer que se salta la regla §2.7**: un consumer podría implementar `getSupportedLanguages().has(lang)` manualmente, rompiendo la fuente única. **Mitigación**: (a) regla dura §2.7; (b) grep del criterio de aceptación del plan de Foundation Evolution 2 verifica ausencia del patrón fuera del propio módulo `adapters.ts`; (c) code review interno.

---

## Recomendación única

Congelar este ADR-004 tras auditoría final independiente. A continuación:

1. **Redacción de ADR-005-LANGUAGE-CATALOG** con criterio de selección + lista concreta de códigos.
2. **Congelación de ADR-005** con auditoría independiente.
3. **Redacción del Plan de Foundation Evolution 2** que consolida la implementación aditiva de ambas ADRs, con toda la información ejecutiva (archivos, tests, criterios, migración) que este ADR ha excluido por diseño.
4. **Auditoría independiente del plan** antes de implementación.
5. **Implementación de Foundation Evolution 2** bajo el plan aprobado.
6. **Apertura del plan de Fase 7** sólo tras el cierre de Foundation Evolution 2.
