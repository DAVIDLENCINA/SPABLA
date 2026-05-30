# SPABLA — Registro de decisiones

Toda decisión con impacto arquitectural, de seguridad o de producto se registra aquí en orden cronológico inverso (la más reciente primero).

**Formato:**

```
## [YYYY-MM-DD] Título

**Decisión:** qué se decidió.
**Motivo:** por qué.
**Impacto:** qué cambia en el sistema.
**Agente responsable:** quién lo decidió.
**Estado:** vigente | superada | en revisión
```

---

## [2026-05-31] Bloque 1 ejecutado — conversationId como roomId de señalización en el chat

**Decisión:** `useWebRTC` ya no acepta un `roomId` generado con `Math.random()`. Acepta `conversationId: string | null` y lo usa directamente como identificador de sala en todos los eventos de Socket.io (`join-room`, `offer`, `answer`, `ice-candidate`). Si `conversationId` es `null` en el momento de llamar a `startCall`, la función retorna sin conectar.

**Motivo:** el `roomId` aleatorio hacía que dos usuarios de la misma conversación Supabase entraran en salas de señalización distintas. La llamada nunca conectaba a los participantes correctos. El principio fundamental del master — `conversationId` como entidad única del sistema — no se cumplía en la capa de señalización.

**Impacto:**
- `app/chat/page.tsx`: eliminada la línea `const [roomId] = useState(() => Math.random()...)`. El hook recibe `conversationId` directamente.
- `app/chat/hooks/useWebRTC.ts`: firma actualizada a `(conversationId: string | null)`, guard añadido en `startCall`, todas las referencias internas a `roomId` renombradas, dependencia de `useCallback` actualizada.
- `server/signaling.ts`: sin cambios. El servidor recibe el UUID del `conversationId` como nombre de sala en lugar de un string aleatorio de 6 caracteres. La lógica del servidor es agnóstica al formato del roomId.
- TypeScript: cero errores tras el cambio.

**Agente responsable:** Orchestrator / WebRTC

**Estado:** implementado — 2026-05-31

---

## [2026-05-31] Estructura documental estratégica

**Decisión:** se crea la estructura `docs/` con cinco documentos estratégicos:
- `docs/vision.md` — identidad, misión, principios, regla de oro
- `docs/product.md` — V1/V2/V3, flujo canónico, funciones no prioritarias
- `docs/architecture.md` — conversationId como sesión única, flujos de datos, prohibición de salas independientes
- `docs/workflow.md` — agentes, orden de trabajo, reglas críticas
- `docs/decisions.md` — este archivo

`SPABLA_MASTER.md` se convierte en el índice obligatorio que apunta a toda la documentación.

**Motivo:** la documentación estaba dispersa entre `SPABLA_MASTER.md`, `agents/` y `docs/` sin jerarquía clara. Cualquier agente (IA o humano) necesita un punto de entrada único que obligue a leer la visión, la arquitectura y las reglas antes de actuar.

**Impacto:** todos los agentes deben leer el master como primer paso de cualquier tarea. El master apunta a los docs específicos según el tipo de trabajo.

**Agente responsable:** Orchestrator

**Estado:** vigente

---

## [2026-05-30] Eliminación de /call/[roomId] como ruta de usuario

**Decisión:** la ruta `app/call/[roomId]/page.tsx` se elimina del flujo de usuario. La videollamada se renderiza exclusivamente dentro de `/chat` mediante `VideoOverlay.tsx`.

**Motivo:** SPABLA_MASTER.md establece que no existen salas independientes para videollamadas. La ruta `/call/[roomId]` es una sesión completamente desconectada de cualquier conversación: no tiene usuario autenticado, no escribe en Supabase, no tiene historial.

**Impacto:**
- `VideoOverlay.tsx` integra subtítulos y transcripción (funcionalidad que tenía `/call/[roomId]`).
- El código de Deepgram + subtítulos migra al hook `useWebRTC` o a un hook `useTranscription` separado.
- `app/call/[roomId]/page.tsx` se elimina o se convierte en redirect a `/chat`.

**Agente responsable:** CTO / Frontend / WebRTC

**Estado:** vigente — pendiente de implementar

---

## [2026-05-30] AudioWorklet en lugar de ScriptProcessorNode

**Decisión:** el procesado de audio para envío a Deepgram usa `AudioWorkletNode`, no el deprecado `ScriptProcessorNode`.

**Motivo:** `ScriptProcessorNode` está marcado como deprecado en la Web Audio API spec. Algunos navegadores ya muestran warnings; la eliminación es eventual. `AudioWorklet` procesa en un thread separado y no bloquea el hilo principal.

**Impacto:**
- Requiere un archivo Worklet (`audio-processor.js`) en `/public`.
- El hook `useWebRTC` carga el Worklet con `audioCtx.audioWorklet.addModule()`.
- Degradación graceful a `ScriptProcessorNode` si el navegador no soporta Worklets (documentado con warning).

**Agente responsable:** WebRTC

**Estado:** vigente — pendiente de implementar

---

## [2026-05-30] Supabase Auth en lugar de localStorage como identidad

**Decisión:** la identidad del usuario se gestiona con Supabase Auth. El `user.id` que aparece en `sender_id` de mensajes y eventos se obtiene de `supabase.auth.getUser()` en el servidor, no de `localStorage`.

**Motivo:** `localStorage` no es un mecanismo de autenticación. Cualquier usuario puede modificar `user.id` en devtools y enviar mensajes suplantando a otro usuario. Sin autenticación real, RLS no puede ser efectivo.

**Impacto:**
- `onboarding/page.tsx` usa `supabase.auth.signUp()` o `signInAnonymously()` además de insertar en la tabla `users`.
- `chat/page.tsx` lee la sesión con `supabase.auth.getSession()`.
- El `sender_id` en `INSERT messages` se toma de la sesión, no del body.
- `localStorage` puede mantenerse como cache de display (nombre, idioma) pero no como fuente de identidad.

**Agente responsable:** Security / Backend

**Estado:** vigente — pendiente de implementar

---

## [2026-05-30] OpenAI GPT-4o-mini como proveedor único de traducción

**Decisión:** toda traducción del sistema (mensajes de chat y subtítulos de llamada) pasa exclusivamente por `/api/translate`, que usa OpenAI GPT-4o-mini.

**Motivo:** existían dos proveedores: OpenAI en el chat y MyMemory (servicio gratuito sin API key) en la videollamada standalone. MyMemory tiene rate limits severos, calidad inferior y sin SLA. La inconsistencia produce traducciones de calidad diferente según el contexto.

**Impacto:**
- `call/[roomId]/page.tsx` elimina el fetch directo a `mymemory.translated.net`.
- El servidor de señalización llama a `/api/translate` para traducir subtítulos antes de emitirlos.
- El endpoint `/api/translate` incluye rate limiting por `user_id`.

**Agente responsable:** CTO / Backend

**Estado:** vigente — parcialmente implementado (falta el servidor de señalización)

---

## [2026-05-30] conversationId como roomId de señalización

**Decisión:** el identificador de sala en el servidor Socket.io es siempre el `conversationId` de Supabase. Se elimina la generación de `roomId` con `Math.random()`.

**Motivo:** SPABLA_MASTER.md establece como principio fundamental que no existen salas independientes. El `conversationId` es la entidad central; la sala de llamada es una manifestación de la conversación, no una entidad separada.

**Impacto:**
- `useWebRTC` recibe `conversationId` como parámetro, no genera un ID propio.
- `app/chat/page.tsx` elimina `const [roomId] = useState(() => Math.random()...)`.
- El servidor de señalización valida `conversationId` contra Supabase antes de procesar `join-room`.
- La ruta `/call/[roomId]` se elimina del flujo de usuario normal.

**Agente responsable:** CTO / Orchestrator

**Estado:** vigente — pendiente de implementar
