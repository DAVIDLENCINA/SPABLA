# SPABLA — Workflow de agentes

---

## Principio del workflow

Antes de ejecutar cualquier tarea, cualquier agente — humano o IA — debe leer:

1. `app/chat/SPABLA_MASTER.md`
2. `docs/vision.md`
3. `docs/architecture.md`

Sin esta lectura, no se toma ninguna decisión ni se escribe ninguna línea de código.

---

## Orden obligatorio de trabajo

```
Tarea recibida
    │
    ▼
[1] ORCHESTRATOR
    Lee el master. Clasifica la tarea. Asigna agente.
    │
    ▼
[2] Agente primario (según tipo de tarea)
    Ejecuta dentro de su dominio.
    │
    ▼
[3] QA
    Valida el resultado. Genera informe si hay bugs.
    │
    ▼
[4] ORCHESTRATOR
    Aprueba. Registra en docs/decisions.md si hay impacto arquitectural.
    │
    ▼
Tarea completada
```

**Ningún agente salta este orden.** Una tarea no está completa hasta que QA la ha validado y el Orchestrator la ha aprobado.

---

## Orchestrator

**Rol:** coordinador central. Punto de entrada de toda tarea.

**Actúa primero en:**
- Cualquier petición nueva (feature, bug, refactor, decisión).
- Cualquier conflicto entre agentes.
- Cualquier cambio que afecte al `conversationId` o al flujo principal.

**Responsabilidades:**
- Leer SPABLA_MASTER.md antes de asignar.
- Identificar el agente primario y los agentes de soporte.
- Definir el criterio de éxito de la tarea.
- Rechazar tareas que violen el master o prioricen funciones secundarias sobre el flujo principal roto.
- Registrar decisiones arquitecturales en `docs/decisions.md`.
- Revisar el informe de QA antes de aprobar cualquier release.

**No hace:** no implementa código, no diseña UI, no define la base de datos.

---

## CTO

**Rol:** arquitectura global y decisiones técnicas de alto nivel.

**Actúa en:**
- Decisiones de arquitectura (nueva ruta, cambio de modelo de datos, nueva integración externa).
- Deuda técnica estructural.
- Conflictos de implementación entre agentes.
- Revisión de dependencias y stack.

**Responsabilidades:**
- Garantizar que `conversationId` es el identificador único de toda actividad del sistema.
- Aprobar o rechazar cualquier propuesta que genere salas, sesiones o contextos independientes.
- Mantener la coherencia del stack con SPABLA_MASTER.md.
- Definir contratos entre capas (qué emite el servidor, qué escribe Supabase, qué consume el frontend).

**No hace:** no implementa interfaces, no define UX, no gestiona el roadmap.

---

## Product

**Rol:** definición del producto y priorización del roadmap.

**Actúa en:**
- Toda petición de nueva funcionalidad.
- Priorización del backlog.
- Definición de criterios de aceptación.
- Detección de flujos rotos o inconsistentes con la visión.

**Responsabilidades:**
- Mantener `docs/product.md` y `docs/roadmap.md` actualizados.
- Asegurarse de que V1 está completa antes de iniciar trabajo de V2.
- Rechazar features secundarias mientras existan bugs críticos en el flujo principal.
- Definir el flujo canónico y detectar cualquier desviación.

**Preguntas clave antes de aprobar cualquier tarea:**
- ¿Esto acerca SPABLA a que dos personas se comuniquen sin barreras idiomáticas?
- ¿La experiencia es más simple que antes?
- ¿Rompe el principio de conversación única?

**No hace:** no implementa código, no decide arquitectura técnica.

---

## Frontend

**Rol:** construcción de la interfaz en Next.js + React + TypeScript.

**Actúa en:**
- Implementación de componentes y páginas.
- Navegación y routing.
- Integración de estado y datos del backend.
- Responsive y rendimiento de UI.

**Responsabilidades:**
- Ningún componente genera `roomId` con `Math.random()`.
- El `conversationId` se recibe de la URL o del contexto; nunca se crea en el componente.
- La videollamada se renderiza en `VideoOverlay.tsx` dentro de `/chat`, no en una ruta separada.
- El link de invitación siempre apunta a `/chat?id={conversationId}`.
- TypeScript sin errores (`npx tsc --noEmit` en cero errores).

**Restricciones:**
- No modifica el backend ni la base de datos.
- No hace fetch directo a APIs externas (OpenAI, Deepgram, ElevenLabs).
- No toma decisiones de arquitectura.

---

## Backend

**Rol:** capa de datos, APIs y autenticación.

**Actúa en:**
- Modelo de datos en Supabase.
- API Routes de Next.js.
- Autenticación y RLS.
- Integraciones con servicios externos desde el servidor.

**Responsabilidades:**
- `sender_id` en mensajes se obtiene siempre de `supabase.auth.getUser()`.
- RLS activo en todas las tablas.
- `/api/translate` es el único endpoint de traducción; usa OpenAI GPT-4o-mini.
- Al crear una conversación, la respuesta incluye el `conversationId` para que el frontend redirija.

**Restricciones:**
- No implementa componentes UI.
- No gestiona la señalización WebRTC.
- No toma decisiones de producto ni de priorización.

---

## WebRTC

**Rol:** toda la capa de comunicación en tiempo real (audio, vídeo, transcripción, síntesis).

**Actúa en:**
- Servidor de señalización Socket.io.
- Hook `useWebRTC` en el cliente.
- Integración con Deepgram (STT).
- Integración con ElevenLabs (TTS).
- Procesado de audio (AudioWorklet).

**Responsabilidades:**
- `roomId` = `conversationId` en todo momento. Sin excepciones.
- El servidor valida `conversationId` en Supabase antes de procesar `join-room`.
- Deepgram y ElevenLabs se llaman únicamente desde el servidor.
- Una implementación única de WebRTC (`useWebRTC`); no hay duplicados.
- `AudioWorklet` en lugar de `ScriptProcessorNode`.

**Reglas obligatorias (no negociables):**
- Toda llamada utiliza `conversationId`.
- Toda videollamada utiliza `conversationId`.
- No se crean salas independientes.
- No se generan enlaces independientes para llamadas.
- No se generan invitaciones fuera del contexto de la conversación.

**Restricciones:**
- No define la UI de los controles de llamada (eso es Frontend).
- No accede directamente a Supabase para leer mensajes o participantes desde el cliente.

---

## QA

**Rol:** encontrar bugs antes que los usuarios.

**Actúa en:**
- Toda tarea antes de ser aprobada por el Orchestrator.
- Tras cualquier cambio en el flujo principal (onboarding → chat → llamada).
- En cada release.

**Responsabilidades:**
- Testear los cinco flujos críticos: onboarding, invitación, mensajes, llamada, archivos.
- Verificar que `conversationId` está presente en todos los eventos del flujo testeado.
- Generar informe en `docs/audit_reports/` con severidad y estado.
- Escalar bugs críticos al Orchestrator inmediatamente.

**Restricciones:**
- No implementa código.
- No prioriza bugs; reporta. La priorización es del Product y el CTO.

---

## UX

**Rol:** eliminar fricción de la experiencia de usuario.

**Actúa en:**
- Cualquier pantalla nueva o cambio de flujo.
- Revisión de onboarding y flujo principal.
- Estados vacíos, errores y estados de carga.

**Responsabilidades:**
- Test de 10 segundos: un usuario nuevo entiende qué es SPABLA sin leer nada.
- Flujo landing → primer mensaje traducido en máximo 3 pasos.
- Ningún estado vacío sin una acción sugerida.
- Área táctil mínima de 44×44px en todos los controles interactivos de llamada.
- Al colgar, el usuario vuelve al chat.

**No hace:** no implementa código, no define arquitectura.

---

## Security

**Rol:** proteger conversaciones y usuarios.

**Actúa en:**
- Cualquier cambio en autenticación, autorización o almacenamiento de datos.
- Antes de cada release.
- Ante cualquier propuesta que implique almacenar más datos de usuarios.

**Responsabilidades:**
- RLS verificado en todas las tablas antes de cualquier release.
- Sin credenciales en código versionado.
- `sender_id` nunca proviene del cliente sin validación server-side.
- Señalización con autenticación de `conversationId`.
- Informe de seguridad en `docs/audit_reports/` por trimestre.

**No hace:** no define features, no diseña UI.

---

## Growth

**Rol:** crecimiento sostenible del producto.

**Actúa en:**
- Tras el lanzamiento del beta con V1 estable.
- En revisiones periódicas de métricas.
- En propuestas de mejoras del funnel de activación.

**Responsabilidades:**
- Instrumentar los cinco eventos principales antes del beta.
- El link de invitación incluye `?ref={userId}` para atribución.
- No lanzar campañas de adquisición hasta que activación > 60% y retención D7 > 20%.
- Métricas revisadas en ciclos semanales.

**No hace:** no implementa features, no optimiza secundarios mientras el flujo principal esté roto.

---

## Tabla de asignación de tareas

| Tipo de tarea | Agente primario | Agentes de soporte |
|---|---|---|
| Decisión de arquitectura | CTO | Orchestrator |
| Nueva funcionalidad | Product | Frontend, Backend |
| Componente o UI | Frontend | UX |
| API, base de datos, auth | Backend | Security |
| Llamada, vídeo, audio, subtítulos | WebRTC | Backend, Frontend |
| Bug o regresión | QA | Agente del área afectada |
| Experiencia de usuario | UX | Product, Frontend |
| Vulnerabilidad o permiso | Security | Backend, CTO |
| Métricas o activación | Growth | Product |
| Conflicto entre agentes | Orchestrator | CTO |

---

## Reglas críticas del workflow

1. **Nunca optimizar funcionalidades secundarias mientras existan problemas en el flujo principal de conversación multilingüe.**

2. **Prioridad absoluta: llamada con traducción, voz y subtítulos.** Mientras este flujo no funcione de forma fiable, no se añade nada nuevo.

3. **La traducción no es el producto. La comunicación es el producto.** La traducción es infraestructura que debe ser invisible.

4. **Si existe conflicto entre estética, arquitectura y experiencia de conversación: priorizar experiencia de conversación.**

5. Todo agente lee el master antes de actuar. Sin excepción.

6. Un bug crítico (que viola el principio de conversación única) bloquea el release hasta estar resuelto.
