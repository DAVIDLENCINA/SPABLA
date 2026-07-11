# PLAN OFICIAL DE FASE 7 — SPABLA V2

**Tipo**: Plan de fase (implementación).
**Autor**: Jefe de Proyecto.
**Estado**: congelado.
**Fecha**: 2026-07-11.
**Base**: `spabla-v2-adr-006-runtime-adapter-resolution-2026-07-10` @ `3b59908`.
**Depende de**: ADR-003, ADR-004, ADR-005, ADR-006, plan Foundation Evolution 2 (congelado en `spabla-v2-foundation-evolution-2-2026-07-09`).

---

## §1. Propósito

Introducir el **dominio de adapters reales** en el engine V2, materializando la **infraestructura común** que ADR-006 §1 asigna a `engine/src/adapters/`, **sin implementar adapters concretos por proveedor** (bloqueados por B1 de ADR-006). La fase cierra el hueco entre el contrato congelado por Foundation Evolution 2 y los adapters concretos que fases posteriores introducirán.

## §2. Alcance

- Creación del directorio raíz del dominio de adapters bajo `engine/src/adapters/`.
- Materialización del **mecanismo interno no público** de derivación del default `supports(lang)` (ADR-006 §2) dentro del margen técnico autorizado por dicho ADR.
- **Documentación interna** del dominio de adapters con las reglas normativas derivadas de ADR-006 §2/§3/§4.
- **Infraestructura interna** reutilizable para la verificación del contrato (pruebas de equivalencia semántica entre `supports(lang)` y `getSupportedLanguages().has(lang)`, ADR-006 §5).
- Validación integral del contrato interno mediante escenarios sintéticos que ejerciten las opciones (a), (b), (c) autorizadas por ADR-006 §2.
- Integración del nuevo dominio en el sistema de build y de tests del engine sin ampliar la superficie pública.

## §3. Exclusiones

- Elección o integración de proveedores concretos (B1 de ADR-006).
- Adapters concretos por proveedor para STT, MT, TTS, WebRTC, Signaling o Supabase.
- Nuevos `AdapterKind` (requiere ADR aditiva a ADR-004 §2.1).
- Modificación de Foundation types (`engine/src/types/`).
- Modificación de Managers.
- Modificación de `AdapterRegistry` (ADR-004 §2.6).
- Modificación de Engine, Pipeline, PipelineOrchestrator, Core API.
- Modificación de código V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- SDK (Fase 9).
- Guards en Managers antes de dispatch (ADR-004 §5.2, decisión abierta).
- Demo end-to-end o integración con backends reales.
- Cualquier ampliación de la superficie pública del engine.

## §4. Prerequisitos

- ADR-003, ADR-004, ADR-005, ADR-006 congelados. ✅
- Plan Foundation Evolution 2 congelado. ✅
- Foundation types congelados. ✅
- Suite basal (526 tests) verde. ✅
- Rama de trabajo sincronizada con `origin` y working tree limpio. ✅

## §5. Bloqueos

- **B1 (residual de ADR-006)** — proveedores concretos: **NO bloquea** esta fase. Bloquea la fase posterior de adapters concretos.
- **B2 (residual de ADR-006)** — guards en Managers (ADR-004 §5.2): **NO bloquea** esta fase.
- Cero bloqueos activos.

## §6. Entregables

1. Directorio raíz del dominio de adapters en el engine.
2. **Infraestructura interna del dominio** que materializa el mecanismo no público de derivación del default `supports(lang)`, con las pruebas necesarias para verificar su comportamiento.
3. **Documentación interna** del dominio con las reglas normativas de ADR-006 §2/§3/§4 correctamente citadas.
4. **Infraestructura interna** reutilizable de verificación del contrato (pruebas de equivalencia semántica).
5. Validación integral del contrato interno mediante escenarios sintéticos que ejercitan las opciones (a), (b), (c) de ADR-006 §2.
6. Suite basal (526 tests) intacta y verde tras la fase.
7. Suite del nuevo dominio verde.
8. Cero exports nuevos desde el barrel público del engine.
9. Cero modificaciones en archivos declarados fuera de alcance.
10. Documento de cierre de fase siguiendo el Release Standard.

## §7. Estrategia de implementación incremental

Hitos funcionales secuenciales. Cada hito se cierra con auditoría → corrección expresa si aplica → auditoría post-corrección → autorización explícita de avance. Los hitos describen exclusivamente qué queda entregado, no cómo se materializa.

**Hito 7.1 — Existencia del dominio de adapters**
- Objetivo funcional: el dominio de adapters queda reconocido como espacio arquitectónico del engine.
- Resultado esperado: el nuevo dominio es visible dentro del árbol del engine y participa del sistema de build y de tests sin degradar la basal ni ampliar la superficie pública.
- Criterio de finalización: auditoría APTO; suite basal verde; superficie pública sin cambios.

**Hito 7.2 — Contrato interno del dominio estabilizado**
- Objetivo funcional: las reglas normativas internas que gobiernan cómo un adapter real elige entre las opciones (a), (b), (c) de ADR-006 §2 quedan explicitadas y accesibles internamente.
- Resultado esperado: cualquier adapter futuro puede consultar el contrato interno del dominio, con las ADRs aplicables correctamente referenciadas.
- Criterio de finalización: auditoría APTO; verificación de coherencia con ADR-003, ADR-004, ADR-005 y ADR-006; cero decisiones arquitectónicas implícitas.

**Hito 7.3 — Disponibilidad de la semántica del default `supports(lang)`**
- Objetivo funcional: la semántica del default `supports(lang)` queda disponible dentro del dominio de adapters, sin ampliar la superficie pública de Foundation ni del engine.
- Resultado esperado: cualquier adapter real del dominio puede apoyarse en la semántica prevista por ADR-004 §2.3 y ADR-006 §2 sin necesidad de duplicarla.
- Criterio de finalización: auditoría APTO; disponibilidad demostrada mediante pruebas dedicadas; ningún símbolo del mecanismo interno aparece en el barrel público.

**Hito 7.4 — Coherencia del contrato verificable de forma reutilizable**
- Objetivo funcional: la coherencia entre `supports(lang)` y `getSupportedLanguages().has(lang)` (ADR-006 §5) queda verificable mediante infraestructura reutilizable dentro del dominio.
- Resultado esperado: cualquier adapter futuro puede someter su implementación a pruebas de equivalencia semántica sin duplicar lógica de verificación.
- Criterio de finalización: auditoría APTO; verificabilidad demostrada sobre escenarios controlados dentro del propio dominio.

**Hito 7.5 — Viabilidad demostrada de las opciones (a), (b) y (c)**
- Objetivo funcional: las tres opciones autorizadas por ADR-006 §2 quedan demostradas como viables para un adapter real, sin proveedor concreto.
- Resultado esperado: existe evidencia de que un adapter real puede adoptar (a), (b) o (c) sin violar el contrato interno ni ampliar la superficie pública.
- Criterio de finalización: auditoría APTO; evidencia producida sobre escenarios sintéticos del propio dominio.

**Hito 7.6 — Cierre sin regresión y documentación completa**
- Objetivo funcional: la fase se cierra sin regresión observable y con la documentación de cierre disponible.
- Resultado esperado: suite basal y suite del nuevo dominio verdes; documento de cierre completo bajo `docs/phases/`; alcance del delta coherente con el declarado en §2.
- Criterio de finalización: auditoría global APTO PARA CONGELACIÓN; autorización expresa del Jefe de Proyecto para commit/push/tag.

## §8. Estrategia de auditoría

Cada sub-fase se audita contra:
- Coherencia con ADR-003, ADR-004, ADR-005, ADR-006.
- Ausencia de nuevas decisiones arquitectónicas implícitas.
- Ausencia de contradicciones con Foundation Evolution 2.
- Cero nuevos exports desde la superficie pública del engine.
- Cero modificaciones en archivos fuera de alcance.
- Cero introducción de proveedores concretos.
- Preservación de compatibilidad hacia atrás.
- Cumplimiento del Code Standard §3 (máx. 300 líneas por archivo de producción).

Auditoría global final adicional: coherencia del delta total con el alcance declarado y cumplimiento del Release Standard.

Cada auditoría emite veredicto APTO / NO APTO; sólo APTO permite avanzar.

## §9. Estrategia de regresión

- Suite basal (526 tests) DEBE permanecer verde en cada sub-fase.
- Suite del nuevo dominio se ejecuta en cada sub-fase y DEBE ser verde.
- Comportamiento observable de Managers, Engine, Pipeline y Core API: cero cambios permitidos.
- Superficie pública del engine: cero cambios permitidos, verificado por diff.

## §10. Criterios de aceptación

- Entregables §6 producidos y auditados APTO.
- Suite basal + suite del nuevo dominio: 100% verde.
- Cero regresiones observables.
- Cero modificaciones a archivos fuera de alcance.
- Cero exports nuevos en el barrel público.
- Auditoría global final APTO.
- Documento de cierre completo.

## §11. Criterios de salida

Fase 7 se considera cerrada cuando:
- Auditoría global APTO PARA CONGELACIÓN.
- Serie ordenada de commits documental y de implementación.
- Tag anotado `spabla-v2-fase-7-<fecha>` publicado en `origin`.
- Verificación remota confirmada.
- Documento de cierre bajo `docs/phases/`.
- Autorización expresa del Jefe de Proyecto.

Post-cierre habilita la planificación de:
- Fase posterior de adapters concretos por proveedor (condicionada a resolución de B1).
- Fase 8 y Fase 9 según hoja de ruta.

## §12. Estrategia de rollback

- **Nivel A — sub-fase individual**: revertir working tree si aún no hay commit; `git reset --hard HEAD~N` con autorización expresa si ya hay commit local no pusheado.
- **Nivel B — fase completa antes de push/tag**: `git reset --hard <tag base>` con autorización expresa.
- **Nivel C — fase completa después de push/tag**: rollback documental vía commit de reverso explícito. Nunca `force push`. Nunca eliminar tag remoto congelado. Requiere ADR-007 (Rollback de Fase 7) si aplica.

Base de rollback: `spabla-v2-adr-006-runtime-adapter-resolution-2026-07-10` @ `3b59908`.

## §13. Riesgos

**Técnicos**:
- **RT1** — Fuga del mecanismo interno al barrel público. **Mitigación**: verificación explícita en cada auditoría.
- **RT2** — Fragmentación del contrato interno si futuros adapters no siguen la convención. **Mitigación**: documentación interna normativa + pruebas del contrato.
- **RT3** — Divergencia entre la firma del mecanismo interno y el contrato ADR-004 §2.3. **Mitigación**: pruebas de equivalencia semántica sobre catálogo probe.
- **RT4** — Cambios en el sistema de build que rompan la suite basal. **Mitigación**: snapshot de configuración antes y después; suite basal ejecutada en cada sub-fase.
- **RT5** — Inflación de la superficie interna del dominio por decisiones no autorizadas. **Mitigación**: cada sub-fase revisa cumplimiento con "una responsabilidad por módulo" y Code Standard §3.

**Operativos**:
- **RO1** — Interpretación divergente entre "infraestructura común" y "adapter concreto". **Mitigación**: definición explícita en §2 y §3.
- **RO2** — Presión externa para adelantar B1 (proveedores). **Mitigación**: B1 se aborda en fase posterior; este plan la excluye taxativamente.
- **RO3** — Auditoría sub-fase podría no detectar regresiones sutiles. **Mitigación**: suite basal completa en cada sub-fase.
- **RO4** — Documento de cierre podría omitir cláusulas del Release Standard. **Mitigación**: checklist explícito en criterio de salida.
- **RO5** — Sub-fases pueden multiplicarse por corrección repetida. **Mitigación**: sub-fase que requiera más de dos correcciones se re-evalúa a nivel de plan.

---

## Seguridad y Producción

Fase 7 **no introduce cambios** en:

- Autenticación.
- Autorización.
- Persistencia.
- RLS y aislamiento de datos.
- APIs públicas.
- Despliegue.
- CI/CD.
- Observabilidad.
- Métricas.
- Alertas.

Cualquier implementación futura que aborde alguno de estos aspectos deberá cumplir los estándares arquitectónicos vigentes y estar respaldada por la ADR correspondiente. **Este plan no define políticas de DevOps ni de Security.**

---

## Lista de archivos previsiblemente afectados

**Nuevos** (introducidos por Fase 7):
- Directorio raíz nuevo bajo `engine/src/adapters/`.
- Módulos internos del dominio necesarios para la infraestructura del mecanismo no público de materialización, sin exposición en la superficie pública.
- Módulos internos del dominio necesarios para la infraestructura de verificación del contrato.
- Documentación interna del dominio cuando proceda.
- `docs/phases/SPABLA_V2_FASE_7_PLAN.md` — este plan congelado.
- `docs/phases/SPABLA_V2_FASE_7_CIERRE.md` — documento de cierre.

**Posibles modificaciones menores** (sólo si no están ya cubiertas por los globs existentes):
- Configuración de build del engine.
- Configuración de la suite de tests del engine.

**Sin cambios** (fuera de alcance, prohibido tocarlos):
- `engine/src/types/*` — Foundation congelada.
- `engine/src/adapter-registry/*` — ADR-004 §2.6.
- Todos los Managers.
- Engine, Pipeline, PipelineOrchestrator, Core API.
- `engine/src/index.ts` — cero nuevos exports.
- V1 (`app/`, `server/`, `lib/`, `public/`, `supabase/`).
- ADRs y planes congelados previos.

---

## Veredicto de congelación

**APTO PARA CONGELACIÓN.**

Justificación:
- §7 queda transformado en hitos funcionales estrictos con tres campos cada uno; ningún hito describe implementación.
- Deriva exclusivamente de ADR-003, ADR-004, ADR-005, ADR-006 y Foundation Evolution 2 congelada.
- No decide tecnologías concretas.
- No define políticas de DevOps ni de Security.
- No introduce proveedores concretos.
- No modifica Foundation, Engine, Managers, AdapterRegistry ni superficie pública.
- Cumple todas las prohibiciones del alcance estricto.
- Estrategia auditable y con regresión completa por hito.
- Rollback definido en tres niveles con salvaguarda de tag remoto congelado.
- Bloqueos residuales de ADR-006 correctamente delimitados y no bloqueantes de esta fase.
