# ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION — Semántica interna de resolución de soporte lingüístico

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: BORRADOR — APTO PARA AUDITORÍA.
**Fecha**: 2026-07-17.
**Base**: `spabla-v2-phase-7-plan-2026-07-11` @ `9f08307`.
**Depende de**: ADR-003, ADR-004, ADR-005, ADR-006, Plan Oficial de Fase 7 (congelado).

---

## §1. Contexto

El Hito 7.1 del Plan Oficial de Fase 7 cerró la existencia arquitectónica del dominio `engine/src/adapters/`. La apertura del Hito 7.2 requiere materializar dentro de ese dominio la semántica de resolución del soporte lingüístico declarado por un adapter, conforme a ADR-006 §2. Durante la apertura del Hito 7.2 se detectaron tres ambigüedades bloqueantes que impiden derivar la implementación literalmente de ADR-006:

- **A1 (crítica)** — El brief inicial del Hito 7.2 incluía `capabilities.languages` como fuente candidata; sin embargo `AdapterCapabilities` está congelada como interfaz vacía (ADR-004 §2.5) y ninguna ADR ha declarado la clave `languages`.
- **A2 (alta)** — ADR-006 no cierra el comportamiento del resolver cuando el adapter no declara ni `supports(lang)` ni `getSupportedLanguages()`.
- **A3 (alta)** — ADR-006 §2 (b) autoriza al dominio interno de adapters a derivar soporte, pero el test §2.7 congelado por Foundation Evolution 2 (`engine/src/types/adapters.test.ts`) sólo autoriza el patrón `getSupportedLanguages().has(` dentro de `types/adapters.ts` y `types/adapters.test.ts`. Sin ajuste explícito, la nueva derivación no puede ubicarse en el dominio sin romper la basal o recurrir a workarounds.

ADR-007 cierra exclusivamente estas tres ambigüedades. No amplía Foundation, no decide proveedores, no toca superficie pública ni Managers.

---

## §2. Problema

Se necesita una decisión arquitectónica mínima que permita al Hito 7.2 implementar la evaluación del soporte lingüístico sin invención de defaults, sin ampliación de contrato y sin transgresión de la basal congelada. La decisión debe fijar:

- las fuentes válidas de declaración de soporte;
- su precedencia;
- el comportamiento cuando no hay declaración;
- el tratamiento de incoherencias entre declaraciones;
- la autorización del dominio interno como consumidor derivador;
- la adaptación mínima de la salvaguarda congelada en Foundation Evolution 2.

---

## §3. Decisión

Se adoptan las decisiones §4–§9. Todas son declarativas, mínimas y auditables. Ninguna amplía la superficie pública ni el contrato de Foundation.

---

## §4. Fuentes válidas de declaración de soporte

Las **únicas dos fuentes válidas** de declaración de soporte lingüístico de un adapter, a los efectos de la resolución interna del Hito 7.2, son:

- `adapter.supports(lang)`;
- `adapter.getSupportedLanguages()`.

`capabilities.languages` **NO participa** en la resolución del Hito 7.2 ni en la del resolver interno del dominio de adapters.

Justificación normativa:
- `AdapterCapabilities` está congelada como interfaz vacía (`engine/src/types/adapters.ts`, ADR-004 §2.5).
- ADR-004 §2.5 exige ADR específica para introducir cualquier clave en `AdapterCapabilities`.
- Ninguna ADR congelada declara la clave `languages`.
- Hito 7.2 no amplía Foundation ni el contrato del adapter.

Corolario: cualquier futura introducción de `capabilities.languages` u otras claves en `AdapterCapabilities` requiere una ADR nueva y quedaría fuera del alcance del Hito 7.2 y del alcance de ADR-007.

---

## §5. Precedencia

La precedencia normativa aplicada por el mecanismo interno del dominio de adapters es:

- **(a)** Si `adapter.supports(lang)` está definido, el consumidor autorizado invoca `adapter.supports(lang)` y ese valor es el resultado de la resolución.
- **(b)** Si `adapter.supports(lang)` NO está definido y `adapter.getSupportedLanguages()` está definido, el dominio interno deriva el resultado mediante pertenencia del `lang` al conjunto declarado por `adapter.getSupportedLanguages()`.
- **(c)** Si ninguna de las dos está definida, se aplica el comportamiento por defecto declarado en §6.

Reglas duras adicionales:
- El resolver **no consulta simultáneamente** ambas fuentes durante la resolución ordinaria.
- El resolver **no ejecuta doble evaluación** en runtime.
- El resolver **no lanza** por diferencia entre fuentes.

Esta precedencia es determinista, sin ramas ocultas y sin fallback entre fuentes distinto del descrito.

---

## §6. Comportamiento cuando no hay declaración

Cuando un adapter no implemente `supports(lang)` **ni** `getSupportedLanguages()`, el resultado de la resolución es:

**`false`**.

Justificación normativa:
- Comportamiento **fail-closed** por defecto.
- Ausencia de declaración no equivale a soporte.
- Evita "soporte universal" implícito no declarado por ningún adapter real.
- Evita la introducción de excepciones nuevas o de tipos de retorno no booleanos.
- Preserva el tipo de retorno booleano homogéneo previsto por ADR-004 §2.3.
- Protege producción ante adapters incompletos (legacy fakes o adapters mal migrados) que pudieran ser invocados por error.
- Permite que los fakes legacy sigan existiendo (ADR-004 §2.4) sin declarar capacidad inexistente.

---

## §7. Incoherencias entre declaraciones

Cuando un adapter implemente simultáneamente `supports(lang)` y `getSupportedLanguages()`, ambos **deben** ser semánticamente equivalentes conforme a ADR-004 §2.3 y ADR-006 §5.

El resolver de runtime:

- **NO comprueba** ambas fuentes en cada llamada.
- **NO lanza** errores por divergencia observada.
- **NO realiza** validación duplicada en runtime.
- Utiliza `supports(lang)` conforme a la precedencia definida en §5.

La incoherencia entre declaraciones constituye:

- Incumplimiento del contrato del adapter (ADR-004 §2.3).
- Adapter inválido para producción (ADR-004 §2.3).
- Responsabilidad de las **pruebas de conformidad** del adapter (ADR-006 §5) y de la **auditoría** documental del adapter.
- **NO** es responsabilidad del resolver de runtime detectar ni reportar la divergencia.

Corolario: el resolver es puramente resolutorio, no validador.

---

## §8. Consumidor autorizado

Se autoriza expresamente al dominio interno

`engine/src/adapters/`

a derivar el soporte lingüístico desde `getSupportedLanguages()` cuando `supports(lang)` esté ausente, conforme al camino (b) de §5.

Esta autorización es una **excepción controlada** a la salvaguarda introducida por Foundation Evolution 2 en `engine/src/types/adapters.test.ts` (test §2.7), y opera exclusivamente sobre el dominio interno de adapters.

La autorización **NO** se extiende a:

- Managers.
- `AdapterRegistry`.
- Engine.
- Pipeline.
- Pipeline Orchestrator.
- Core API.
- V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- SDK futuro (heredará por su propia ADR cuando exista).
- Ningún otro consumer actual o futuro.

Cualquier ampliación futura de la autorización requiere ADR nueva.

---

## §9. Salvaguarda de derivación

ADR-007 autoriza una modificación **mínima y explícita** posterior del test:

`engine/src/types/adapters.test.ts`

exclusivamente para incorporar `engine/src/adapters/` a la lista blanca de contextos autorizados por el test §2.7.

La excepción:

- **debe limitarse exactamente** al dominio interno `engine/src/adapters/`;
- **no debe autorizar** Managers;
- **no debe autorizar** `AdapterRegistry`;
- **no debe autorizar** Engine;
- **no debe autorizar** Pipeline ni Pipeline Orchestrator;
- **no debe autorizar** Core API;
- **no debe autorizar** V1;
- **no debe permitir** derivaciones distribuidas en cualquier otro consumer;
- **debe mantener bloqueado** cualquier otro consumer actual o futuro.

Reglas anti-workaround (aplicables al Hito 7.2 y a cualquier hito posterior):

- **PROHIBIDO** introducir variables intermedias diseñadas para eludir el regex de la salvaguarda.
- **PROHIBIDO** fragmentar deliberadamente la expresión `getSupportedLanguages().has(...)` para evitar la detección estática.
- **PROHIBIDO** introducir aliases (renombrados, wrappers triviales, indirecciones) destinados a ocultar la derivación.
- La corrección debe ser **explícita**: la lista blanca del test §2.7 se amplía nominalmente al dominio interno, no se rodea.

Corolario: la implementación del Hito 7.2 podrá escribir la derivación en su forma directa dentro del dominio interno, precisamente porque §9 autoriza esa forma nominal. Cualquier técnica de evasión invalida la implementación.

---

## §10. Consecuencias

1. **A1 resuelta**: `capabilities.languages` queda expresamente fuera del contrato de resolución del Hito 7.2. Cualquier futura introducción requiere ADR nueva.
2. **A2 resuelta**: el default para el caso "ninguna declaración presente" es `false`, fail-closed, sin excepciones nuevas ni cambio de tipo de retorno.
3. **A3 resuelta**: el dominio interno de adapters queda autorizado nominalmente como consumer derivador; la salvaguarda §2.7 se ampliará por corrección mínima explícita del test, sin workarounds.
4. **Foundation intacta**: `engine/src/types/adapters.ts` y `engine/src/types/language.ts` no se modifican.
5. **Superficie pública intacta**: `engine/src/index.ts` no se modifica; el mecanismo interno permanece no público (ADR-006 §3, §4).
6. **Managers, AdapterRegistry, Engine, Pipeline, Core API, V1 intactos**.
7. **Compatibilidad hacia atrás preservada**: fakes legacy (Fases 1–6) siguen siendo válidos por opcionalidad de tipo (ADR-004 §2.4); el default fail-closed hace que su resolución retorne `false` sin excepción.
8. **Superficie de decisión mínima**: ADR-007 cierra exclusivamente las tres ambigüedades detectadas, sin abrir nuevas.

---

## §11. Fuera de alcance

ADR-007 **no** decide, autoriza ni prescribe:

- Adapters concretos por proveedor (bloqueado por B1 de ADR-006).
- Proveedores concretos por kind.
- Selección de adapters por parte de consumers.
- Modificaciones a `AdapterRegistry` (ADR-004 §2.6).
- Prioridad entre adapters registrados.
- Fallback entre proveedores.
- Caché de resultados de resolución.
- Métricas o telemetría sobre resoluciones.
- Logging de resoluciones.
- Observabilidad de invocaciones.
- Rate limiting.
- Persistencia de resultados.
- RLS o multi-tenant.
- Ampliación de la superficie pública del engine.
- Ampliación de la API pública.
- Anticipación de decisiones del SDK.
- Cambios en Managers.
- Cambios en Engine, Pipeline, Pipeline Orchestrator, Core API.
- Cambios en V1.
- Introducción de nuevos `AdapterKind` (requiere ADR aditiva a ADR-004 §2.1).
- Introducción de claves en `AdapterCapabilities` (requiere ADR específica por ADR-004 §2.5).
- Demo end-to-end o integración con servicios reales.

---

## §12. Compatibilidad

- **Foundation**: intacta. Ningún tipo cambia. Ninguna interfaz nueva. Ningún export nuevo.
- **Foundation Evolution 2 congelada**: intacta salvo la modificación mínima y explícita del test §2.7 autorizada por §9, exclusivamente para ampliar la lista blanca al dominio interno `engine/src/adapters/`. Los 526 tests basales permanecen semánticamente equivalentes; el conteo se mantiene o crece únicamente por tests nuevos del Hito 7.2.
- **Superficie pública del engine**: intacta.
- **Adapters legacy** (Fases 1–6): siguen siendo válidos; su resolución retorna `false` por §6, coherente con "válidos sólo para tests o entornos no productivos" (ADR-004 §2.4).
- **Managers, AdapterRegistry, Engine, Pipeline, Core API**: intactos.
- **V1**: intacta.

---

## §13. Seguridad y producción

ADR-007 **no introduce cambios** en:

- Autenticación.
- Autorización.
- Persistencia.
- RLS.
- APIs públicas.
- Despliegue.
- CI/CD.
- Observabilidad.
- Métricas.
- Alertas.
- Rate limiting.
- Caché.
- Logging.
- Red.
- Dependencias externas.
- Superficie de ataque.

El default fail-closed (§6) refuerza la postura de seguridad en runtime: un adapter no completamente declarado no puede reportarse como soporte-universal por accidente.

Cualquier implementación futura que aborde estos aspectos deberá cumplir los estándares arquitectónicos vigentes y estar respaldada por la ADR correspondiente.

---

## §14. Criterios de aceptación

ADR-007 se considerará listo para congelación cuando:

- Haya sido auditado independientemente y el veredicto sea APTO PARA CONGELACIÓN.
- Cero contradicciones con ADR-003, ADR-004, ADR-005, ADR-006.
- Cero decisiones fuera del alcance declarado en §3.
- Cero ampliación de superficie pública.
- Cero introducción de tecnologías o proveedores concretos.
- Cero cambios de código o de tests como parte de esta ADR (los cambios pertenecen al Hito 7.2 bajo la autorización nominal de §9).
- Las tres ambigüedades A1, A2, A3 identificadas en la detención del Hito 7.2 queden inequívocamente cerradas por §4, §6, §7, §8 y §9.

---

## §15. Veredicto documental

**BORRADOR — APTO PARA AUDITORÍA INDEPENDIENTE.**

Justificación:
- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006 y del Plan Oficial de Fase 7 congelado.
- Cierra las tres ambigüedades A1, A2, A3 sin invención adicional.
- No amplía Foundation, no amplía superficie pública, no introduce tecnologías ni proveedores.
- Autoriza nominalmente al dominio interno como consumer derivador con salvaguarda anti-workaround explícita.
- Alcance mínimo y auditable; fuera de alcance enumerado exhaustivamente en §11.
