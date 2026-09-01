# CONTRATO INTERNO DEL DOMINIO DE ADAPTERS — INTERNAL

**Ámbito**: `engine/src/adapters/` (dominio interno del engine).
**Naturaleza**: documento normativo interno. No forma parte de la superficie pública del engine.
**Vinculación**: derivado literalmente de ADR-003, ADR-004, ADR-005, ADR-006 y ADR-007 V1.1 (APROBADA Y CONGELADA).
**Alcance**: contrato del Hito 7.2 (documental). La materialización runtime pertenece al Hito 7.3.

Este documento consolida las reglas normativas que gobiernan a los adapters reales del dominio interno `engine/src/adapters/`. Cada afirmación está respaldada por cita literal a una sección de ADR congelada. Ninguna afirmación introduce una decisión arquitectónica nueva.

---

## §1. Ubicación de la materialización (ADR-006 §1)

El dominio `engine/src/adapters/` es la **ubicación asignada** para la materialización interna del default `supports(lang)`. La materialización NO reside en Foundation (`engine/src/types/*`, congelada) ni en el SDK (Fase 9, aún no existe).

Cita (ADR-006 §1): *"La materialización runtime del default `supports(lang)` reside en el dominio de adapters reales (`engine/src/adapters/`)."*

---

## §2. Tres opciones autorizadas (ADR-006 §2)

Un adapter real dentro del dominio puede adoptar cualquiera de las tres opciones autorizadas:

- **(a)** Implementar `supports(lang)` delegando al mecanismo interno del dominio.
- **(b)** Omitir `supports(lang)` cuando exista un consumidor autorizado (interno al dominio, al SDK futuro o a la superficie que ADR-004 §2.7 declare autorizada) que derive el resultado a partir de `getSupportedLanguages()`.
- **(c)** Implementar una optimización propia de `supports(lang)` cuando exista justificación demostrable, siempre y cuando sea **semánticamente equivalente** a la derivación desde `getSupportedLanguages()`.

La elección corresponde al adapter real. La selección de la forma canónica que materialice runtime la derivación de la opción (b) o el mecanismo interno de la opción (a) corresponde al **Plan del Hito 7.3**.

---

## §3. Fuentes válidas de declaración de soporte (ADR-007 V1.1 §4)

Las **únicas dos fuentes válidas** de declaración de soporte lingüístico de un adapter son:

- `adapter.supports(lang)`
- `adapter.getSupportedLanguages()`

**`capabilities.languages` NO participa** en la resolución. Justificación normativa: `AdapterCapabilities` está congelada como interfaz vacía por ADR-004 §2.5; ninguna ADR congelada declara la clave `languages`; cualquier futura introducción exige ADR nueva.

---

## §4. Precedencia normativa (ADR-007 V1.1 §5, ADR-006 §2)

- **(a)** Si `adapter.supports(lang)` está definido, el resultado normativo es el valor devuelto por `adapter.supports(lang)`.
- **(b)** Si `adapter.supports(lang)` NO está definido y `adapter.getSupportedLanguages()` está definido, el resultado normativo es la pertenencia del `lang` al conjunto retornado por `adapter.getSupportedLanguages()`, expresada mediante una forma canónica F1/F2/F3 (ADR-007 V1.1 §9.3) que el **Plan del Hito 7.3** elegirá.
- **(c)** Si ninguna de las dos está definida, el resultado normativo es el default de §5.

Reglas duras (ADR-007 V1.1 §5): el resolver de runtime NO consulta simultáneamente ambas fuentes durante la resolución ordinaria; NO ejecuta doble evaluación; NO lanza por diferencia entre fuentes.

---

## §5. Default fail-closed (ADR-007 V1.1 §6)

Cuando un adapter no implemente `supports(lang)` ni `getSupportedLanguages()`, el resultado normativo es:

**`false`** (fail-closed).

Justificación normativa (ADR-007 V1.1 §6): ausencia de declaración no equivale a soporte; evita "soporte universal" implícito no declarado por ningún adapter real; evita la introducción de excepciones nuevas o de tipos de retorno no booleanos; preserva el tipo de retorno booleano homogéneo previsto por ADR-004 §2.3; protege producción ante adapters incompletos.

---

## §6. Tratamiento de incoherencias (ADR-007 V1.1 §7)

Cuando un adapter implemente simultáneamente ambos, ambos **deben** ser semánticamente equivalentes conforme a ADR-004 §2.3 y ADR-006 §5.

El resolver de runtime:

- **NO** comprueba ambas fuentes en cada llamada.
- **NO** lanza errores por divergencia observada.
- **NO** realiza validación duplicada en runtime.
- Utiliza `supports(lang)` conforme a la precedencia definida en §4.

La incoherencia entre declaraciones constituye incumplimiento del contrato del adapter (ADR-004 §2.3), lo hace inválido para producción, y es responsabilidad de las **pruebas de conformidad** del adapter (ADR-006 §5) y de la **auditoría** documental del adapter. **NO** es responsabilidad del resolver de runtime detectar ni reportar la divergencia.

Corolario: el resolver es puramente resolutorio, no validador.

---

## §7. Materializador autorizado (ADR-007 V1.1 §8, ADR-006 §1, §2(b))

`engine/src/adapters/` es el **MATERIALIZADOR autorizado** del default `supports(lang)`. NO es consumer distribuido. Las formas canónicas F1/F2/F3 son constitucionalmente válidas dentro del dominio precisamente porque el dominio actúa como materializador, no como consumer.

La autorización **NO** se extiende a:

- Managers.
- `AdapterRegistry`.
- Engine.
- Pipeline, PipelineOrchestrator.
- Core API.
- V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- SDK futuro (heredará por su propia ADR cuando exista).
- Cualquier otro consumer actual o futuro.

Cualquier ampliación de la autorización requiere ADR nueva.

---

## §8. Formas canónicas F1, F2, F3 (ADR-007 V1.1 §9.3)

Las tres formas canónicas autorizadas dentro del dominio interno para expresar la equivalencia semántica de la derivación sin modificar Foundation son:

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

**Las tres formas se citan como referencia normativa en este contrato. Ninguna se implementa en el Hito 7.2.** La elección concreta para materialización runtime corresponde al Plan del Hito 7.3.

Reglas anti-workaround (ADR-007 V1.1 §9.4) aplicables a **cualquier archivo** del engine:

- **PROHIBIDO** escribir el patrón textual literal de la derivación inline sobre `getSupportedLanguages()` encadenado con `.has(...)` en cualquier archivo del engine. Esa expresión sólo puede aparecer en los dos contextos autorizados por Foundation Evolution 2 §2.7 (`types/adapters.ts`, `types/adapters.test.ts`).
- **PROHIBIDO** aliases opacos (renombrados sin semántica, wrappers triviales sin propósito documentado, indirecciones sin justificación normativa) destinados a ocultar la derivación al auditor.
- **PROHIBIDO** fragmentar la derivación en pasos que no sean legibles como una única semántica de pertenencia auditable.
- **PROHIBIDO** invocar dinámicamente el método `has` mediante acceso `[..]` para eludir la detección estática.
- **PROHIBIDO** en cualquier consumer no autorizado reproducir cualquier forma de derivación, canónica o no.
- **PERMITIDO** en `engine/src/adapters/` cualquiera de F1, F2 o F3, o una equivalencia semántica análoga suficientemente auditable, siempre que quede documentada en el plan del hito que la introduzca.

---

## §9. Salvaguarda dentro del dominio (ADR-007 V1.1 §9.1, §9.2, §9.6)

**Foundation permanece INTACTA sin excepción.** `engine/src/types/*` (incluyendo `engine/src/types/adapters.test.ts`) NO se modifica.

La salvaguarda §2.7 congelada por Foundation Evolution 2 permanece intacta con su **lista blanca original** (`types/adapters.ts` + `types/adapters.test.ts`). NO se amplía, NO se debilita, NO se ajusta la regex.

Cita (ADR-007 V1.1 §9.1): *"ADR-007 no autoriza ninguna modificación de `engine/src/types/*` ni de la salvaguarda §2.7 congelada por Foundation Evolution 2."*

Cita (ADR-007 V1.1 §9.6): *"Cualquier intento de modificar `engine/src/types/*` requiere un Change Request formal al Plan Oficial de Fase 7 y queda fuera del alcance de ADR-007 en su forma actual."*

---

## §10. Superficie pública (ADR-006 §3, §4; ADR-007 V1.1 §12)

El dominio es **interno**. Prohibiciones duras:

- Cero **re-export** desde `engine/src/index.ts` (barrel público). Cualquier PR que re-exporte el mecanismo interno viola ADR-006 §4 y debe ser rechazado en revisión.
- Cero ampliación de `AdapterBase` (Foundation congelada por Foundation Evolution 2).
- Cero ampliación de `AdapterCapabilities` (Foundation congelada; ADR-004 §2.5 exige ADR específica para cada clave).
- Cero nueva API pública.
- El dominio permanece consumible únicamente desde dentro del propio dominio; no forma parte de la superficie que el SDK futuro re-exportará.

---

## §11. Regla dura para consumers (ADR-004 §2.7)

**Todos los consumers de adapters — SDK, API pública, CLI, dashboards, tests y cualquier consumer futuro — utilizan SIEMPRE `supports(lang)`.**

**Ningún consumer implementa manualmente la derivación desde `getSupportedLanguages()`.**

Excepción única: el dominio interno `engine/src/adapters/` como **MATERIALIZADOR** autorizado por ADR-007 V1.1 §8 (no como consumer). Las formas canónicas F1/F2/F3 son válidas dentro del dominio precisamente porque el dominio no es consumer.

---

## §12. Ausencia de helper de resolución en el registry (ADR-004 §2.6)

`AdapterRegistry` **NO** añade `resolveByLanguage(kind, lang)` ni ningún otro helper de resolución por capacidades. Esa responsabilidad pertenece al SDK (Fase 9) por coherencia con ADR-003 §0.3 (SDK First) y §0.4 (Provider Agnostic).

---

## §13. Catálogo canónico de idiomas (ADR-005 §5)

El catálogo canónico de idiomas de SPABLA V2 es la **fuente única de verdad**. Los adapters expresan capacidad sobre los códigos declarados en el catálogo sin reinventarlo. La primera versión oficial (55 códigos ISO 639-1) está fijada por ADR-005 §5. La evolución del catálogo sigue la gobernanza permanente definida en ADR-005 §§1–4.

---

## §14. Separación de hitos de Fase 7

- **Hito 7.1**: existencia arquitectónica del dominio (cerrado en el commit `5c66392`).
- **Hito 7.2** (este contrato): explicitación del contrato normativo documental del dominio, verificable mecánicamente.
- **Hito 7.3**: materialización runtime del default `supports(lang)` dentro del dominio, elección concreta de una de las formas canónicas F1/F2/F3.
- **Hito 7.4**: infraestructura reutilizable de verificación de coherencia (pruebas de equivalencia semántica).
- **Hito 7.5**: escenarios sintéticos que demuestran la viabilidad de las opciones (a), (b), (c).

Ninguna materialización runtime, infraestructura reutilizable ni escenario sintético pertenece al Hito 7.2. Cualquier intento de introducirlos en este hito debe detenerse y elevarse al Jefe de Proyecto.

---

## §15. Referencias normativas

- **ADR-003-STRATEGIC-VISION** (congelado 2026-07-09).
- **ADR-004-FOUNDATION-EVOLUTION-2** (congelado 2026-07-09) — §2.1, §2.3, §2.4, §2.5, §2.6, §2.7.
- **ADR-005-LANGUAGE-CATALOG** (congelado 2026-07-09) — §5 (catálogo canónico).
- **ADR-006-RUNTIME-ADAPTER-RESOLUTION** (congelado 2026-07-10) — §1, §2, §3, §4, §5.
- **ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION V1.1** (APROBADA Y CONGELADA en `6f49b92`) — §4, §5, §6, §7, §8, §9.
- **Plan Oficial de Fase 7** (`docs/phases/SPABLA_V2_FASE_7_PLAN.md`, congelado 2026-07-11).
- **Plan Oficial del Hito 7.2 V1.3** (`docs/phases/SPABLA_V2_FASE_7_HITO_7_2_PLAN.md`, APROBADO Y CONGELADO en `7e896c5`).

---

## §16. Prohibición de citación pública

Este documento es **INTERNAL** y **NO puede citarse como superficie pública** del engine. Es un artefacto interno del dominio `engine/src/adapters/`. Su modificación exige una nueva versión del Plan del Hito 7.2 con auditoría independiente conforme al proceso de gobernanza vigente.

---

**Fin del contrato interno.**
