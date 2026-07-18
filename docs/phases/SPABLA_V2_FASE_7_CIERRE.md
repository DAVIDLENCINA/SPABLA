# Cierre oficial — SPABLA V2 · Fase 7 · Adapters Domain

**Tipo**: Documento de cierre de fase.
**Estado**: APROBADO Y CERRADO — V1.0 (aprobación expresa del Jefe de Proyecto el 2026-07-18 tras auditoría técnica global APTO PARA CONGELACIÓN).
**Versión**: V1.0.
**Fecha**: 2026-07-18.

## §1. Identificación

- Rama: `spabla-v2/fase-7-adapters-domain`.
- HEAD auditado: `615d5c00dccda98938cd1ce4b9e64996892eaa78`.
- Base de Fase 7: `9f08307` (commit `docs(plan): add official Phase 7 implementation plan`).
- Base tag: `spabla-v2-phase-7-plan-2026-07-11`.
- Rango de implementación auditado: `9f08307..615d5c0`.

## §2. Definición literal del Hito 7.6

Plan Oficial de Fase 7 (`docs/phases/SPABLA_V2_FASE_7_PLAN.md`) §7 L96–L99:

- **Objetivo funcional**: la fase se cierra sin regresión observable y con la documentación de cierre disponible.
- **Resultado esperado**: suite basal y suite del nuevo dominio verdes; documento de cierre completo bajo `docs/phases/`; alcance del delta coherente con el declarado en §2 del propio Plan.
- **Criterio de finalización**: auditoría global APTO PARA CONGELACIÓN; autorización expresa del Jefe de Proyecto para commit/push/tag.

## §3. Alcance completado

| Hito | Objetivo | Commit de cierre | Resultado verificable | Tests |
|---|---|---|---|---|
| 7.1 | Establecer el dominio `engine/src/adapters/` sin ampliar superficie pública | `5c66392` | Directorio con marker + JSDoc de referencia | +3 (`index.test.ts`) |
| 7.2 | Consolidar contrato interno normativo del dominio | `55f050f` | `CONTRACT.md` + tests mecánicos + JSDoc extendido en `index.ts` | +15 (`contract.test.ts`) |
| 7.3 | Materializar la función pura del default `supports(lang)` con precedencia F1 | `0c17872` | `resolve-language-support.ts` (64 líneas, `@internal`) | +14 (`resolve-language-support.test.ts`) |
| 7.4 | Infraestructura reutilizable de verificación de conformidad | `3296c9b` | `conformance.ts` (279 líneas, 11 exports internos) | +17 (`conformance.test.ts`) |
| 7.5 | Viabilidad demostrada de las opciones (a), (b), (c) de ADR-006 §2 | `615d5c0` | 3 fakes sintéticos ejercitados por `conformance.ts` | +5 (`options-viability.test.ts`) |
| 7.6 | Cierre sin regresión + documentación completa | (este commit) | Ver §12 y §14 | 0 |

Planes de hito congelados/aprobados dentro del rango: Hito 7.2 V1.3 (`7e896c5`), Hito 7.3 V1.1 (`252e712`), Hito 7.4 V1.1 (`eddc5eb`), Hito 7.5 V1.0 aprobado (`21ccf60`). ADR-007 V1.1 congelada dentro del rango en `6f49b92`.

## §4. Decisiones vigentes

- **ADR-003-STRATEGIC-VISION** — contrato producto (previa a Fase 7).
- **ADR-004-FOUNDATION-EVOLUTION-2** — contrato Foundation, opcionalidad de `supports(lang)`, ausencia de helper en `AdapterRegistry`, prohibición del patrón `getSupportedLanguages().has(` para consumers, `AdapterCapabilities` vacía y extensible sólo por ADR.
- **ADR-005-LANGUAGE-CATALOG** — 55 códigos ISO 639-1 canónicos, evolución aditiva por ADR.
- **ADR-006-RUNTIME-ADAPTER-RESOLUTION** — ubicación de la materialización en `engine/src/adapters/`, tres opciones (a)/(b)/(c) para adapters reales, superficie interna, prohibición dura de re-export desde barrel público, equivalencia semántica exigida.
- **ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION V1.1** (creada dentro de Fase 7, `6f49b92`) — fuentes válidas, precedencia normativa `supports → derivación F1 desde gSL → false fail-closed`, autorización del dominio interno como materializador, formas canónicas F1/F2/F3.
- **`engine/src/adapters/CONTRACT.md`** — contrato interno normativo del dominio, referenciado por `engine/src/adapters/index.ts` y verificado por `contract.test.ts`.

## §5. Delta global

- **12 commits** en el rango `9f08307..615d5c0`.
- **14 archivos nuevos** (todos añadidos, cero modificados, cero eliminados).
- **3890 inserciones**, **0 deletions**.
- `git diff --check 9f08307..HEAD`: exit 0.

Clasificación resumida:

- Código productivo interno (3): `index.ts` (45), `resolve-language-support.ts` (64), `conformance.ts` (279).
- Tests dedicados (5): `index.test.ts` (30), `contract.test.ts` (121), `resolve-language-support.test.ts` (173), `conformance.test.ts` (414), `options-viability.test.ts` (221).
- Contrato interno (1): `CONTRACT.md` (214).
- ADR nueva (1): `ADR-007-ADAPTER-LANGUAGE-SUPPORT-RESOLUTION.md` (342).
- Planes de hito (4): Hito 7.2 (447), Hito 7.3 (586), Hito 7.4 (822), Hito 7.5 (132).

El Plan Oficial de Fase 7 (`SPABLA_V2_FASE_7_PLAN.md`) reside en la base `9f08307` y **no** forma parte del rango `BASE..HEAD` posterior.

## §6. Delta de tests

- Basal normativa declarada por Plan Fase 7 §9: **526 tests**.
- Total actual: **580 tests verdes** en **22 archivos**.
- Delta: **+54 tests exactos**.
- Desglose: Hito 7.1 +3, Hito 7.2 +15, Hito 7.3 +14, Hito 7.4 +17, Hito 7.5 +5 (3+15+14+17+5=54).
- Dominio adapters: **54/54 verde** (5 archivos).
- Foundation `types/adapters.test.ts`: **11/11 verde** sin modificación.

## §7. Validaciones globales

- `npx tsc --noEmit` desde `engine/`: **exit 0** en modo strict con `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- Suite completa: **580/580** en 22 archivos.
- Dominio adapters: 54/54 (contract 15, index 3, resolve 14, conformance 17, options-viability 5).
- Salvaguarda Foundation §2.7 (`types/adapters.test.ts`): 11/11 sin modificar la lista blanca original.
- `git diff --check 9f08307..HEAD`: exit 0.
- Code Standard §3 (≤300 líneas por archivo de producción): cumplido (max=279 en `conformance.ts`).
- Superficie pública del engine: cero cambio (`git diff 9f08307..HEAD -- engine/src/index.ts` = vacío).
- Cero proveedor concreto en `engine/src/adapters/`.
- Cero regresiones.

## §8. Intangibilidad y compatibilidad

- **Foundation intacta durante Fase 7**: `git diff 9f08307..HEAD -- engine/src/types/` = vacío. `AdapterBase`, `AdapterKind`, `LangCode`, `isLangCode`, `AdapterCapabilities`, salvaguarda §2.7: sin modificación.
- **Superficie pública del engine intacta**: `engine/src/index.ts` sin cambios. Los símbolos re-exportados desde `./types/adapters.js` son exclusivamente los preexistentes a Fase 7.
- **Managers, `AdapterRegistry`, Engine, Pipeline, `PipelineOrchestrator`, Core API, `state-machine`, `event-bus`, V1** (`app/`, `server/`, `lib/`, `public/`, `supabase/`): cero cambios.
- **Configuración de build/test**: `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts` sin cambios.
- **`engine/src/adapters/index.ts`**: creado en Hito 7.1 (`5c66392`) con cuerpo `export {};`; modificado autorizadamente en Hito 7.2 (`55f050f`) para extender JSDoc citando CONTRACT.md; el cuerpo permanece `export {};`. Cero export nuevo desde el dominio.
- **ADR-007 añadida autorizadamente**: coherente con la bloque residual B1 previsto por ADR-006 y con la separación dominio interno / superficie pública.

## §9. Desviaciones

- Cero desviaciones materiales respecto al Plan Oficial de Fase 7.
- Modificaciones internas autorizadas: JSDoc de `index.ts` en Hito 7.2.
- Cero decisión arquitectónica implícita. Ninguna ADR previa fue modificada. ADR-007 formaliza sin ampliar superficie.

## §10. Riesgos y deuda residual

- **ADR-006 §Bloqueos residuales B1** — "Decisión de proveedores primarios por kind (STT, MT, TTS)". Bloquea futuros hitos de adapters concretos por proveedor. **NO bloquea el cierre de Fase 7**: la infraestructura común queda establecida sin depender de esa decisión.
- **ADR-006 §Bloqueos residuales B2** — "Decisión abierta ADR-004 §5.2 (guards en Managers antes de dispatch)". Ajena al dominio adapters. **NO bloquea el cierre**.

Cero bloqueo técnico ni normativo derivado de Fase 7 misma.

## §11. Compatibilidad estratégica

Fase 7 preserva sin implementar todavía las siguientes capacidades futuras (ADR-003):

- Idioma personal por participante (`LangCode` sigue siendo fuente de verdad; `resolveLanguageSupport` opera por idioma).
- Chat, voz y vídeo (cero cambio en Managers).
- Grupos multilingües (`AdapterKind` admite futuros kinds sin refactor).
- Independencia de proveedores (reforzada: dominio adapters formaliza el contrato con cero proveedor concreto).
- Multidispositivo (cero cambio en superficie pública y en V1).
- Integración futura con redes y plataformas (dominio interno no expuesto).
- Evolución mediante contratos estables (Foundation intacta; ADR-006/007 fijan el patrón sin ampliar superficie).

Ninguna de estas capacidades queda declarada como implementada por Fase 7.

## §12. Estado Git y publicación

- HEAD auditado: `615d5c00dccda98938cd1ce4b9e64996892eaa78`.
- Working tree inicial: limpio.
- Commits locales pendientes de publicación: 4 previos al cierre (`eddc5eb`, `3296c9b`, `21ccf60`, `615d5c0`) más el commit documental de este cierre (aún no creado).
- Tag aprobado: `spabla-v2-phase-7-adapters-domain-2026-07-18` (Release Standard §5).
- Push de rama y tag: pendientes de autorización expresa del Jefe de Proyecto.

## §13. Veredicto

**FASE 7 APROBADA, CERRADA Y APTA PARA CONGELACIÓN.**

- La auditoría técnica global (`docs/audit_reports/AUDIT_2026-07-18_phase-7-adapters-domain.md` §I) emitió **APTO PARA CONGELACIÓN** el 2026-07-18.
- El Jefe de Proyecto aprobó expresamente ambos documentos (cierre + informe de auditoría) el 2026-07-18.
- La publicación remota (`git push origin`) y la creación/publicación del tag `spabla-v2-phase-7-adapters-domain-2026-07-18` permanecen **pendientes de una autorización expresa separada** del Jefe de Proyecto. No se afirma que push ni tag se hayan ejecutado.

## §14. Cierre Git

- El commit documental inicial del cierre de Fase 7 es `099e85e21334ca583c99e3a52dbe46206315653f` (`docs(phase): close Fase 7 adapters domain V1.0`), que incorporó este documento y el informe de auditoría en su forma aprobada.
- Esta corrección quirúrgica de consistencia se registrará en un commit documental posterior aislado, sin reescritura ni amend de `099e85e`.
- El tag `spabla-v2-phase-7-adapters-domain-2026-07-18` (Release Standard §5) se creará como tag anotado sobre el nuevo HEAD correctivo, no sobre `099e85e`, para que apunte a la versión coherente del documento.
- Los hashes definitivos del commit correctivo y del tag anotado se consignarán en el reporte operativo final entregado al Jefe de Proyecto y en el mensaje de anotación del propio tag, sin insertar en este documento placeholders ni SHAs todavía inexistentes.
- La publicación remota (`git push origin`) y la creación/publicación del tag continúan pendientes de una autorización expresa separada del Jefe de Proyecto.

Post-cierre habilita la planificación de fases posteriores (adapters concretos por proveedor, condicionados a resolución de ADR-006 B1; Fase 8 y Fase 9 según hoja de ruta).
