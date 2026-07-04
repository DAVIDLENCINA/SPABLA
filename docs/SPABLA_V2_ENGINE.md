# SPABLA Engine — Núcleo V2

Documento de Fase 0.1. Cero código funcional. Define el motor propio de SPABLA sobre el que se construyen todos los módulos.

Este documento **complementa y precisa** `SPABLA_V2_ARCHITECTURE.md`. Donde el anterior describía módulos con dependencias declaradas entre sí, este introduce una regla más estricta: **los módulos no se hablan directamente — todo pasa por el Engine**.

---

## 1. Qué es SPABLA Engine

**SPABLA Engine es un mediador con estado propio y máquinas de estados internas. Es la única fuente de verdad para las tres primitivas del sistema (conversación, participantes, sesión de llamada) y el único canal de comunicación entre módulos.**

No es una librería de tipos. No es un context de React. No es un event bus pasivo. Es un runtime con:

- Estado interno propio, aislado del mundo exterior.
- Máquinas de estados finitas y explícitas para cada primitiva.
- Un bus de eventos tipado hacia afuera (pub/sub).
- Un conjunto reducido de comandos entrantes que ejecutan transiciones validadas.
- Adaptadores hacia servicios externos, invocados solo desde dentro del Engine.

**Metáfora útil:** el Engine es un servidor local en el mismo proceso, con puertos de entrada (comandos) y salidas (eventos). Los módulos son clientes de ese servidor. No hay clientes hablando entre sí.

---

## 2. Qué controla

El Engine posee de forma exclusiva:

1. **El grafo de estado.** Toda `ConversationSession`, todo `Participant`, todo `LanguagePair`, toda `CallSession` viven **dentro** del Engine. Ningún módulo mantiene su propia copia.
2. **Las transiciones de estado.** Toda transición pasa por una máquina de estados codificada. Los inputs son comandos, los outputs son eventos. No hay "escribir directamente al estado".
3. **La validación de invariantes.** El Engine rechaza cualquier comando que violaría un invariante antes de aplicarlo. Los invariantes se codifican en tipos y en asserts ejecutables.
4. **La orquestación de adaptadores externos.** El Engine decide cuándo abrir/cerrar STT, cuándo invocar traducción, cuándo emitir a Socket, cuándo tocar Supabase. Nadie más los invoca.
5. **La emisión de eventos hacia módulos.** Los módulos consumen eventos tipados. No consultan estado directamente (pull); reciben notificaciones (push).
6. **El ciclo de vida de una llamada.** Desde `initiate` hasta `end`, con cleanup determinista y en orden inverso al arranque.
7. **La resolución de precondiciones.** El Engine es el único que decide si un comando es viable (ej: `initiateCall` requiere `LanguagePair` válido; el Engine lo comprueba antes de aceptar).
8. **La telemetría estructurada.** Cada transición y cada comando emiten un evento auditable con `timestamp`, `commandId`, `causedBy`, `outcome`.

---

## 3. Qué NO controla

El Engine explícitamente **no** hace estas cosas — otros módulos las hacen, guiados por eventos del Engine:

1. **UI.** El Engine no renderiza. No conoce React. Ningún tipo del Engine referencia JSX, DOM, componentes, refs, hooks.
2. **Renderizado de burbujas.** El módulo `bubbles` traduce eventos del Engine (`translation.emitted`) en burbujas visibles. El Engine no sabe qué es una burbuja.
3. **Tonos de llamada.** El módulo `ring` traduce eventos del Engine (`call.state.changed`) en oscillators. El Engine no sabe qué es un ringtone.
4. **Reproducción de audio.** El módulo `tts-player` recibe chunks vía evento y los reproduce. El Engine no sabe qué es un `AudioContext`.
5. **Quirks de iOS Safari.** El módulo `audio-capture` encapsula unlocks de AudioContext en gesture handlers. El Engine no sabe qué es Safari.
6. **HTTP directo, WebSocket directo, WebRTC directo.** El Engine invoca adaptadores; los adaptadores hablan con el mundo. El Engine no llama a `fetch`, ni construye `RTCPeerConnection`, ni abre `io()` client.
7. **Inferencia con IA.** Ningún prompt vive en el Engine. Vive en el adaptador correspondiente (STT, MT, TTS). El Engine solo conoce los contratos de entrada/salida de esos adaptadores.
8. **Persistencia directa.** El Engine no ejecuta SQL. Invoca al adaptador `SupabaseAdapter` con comandos semánticos.
9. **Autenticación.** El Engine recibe una identidad ya resuelta (`Participant.userId`, `Participant.token`). No lee cookies, no llama a `getSession`.
10. **Rutas de la app / URLs.** Next.js router es cosa del módulo `app/`. El Engine no sabe de rutas.

---

## 4. Contrato CallSession

Estructura inmutable con máquina de estados finita.

```
type CallSession = {
  id:                UUID;              // asignado por Engine al crear
  conversationId:    UUID;
  caller:            Participant;       // ver §6
  callee:            Participant;
  languagePair:      LanguagePair;      // ver §7 — VALIDADO en creación
  mode:              "voice" | "video";
  state:             CallState;
  createdAt:         ISOTimestamp;
  acceptedAt?:       ISOTimestamp;
  endedAt?:          ISOTimestamp;
  endedBy?:          "caller" | "callee" | "network" | "timeout";
};

type CallState =
  | "idle" | "ringing" | "incoming" | "accepted"
  | "ended" | "rejected" | "missed" | "cancelled";
```

### Invariantes

1. Una `CallSession` no puede existir sin `languagePair` válido (§7). El constructor del Engine rechaza cualquier intento sin él.
2. Transiciones de estado autorizadas — cualquier otra lanza excepción documentada:
   ```
   Caller side:  idle → ringing → accepted → ended
                              ↓         ↓
                       cancelled  ended (terminal)
                              ↓
                    missed | rejected  (terminales)

   Callee side:  idle → incoming → accepted → ended
                               ↓          ↓
                        rejected     ended (terminal)
                               ↓
                          missed  (terminal)
   ```
3. `state` es monótono: nunca revierte a un estado anterior. Terminal es terminal.
4. `endedAt` solo se puebla en la transición hacia `ended | rejected | missed | cancelled`.
5. La `CallSession` es inmutable desde fuera del Engine. Los módulos reciben snapshots (copias) vía eventos, no referencias mutables.

---

## 5. Contrato ConversationSession

Representa una conversación cargada por el cliente local, con sus participantes.

```
type ConversationSession = {
  id:              UUID;
  createdAt:       ISOTimestamp;
  participants:    ReadonlyArray<Participant>;   // mín 1 (el usuario local), máx 2 en V2
  localParticipant: Participant;                 // shortcut al miembro que soy yo
  remoteParticipant?: Participant;               // undefined hasta que el otro entra
  languagePair?:   LanguagePair;                 // undefined hasta remote + validación
  createdCallSessions: ReadonlyArray<UUID>;      // historial de CallSession.id
};
```

### Invariantes

1. `localParticipant` siempre está presente. Si no hay usuario autenticado, no hay `ConversationSession`.
2. `remoteParticipant` puede ser undefined transitoriamente. Cuando aparece (evento `participant.joined`), el Engine intenta computar `languagePair`.
3. `languagePair` está definido solo cuando ambos participantes tienen `language` distintos y no nulos. El Engine emite `languagePair.resolved` al lograrlo, o `languagePair.unresolvable` si son iguales o si el timeout de resolución expira.
4. `ConversationSession` es inmutable desde fuera. Cambios provocan nuevos snapshots por evento.

---

## 6. Contrato Participant

```
type Participant = {
  userId:      UUID;
  displayName: string;
  language:    LangCode | null;    // null solo transitoriamente antes de load
  role:        "local" | "remote";
  joinedAt:    ISOTimestamp;       // cuándo entró a la ConversationSession
  isOnline:    boolean;            // presencia realtime
};

type LangCode = "es" | "en" | "fr" | "de" | "it" | "pt" | "ja" | "zh" | "ar" | "ru";
```

### Invariantes

1. `language === null` es tolerado solo hasta que Supabase resuelve el user. Tras el primer resolve, no puede volver a null en la misma sesión.
2. `role === "local"` es único por `ConversationSession` (solo un yo).
3. `role === "remote"` puede aparecer y desaparecer si el otro cierra la pestaña — pero `Participant` no se elimina, solo `isOnline` cambia a `false`.
4. `userId` es opaco al Engine — no lee metadata más allá del contrato.

---

## 7. Contrato LanguagePair

Primitiva pequeña pero central. Su existencia es la precondición dura para toda llamada.

```
type LanguagePair = {
  from: LangCode;
  to:   LangCode;
  // Constructor privado — solo el Engine puede instanciar.
  // Rechaza from === to.
};
```

### Invariantes

1. `from !== to`. Si alguien intenta construir `LanguagePair { from: "es", to: "es" }`, el Engine lanza `LanguagePairInvalidError` y no lo instancia.
2. Un `LanguagePair` es siempre direccional. `{ from: es, to: en }` es distinto de `{ from: en, to: es }`. La `CallSession` guarda el par desde el punto de vista del hablante que arrancó el turno actual.
3. Un `LanguagePair` no muta. Si el usuario cambia de idioma mid-call, se crea uno nuevo y el Engine emite `languagePair.changed`, disparando teardown+setup de STT/MT/TTS de forma controlada.

**Esta es la corrección directa del defecto raíz de V1** — donde el idioma vivía en 4 sitios distintos (state React, ref mirror, prop de useWebRTC, ref interno del hook, socket.data del server) y se desincronizaba. Aquí vive en un solo lugar dentro del Engine.

---

## 8. Eventos internos

El Engine emite eventos tipados hacia afuera. Los módulos se suscriben. Nada más los emite.

### Eventos de conversación

```
conversation.loaded            { conversation: ConversationSession }
participant.joined             { participant: Participant }
participant.left               { participantId: UUID }
languagePair.resolved          { pair: LanguagePair }
languagePair.unresolvable      { reason: "same-language" | "timeout" | "no-remote" }
languagePair.changed           { from: LanguagePair; to: LanguagePair }
```

### Eventos de llamada

```
call.initiated                 { session: CallSession }        // caller
call.incoming                  { session: CallSession }        // callee
call.accepted                  { session: CallSession }        // ambos
call.rejected                  { session: CallSession }
call.cancelled                 { session: CallSession }
call.missed                    { session: CallSession }
call.ended                     { session: CallSession }        // terminal
call.state.changed             { session: CallSession; previousState: CallState }
```

### Eventos de pipeline de traducción

```
turn.started                   { turnId: UUID; callSessionId: UUID; speaker: "local" | "remote" }
utterance.partial              { turnId: UUID; text: string }
utterance.final                { turnId: UUID; text: string }
translation.emitted            { turnId: UUID; source: string; target: string; pair: LanguagePair }
translation.failed             { turnId: UUID; stage: "stt" | "mt" | "tts"; reason: string }
audio.chunk.produced           { turnId: UUID; seq: number; payload: bytes }
turn.completed                 { turnId: UUID }
```

### Eventos de adaptadores

```
adapter.stt.status             { state: "idle" | "connecting" | "ready" | "closed" | "error" }
adapter.mt.status              { state: "idle" | "ready" | "error" }
adapter.tts.status             { state: "idle" | "streaming" | "drained" | "error" }
adapter.socket.status          { state: "disconnected" | "connecting" | "connected" }
adapter.webrtc.status          { state: "idle" | "negotiating" | "connected" | "failed" | "closed" }
adapter.supabase.status        { state: "connected" | "reconnecting" | "offline" }
```

### Eventos de telemetría (siempre emitidos)

```
telemetry.command.received     { commandName: string; commandId: UUID; ts: number }
telemetry.command.rejected     { commandId: UUID; reason: string }
telemetry.state.transition     { primitive: string; from: string; to: string; causedBy: UUID }
telemetry.invariant.violated   { primitive: string; invariant: string; details: object }
```

**Regla:** todos los eventos llevan `ts: ISOTimestamp` y un `correlationId: UUID` que enlaza cadenas causales (comando → transición → eventos derivados).

---

## 9. Estados permitidos

Máquinas de estados finitas explícitas. Cualquier transición no listada aquí es un bug del Engine.

### `CallState` — ver §4

Listado exhaustivo de transiciones válidas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `ringing` | comando `initiate` (caller) |
| `idle` | `incoming` | evento remoto (callee) |
| `ringing` | `accepted` | evento remoto: callee aceptó |
| `ringing` | `cancelled` | comando `cancel` (caller) |
| `ringing` | `missed` | timeout 30 s sin respuesta |
| `ringing` | `rejected` | evento remoto: callee rechazó |
| `incoming` | `accepted` | comando `accept` (callee) |
| `incoming` | `rejected` | comando `reject` (callee) |
| `incoming` | `cancelled` | evento remoto: caller canceló |
| `incoming` | `missed` | timeout 30 s |
| `accepted` | `ended` | comando `end` (cualquiera) o desconexión de red |

Estados terminales: `ended`, `rejected`, `missed`, `cancelled`. Terminal significa que la `CallSession` queda archivada y no admite más transiciones.

### Estado de resolución de `LanguagePair`

Sub-máquina interna del Engine, no expuesta directamente:

| Desde | A | Trigger |
|---|---|---|
| `unresolved` | `resolving` | `conversation.loaded` con `remoteParticipant` presente |
| `unresolved` | `resolving` | `participant.joined` con role `remote` |
| `resolving` | `resolved` | ambos participantes tienen `language` con `from !== to` |
| `resolving` | `unresolvable-same` | ambos languages iguales |
| `resolving` | `unresolvable-timeout` | 30 s sin remote joined |
| `resolved` | `resolving` | `participant.language.changed` (usuario cambia idioma) |

Solo desde `resolved` es viable el comando `initiateCall` o `acceptCall`.

### Estado del pipeline por turno

Cada `turnId` recorre su propia mini-FSM. Turnos son independientes entre sí (múltiples pueden estar en distintos estados simultáneamente).

| Desde | A | Trigger |
|---|---|---|
| `capturing` | `transcribing` | primer partial STT recibido |
| `transcribing` | `translating` | evento `utterance.final` |
| `transcribing` | `dropped` | `call.ended` mid-turn |
| `translating` | `synthesizing` | evento `translation.emitted` |
| `translating` | `failed` | error en adaptador MT |
| `synthesizing` | `completed` | último chunk TTS entregado |
| `synthesizing` | `failed` | error en adaptador TTS |

Turno `completed` o `failed` es terminal.

---

## 10. Adaptadores externos

El Engine define **interfaces** para hablar con el mundo. Las implementaciones concretas viven en `adapters/` y son sustituibles.

**Regla común a todos los adaptadores:** implementan una interfaz mínima, no exponen su estado interno más allá de la interfaz, y NO son invocados desde módulos consumidores — solo desde el Engine.

### 10.1 STTAdapter

```
interface STTAdapter {
  open(pair: LanguagePair, options: STTOptions): Promise<STTHandle>;
  // STTHandle emite eventos partial/final vía callbacks tipados.
  // La instancia se cierra vía handle.close().
}
```

Implementación por defecto Fase 3: `DeepgramLiveAdapter`. Sustituible por `WhisperStreamingAdapter` sin tocar el Engine.

### 10.2 TranslationAdapter

```
interface TranslationAdapter {
  translate(request: {
    text: string;
    from: LangCode;
    to: LangCode;
    turnId: UUID;
  }): Promise<{ turnId: UUID; translated: string }>;
}
```

Implementación por defecto Fase 4: `OpenAIChatAdapter` (llama a `gpt-4o-mini`). Prompt encapsulado dentro del adaptador. El Engine no ve el prompt.

### 10.3 TTSAdapter

```
interface TTSAdapter {
  synthesize(request: {
    text: string;
    language: LangCode;
    turnId: UUID;
  }): AsyncIterable<{ turnId: UUID; seq: number; payload: bytes }>;
}
```

Streaming por diseño. Implementación por defecto Fase 5: `ElevenLabsStreamingAdapter`.

### 10.4 WebRTCAdapter

```
interface WebRTCAdapter {
  open(session: CallSession, signalingChannel: SignalingChannel): Promise<PeerHandle>;
  // PeerHandle expone: addLocalTrack, onRemoteTrack, close, upgradeToVideo.
}
```

Implementación única: `NativeRTCAdapter` (envuelve `RTCPeerConnection`).

### 10.5 SocketAdapter

```
interface SocketAdapter {
  connect(url: string, auth: { token: string }): Promise<SocketHandle>;
  // SocketHandle expone: emit(event, payload), on(event, handler), close.
}
```

Implementación por defecto: `SocketIOAdapter`. Sustituible por WebSocket puro sin tocar el Engine.

### 10.6 SupabaseAdapter

```
interface SupabaseAdapter {
  loadUser(userId: UUID):                              Promise<User>;
  loadConversation(id: UUID):                          Promise<ConversationRow>;
  listParticipants(conversationId: UUID):              Promise<ParticipantRow[]>;
  subscribeToParticipants(conversationId: UUID,
                          onChange: (rows: ParticipantRow[]) => void): Unsubscribe;
  insertParticipant(conversationId: UUID, userId: UUID): Promise<void>;
  createCallSignal(...):                               Promise<UUID>;
  updateCallSignal(id: UUID, status: string):          Promise<void>;
  subscribeToCallSignals(conversationId: UUID,
                         onChange: (row: CallSignalRow) => void): Unsubscribe;
  insertMessage(...):                                  Promise<void>;
  subscribeToMessages(conversationId: UUID,
                      onNew: (row: MessageRow) => void): Unsubscribe;
}
```

Encapsula RLS, políticas, y realtime channels. El Engine no ve SQL, ni policies, ni channel names.

---

## Reglas de arquitectura obligatorias

Las siguientes son duras. Su incumplimiento invalida un commit en review.

1. **Cero dependencia directa entre módulos.**
   - Ningún módulo importa a otro módulo. Todo va vía `SPABLA Engine` (suscribiéndose a eventos o mandando comandos).
   - Verificable con lint rule sobre imports de `modules/*`.

2. **Límite de tamaño de archivo.**
   - Cada archivo `.ts` / `.tsx` cabe en **300 líneas o menos** durante desarrollo activo.
   - **400 es el límite absoluto**. Cualquier archivo que llegue a 400 lanza error en pre-commit hook (o CI). Refactor obligatorio antes de merge.
   - El Engine mismo debe repartirse en submódulos internos si crece: `engine/state-machine.ts`, `engine/event-bus.ts`, `engine/invariants.ts`, `engine/command-router.ts`, etc.

3. **Cero código funcional fuera de los adaptadores para hablar con el exterior.**
   - Ni componentes React ni hooks pueden llamar `fetch`, ni abrir `WebSocket`, ni instanciar `RTCPeerConnection`, ni acceder a `supabase.from(...)` directamente.
   - Todo pasa por adaptadores, todos los adaptadores pasan por el Engine.

4. **Ningún prompt de IA fuera de su adaptador.**
   - `system_prompt`, `instructions`, `tools` viven exclusivamente dentro de `adapters/openai-*.ts`, `adapters/deepgram-*.ts`, etc.
   - El Engine invoca `translate(...)`, no sabe qué prompt lleva.

5. **Nunca compartir estado por refs.**
   - Ningún `useRef` para "compartir" datos entre módulos. Refs son solo para DOM elements o para escapar closure staleness dentro de un mismo hook.
   - Todo estado compartido vive en el Engine y se lee vía snapshot de evento.

---

## Definición operativa de "estable"

Una versión de V2 (fase o release) es **estable** si y solo si cumple **los cinco** criterios abajo. "Ha funcionado una vez" no cuenta.

1. **Prueba repetible documentada.**
   - Existe un guion de prueba escrito (`docs/phases/phase-N-test-script.md`) con pasos exactos, dispositivos, y resultados esperados.
   - La prueba se ha ejecutado al menos **tres veces por dos personas distintas** (o dos sesiones separadas por al menos 24 h con contexto reseteado), con resultado idéntico.

2. **Invariantes codificadas ejecutables.**
   - Cada invariante del Engine (§4, §5, §6, §7, §9) tiene un test unitario que la verifica.
   - Los tests pasan en CI, no solo en local.

3. **Cleanup verificado.**
   - En los tres escenarios (caller cuelga, callee cuelga, red muere), los eventos `adapter.*.status` llegan a `closed`/`idle`/`offline` dentro de 5 s del `call.ended`.
   - Ningún evento `telemetry.*` posterior a `call.ended` durante 30 s.

4. **Sin regresiones.**
   - El test script de la fase N-1 se ejecuta tras cerrar N, y sigue pasando.

5. **Tag protegido + doc de fase + smoke tests en CI.**
   - `v2-phase-N-<slug>` en origin.
   - `docs/phases/phase-N.md` con qué se hizo, qué se probó, qué queda fuera.
   - Smoke tests que arrancan la app y validan que los módulos suscriben a los eventos que declaran.

Una versión que no cumpla los cinco se considera **candidata**, no estable. Se documenta como candidata y se itera hasta cumplir los cinco.

---

## Consecuencia sobre `SPABLA_V2_ARCHITECTURE.md`

El documento anterior queda vigente en su descripción de fases, estructura de carpetas y flujos generales. Pero:

- La tabla de dependencias del §2 de arquitectura (donde módulos declaraban dependencias directas) **se sustituye por: "todo módulo depende únicamente del Engine"**.
- El "contrato `CallSession`" del §3 de arquitectura queda ampliado por este documento (§4 + §5 + §6 + §7).
- Los flujos de llamada y traducción (§4 y §5 de arquitectura) se reformulan mentalmente como: los módulos reaccionan a eventos del Engine; no ejecutan flujos por su cuenta.

Este documento es la base **antes** de programar la Fase 1. Ninguna línea de código funcional se escribe hasta que este documento y el anterior estén validados y aceptados.
