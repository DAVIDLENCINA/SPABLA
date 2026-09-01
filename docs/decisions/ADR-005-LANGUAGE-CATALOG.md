# ADR-005-LANGUAGE-CATALOG — Catálogo Oficial de Idiomas de SPABLA V2

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: aceptada.
**Fecha**: 2026-07-09.
**Base**: `spabla-v2-adr-004-foundation-evolution-2-2026-07-09` @ `a363edd`.
**Depende de**: `ADR-003-STRATEGIC-VISION`, `ADR-004-FOUNDATION-EVOLUTION-2`.

Este ADR define la primera versión oficial del catálogo de idiomas de SPABLA V2 y las reglas permanentes de su evolución. Su alcance es exclusivamente arquitectónico y de gobernanza documental. La implementación pertenece al futuro **Plan de Foundation Evolution 2**.

---

## Preámbulo normativo permanente

- **El valor de esta ADR reside en las reglas de evolución del catálogo, no en el número de idiomas incluidos en su versión inicial**.
- El catálogo publicado por esta ADR constituye únicamente el **punto de partida** del modelo de gobernanza definido en §§1–4.
- Toda futura ampliación seguirá la gobernanza definida en §§1–4 sin reinterpretar los criterios.

---

## Contexto

ADR-004 congeló el contrato arquitectónico de capacidades del Adapter y delegó en este ADR la definición del catálogo y las reglas permanentes de su evolución. La primera versión oficial acoge un catálogo amplio suficiente para abrir Fase 7; el catálogo es **evolutivo por diseño** y no queda vinculado a su tamaño inicial.

Este ADR responde exclusivamente a: qué criterios permanentes gobiernan la incorporación de idiomas, cuándo se requiere una variante regional, cómo se preserva la estabilidad del catálogo, quién decide qué se añade y bajo qué proceso, y cuál es la primera versión oficial del catálogo que abre Fase 7.

Este ADR **no describe implementación**, **no cita proveedores**, **no modifica ninguna ADR existente**.

---

## Decisión

### §1. Criterios permanentes de incorporación

Un idioma se incorpora al catálogo oficial cuando tiene **relevancia suficiente considerando conjuntamente** las siguientes dimensiones. **Ningún criterio individual es suficiente por sí solo**; la incorporación exige valoración agregada.

**§1.1 — Estabilidad del identificador**
- SPABLA utiliza **preferentemente** códigos ISO 639-1 (2 letras) con estabilidad consolidada.
- Cuando ISO 639-1 resulte insuficiente para representar correctamente un idioma o una variante estratégica, puede utilizarse otro estándar internacional ampliamente reconocido (por ejemplo BCP 47), únicamente mediante ADR específica.
- Toda excepción preserva la compatibilidad del contrato definido por ADR-004.
- Se excluyen códigos deprecados por su organismo emisor o en revisión activa.

**§1.2 — Número de hablantes**
- Presencia significativa medida por hablantes nativos o por hablantes de uso funcional.
- No se fija umbral numérico rígido; la valoración se combina con las demás dimensiones.

**§1.3 — Importancia económica**
- Presencia demostrable del idioma en flujos comerciales internacionales, comunicaciones empresariales o intercambio digital.

**§1.4 — Relevancia institucional**
- Estatus oficial en organismos internacionales, uniones políticas o comunidades autónomas reconocidas.

**§1.5 — Demanda empresarial**
- Demanda observable para servicios de traducción real-time en el idioma dentro del mercado B2B.

**§1.6 — Presencia internacional**
- Uso del idioma en más de un país, en comunicaciones transfronterizas, en diáspora significativa o en instituciones internacionales.

**§1.7 — Valor estratégico para la expansión global de SPABLA**
- El idioma refuerza la cobertura de SPABLA en al menos una dimensión estratégica: mercado emergente, comunidad autónoma histórica, corredor migratorio, corredor comercial, zona de crecimiento digital.

**§1.8 — Priorización de disponibilidad multi-proveedor**
- SPABLA **priorizará** la incorporación de idiomas con soporte estable en múltiples proveedores independientes de STT, MT y TTS. La verificación no fija proveedor concreto; sólo constata la existencia de opciones múltiples en el mercado, evitando lock-in.
- **Excepción**: cuando un idioma tenga relevancia estratégica suficiente (valoración agregada de §1.2–§1.7) pero no exista todavía una oferta madura de múltiples proveedores, podrá incorporarse mediante ADR específica con justificación expresa.
- **La excepción nunca podrá generar dependencia arquitectónica de un proveedor concreto**: los adapters registrados sobre un idioma incorporado por excepción seguirán consumiéndose vía el mismo contrato de `AdapterBase` congelado por ADR-004, sin acoplamiento a implementaciones concretas.

**Regla dura**: la valoración es **agregada**. Un idioma que satisface sólo una dimensión NO se incorpora. La ADR de incorporación debe justificar explícitamente la evaluación combinada contra §1.1–§1.8.

**Excepción documentada por estatus oficial**: un idioma con estatus oficial en la UE u organismo internacional equivalente puede incorporarse aunque presente valoración menor en las dimensiones de volumen o demanda, cuando §1.4 y §1.7 lo justifiquen; la excepción se declara expresamente en su ADR de incorporación.

### §2. Política sobre variantes regionales

Un idioma se representa por su identificador base sin variante regional en el catálogo oficial, salvo cuando se satisfacen **todos** los criterios de variante:

**§2.1 — Divergencia lingüística demostrable**
- La variante presenta diferencias léxicas, gramaticales o fonéticas suficientes para que un hablante de la variante base no las procese como idénticas en conversación real-time.

**§2.2 — Divergencia técnica en el pipeline**
- STT/MT/TTS de al menos dos proveedores independientes tratan la variante como código distinto en su superficie.

**§2.3 — Relevancia agregada**
- La variante satisface la valoración combinada del §1 aplicada al ámbito de la variante.

**§2.4 — Estabilidad del identificador de variante**
- La variante tiene identificador estable en un estándar internacional reconocido (por ejemplo BCP 47) o en ISO 639-1 extendido cuando corresponda.

**§2.5 — Representación en `LangCode`**
- Si una variante satisface §2.1–§2.4, se incluye en `LangCode` como código adicional respetando el formato del estándar aplicado (§1.1), nunca reemplazando el idioma base.

Aplicación por caso a la primera versión del catálogo:

- **Inglés (`en`)**, **Español (`es`)**, **Francés (`fr`)**: base cubre uso global. Variantes regionales resueltas por adapters, salvo ADR aditiva.
- **Portugués (`pt`)**: base cubre europeo y brasileño. ADR aditiva si divergencia técnica (§2.2) lo justifica.
- **Chino (`zh`)**: base cubre chino global. Distinción simplificado/tradicional resuelta por adapters como primera aproximación.
- **Árabe (`ar`)**: base cubre árabe estándar moderno. Variantes dialectales resueltas por adapters.

**Regla dura**: la decisión de variante no es arbitraria. Cada variante añadida se justifica contra §2.1–§2.4 en su ADR de incorporación.

### §3. Política de estabilidad del catálogo

**§3.1 — Nunca eliminar un código publicado sin ADR específica**
- Un código incluido en el catálogo oficial NO puede eliminarse sin ADR específica que justifique la retirada.
- La ADR de retirada declara la estrategia de deprecación y respeta un período suficiente para migración razonable de adapters y consumers registrados. La duración concreta se decide caso a caso en la propia ADR de retirada, respetando siempre el principio ADR-003 §0.7.

**§3.2 — Incorporación exclusivamente aditiva**
- Toda ampliación del catálogo es aditiva. Los códigos existentes conservan su semántica; los nuevos se añaden sin modificar los previos.

**§3.3 — Compatibilidad hacia atrás garantizada**
- Ninguna ampliación del catálogo puede invalidar adapters ya registrados. Un adapter registrado en Fase N sigue siendo válido en Fase N+K aunque el catálogo se haya ampliado en el intervalo.

**§3.4 — Prohibición de cambios arbitrarios de identificador**
- Ningún código incluido puede reasignarse a otro idioma.
- Si el organismo emisor retira o deprecia un código, este ADR prescribe conservar el código durante un período suficiente antes de proponer su retirada por ADR específica.

**§3.5 — Prohibición de fragmentación por conveniencia técnica**
- Prohibido introducir en `LangCode` códigos que no cumplan la valoración agregada §1, aunque cuenten con soporte técnico de algún proveedor.

### §4. Gobernanza del catálogo

**§4.1 — Quién puede proponer**
- Cualquier miembro del equipo puede proponer incorporación, retirada o variante.
- La propuesta documenta: identificador propuesto; justificación por §1 (o §2 si es variante); análisis de estabilidad §3; impacto arquitectónico esperado.

**§4.2 — Cuándo requiere ADR específica**
Toda incorporación requiere ADR específica cuando:
- Se propone un nuevo código.
- Se propone una variante regional.
- Se propone la retirada o deprecación de un código.
- Se propone modificar un criterio de §1 o una política de §2/§3. En este caso el ADR es de **sustitución** de este ADR-005, no ampliación aditiva.

**§4.3 — Cuándo basta actualización documental**
Actualización documental sin ADR es suficiente sólo para: ampliación de la documentación de un código ya incluido; corrección de errores tipográficos o de metadatos; actualización de referencias cruzadas.

**§4.4 — Cómo se audita una ampliación**
Auditoría documental previa contra §1 y §2/§3 según aplique; verificación de coherencia con ADR-003 y ADR-004; verificación de que la propuesta no viola §3; aprobación final del Jefe de Proyecto.

**§4.5 — Registro de decisiones**
Cada ampliación queda registrada en su ADR específica, referenciada por este documento como fuente única de gobernanza del catálogo.

**§4.6 — Independencia entre catálogo y contrato**
Ninguna decisión abierta relativa al catálogo podrá bloquear Foundation Evolution 2 ni la apertura de la Fase 7 cuando no afecte al contrato arquitectónico definido por ADR-004. Las decisiones abiertas de este ADR se limitan exclusivamente al **contenido** del catálogo y nunca al **contrato** de Foundation. Toda excepción o ampliación posterior se resuelve por ADR aditiva sin retrasar hitos de fases que dependan únicamente del contrato ya congelado.

### §5. Primera versión oficial del catálogo

Se declara la primera versión oficial del catálogo de idiomas de SPABLA V2.

**Esta versión no es un catálogo objetivo, definitivo, límite ni referencia permanente**: constituye el punto de partida del modelo de gobernanza definido en §§1–4. Toda ampliación posterior seguirá el proceso de §4 sin reinterpretar los criterios §1.

Los códigos actualmente presentes en `LangCode` (10) están todos incluidos. Se incorporan 45 códigos nuevos. Ninguno existente se modifica.

**Lista canónica (55 códigos, orden alfabético)**:

af, am, ar, bg, bn, ca, cs, da, de, el, en, es, et, eu, fa, fi, fr, ga, gl, gu, he, hi, hr, hu, id, is, it, ja, km, ko, lt, lv, mr, ms, mt, ne, nl, no, pl, pt, ro, ru, sk, sl, sv, sw, ta, te, th, tl, tr, uk, ur, vi, zh.

**Total en esta primera versión: 55 códigos.**

**Presentación documental por bloques** (agrupación ilustrativa para lectura; **no es criterio de selección**):

- **Bloque documental A — Idiomas oficiales de la Unión Europea** (24): bg, cs, da, de, el, en, es, et, fi, fr, ga, hr, hu, it, lt, lv, mt, nl, pl, pt, ro, sk, sl, sv.
- **Bloque documental B — Idiomas de alcance global por volumen y demanda** (18): ja, zh, ko, hi, bn, ar, tr, vi, th, id, ms, fa, he, ru, uk, no, is, ur.
- **Bloque documental C — Idiomas del origen del producto** (3): ca, eu, gl.
- **Bloque documental D — Expansión estratégica a corredores globales** (10): sw, af, am, tl, ta, te, mr, gu, ne, km.

**Justificación por dimensiones colectivas** (§1 aplicado agregadamente):

- **Cobertura mundial**: cada continente habitado y todas las macrofamilias lingüísticas mayores presentes en flujos internacionales relevantes.
- **Utilidad para la comunicación internacional**: idiomas oficiales de la UE, de mayor uso global por hablantes, principales corredores migratorios y comerciales, y lenguas de instituciones internacionales.
- **Impacto económico**: idiomas de los principales mercados económicos globales y de los principales flujos de intercambio digital.
- **Demanda empresarial**: demanda observable de servicios de traducción real-time en el mercado B2B.
- **Equilibrio geográfico**: representación balanceada entre Europa, Asia, África, América y Oceanía; cero concentración exclusiva en una única región.
- **Valor estratégico para la expansión global de SPABLA**: mercados emergentes, comunidades autónomas del origen del producto, corredores digitales de crecimiento.

**Aplicación de §1**: cada código satisface la valoración agregada exigida por §1. Excepción documentada aplicada a `mt` (maltés) y `ga` (irlandés): estatus oficial UE prevalece por §1.4 + §1.7.

**Variantes regionales aplicadas a esta primera versión**: **ninguna**. Cada idioma se representa por su código base. Variantes futuras se incorporarán por ADR-005-N siguiendo §2.

---

## Coherencia con ADRs previas

- **ADR-003 §7 (Estrategia i18n)**: este ADR materializa el catálogo y su gobernanza; ADR-004 el contrato.
- **ADR-003 §0.4 (Provider Agnostic)**: §1.8 exige multi-proveedor sin fijar cuáles y garantiza que la excepción no crea dependencia arquitectónica de proveedor concreto.
- **ADR-003 §0.7 (Evolución sin ruptura)**: §3 lo garantiza; §4.6 lo refuerza en el nivel de hitos.
- **ADR-004 §1**: la primera versión del catálogo se resuelve aquí; la ampliación de tipo `LangCode` se ejecutará en el Plan de Foundation Evolution 2.
- **ADR-004 §2 (contrato de capacidades)**: este ADR NO modifica el contrato de `AdapterBase`. Los adapters reales de Fase 7 declararán capacidades sobre este catálogo mediante `getSupportedLanguages()`.

---

## Confirmaciones arquitectónicas

- **Engine permanece completamente agnóstico**. No conoce el catálogo por nombre; trabaja con `LangCode` como tipo genérico.
- **Foundation sólo amplía `LangCode` y `SUPPORTED_LANG_CODES`**.
- **`AdapterBase` (congelado por ADR-004) NO se modifica**. Este ADR gobierna el CONTENIDO del catálogo, no el contrato.
- **Cero impacto de este ADR** en SDK, Managers, Pipeline, PipelineOrchestrator, AdapterRegistry, Core API, SpablaCore, clientes ni superficies aún inexistentes.

---

## Consecuencias arquitectónicas

1. **Modelo de gobernanza operativo desde ahora**: §§1–4 quedan vigentes; toda ampliación futura sigue el mismo protocolo.
2. **Primera versión oficial publicada**: 55 códigos suficientes para abrir Fase 7; el catálogo es evolutivo por diseño y no queda vinculado a este número.
3. **Cero fragmentación por conveniencia técnica**: §3.5 lo prohíbe.
4. **Compatibilidad hacia atrás perpetua**: §3.1–§3.3 la garantizan.
5. **Independencia entre catálogo y contrato**: §4.6 garantiza que ninguna decisión abierta del catálogo bloquea hitos que dependen del contrato congelado.
6. **Sin dependencias de proveedor**: el catálogo sobrevive al ciclo de vendors; incluso las excepciones de §1.8 preservan agnosticismo.
7. **Estándares flexibles**: la preferencia ISO 639-1 con excepción BCP 47 permite representar correctamente casos que ISO 639-1 no cubre.
8. **Variantes controladas**: §2 impide proliferación arbitraria.

---

## Decisiones abiertas

Las siguientes decisiones son de contenido del catálogo. Por §4.6 ninguna bloquea Foundation Evolution 2 ni Fase 7.

**§6.1 — Variante chino simplificado vs tradicional**
- Primera versión incluye sólo `zh` como base.
- **Owner**: Jefe de Proyecto. Recomendación: mantener `zh` base; abrir ADR-005-1 si Fase 7 justifica variante.

**§6.2 — Portugués brasileño vs europeo**
- Primera versión incluye sólo `pt` como base.
- **Owner**: Jefe de Proyecto. Recomendación: mantener `pt` base; abrir ADR-005-2 si Fase 7 lo justifica.

**§6.3 — Umbral concreto de "múltiples proveedores" en §1.8**
- El criterio actual exige "al menos dos". Cabe elevarlo a tres para categorías críticas cuando la madurez del mercado lo justifique.
- **Owner**: Jefe de Proyecto. Recomendación: mantener "al menos dos" en primera versión; revisar tras Fase 7 con datos reales; cambio requiere ADR de sustitución.

---

## Riesgos arquitectónicos

**R1 — Presión por incorporación acelerada**: un cliente enterprise podría solicitar incorporación urgente. **Mitigación**: §4.2 estandariza el proceso; §4.6 garantiza que ningún proceso de catálogo bloquea hitos de contrato.

**R2 — Divergencia de criterios ante ampliaciones sucesivas**: sucesivas ADRs podrían relajar o endurecer §1. **Mitigación**: §4.2 exige ADR de **sustitución** para modificar criterios; el preámbulo normativo reafirma que el valor está en la gobernanza, no en el número, dificultando derivas por acumulación.

**R3 — Fragmentación por variantes regionales**: §2 abre la puerta a variantes. **Mitigación**: §2 exige todos los criterios; §4.4 obliga a auditoría.

**R4 — Discrepancia catálogo oficial vs disponibilidad real**: un código podría perder proveedores. **Mitigación**: §3.1 prohíbe eliminación arbitraria; la disponibilidad la reflejan los adapters vía `getSupportedLanguages()`.

**R5 — Cambio del estándar de identificador**: §3.4 preserva durante período suficiente; duración caso a caso.

**R6 — Acumulación de sub-ADRs sin auditoría homogénea**: **Mitigación**: §4.4 estandariza; auditoría periódica del catálogo consolidado.

**R7 — Interpretación ambigua de las dimensiones §1**: la ambigüedad se acota en cada ADR de ampliación; el Jefe de Proyecto decide en caso de disputa.

**R8 — Excepción por estatus oficial usada abusivamente**: exige estatus oficial UE u organismo equivalente + §1.4 + §1.7; auditoría verifica cada aplicación.

**R9 — Adopción de BCP 47 fragmenta la coherencia del catálogo**: **Mitigación**: §1.1 exige preservar la compatibilidad del contrato ADR-004; la coexistencia se acepta como precio de correcta representación.

**R10 — Abuso de la excepción de §1.8 (idioma sin oferta madura multi-proveedor)**: **Mitigación**: la excepción exige ADR específica con justificación expresa + regla dura que prohíbe dependencia arquitectónica de proveedor concreto.

---

## Recomendación única

Congelar este ADR-005 tras auditoría final independiente. A continuación:

1. **Redacción del Plan de Foundation Evolution 2** consolidando ADR-004 (contrato) + ADR-005 (catálogo).
2. **Auditoría independiente del Plan** antes de implementación.
3. **Implementación de Foundation Evolution 2** bajo el plan aprobado.
4. **Apertura del plan de Fase 7** sólo tras el cierre de Foundation Evolution 2.
