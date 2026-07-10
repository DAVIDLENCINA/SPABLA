# ADR-006-RUNTIME-ADAPTER-RESOLUTION — Materialización del default `supports(lang)`

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: congelado.
**Fecha**: 2026-07-10.
**Base**: `spabla-v2-foundation-evolution-2-2026-07-09` @ `e6d174a`.
**Depende de**: `ADR-003-STRATEGIC-VISION`, `ADR-004-FOUNDATION-EVOLUTION-2`, `ADR-005-LANGUAGE-CATALOG`.

Este ADR resuelve exclusivamente **dónde y cómo se materializa la semántica del default `supports(lang)`** derivada de `getSupportedLanguages()`. Cierra la decisión abierta que ADR-004 §2.3 delegó a un plan posterior y que la corrección de Fase 2 del plan Foundation Evolution 2 confirmó como diferida al dominio de adapters reales o al plan del SDK. Su alcance es exclusivamente arquitectónico y declarativo. No prescribe patrones concretos de implementación ni artefactos concretos de testing.

Este ADR **no autoriza implementación**, **no decide proveedores**, **no introduce nuevos kinds de adapter**, **no modifica ninguna ADR existente**, **no autoriza cambios en Managers, Engine, AdapterRegistry ni Foundation types**, **no exige demo end-to-end**.

---

## Contexto

ADR-004 §2.3 estableció que Foundation garantiza que `supports(lang)` está disponible con semántica equivalente a `getSupportedLanguages().has(lang)`, y delegó explícitamente el patrón TypeScript concreto (abstract class, helper function, factory, mixin) a un plan posterior. La corrección de Fase 2 del plan Foundation Evolution 2 confirmó ese diferimiento y añadió la constraint dura: **la materialización no debe exponer una segunda superficie pública en Foundation** ni duplicar lógica en consumers.

Foundation Evolution 2 congeló:
- `AdapterBase<K>` con `getSupportedLanguages?`, `supports?`, `capabilities?` (todos opcionales por ADR-004 §2.4).
- `interface AdapterCapabilities {}` (vacía, extensible sólo por edición del propio archivo, ADR-004 §2.5).
- Ninguna función ni clase adicional exportada en `engine/src/types/adapters.ts`.

Fase 7 no puede planificarse por completo sin decidir dónde reside la materialización porque:
- ADR-004 §2.4 establece que en adapters reales `supports(lang)` "se hereda de la implementación por defecto de Foundation".
- Foundation Evolution 2 congeló Foundation sin proveer esa materialización runtime.
- ADR-004 §2.7 exige que los consumers usen `supports(lang)` y nunca `getSupportedLanguages().has(lang)` manualmente.

Este ADR resuelve el hueco de forma declarativa.

---

## Decisión

### §1. Ubicación de la materialización

La materialización runtime del default `supports(lang)` reside en el **dominio de adapters reales** (`engine/src/adapters/`), introducido por Fase 7 como infraestructura común. **No reside en Foundation** (`engine/src/types/adapters.ts`, congelado por Foundation Evolution 2). **No reside en el SDK** (Fase 9 aún no existe).

### §2. Forma de la materialización

Se implementa como **mecanismo interno no público del dominio de adapters**. La forma concreta (utility function, wrapper, decorator, adapter internal base class, o cualquier otra materialización TypeScript válida) queda dentro del margen técnico del plan de Fase 7, siempre respetando:
- **No añade ninguna superficie pública** en Foundation.
- **No se re-exporta** desde el barrel público de `engine` (`engine/src/index.ts`).
- **Preserva la semántica** definida por ADR-004 §2.3 (equivalencia a `getSupportedLanguages().has(lang)`).

`supports(lang)` **permanece opcional** en `AdapterBase` conforme a ADR-004 §2.4. Los adapters reales pueden adoptar cualquiera de las siguientes opciones válidas:

- **(a) Implementar `supports(lang)`** delegando al mecanismo interno del dominio de adapters.
- **(b) Omitir `supports(lang)`** cuando exista un consumidor autorizado (interno al dominio de adapters, al SDK futuro o a la superficie que ADR-004 §2.7 declare autorizada) que derive el resultado a partir de `getSupportedLanguages()` conforme a ADR-004.
- **(c) Implementar una optimización propia** de `supports(lang)` cuando exista justificación demostrable, siempre y cuando sea **semánticamente equivalente** a `getSupportedLanguages().has(lang)` (ADR-004 §2.3).

La elección entre (a), (b) o (c) es una decisión de diseño del adapter concreto, no de este ADR.

### §3. Superficie pública

- **Foundation** (`engine/src/types/adapters.ts`) permanece **exactamente igual** que tras Foundation Evolution 2. Cero nuevos exports.
- **El mecanismo interno del dominio de adapters** NO se re-exporta desde `engine/src/index.ts` ni desde ningún barrel público del engine. Vive dentro de `engine/src/adapters/`.
- **La superficie pública consumida por consumers permanece siendo `adapter.supports(lang)`** (ADR-004 §2.7).

### §4. Prevención de una segunda superficie pública no autorizada

- Regla dura: cualquier PR que re-exporte el mecanismo interno desde `engine/src/index.ts` o desde un módulo público del engine viola este ADR y debe ser rechazado en revisión.
- Regla dura: consumers autorizados (SDK futuro, API pública futura, tests, dashboards) usan siempre la superficie pública `adapter.supports(lang)`. La regla ADR-004 §2.7 se mantiene sin ampliación.
- Regla dura: los adapters reales que adopten la opción (a) o (c) documentan su elección con JSDoc que cite ADR-006. Auditoría documental verifica el cumplimiento.

### §5. Validación de coherencia con `getSupportedLanguages()`

- Requisito abstracto: cada adapter real debe someterse a **pruebas de equivalencia semántica** entre `supports(lang)` (cuando esté implementado o derivado por el consumidor autorizado) y `getSupportedLanguages().has(lang)`, sobre un catálogo probe suficiente para el contrato declarado por el adapter.
- La forma concreta de esas pruebas (framework, helper, patrón de assertion, reutilización de infraestructura ya existente en Foundation Evolution 2, etc.) queda dentro del margen técnico del plan de Fase 7 y de cada adapter individual.
- La detección de divergencia debe garantizarse antes de que un adapter alcance producción.

### §6. Fuera de alcance

Este ADR **no** decide, autoriza ni prescribe:

- Elección de proveedores concretos por kind.
- Introducción de nuevos kinds de adapter (requiere ADR aditiva a ADR-004 §2.1).
- Cambios en Managers (ADR-004 §5.2 sigue abierta como decisión independiente).
- Cambios en Engine, Pipeline, PipelineOrchestrator, Core API.
- Cambios en `AdapterRegistry` (ADR-004 §2.6).
- Cambios en Foundation types (Foundation Evolution 2 congelado).
- Demo end-to-end u orquestación de integración con servicios reales.

---

## Alternativas descartadas

**A1 — Helper function exportado por Foundation** (ej. función pública `supportsLanguage(adapter, lang)` en `types/adapters.ts`).
Descartada: introduce una segunda superficie pública consumible junto con `adapter.supports(lang)`. Violó explícitamente la constraint que motivó la corrección de Fase 2 del plan Foundation Evolution 2.

**A2 — Clase base abstracta exportada por Foundation** (ej. `abstract class AbstractAdapterBase<K>`).
Descartada: (a) rompe el structural typing sobre el que se apoyan los fakes legacy de Fases 1–6; (b) fuerza a los adapters reales a extender una clase, restringiendo flexibilidad de composición; (c) genera ambigüedad sobre qué contrato satisface un adapter dado (interface vs class).

**A3 — Factory function exportada por Foundation** (ej. `createAdapter(base)`).
Descartada: (a) añade nueva superficie pública en Foundation; (b) impone al autor del adapter una API de construcción específica no exigida por el contrato.

**A4 — Mixin que enriquece el objeto adapter en tiempo de registro**.
Descartada: requiere modificación de `AdapterRegistry`, expresamente excluida por ADR-004 §2.6.

**A5 — Declaration merging distribuido** (extensión de `AdapterBase` desde módulos de adapters concretos).
Descartada: prohibida por ADR-004 §2.5 para `AdapterCapabilities`; por coherencia arquitectónica extendida al resto de `AdapterBase`. Fragmenta la fuente única de verdad.

**A6 — Requerir a cada adapter real implementar la derivación en línea** sin ningún mecanismo compartido.
Descartada: (a) duplica lógica trivial en cada adapter; (b) invita a divergencias sutiles; (c) contradice ADR-004 §2.4 en cuanto a "heredar" del default sin escribirlo cada vez.

**A7 — Diferir la materialización íntegramente al SDK (Fase 9)**.
Descartada: los adapters reales de Fase 7 quedarían sin infraestructura común disponible durante las Fases 7 y 8, forzando workarounds temporales o duplicación adapter por adapter antes de que exista el SDK.

**A8 — Convertir `supports(lang)` en miembro obligatorio de `AdapterBase` para adapters reales**.
Descartada: modifica de facto el contrato ADR-004 §2.4 sin ADR de sustitución, y elimina el margen de las opciones (b) y (c) que este ADR autoriza.

---

## Consecuencias arquitectónicas

1. **Foundation types permanecen intactos** tras Foundation Evolution 2. Este ADR no propone ninguna operación adicional sobre ellos.
2. **`AdapterRegistry` no se modifica** (ADR-004 §2.6 respetada).
3. **La superficie pública consumida por consumers permanece siendo `adapter.supports(lang)`** (ADR-004 §2.7). Cero ampliación en formas de consultar soporte.
4. **`supports(lang)` sigue siendo opcional** conforme a ADR-004 §2.4. Los adapters reales eligen entre las tres opciones autorizadas por §2 de este ADR.
5. **La compatibilidad hacia atrás con adapters legacy** (fakes de Fases 1–6) se preserva íntegramente: los fakes que omiten `getSupportedLanguages` y `supports` siguen siendo válidos por opcionalidad.
6. **La materialización queda encapsulada en el dominio de adapters reales** de forma no pública, permitiendo iterar sobre patrones concretos sin propagar cambios a Foundation.
7. **El SDK (Fase 9) hereda un contrato limpio**: consumers piden `adapter.supports(lang)` sin necesidad de conocer el mecanismo interno ni la ubicación del catálogo.
8. **La validación de coherencia queda anclada a un requisito semántico** (equivalencia entre `supports(lang)` y `getSupportedLanguages().has(lang)`), sin ligarlo a un artefacto de testing concreto que pudiera envejecer.

---

## Archivos eventualmente afectados (cuando Fase 7 se ejecute)

Este ADR no autoriza modificaciones. Los siguientes archivos serían afectados **por Fase 7** bajo su propio plan:

**Nuevos** (introducidos por Fase 7):
- `engine/src/adapters/` — nuevo directorio raíz para adapters reales.
- Uno o más módulos internos dentro de `engine/src/adapters/` que materialicen el mecanismo interno no público descrito por §2. **NO exportados** desde `engine/src/index.ts`.
- Subdirectorios por adapter real, con implementaciones + pruebas de equivalencia semántica.

**Sin cambios** (por Foundation Evolution 2 congelado y por las prohibiciones de este ADR):
- `engine/src/types/adapters.ts`, `engine/src/types/language.ts`, `engine/src/types/adapters.test.ts`, `engine/src/types/language.test.ts`.
- `engine/src/adapter-registry/` (ADR-004 §2.6).
- `engine/src/engine/`, `engine/src/pipeline/`, `engine/src/pipeline-orchestrator/`, `engine/src/core-api/`.
- Managers (STT, MT, TTS, Message, TurnPipeline, Session, Language, Conversation, Participant): fuera de alcance de este ADR.
- `engine/src/index.ts`: no re-exporta el mecanismo interno.
- ADRs, planes congelados, V1: intocables.

---

## Riesgos arquitectónicos

**R1 — El mecanismo interno del dominio de adapters podría ser re-exportado indebidamente** por un futuro contributor. **Mitigación**: (a) regla dura §4 auditable por grep sobre `engine/src/index.ts` y barrels del engine; (b) convención de marcar el mecanismo como `@internal` en JSDoc (o equivalente).

**R2 — Un adapter real podría publicar en su superficie una lógica de `supports(lang)` semánticamente divergente** de `getSupportedLanguages()`. **Mitigación**: §5 exige pruebas de equivalencia semántica; auditoría documental del adapter verifica su presencia.

**R3 — Divergencia entre adapters** sobre cuál de las opciones (a), (b), (c) adoptar. **Mitigación**: aceptable por diseño; el objetivo del contrato es la equivalencia semántica del resultado, no la uniformidad del pattern de implementación.

**R4 — Optimización futura del mecanismo interno** podría requerir cambios de signatura. **Mitigación**: al no ser público, los cambios no rompen ningún consumer externo y no requieren nueva ADR.

**R5 — La opción (b) (omitir `supports`) exige un "consumidor autorizado"** que derive el comportamiento, y ese consumidor podría no existir aún (SDK en Fase 9). **Mitigación**: el consumidor autorizado interno al dominio de adapters (por ejemplo, envoltorios internos usados durante integraciones tempranas) puede cumplir el rol mientras el SDK no esté disponible. Cada adapter real que adopte la opción (b) documenta cuál es el consumidor autorizado en su contexto.

**R6 — La opción (c) (optimización propia) sin equivalencia semántica** deja el adapter inválido para producción. **Mitigación**: §5 exige pruebas de equivalencia semántica sobre catálogo probe suficiente antes de habilitar el adapter en producción.

**R7 — El mecanismo interno podría fragmentarse** si distintos adapters implementan variantes propias sin colaboración. **Mitigación**: el plan de Fase 7 puede establecer una infraestructura común compartida por convención; no es requisito de este ADR, pero es una posibilidad natural.

---

## Bloqueos residuales

**B1 — Decisión de proveedores primarios por kind (STT, MT, TTS)**:
- **NO bloquea** la infraestructura común de Fase 7 (mecanismo interno de materialización, contratos de pruebas de equivalencia semántica, esqueleto del directorio `engine/src/adapters/`).
- **SÍ bloquea** la implementación de adapters concretos por proveedor específico.
- Fase 7 puede abrirse en modo "infraestructura común primero, adapters concretos condicionados a decisión de proveedores".

**B2 — Decisión abierta ADR-004 §5.2 (guards en Managers antes de dispatch)**:
- Sigue siendo decisión independiente pendiente.
- No la resuelve ADR-006. Puede diferirse a la fase que introduzca el primer adapter real completo.

**B3 — Auditoría documental independiente de este ADR**:
- Ejecutada. Veredicto: APTO PARA CONGELACIÓN (0 críticos / 0 altos / 0 medios / 0 bajos; 3 observaciones no bloqueantes).

---

## Veredicto de congelación

**APTO PARA CONGELACIÓN.**

Justificación:
- Deriva exclusivamente de ADR-003, ADR-004 y ADR-005.
- No modifica decisiones congeladas ni ADRs existentes.
- No decide proveedores concretos.
- No introduce nuevos adapter kinds.
- No autoriza cambios en Managers, Engine, AdapterRegistry ni Foundation types.
- No exige demo end-to-end.
- No prescribe patrones concretos de implementación (mecanismo interno queda en manos del plan de Fase 7).
- No prescribe artefactos concretos de testing (validación de coherencia queda como requisito semántico abstracto).
- Preserva la opcionalidad de `supports(lang)` fijada por ADR-004 §2.4 mediante las tres opciones autorizadas.
- Desbloquea la planificación de la infraestructura común de Fase 7 sin depender de la selección de proveedores concretos.
