# Plan de Foundation Evolution 2

**Tipo**: Plan de implementación derivado exclusivamente de ADRs congeladas.
**Autor**: Jefe de Proyecto.
**Estado**: aceptado.
**Fecha**: 2026-07-09.
**Rama de trabajo prevista**: `spabla-v2/foundation-evolution-2` desde `spabla-v2-adr-005-language-catalog-2026-07-09` @ `a9dfc02`.
**Depende de**: ADR-003, ADR-004, ADR-005 (fuente única de verdad; este plan no duplica su contenido).

Este plan traduce ADR-004 (contrato de capacidades del Adapter) y ADR-005 (catálogo de idiomas) en un único plan técnico ejecutable. **No introduce ninguna decisión arquitectónica nueva**. Todas las decisiones normativas provienen de las ADRs congeladas y se citan por referencia.

---

## Contexto

ADR-004 congeló el contrato arquitectónico del Adapter y ADR-005 congeló la primera versión oficial del catálogo más las reglas permanentes de su gobernanza. Este plan es la única traducción ejecutiva autorizada de ambas ADRs.

Cualquier necesidad de tomar una decisión arquitectónica no prevista por ADR-003/004/005 durante la implementación **detiene inmediatamente el plan** y se reporta como bloqueo. Este plan sólo implementa lo ya decidido.

---

## Alcance del plan

Cierre técnico de Foundation Evolution 2:

- Ampliación de `LangCode` y `SUPPORTED_LANG_CODES` con el catálogo ADR-005 §5.
- Ampliación aditiva del contrato `AdapterBase` según ADR-004 §2.1.
- Declaración de `interface AdapterCapabilities {}` con las reglas normativas de ADR-004 §2.5.
- Provisión de la implementación por defecto de `supports(lang)` según ADR-004 §2.3.
- Tests contract-first alineados con las reglas de ADR-004 §2.
- Regresión cero de la suite basal Fase 6.

**Fuera de alcance** (delegado a Fase 7 o posterior):

- Adapters reales.
- Modificación de `AdapterRegistry` (ADR-004 §2.6).
- Guards en Managers (ADR-004 §5.2 pendiente).
- Helper de resolución en el registro (ADR-004 §5.1 pendiente).

---

## Secuencia obligatoria de implementación

**Orden estricto**. Cada fase se cierra antes de abrir la siguiente.

### Fase 1 — Foundation types: `LangCode` y `SUPPORTED_LANG_CODES`

- Archivo: `engine/src/types/language.ts`.
- Ampliar la union `LangCode` con los códigos nuevos del catálogo ADR-005 §5, preservando los existentes.
- Ampliar el Set `SUPPORTED_LANG_CODES` con los mismos códigos, preservando los existentes.
- Cero cambios semánticos en `isLangCode`, `makeLanguagePair`, `languagePairEquals`, `invertLanguagePair`. Consumen el Set y absorben la ampliación automáticamente.
- Actualización del array parametrizado en `engine/src/types/language.test.ts` con la lista de códigos ADR-005 §5.

### Fase 2 — Adapter contracts: `AdapterBase` y `AdapterCapabilities`

- Archivo: `engine/src/types/adapters.ts`.
- Declarar `export interface AdapterCapabilities {}` como interfaz vacía extensible, con JSDoc normativo que cite ADR-004 §2.5 (prohibición de contenido dinámico enumerando las categorías prohibidas listadas en ADR-004 §2.5; prohibición de declaration merging distribuido).
- Ampliar `AdapterBase<K>` con tres miembros opcionales:
  - `getSupportedLanguages?(): ReadonlySet<LangCode>`
  - `supports?(lang: LangCode): boolean`
  - `readonly capabilities?: AdapterCapabilities`
  - JSDoc de cada miembro cita ADR-004 §2.2, §2.3, §2.4, §2.7.
- **La implementación por defecto de `supports(lang)` se materializará conforme al contrato definido en ADR-004 §2.3, dentro del módulo Foundation correspondiente, sin exponer una segunda superficie pública ni duplicar lógica en consumers**. El patrón técnico concreto (helper, factory, mixin, o cualquier otra materialización TypeScript válida) se decide en el momento de la implementación dentro del margen que ADR-004 §2.3 delega explícitamente al plan.
- JSDoc explicita §2.7: consumers usan siempre `supports(lang)`; NUNCA se implementa `adapter.getSupportedLanguages().has(lang)` manualmente en código consumer.

### Fase 3 — Compatibilidad legacy (verificación)

- Verificación de que los adapters fake existentes en `engine/src/**/*.test.ts` siguen compilando sin cambios.
- Verificación de que ningún test previo asume un tamaño fijo de `LangCode`.
- Verificación tipada en TypeScript: los códigos previos siguen siendo `LangCode` válidos; los nuevos también.

### Fase 4 — Tests unitarios

- Nuevo archivo: `engine/src/types/adapters.test.ts`.
- Tests exactamente alineados con las reglas ADR-004 §2. Especificación normativa de los tests que traducen cada regla del contrato:
  1. **Legacy** — adapter sin métodos: válido en compilación TypeScript; consulta `supports(lang)` sobre él lanza error explícito por adapter no productivo (regla ADR-004 §2.4).
  2. **Producción sólo `getSupportedLanguages`** — la consulta `supports(lang)` retorna resultados correctos para un catálogo de prueba, derivados de `getSupportedLanguages()` (regla ADR-004 §2.3).
  3. **Producción con `supports` coherente** — la consulta `supports(lang)` respeta el método override cuando existe y retorna el resultado esperado (regla ADR-004 §2.3).
  4. **Producción con `supports` override optimizado + coherente** — equivalencia semántica verificada sobre el catálogo de prueba (regla ADR-004 §2.3).
  5. **Divergencia — adapter con `supports` incoherente**: la incoherencia es **detectable** mediante checker `assertAdapterCoherence(adapter, testLangs)` que compara la respuesta del método override con la derivada de `getSupportedLanguages()` (regla ADR-004 §2.3).
  6. **Descubrimiento** — consumer itera `getSupportedLanguages()` sin conocer catálogo global (regla ADR-004 §2.2).
  7. **Regla §2.7** — grep normativo verifica ausencia de patrón `getSupportedLanguages().has(` en tests y código consumer fuera del propio `adapters.ts` y `adapters.test.ts` (regla ADR-004 §2.7).
  8. **Socket vacío** — adapter con `capabilities: {}` no falla ni introspecta (regla ADR-004 §2.5).
  9. **`AdapterCapabilities` sin claves** — verificación por análisis estático de que no existen propiedades declaradas por ADR-004 (regla ADR-004 §2.5).
  10. **`AdapterCapabilities` sin estado dinámico** — verificación por análisis JSDoc + grep de que `adapters.ts` no importa tipos runtime en el contexto de `AdapterCapabilities` (regla ADR-004 §2.5).
- Actualización de `engine/src/types/language.test.ts`: ampliar test "recognizes every documented LangCode" con la lista ADR-005 §5. Añadir test que verifique `SUPPORTED_LANG_CODES.size` igual al número de códigos declarado por ADR-005 §5. Añadir test que verifique sincronía union ↔ Set.

### Fase 5 — Tests de integración (regresión)

- Ejecución de la suite completa: `npx vitest run`.
- **Criterios estables** (no numéricos):
  - Todos los tests existentes permanecen verdes (regresión cero respecto a la basal Fase 6).
  - Se añaden todos los tests nuevos definidos por el plan (Fase 4).
  - La cobertura no disminuye respecto a la basal Fase 6.
  - No hay regresiones detectables.

### Fase 6 — Auditoría

- Grep de prohibiciones (detalle en §Estrategia de auditoría).
- Verificación de tamaño de archivos (Code Standard §3: producción ≤ 300 líneas objetivo, ≤ 400 duro; tests preferidos ≤ 500).
- Verificación de cobertura: no reducción respecto a la basal Fase 6.
- Verificación de que ninguna ADR ha sido modificada durante la implementación.

### Fase 7 — Commit

- Commit único: `feat(engine): foundation evolution 2 — LangCode catalog + adapter capabilities contract`.
- Mensaje incluye referencia explícita a ADR-004 y ADR-005 congelados por sus tags.

### Fase 8 — Push

- `git push origin spabla-v2/foundation-evolution-2`.

### Fase 9 — Tag

- Tag anotado: `spabla-v2-foundation-evolution-2-<fecha>` sobre el commit único.
- Push del tag.
- Verificación remota.

---

## Archivos afectados

| Archivo | Cambio | Fase |
|---|---|---|
| `engine/src/types/language.ts` | Ampliar union `LangCode` + Set `SUPPORTED_LANG_CODES` con los códigos ADR-005 §5 | 1 |
| `engine/src/types/adapters.ts` | Declarar `AdapterCapabilities {}`; ampliar `AdapterBase` con `getSupportedLanguages?`, `supports?`, `capabilities?`; proveer la implementación por defecto de `supports(lang)` conforme a ADR-004 §2.3; JSDoc normativo citando ADR-004 §2.2–§2.7 y ADR-005 §1.1 (excepción BCP 47) | 2 |
| `engine/src/types/language.test.ts` | Ampliar array parametrizado a la lista ADR-005 §5; añadir test de tamaño; añadir test de sincronía union ↔ Set | 4 |
| `engine/src/types/adapters.test.ts` | Nuevo archivo con los tests contract-first especificados en Fase 4 | 4 |

Cambio acotado en tamaño, verificable por diff sobre los archivos declarados.

**Ningún otro archivo del engine se toca**. `engine/src/engine/`, `engine/src/pipeline/`, `engine/src/pipeline-orchestrator/`, `engine/src/core-api/`, `engine/src/adapter-registry/`, `engine/src/stt/`, `engine/src/translation/`, `engine/src/tts/`, `engine/src/messaging/`, `engine/src/state-machine/`, `engine/src/event-bus/`, `engine/src/session-manager/`, `engine/src/participant-manager/`, `engine/src/language-manager/`, `engine/src/conversation-manager/`: **cero cambios**.

---

## Matriz de impacto

| Componente | Impacto | Riesgo | Compatibilidad | Acciones necesarias |
|---|---|---|---|---|
| **Foundation types** (`language.ts`, `adapters.ts`) | Ampliación aditiva del tipo, del Set, del contrato base + nueva interfaz vacía + provisión del default `supports(lang)` conforme a ADR-004 §2.3 | Bajo — cambios acotados y verificables por tipo | 100 % backward | Fases 1 y 2 del plan |
| **Foundation tests** (`language.test.ts`, `adapters.test.ts`) | Ampliación aditiva de tests existentes + nuevo archivo de contract tests | Bajo | 100 % — tests previos intactos | Fase 4 |
| **Engine** (`engine/`) | Ninguno | Ninguno | 100 % | Ninguna |
| **Managers** (STT, Translation, TTS, Message, TurnPipeline, Session, Language, Conversation, Participant) | Ninguno | Ninguno | 100 % | Ninguna |
| **Pipeline** (`pipeline/`, `pipeline-orchestrator/`) | Ninguno | Ninguno | 100 % | Ninguna |
| **AdapterBase** (contrato) | Ampliación de la interfaz con miembros opcionales + provisión del default conforme a ADR-004 §2.3 | Bajo — 100 % backward por opcionalidad de tipos | 100 % | Fase 2 |
| **AdapterRegistry** | Ninguno (ADR-004 §2.6 excluye helper de resolución) | Ninguno | 100 % | Ninguna |
| **SDK** (Fase 9, no existe aún) | Ninguno directo | N/A | Nacerá con el contrato ampliado ya vigente | Ninguna en este plan |
| **API pública** (Fase 17, no existe aún) | Ninguno directo | N/A | Idem SDK | Ninguna en este plan |
| **Clientes** (Fases 11+, no existen aún) | Ninguno | N/A | N/A | Ninguna en este plan |
| **Suite de tests** | Ampliación por el conjunto de tests nuevos definidos por el plan | Bajo | 100 % — regresión cero verificada en Fase 5 | Fases 4 y 5 |

---

## Criterios de aceptación

- **Cero breaking changes**: verificado por Fase 3 (compatibilidad legacy) + Fase 5 (regresión completa).
- **Compatibilidad total con Fases 1–6**: verificado por diff limitado a los archivos declarados en §Archivos afectados sobre el tag base `spabla-v2-adr-005-language-catalog-2026-07-09`.
- **Engine sin modificaciones funcionales**: grep sobre `engine/src/engine/` = 0 diffs.
- **Pipeline sin modificaciones**: grep sobre `engine/src/pipeline/` y `engine/src/pipeline-orchestrator/` = 0 diffs.
- **SDK sin modificaciones**: no existe aún; verificado por ausencia de estructura `sdk/`.
- **AdapterBase evolucionado únicamente mediante cambios aditivos**: verificado por diff sobre `engine/src/types/adapters.ts` que muestra sólo inserciones (0 líneas eliminadas de la definición previa).
- **`LangCode` ampliado conforme a ADR-005**: la union contiene exactamente los códigos declarados por ADR-005 §5.
- **Todos los adapters legacy continúan compilando**: verificado por `tsc --noEmit` con 0 errores.
- **Todos los tests existentes permanecen verdes**.
- **Cobertura no inferior a la basal Fase 6** según medición vigente.
- **Tests nuevos específicos para Foundation Evolution 2 añadidos** conforme a la especificación de Fase 4.
- **Base tag correcto**: rama parte de `spabla-v2-adr-005-language-catalog-2026-07-09` @ `a9dfc02`.

---

## Estrategia de migración

- **Migración completamente aditiva**: verificado por §Archivos afectados (sólo inserciones sobre tipos existentes; una nueva interfaz vacía; un nuevo archivo de test).
- **Ausencia de cambios destructivos**: no se elimina ningún código; no se modifica semántica de ningún tipo existente; no se rebautiza ninguna función.
- **Compatibilidad automática para adapters legacy**: garantizada por la opcionalidad de los nuevos miembros de `AdapterBase` (ADR-004 §2.4). Los adapters fake actuales de tests no requieren cambio.
- **Transición progresiva hacia adapters reales de Fase 7**: los adapters reales que se introduzcan en Fase 7 declararán `getSupportedLanguages()` desde el momento de su registro. La transición es "adapter por adapter" sin big-bang.

---

## Estrategia de auditoría

**Comprobaciones documentales**:
- Verificación de que este plan no introduce ninguna decisión no autorizada por ADR-003, ADR-004 ni ADR-005.
- Verificación de que las citas a ADRs son por referencia y no duplican contenido normativo.

**Comprobaciones de arquitectura**:
- `grep -rn "declare module" engine/src/**/*.ts` con foco en `AdapterCapabilities`: **debe ser 0 fuera de `types/adapters.ts`** (regla ADR-004 §2.5).
- Verificación de que `types/adapters.ts` no importa tipos runtime en el contexto de `AdapterCapabilities` (regla ADR-004 §2.5 sobre estado dinámico).
- Verificación de que los códigos de `LangCode` son exactamente los declarados por ADR-005 §5.
- Verificación de que ni Engine ni Pipeline importan símbolos nuevos de Foundation Evolution 2.

**Comprobaciones de compatibilidad**:
- `npx tsc --noEmit` con 0 errores.
- Todos los tests de la basal Fase 6 verdes tras el cambio.
- Grep `getSupportedLanguages().has(` fuera de `types/adapters.ts` y `types/adapters.test.ts`: **debe ser 0** (regla ADR-004 §2.7).

**Comprobaciones de cobertura**:
- Cobertura no inferior a la basal Fase 6 según medición vigente.
- Cobertura de `engine/src/types/` mantenida o mejorada.

**Comprobaciones de regresión**:
- Verificación de que no se ha modificado ningún archivo fuera de los declarados en §Archivos afectados.
- `git diff --name-only spabla-v2-adr-005-language-catalog-2026-07-09..HEAD` debe listar exclusivamente esos archivos.

---

## Estrategia de rollback

**Escenario 1**: la auditoría detecta un incumplimiento **antes del commit único** (Fase 7).
- Descartar cambios locales sobre los archivos declarados en §Archivos afectados; eliminar el archivo nuevo de tests.
- Rama vuelve al estado del tag base `spabla-v2-adr-005-language-catalog-2026-07-09`.

**Escenario 2**: la auditoría detecta un incumplimiento **entre commit y push** (entre Fase 7 y Fase 8).
- `git reset --hard HEAD~1` sobre la rama local (destructivo autorizado por ser rollback controlado antes de publicar).
- Rama vuelve al estado previo al commit único.
- Se corrige y se re-ejecutan Fases 6 y 7.

**Escenario 3**: la auditoría detecta un incumplimiento **después del push y del tag** (después de Fase 9).
- Publicar `git revert <commit>` como nuevo commit compensatorio.
- Publicar tag marca `spabla-v2-foundation-evolution-2-reverted-<fecha>` sobre el revert.
- Push del revert y del tag marca.
- **No** se elimina el tag original (regla de historia inmutable).
- Se abre un nuevo plan de retry con lecciones aprendidas.

**En todos los escenarios**: el commit único de este plan es la única unidad de reversión. La aditividad estricta garantiza que el rollback es limpio.

---

## Riesgos operativos

**R1 — El patrón técnico elegido para materializar el default de `supports(lang)` es una decisión de implementación**: distintas materializaciones (helper, factory, mixin, otras) son compatibles con ADR-004 §2.3. El riesgo es elegir en el momento de la implementación una que resulte menos ergonómica que otra. **Mitigación**: la elección se justifica en JSDoc y se documenta como aplicación del contrato; cualquier iteración futura sobre el patrón concreto no requiere modificación de ADR ni de este plan mientras respete el contrato normativo.

**R2 — La ampliación del catálogo aumenta el tamaño de la union `LangCode`**: potencial impacto marginal en tiempos de type-checking en editores. **Mitigación**: monitorable durante Fases 4–5; sin acción preventiva prevista.

**R3 — Un consumer futuro podría implementar directamente `adapter.getSupportedLanguages().has(lang)`**: violaría ADR-004 §2.7. **Mitigación**: grep normativo en la auditoría de este plan verifica ausencia del patrón en el estado actual; la regla se enforza indefinidamente en los planes de Fase 7 y siguientes.

**R4 — Adapter fake de un test futuro que implemente `supports?` sin `getSupportedLanguages?`**: es un anti-patrón detectado sólo por revisión de PR. **Mitigación**: los tests especificados en Fase 4 (legacy y divergencia) cubren la mayoría de los casos; casos edge quedan a revisión.

**R5 — Excepción BCP 47 de ADR-005 §1.1 no ejercitada por este plan**: el plan implementa el catálogo inicial que no contiene códigos BCP 47. Si en el futuro se introduce uno, la union `LangCode` deberá acoger strings con guiones. **Mitigación**: no aplica a este plan; el manejo de BCP 47 llegará en una ADR-005-N futura + Foundation Evolution N aditiva.

**R6 — Divergencia entre `LangCode` y `SUPPORTED_LANG_CODES`**: si al implementar Fase 1 se omite un código en uno de los dos, la invariante de sincronía se rompe. **Mitigación**: el test de sincronía especificado en Fase 4 lo detecta explícitamente.

---

## Bloqueos detectados

**Ninguno**. Análisis:

- Todo el trabajo deriva exclusivamente de ADR-004 y ADR-005 congeladas.
- No aparece durante la redacción del plan ninguna necesidad de tomar una decisión arquitectónica no prevista.
- ADR-004 §2.3 delega explícitamente al plan la elección del patrón TypeScript para materializar el default de `supports(lang)`: "Foundation NO impone el patrón concreto de TypeScript (abstract class, helper function, factory, mixin) por el cual `supports(lang)` se materializa por defecto. Ese detalle pertenece al plan de Foundation Evolution 2, siempre respetando el contrato normativo de este ADR". Este plan no fija el patrón concreto; lo delega al momento de la implementación bajo las mismas condiciones normativas.
- No se detecta ninguna otra ambigüedad que requiera modificación de ADRs previas.

---

## Recomendación única

Congelar este plan tras auditoría independiente y, con esa aprobación, ejecutar la implementación siguiendo la Secuencia obligatoria (Fases 1–9). Sólo tras el cierre exitoso de Foundation Evolution 2 (tag `spabla-v2-foundation-evolution-2-<fecha>` publicado) se autoriza abrir el plan de Fase 7.
