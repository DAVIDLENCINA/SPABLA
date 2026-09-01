# ADR-003-STRATEGIC-VISION — SPABLA V2

**Tipo**: Decisión (ADR).
**Autor**: Jefe de Proyecto.
**Estado**: aceptada.
**Fecha**: 2026-07-09.
**Base**: `spabla-v2-phase-6-pipeline-2026-07-09` @ `50d9e50`.

Este ADR es el **contrato de producto permanente** que gobierna las Fases 7 en adelante. Ninguna fase posterior contradice sus decisiones sin una ADR de sustitución. Este documento define principios estratégicos; las decisiones tácticas (proveedores, frameworks, transporte) pertenecen a ADRs específicas o al plan de cada fase.

---

## §0. Misión y Principios Permanentes

Esta sección define la identidad y los principios atemporales de SPABLA. Rige por encima de cualquier decisión posterior de este ADR o de cualquier ADR futura. Su modificación exige ADR de sustitución específica y aprobación explícita del Jefe de Proyecto. Ningún principio de esta sección puede quedar obsoleto por la evolución tecnológica del entorno.

### §0.1. Misión

SPABLA existe para eliminar la barrera del idioma en cualquier conversación humana, independientemente del dispositivo, la plataforma o la tecnología utilizada.

### §0.2. Tecnología invisible

La mejor experiencia es aquella en la que el usuario olvida que existe tecnología. La conversación debe sentirse natural, como si todas las personas involucradas compartieran el mismo idioma. Cada decisión de producto y de arquitectura se juzga por su contribución a esa naturalidad.

### §0.3. SDK First

El SDK constituye el núcleo del producto. Toda lógica de negocio pertenece al SDK. Ninguna plataforma, cliente, servicio o integración externa implementa lógica de negocio fuera de él. Toda superficie de consumo — clientes de referencia, API pública, White Label, Enterprise — se construye sobre el mismo SDK.

### §0.4. Provider Agnostic

Ningún proveedor forma parte de la arquitectura. Todos los proveedores externos son sustituibles a través de la abstracción `Adapter` correspondiente a su kind. El Engine no importa proveedores. El SDK conoce únicamente los contratos de adapter, nunca a sus implementaciones concretas.

### §0.5. API First

Toda capacidad relevante del producto debe poder ser consumida desde interfaces públicas y estables. Ninguna capacidad crítica queda accesible sólo desde una superficie interna o desde un cliente concreto. El SDK y la API pública son el mismo contrato de producto expresado en dos superficies distintas.

### §0.6. Privacy by Design

La privacidad, la seguridad y la protección de los datos forman parte del diseño desde el origen y nunca se añaden posteriormente. Ninguna decisión de producto puede posponer una salvaguarda de privacidad a una fase posterior; toda fase que amplíe el manejo de datos personales incorpora sus salvaguardas correspondientes en su propio alcance.

### §0.7. Evolución sin ruptura

Toda evolución del sistema deberá preservar la compatibilidad arquitectónica siempre que sea razonablemente posible. Las incompatibilidades sólo podrán introducirse mediante ADR específica que declare explícitamente su alcance, su justificación y su estrategia de migración. Las decisiones tácticas evolucionan; los principios de esta sección no.

---

## Contexto

El Engine V2 está terminado como modelo en memoria (Fases 1–6, tag `spabla-v2-phase-6-pipeline-2026-07-09`, 513 tests verdes, 97.6 % cobertura global). El código de V2 vive exclusivamente en `engine/src/` y no tiene aún: adapters reales, backend, transporte, autenticación, UI, ni distribución.

Entre "Engine terminado" y "producto usable por una persona real" hay ~13 fases razonables. Cada fase contiene decisiones que, si se toman por defecto en el momento de la implementación, producen deuda arquitectónica cara. Este ADR consolida los principios estratégicos que sobreviven al ciclo de vendors, frameworks y tecnologías de transporte, y separa esos principios de las decisiones tácticas que evolucionarán en 2, 5 o 10 años.

---

## Decisiones

### §1. Visión SPABLA a 5–10 años

SPABLA es la **capa universal de comunicación multilingüe en tiempo real** para cualquier producto que necesite superar la barrera del idioma en interacciones humanas síncronas.

- **A 12 meses**: primer producto propio (MVP Web 1:1) validando arquitectura + primeros clientes early access.
- **A 24 meses**: SDK público estable + primeras integraciones White Label + soporte inicial a conversaciones con N > 2 participantes cuando el mercado lo requiera.
- **A 5 años**: SPABLA embebido en múltiples productos consumer y enterprise, con soporte a modalidades 1:1, N-party y broadcast diferenciadas por producto.
- **A 10 años**: estándar de facto de la comunicación multilingüe real-time, con múltiples proveedores intercambiables detrás y presencia en el stack de comunicaciones al mismo nivel que las capas históricas de voz, identidad y pagos.

### §2. Alcance del producto

SPABLA cubre la **conversación multilingüe en tiempo real entre dos o más personas**, en modos texto y voz (con vídeo opcional como stream paralelo sin transformación). Cada participante habla y escribe en su idioma; SPABLA traduce en tiempo real entre todos los participantes y presenta la traducción como texto y/o audio sintetizado en el idioma de cada receptor.

**MVP alcance**: conversación 1:1 (dos participantes). **La arquitectura del Engine, del SDK y de los contratos entre módulos debe permitir extender a N > 2 sin ruptura**. La ampliación a N-party es un cambio de plan de fase, nunca un cambio de contrato core.

**Modos autorizados**: chat (texto → texto traducido), voz (voz → texto → traducción → voz sintetizada), vídeo (voz + vídeo pass-through). Ampliaciones (grabación, resumen, moderación, etc.) requieren ADR específica.

**Superficie autorizada**: SDK + reference clients (Web, PWA, Mobile, Desktop) + API pública server-side. Toda superficie nueva requiere ADR.

Aplicación operativa del principio §0.7 (Evolución sin ruptura).

### §3. Qué es SPABLA y qué NO es SPABLA

**ES**:
- capa de conversación real-time cross-language, agnóstica al número de participantes en el contrato (MVP 1:1, extensible a N-party);
- pipeline STT → MT → TTS con orquestación explícita;
- SDK-first: la lógica de negocio vive dentro del SDK, no en los clientes;
- proveedor-agnóstica: adapters intercambiables por kind (STT/MT/TTS/Auth/Storage/Transport/Telemetry);
- observable por eventos tipados desde el Engine;
- extensible vía adapters registrados en runtime.

**NO ES**:
- una app de traducción de documentos (no batch);
- un transcriptor / servicio de actas (no reemplaza herramientas de note-taking);
- una plataforma de broadcast unidireccional (streaming a audiencias pasivas);
- un chatbot / wrapper de LLM (SPABLA no genera contenido, traduce entre humanos);
- un producto de aprendizaje de idiomas (no gamificación, no lecciones);
- un framework de UI (los reference clients son ejemplos, no un design system).

### §4. Arquitectura de distribución

El SDK es el núcleo. Todas las demás superficies son consumidoras.

```
                    ┌──────────────────────┐
                    │  @spabla/engine      │  Fases 1-6, congelado
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Adapters por kind   │  Fase 7 (STT / MT / TTS / Auth /
                    │  (registro dinámico) │           Storage / Transport /
                    │                      │           Telemetry / …)
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  @spabla/sdk         │  Fase 9 — el producto
                    └──────────┬───────────┘
       ┌─────────────┬─────────┼─────────┬─────────────┬────────────┐
       ▼             ▼         ▼         ▼             ▼            ▼
   Cliente Web  Cliente PWA  Cliente   Cliente     API pública  White Label
   (Fase 11)    (Fase 14)    Mobile    Desktop     (Fase 17)    (Fase 18)
                             (Fase 15) (Fase 16)
```

- **Cliente Web** (Fase 11): reference client mínimo sobre `@spabla/sdk`. Sin lógica de negocio.
- **Cliente PWA** (Fase 14): mismo cliente web instalable. Sin lógica de negocio.
- **Cliente Mobile** (Fase 15): reference client sobre `@spabla/sdk`. Sin lógica de negocio.
- **Cliente Desktop** (Fase 16): reference client sobre `@spabla/sdk`. Sin lógica de negocio.
- **API pública** (Fase 17): servicio HTTP/RPC que consume `@spabla/sdk` en el servidor.
- **SDK** (Fase 9): el producto. `@spabla/sdk` es lo que SPABLA vende, licencia y versiona.

**Regla dura**: **ningún cliente contiene lógica de negocio fuera de la estrictamente necesaria para la interfaz de usuario**. La lógica de negocio vive en el SDK. Si un cliente necesita comportamiento nuevo, se implementa en el SDK y se consume desde el cliente. La elección de framework/runtime por cliente es una decisión táctica y no pertenece a este ADR.

### §5. Estrategia White Label

White Label es una configuración del SDK, no un fork.

- Theming: config declarativa (colores, tipografía, logos, wording base) inyectada al inicializar el SDK.
- Reference clients leen la config y aplican tema en runtime.
- Multi-tenant desde el schema (§8): cada tenant es un cliente White Label potencial.
- **Prohibido**: cliente White Label con código de negocio propio. Si un cliente pide "custom logic", entra por la superficie del SDK (adapter, hook, extension point) — no por rewrite.

### §6. Estrategia Enterprise

Enterprise es SDK + adapters adicionales + SLA + operativa dedicada.

- Autenticación corporativa vía protocolos abiertos (SAML, OIDC) implementada como `AuthAdapter` alternativo al adapter por defecto.
- Auditoría: `AuditAdapter` (o `TelemetryAdapter` con sink dedicado) que persiste `telemetry.*` en la infraestructura acordada con cada cliente.
- Retención por org: `StorageAdapter` con TTL configurable + right-to-erasure.
- Deployment: cloud dedicado o on-prem. El SDK debe correr fuera de infra propia sin cambios de código.
- Cost caps y billing: hard caps por org, usage-based reporting.
- **Enterprise nunca es un fork del SDK**. Es el mismo SDK con adapters distintos.

### §7. Estrategia de internacionalización

SPABLA soporta desde el arranque un mínimo de **50–60 idiomas** en `LangCode`, y el Engine NO conoce qué idiomas soporta cada adapter — el adapter lo declara vía capabilities.

- `LangCode` union se amplía a 50–60 códigos ISO-2 en una **Foundation Evolution 2** (previa a Fase 7). Los códigos concretos son decisión abierta de producto.
- `AdapterBase` gana un método `supports(lang: LangCode): boolean` en la misma Foundation Evolution 2. Cero cambios al Engine.
- SDK filtra por capacidades al resolver el par de idiomas de cada llamada.
- SDK expone `getSupportedLanguages(kind)` para consumers.
- i18n de la UI (traducción de la interfaz) es separado: se difiere a Fase 13. NO afecta al Engine ni al SDK.

**Justificación arquitectónica** (ver §análisis específico más abajo): traer la ampliación aquí no es simplificación técnica, es corrección semántica del contrato adapter.

### §8. Multi-tenancy

`tenant_id` presente en todas las tablas del schema desde Fase 8, aunque MVP inicial funcione como single-tenant.

- Convención: `tenant_id` no nulo en todas las entidades persistidas.
- Un tenant self-serve corresponde 1:1 con una cuenta usuario en MVP; White Label agrupa muchos usuarios bajo un tenant.
- Aislamiento cross-tenant obligatorio desde Fase 8 vía el mecanismo que ofrezca el adapter de persistencia.
- SDK config incluye `tenantId`: el Engine no lo conoce; los adapters de persistencia sí.

**Razón**: retro-añadir `tenant_id` tras el primer cliente en producción exige downtime + migración con backfill. Coste presente ≈ 0; coste diferido ≈ semanas de trabajo.

### §9. Transporte de comunicaciones

**Principio permanente**: el sistema de transporte es **completamente sustituible**.

- El **Engine no conoce** la tecnología de transporte. Cero imports, cero acoplamiento.
- El **SDK conoce sólo el contrato** `TransportAdapter` — abstracción sobre signaling + establecimiento de sesión + routing de media entre participantes.
- Las implementaciones concretas del transporte (peer-to-peer, servidor selectivo, relay, mixto) viven como adapters registrables.
- **La elección concreta del transporte se realiza en la fase correspondiente**, sobre requisitos funcionales del producto en ese momento (número de participantes, latencia objetivo, coste operativo, restricciones de red/firewall).
- **Regla dura**: si una decisión de producto exige un modelo de transporte distinto al vigente (por ejemplo, evolución de 1:1 a N-party), la sustitución debe ser posible cambiando únicamente el `TransportAdapter` registrado, sin tocar Engine, SDK ni contratos existentes.

### §10. Autenticación

**Principio permanente**: SPABLA es agnóstica al proveedor de identidad.

- El SDK define `AuthAdapter` — abstracción sobre sesión autenticada, no sobre credenciales.
- El SDK **NUNCA maneja credenciales**. Recibe un token/sesión ya autenticado del cliente.
- El cliente (Web/Mobile/…) implementa el flujo UI de login; el SDK sólo consume el resultado.
- Cambios entre proveedores de identidad (self-serve → SSO empresarial → federado) se resuelven registrando un `AuthAdapter` distinto, sin tocar Engine, SDK ni otros adapters.

### §11. Persistencia

Aplicación operativa del principio §0.4 (Provider Agnostic).

**Principio permanente**: el Engine y el SDK son stateless por sesión; toda persistencia va por adapter.

- El SDK define `StorageAdapter` — abstracción sobre lectura/escritura de entidades persistentes (conversaciones, mensajes, sesiones, participantes, telemetría, uso).
- El Engine no importa ninguna tecnología de persistencia. `StorageAdapter` consume eventos del bus del Engine y los pega a la persistencia elegida.
- Snapshots del Engine se reconstruyen al arrancar SDK vía `StorageAdapter.load(...)`.
- La tecnología concreta de persistencia se decide en Fase 8 vía ADR específica.

### §12. Privacidad, retención y GDPR

Aplicación operativa del principio §0.6 (Privacy by Design).

**Principios permanentes**:

- **Audio raw NO se persiste jamás**. Sólo transcripciones y metadata.
- **Retención por defecto** para self-serve: definida por producto (se propone 90 días, sujeto a ADR de producto). Configurable per-tenant para White Label / Enterprise dentro de límites contractuales.
- **Right-to-erasure**: cascade delete verificable por adapter de persistencia.
- **DPA / BAA**: obligatorio publicarlos para Enterprise antes de Fase 19.
- **Consentimiento explícito** al onboarding para transcripción + traducción (marca aparte para grabación si se activara).
- **Anonimización de telemetría**: `telemetry.*` no incluye contenido de conversación, sólo IDs + timings.
- **Residencia de datos configurable por tenant**. El adapter de persistencia sabe dónde residen los datos; ni Engine ni SDK deciden región.

### §13. Modelo de costes, cuotas y billing

**Principios permanentes**:

- Cost tracking a nivel de turno: cada `pipeline.turn.completed` genera un evento `telemetry.turn.cost` con desglose STT/MT/TTS/total.
- Cuotas por tenant desde Fase 8: `usage_ledger` (o tabla equivalente en el adapter de persistencia) acumula turnos, minutos de voz, chars de texto.
- Hard caps de emergencia (nivel Engine, aplicados vía SDK): configurables por tenant; bloquean nuevas `initiateCall` cuando se excede.
- **El Engine y el SDK son agnósticos al modelo de facturación**. El modelo comercial concreto (freemium, subscription, usage-based, contrato anual, o combinación) se define por ADR específica de producto y se implementa como consumer de la telemetría, no como lógica del SDK.

### §14. Observabilidad y telemetría

**Principios permanentes**:

- Telemetría vía `TelemetryAdapter`; el Engine emite `telemetry.*`, el adapter decide el sink.
- Nunca se filtra contenido de conversación a la telemetría (regla §12).
- Métricas primarias: latencia p50/p95 por etapa (STT, MT, TTS, total), tasa de fallos por etapa, cost per turn, MAU/DAU por tenant.
- Errores de runtime: consumidos por un adapter específico (o el mismo `TelemetryAdapter`). El SDK no acopla a ningún proveedor concreto de tracking.

### §15. Estrategia del SDK

Aplicación operativa de los principios §0.3 (SDK First) y §0.5 (API First).

`@spabla/sdk` es el producto principal. **Reglas duras**:

- **El SDK contiene toda la lógica de negocio**. Cliente = presentación + input, nada más.
- **Semver desde el día uno**. `@spabla/engine` congela en 1.0.0 al cierre de Fase 6. `@spabla/sdk` empieza en 0.1.0 en Fase 9 y llega a 1.0.0 en Fase 17 (public API).
- **Monorepo** con las siguientes packages canónicas:
  - `@spabla/engine` — Fases 1–6, frozen tras cada release.
  - `@spabla/adapters-*` — implementaciones concretas por kind y por proveedor.
  - `@spabla/sdk` — la unidad comercial: envuelve engine + adapters + transporte + persistencia + auth.
  - Reference clients (Web, PWA, Mobile, Desktop) — cada uno reusa el SDK; sin lógica de negocio.
- **API pública del SDK** documentada + tests contract-first.
- **Cambios breaking al SDK exigen ADR + major bump + migration guide**.
- **Todo cliente puede ser reimplementado desde cero sin afectar al SDK**. Si un cliente exige cambios al SDK, esos cambios son primero justificados y luego implementados en el SDK.

Aplicación específica del principio §0.3: todos los consumidores de SPABLA (Web, PWA, Mobile, Desktop, API pública, White Label, Enterprise) consumen exclusivamente el mismo SDK. Ninguna plataforma implementa lógica de negocio fuera de él salvo la estrictamente necesaria para la interfaz de usuario.

---

## Análisis: ¿debe adelantarse la ampliación de `LangCode` a 50–60 idiomas antes de Fase 7?

**Sí. Debe adelantarse. La razón es arquitectónica, no técnica.**

**Argumento técnico** (débil): son 3 líneas en un solo archivo (`types/language.ts`). Coste diferido ≈ coste actual. Este argumento por sí solo no justificaría adelantar.

**Argumento arquitectónico** (fuerte):

1. **Contrato adapter estabilizado en Fase 7**. En Fase 7 vamos a registrar adapters reales. Sin una API `supports(lang): boolean` en `AdapterBase`, esos adapters se registran con el contrato implícito "soporta todos los `LangCode`". El contrato implícito es una mentira: ningún proveedor real de STT/MT/TTS soporta todos los idiomas del planeta.

2. **Semántica silenciosamente rota al ampliar después**. Cuando en Fase 13 se amplíe `LangCode` de 10 a 60, los adapters registrados en Fase 7 pasan de mentir sobre 10 idiomas a mentir sobre 60. El `AdapterRegistry.get("stt")` retorna un adapter que crashea en runtime para 50 idiomas nuevos. Este es un fallo semántico invisible en tests hasta que un usuario real elige un idioma no soportado.

3. **Refactor retroactivo del contrato adapter**. Hacer que los adapters de Fase 7 declaren capacidades en Fase 13 implica: modificar `AdapterBase` (Foundation) — otro Foundation Evolution; modificar cada adapter registrado — 3+ paquetes por kind; modificar cada consumer que use `AdapterRegistry.get()` — el SDK entero; migrar tests unitarios de cada adapter y del SDK. Coste diferido ≫ coste presente.

4. **Coherencia con la Doctrina §0 del plan de Fase 6**. Foundation define capacidades; políticas viven en Pipeline. La ampliación de `LangCode` es una capacidad; declarar qué soporta un adapter es también una capacidad. Ambas viven en Foundation, no en el orchestrator.

5. **Adapter capabilities es prerequisito del SDK**. La Fase 9 (SDK) necesita `getSupportedLanguages(kind)` como parte de su superficie pública. Si el prerequisito llega en Fase 13, el SDK 1.0 (Fase 17) tendría que romper contrato.

**Decisión propuesta**: abrir una **Foundation Evolution 2** entre Fase 6 (recién cerrada) y Fase 7, con alcance estrictamente aditivo:

- Ampliar `LangCode` a 50–60 códigos (lista concreta = decisión abierta de producto).
- Ampliar el Set de códigos soportados en `types/language.ts`.
- Ampliar el array del test correspondiente.
- Añadir `supports(lang: LangCode): boolean` a `AdapterBase` en `types/adapters.ts` (opcional en la interfaz para no romper adapters de test existentes; obligatorio en adapters reales de Fase 7 en adelante).
- Añadir helper de filtrado por capacidades en `AdapterRegistry` (opcional) o en el consumer.
- Tests: cero regresión + tests nuevos que validen `supports()` en fake adapters.

**Tag propuesto**: `spabla-v2-foundation-evolution-2-YYYY-MM-DD`.

---

## Consecuencias

1. **Plan de Fase 7 se redacta sobre premisas cerradas** en lugar de decisiones abiertas.
2. Cada ADR/plan posterior referencia este ADR-003 como fuente única de dirección estratégica.
3. Los reference clients (Fases 11, 14, 15, 16) se diseñan para ser mínimos por diseño: cero lógica de negocio.
4. La superficie del SDK (Fase 9) se congela antes de que Cliente Web (Fase 11) empiece — evita el anti-pattern "el SDK es lo que sobra tras hacer la UI".
5. Multi-tenancy desde Fase 8 introduce complejidad marginal en el schema inicial; ahorra semanas en Fase 18.
6. La sustituibilidad del transporte queda garantizada de por vida: cualquier decisión táctica (P2P, SFU, relay, mixto) puede cambiarse por otra sin tocar Engine ni SDK.
7. La Foundation Evolution 2 previa a Fase 7 se convierte en la ruta canónica de introducción de la ampliación de idiomas + `supports()`.
8. La ampliación de MVP 1:1 a conversaciones N > 2 no requiere refactor del Engine ni del SDK; sólo cambio del `TransportAdapter` y del plan de la fase correspondiente.

---

## Decisiones abiertas

Las siguientes decisiones no pertenecen a este ADR (son tácticas o de producto). Cada una debe resolverse por ADR específica o por decisión del Jefe de Proyecto antes de la fase en que se necesite.

1. **Lista concreta de 50–60 idiomas objetivo**. Decisión de producto/mercado. Requerida antes de Foundation Evolution 2.
2. **Free tier exacto** (minutos voz / chars texto / mes).
3. **Modelo comercial** (subscription, usage-based, freemium, contrato anual, o combinación). ADR de producto separada.
4. **Elección concreta de proveedores por kind** (STT, MT, TTS, Auth, Storage, Transport, Telemetry). ADR o plan de fase específico.
5. **Stack de cliente por plataforma** (framework Web, runtime Mobile, runtime Desktop). Táctica; se decide en el plan de cada fase de cliente.
6. **Tecnología de signaling** (WebSocket propio, backend-as-a-service, u otras). Se decide en la fase de transporte.
7. **Servicio TURN** (proveedor comercial o self-hosted). Se decide en la fase de transporte.
8. **Auth secondary providers**. Se decide caso a caso según requerimientos enterprise.
9. **Nombre comercial del SDK**. Marca comercial pendiente.
10. **Modelo de contribuciones externas al SDK** (cerrado, open-core, open source). ADR específica antes de Fase 17.
11. **Residencia de datos por defecto** (regiones geográficas soportadas y valor por defecto). ADR de producto separada.
12. **Retención por defecto exacta** para self-serve. ADR de producto separada.

---

## Riesgos

**R1 — Sobre-especificación estratégica**: 15 principios cerrados en un solo ADR pueden estar mal calibrados antes del primer usuario real. **Mitigación**: revisar este ADR tras Fase 11 (primer producto usable) y publicar ADR de sustitución si es necesario.

**R2 — Lock-in oculto vía adapter contract**: si el contrato de un `Adapter` queda mal diseñado, aunque el proveedor sea intercambiable, el contrato mismo puede acoplar al modo de operación de un proveedor concreto. **Mitigación**: cada adapter contract se audita con dos implementaciones fake independientes que no se parezcan entre sí, antes de congelar el contrato.

**R3 — SDK-first sin usuario real**: comprometemos el SDK como producto principal antes de validar demanda. **Mitigación**: MVP Cliente Web (Fase 11) valida la superficie con humanos antes de estabilizar el SDK público (Fase 17).

**R4 — Foundation Evolution 2 introduce cambios en Foundation post-congelación**. **Mitigación**: sigue el mismo protocolo que Foundation Evolution 1: ADR previa, scope estrictamente aditivo, cero regresión, tag propio antes de Fase 7.

**R5 — Adapter capabilities API design first-time-right**: si `supports(lang): boolean` resulta insuficiente (ej. queremos declarar calidad por idioma, latencia esperada, etc.) la API queda estrecha. **Mitigación**: partir de `supports(lang): boolean` como mínimo; la interfaz permite extensión aditiva sin breaking en el futuro.

**R6 — Multi-tenancy prematuro**: `tenant_id` desde Fase 8 añade complejidad para 0 tenants iniciales. **Mitigación**: default single-tenant transparente; el coste marginal es aceptable frente al coste diferido de la migración retroactiva.

**R7 — Techo implícito del alcance MVP 1:1**: si la Fase 7 o la Fase 8 asumen 1:1 en algún contrato interno, la ampliación futura a N-party rompe. **Mitigación**: en cada fase del camino crítico se verifica explícitamente que ningún contrato nuevo cierre `participantes = 2` como invariante.

**R8 — Cost caps mal calibrados**: sin datos reales de coste por turno, los caps pueden sangrar dinero o ser demasiado restrictivos. **Mitigación**: instrumentar `telemetry.turn.cost` desde Fase 7; calibrar en Fase 11 con datos reales antes de Fase 13.

**R9 — Contrato adapter no cubre todas las categorías presentes o futuras**: si aparece una categoría de proveedor no anticipada (ej. moderación, deteccción de idioma, resumen), el `AdapterRegistry` puede necesitar nuevos kinds. **Mitigación**: el diseño del registro ya soporta kinds arbitrarios; sólo requiere ADR aditiva por categoría.

**R10 — ADRs fragmentadas**: cada decisión abierta puede convertirse en su propia sub-ADR y fragmentar la fuente de verdad. **Mitigación**: consolidar decisiones abiertas 1–4, 11, 12 en una ADR-005 de producto antes de Fase 7, para preservar la fuente única de dirección estratégica.
