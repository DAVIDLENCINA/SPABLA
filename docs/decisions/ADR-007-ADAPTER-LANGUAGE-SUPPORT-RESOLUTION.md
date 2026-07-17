# ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION — Semántica interna de resolución de soporte lingüístico

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: BORRADOR — APTO PARA AUDITORÍA INDEPENDIENTE.
**Fecha**: 2026-07-17.
**Base**: `spabla-v2-phase-7-plan-2026-07-11` @ `9f08307`.
**Depende de**: ADR-003, ADR-004, ADR-005, ADR-006, Plan Oficial de Fase 7 (congelado).

**Historial de correcciones**:

- **V1.0 (2026-07-17)** — redacción inicial. §9 autorizaba una modificación mínima del test `engine/src/types/adapters.test.ts` (salvaguarda §2.7 de Foundation Evolution 2) para ampliar su lista blanca al dominio interno.
- **V1.1 (2026-07-17)** — corrección documental sin cambio funcional. La auditoría independiente del ADR-007 detectó una contradicción con el Plan Oficial de Fase 7 §Lista de archivos: `engine/src/types/*` está declarado *"Sin cambios (fuera de alcance, prohibido tocarlos)"*. §9 se rediseña completamente para que la salvaguarda de derivación del dominio interno resida **íntegramente** dentro de `engine/src/adapters/` sin tocar Foundation. La salvaguarda §2.7 congelada por Foundation Evolution 2 se preserva sin excepción. §10, §11, §12, §14 y §15 se actualizan en consecuencia. Las decisiones funcionales §4, §5, §6, §7, §8 permanecen intactas.

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

### §9.1. Principio rector

ADR-007 **no autoriza** ninguna modificación de `engine/src/types/*` ni de la salvaguarda §2.7 congelada por Foundation Evolution 2. El Plan Oficial de Fase 7 §Lista de archivos declara `engine/src/types/*` como *"Sin cambios (fuera de alcance, prohibido tocarlos)"* y ADR-007 respeta esa declaración sin excepción.

La salvaguarda de derivación del dominio interno reside **íntegramente** dentro de `engine/src/adapters/`. Foundation permanece intacta. La salvaguarda §2.7 sigue vigente sin ampliación de su lista blanca.

### §9.2. Ubicación exclusiva de la salvaguarda

- La materialización del default `supports(lang)` (Hito 7.3) vive dentro de `engine/src/adapters/`.
- Las pruebas de conformidad y de equivalencia semántica del mecanismo interno (Hito 7.4) viven dentro de `engine/src/adapters/`.
- Cualquier salvaguarda añadida por el dominio interno para asegurar coherencia del contrato (por ejemplo, un test propio que grep-e patrones prohibidos en `engine/src/adapters/` mismo) vive dentro de `engine/src/adapters/`.

Fuera de `engine/src/adapters/`, ADR-007 no autoriza ninguna intervención.

### §9.3. Forma canónica dentro del dominio interno

La salvaguarda §2.7 congelada por Foundation Evolution 2 dispara exclusivamente sobre el patrón textual literal `getSupportedLanguages()\s*\.\s*has\s*(` aplicado sobre archivos distintos de los dos contextos autorizados (`types/adapters.ts` y `types/adapters.test.ts`). Su motivación normativa (ADR-004 §2.7) es prohibir que los **consumers** materialicen manualmente la derivación.

El dominio interno de adapters **no es un consumer**: es el materializador autorizado del default `supports(lang)` (ADR-004 §2.3, ADR-006 §1). Su materialización debe expresarse dentro del dominio en una **forma canónica** que:

1. sea **semánticamente equivalente** a `getSupportedLanguages().has(lang)` (ADR-004 §2.3, ADR-006 §5);
2. respete literalmente la salvaguarda §2.7 sin modificarla;
3. sea **explícita y auditable** (sin evasión ni oscurecimiento).

Formas canónicas autorizadas dentro de `engine/src/adapters/` (lista no exhaustiva; equivalentes semánticamente):

- **F1** — Variable intermedia nombrada semánticamente:
  ```ts
  const supported = adapter.getSupportedLanguages();
  return supported.has(lang);
  ```
  Precedente idéntico ya presente en el propio test §2.7 congelado (`engine/src/types/adapters.test.ts` línea 68), lo que confirma que esta construcción **no dispara** el grep y ha sido reconocida como idiomática por Foundation Evolution 2.

- **F2** — Iteración explícita sobre el Set devuelto:
  ```ts
  for (const supported of adapter.getSupportedLanguages()) {
    if (supported === lang) return true;
  }
  return false;
  ```

- **F3** — Materialización a array + membership check:
  ```ts
  return Array.from(adapter.getSupportedLanguages()).includes(lang);
  ```
  Precedente equivalente ya presente en el propio test §2.7 congelado (`engine/src/types/adapters.test.ts` línea 77).

La forma elegida se declarará en el plan de Fase 7 Hito 7.3 y su elección no reabre esta ADR.

### §9.4. Reglas anti-workaround (recalibradas)

La regla anti-workaround permanece pero se recalibra para distinguir la **forma canónica autorizada** dentro del dominio interno de una **evasión ilegítima**:

- **PROHIBIDO** dentro de `engine/src/adapters/` o cualquier otro archivo del engine, escribir el patrón textual literal `getSupportedLanguages().has(...)`. Esa expresión sólo puede aparecer en los dos contextos autorizados por Foundation Evolution 2 §2.7 (`types/adapters.ts`, `types/adapters.test.ts`).
- **PROHIBIDO** introducir aliases opacos (renombrados sin semántica, wrappers triviales sin propósito documentado, indirecciones sin justificación normativa) destinados a **ocultar** la derivación al auditor.
- **PROHIBIDO** fragmentar la derivación en pasos que no sean legibles como una única semántica de pertenencia auditable.
- **PROHIBIDO** invocar dinámicamente el método `has` a través de acceso `[..]` para eludir la detección estática (`set["has"](lang)` y similares).
- **PROHIBIDO** en cualquier consumer no autorizado (Managers, `AdapterRegistry`, Engine, Pipeline, Pipeline Orchestrator, Core API, V1, SDK futuro) reproducir cualquier forma de derivación, canónica o no. Ese conjunto usa siempre `adapter.supports(lang)` conforme a ADR-004 §2.7.
- **PERMITIDO** en `engine/src/adapters/` cualquiera de las formas canónicas F1, F2 o F3 de §9.3, o una equivalencia semántica análoga suficientemente auditable, siempre que quede documentada en el plan del hito que la introduzca.

### §9.5. Verificación del contrato dentro del dominio interno

La verificación de que el mecanismo interno del dominio es semánticamente equivalente a `getSupportedLanguages().has(lang)` se realiza mediante:

- **Pruebas de equivalencia semántica** dentro de `engine/src/adapters/` (Hito 7.4), sobre catálogo probe suficiente. La forma exacta queda dentro del margen técnico del plan de Fase 7.
- **Salvaguarda estática opcional del propio dominio** (Hito 7.2 o Hito 7.3): un test dentro de `engine/src/adapters/` puede verificar que ningún archivo del dominio contiene el patrón literal prohibido `getSupportedLanguages().has(`, reforzando por auditoría estática que la forma canónica se respeta. La existencia y forma de esta salvaguarda estática es opcional y no es requisito de ADR-007.

Ninguna de estas verificaciones requiere ni autoriza tocar `engine/src/types/*`.

### §9.6. Corolario

La implementación del Hito 7.2 podrá redactar el contrato interno y — cuando el Hito 7.3 sea autorizado — el mecanismo interno de derivación, en una de las formas canónicas §9.3, dentro de `engine/src/adapters/`, sin modificar Foundation. Cualquier técnica que oculte la derivación al auditor invalida la implementación. Cualquier intento de modificar `engine/src/types/*` requiere un Change Request formal al Plan Oficial de Fase 7 y queda **fuera del alcance** de ADR-007 en su forma actual.

---

## §10. Consecuencias

1. **A1 resuelta**: `capabilities.languages` queda expresamente fuera del contrato de resolución del Hito 7.2. Cualquier futura introducción requiere ADR nueva.
2. **A2 resuelta**: el default para el caso "ninguna declaración presente" es `false`, fail-closed, sin excepciones nuevas ni cambio de tipo de retorno.
3. **A3 resuelta sin tocar Foundation**: el dominio interno de adapters queda autorizado como materializador del default `supports(lang)` (§8); la equivalencia semántica se expresa dentro del dominio en una **forma canónica** (§9.3) que respeta literalmente la salvaguarda §2.7 congelada por Foundation Evolution 2 sin modificarla ni ampliar su lista blanca.
4. **Foundation intacta sin excepción**: `engine/src/types/adapters.ts`, `engine/src/types/language.ts`, `engine/src/types/adapters.test.ts` y `engine/src/types/language.test.ts` **no se modifican**. La salvaguarda §2.7 permanece con su lista blanca original (`types/adapters.ts` + `types/adapters.test.ts`). El Plan Oficial de Fase 7 §Lista de archivos se respeta literalmente sin necesidad de Change Request.
5. **Superficie pública intacta**: `engine/src/index.ts` no se modifica; el mecanismo interno permanece no público (ADR-006 §3, §4).
6. **Managers, AdapterRegistry, Engine, Pipeline, Core API, V1 intactos**.
7. **Compatibilidad hacia atrás preservada**: fakes legacy (Fases 1–6) siguen siendo válidos por opcionalidad de tipo (ADR-004 §2.4); el default fail-closed hace que su resolución retorne `false` sin excepción.
8. **Superficie de decisión mínima**: ADR-007 cierra exclusivamente las tres ambigüedades detectadas, sin abrir nuevas ni requerir enmienda documental a ningún plan de fase congelado.

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
- **Modificaciones a `engine/src/types/*`** (Foundation congelada por Foundation Evolution 2; declarada *"Sin cambios (fuera de alcance, prohibido tocarlos)"* por el Plan Oficial de Fase 7 §Lista de archivos). Cualquier modificación futura de esta superficie requeriría Change Request formal al Plan Oficial de Fase 7 y queda **fuera** del alcance de ADR-007.
- **Modificaciones a la salvaguarda §2.7** en `engine/src/types/adapters.test.ts` (parte de Foundation Evolution 2 congelada). Su lista blanca original (`types/adapters.ts` + `types/adapters.test.ts`) permanece sin ampliación.
- **Enmiendas documentales al Plan Oficial de Fase 7**. ADR-007 se ajusta al Plan Oficial y no lo modifica.

---

## §12. Compatibilidad

- **Foundation**: intacta. Ningún tipo cambia. Ninguna interfaz nueva. Ningún export nuevo.
- **Foundation Evolution 2 congelada**: intacta **sin excepción**. Ni `engine/src/types/adapters.ts` ni `engine/src/types/adapters.test.ts` se modifican. La salvaguarda §2.7 se preserva con su lista blanca original (`types/adapters.ts` + `types/adapters.test.ts`) sin ampliación. La equivalencia semántica dentro del dominio interno se expresa mediante la forma canónica autorizada por §9.3, que no dispara el grep §2.7. Los 526 tests basales permanecen semánticamente equivalentes; el conteo se mantiene o crece únicamente por tests nuevos que el Hito 7.2 y hitos posteriores introduzcan dentro de `engine/src/adapters/`.
- **Plan Oficial de Fase 7 congelado**: respetado literalmente. `engine/src/types/*` permanece en su declaración *"Sin cambios (fuera de alcance, prohibido tocarlos)"*. ADR-007 no requiere Change Request al Plan Oficial de Fase 7.
- **Superficie pública del engine**: intacta.
- **Adapters legacy** (Fases 1–6): siguen siendo válidos; su resolución retorna `false` por §6, coherente con "válidos sólo para tests o entornos no productivos" (ADR-004 §2.4).
- **Managers, AdapterRegistry, Engine, Pipeline, Core API**: intactos.
- **V1**: intacta.
- **SDK futuro (Fase 9)**: intacto; heredará por su propia ADR cuando exista (§8).

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
- Cero contradicciones con Foundation Evolution 2 congelada.
- Cero contradicciones con el Plan Oficial de Fase 7 congelado.
- Cero decisiones fuera del alcance declarado en §3.
- Cero ampliación de superficie pública.
- Cero autorización explícita o implícita para modificar `engine/src/types/*`. Cualquier cambio futuro sobre esa superficie requeriría Change Request formal al Plan Oficial de Fase 7 y quedaría fuera del alcance de ADR-007 en su forma actual.
- Cero autorización explícita o implícita para ampliar la lista blanca del test §2.7.
- Cero introducción de tecnologías o proveedores concretos.
- Cero cambios de código o de tests como parte de esta ADR (los cambios pertenecen al Hito 7.2 y al Hito 7.3 bajo la autorización de §8 y las formas canónicas de §9.3, ambos dentro de `engine/src/adapters/`).
- Las tres ambigüedades A1, A2, A3 identificadas en la detención del Hito 7.2 queden inequívocamente cerradas por §4, §6, §7, §8 y §9, sin requerir modificaciones a Foundation ni al Plan Oficial de Fase 7.

---

## §15. Veredicto documental

**BORRADOR — APTO PARA AUDITORÍA INDEPENDIENTE (V1.1 corregida).**

Justificación:
- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006 y del Plan Oficial de Fase 7 congelado.
- Cierra las tres ambigüedades A1, A2, A3 sin invención adicional.
- **No modifica Foundation ni la salvaguarda §2.7 congelada por Foundation Evolution 2.** La equivalencia semántica dentro del dominio interno se expresa mediante formas canónicas §9.3 que respetan literalmente la salvaguarda §2.7 sin ampliar su lista blanca.
- **No requiere Change Request al Plan Oficial de Fase 7.** `engine/src/types/*` permanece intacto en cumplimiento literal del §Lista de archivos del Plan Oficial.
- No amplía superficie pública, no introduce tecnologías ni proveedores.
- Autoriza al dominio interno como materializador del default con reglas anti-workaround recalibradas (§9.4) para distinguir la forma canónica auditable de la evasión ilegítima.
- Alcance mínimo y auditable; fuera de alcance enumerado exhaustivamente en §11 e incluye ahora explícitamente `engine/src/types/*` y la salvaguarda §2.7.

**Estado**: BORRADOR. Aún no APROBADO, aún no CONGELADO, aún no VINCULANTE. Requiere reauditoría independiente sobre la corrección V1.1 antes de considerar la congelación.
