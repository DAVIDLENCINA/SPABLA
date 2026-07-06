# SPABLA V2 — Fase 3: STT Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 3 antes de escribir código.
Base: tag `spabla-v2-phase-2-messaging-2026-07-04` @ `4229cda`.

Este documento **NO autoriza** implementación. Cuando la implementación abra, será
en la rama `spabla-v2/fase-3-stt` desde el tag base, con commit único al cierre.

---

## 1. Objetivo de Fase 3

Construir el módulo **STT** (Speech-to-Text) del Engine. Modelo puro en memoria:
sesiones, turnos, parciales, finales, transiciones de estado, gestión de errores
y superficie pública en `SpablaCore`. **Sin proveedor real de STT. Sin captura
real de audio.** Los tests inyectan chunks binarios simulados y verifican el
pipeline de eventos.

Al cierre de Fase 3 un consumidor de `SpablaCore` puede:
- Iniciar una sesión de STT vinculada a una `CallSession` en estado `accepted`.
- Enviar chunks de audio (bytes opacos) al motor.
- Recibir eventos `stt.partial`, `stt.final`, `stt.failed` con `turnId` estable.
- Detener la sesión limpiamente.
- Recibir eventos atribuidos a la etapa exacta en caso de fallo.

---

## 2. Qué problema resuelve

Hoy el Engine no tiene concepto de voz. `SpablaCore` no puede:
- Reflejar que un usuario está hablando dentro de una llamada.
- Emitir el texto transcribido de una intervención.
- Vincular una transcripción a una `CallSession` activa.
- Manejar el fallo de una sesión de STT (retry / dropout / silence).

Sin estos primitivos, la Fase 4 (traducción de texto) no tiene fuente que
consumir y la Fase 5 (TTS) tampoco tiene disparador. Fase 3 provee el primer
eslabón del pipeline **capture → STT → MT → TTS**, aislado del transporte y del
proveedor real.

---

## 3. Qué NO hará todavía

Explícito para evitar arrastre:

- **No integración con proveedor real** (Deepgram Live, OpenAI Realtime,
  Whisper streaming). El `STTAdapter` definido en Fase 1.5 permanece como
  interface no implementada; **no se abre en esta fase**.
- **No captura real** desde `navigator.mediaDevices` ni `MediaStream`.
- **No `AudioContext` / `ScriptProcessorNode` / `AudioWorklet`.**
- **No decimación / conversión de sample rate.** Los chunks entran como bytes
  opacos (`Uint8Array`) y se registran sin transformación.
- **No transporte real.** Los chunks se inyectan directamente vía comando en
  tests.
- **No VAD real.** Los turnos se abren/cierran por acción explícita
  (comando en tests o adaptador futuro). No hay detección automática de habla
  en Fase 3.
- **No integración con `TurnPipelineManager`** (existe desde Fase 1.5 pero
  Fase 3 mantiene STTTurn como snapshot propio; la orquestación cross-eslabón
  llega en Fase 5-6).

---

## 4. Módulos exactos a crear

Un módulo interno + una máquina de estados.

| Módulo | Responsabilidad única |
|---|---|
| `stt/STTManager` | Owner exclusivo de `STTSession` + `STTTurn` snapshots. Recibe chunks, acepta comandos simulados de partial/final/error, aplica la máquina de estados, emite eventos. |
| `stt/stt-session-machine` | Máquina finita para `STTSessionState`, reutilizando la primitiva `StateMachine` de Fase 1. |

**No se crea `STTTurnManager` separado.** Los turnos viven dentro de `STTManager`
(uno activo a la vez por sesión, coherente con la decisión de producto 1-a-1 =
un speaker por sesión).

---

## 5. Archivos exactos previstos

**Nuevos (5 archivos):**
```
engine/src/stt/
├── STTManager.ts                (~260 líneas estimadas)
├── STTManager.test.ts           (~300 líneas estimadas)
└── stt-session-machine.ts       (~40 líneas estimadas)

engine/src/types/
└── stt.ts                       (~120 líneas estimadas — los 5 contratos)
```

**Modificados (aditivos, sin refactor):**
```
engine/src/types/events.ts        (+5 eventos, ~35 líneas)
engine/src/engine/types.ts        (+1 línea — `stt: STTManager`)
engine/src/engine/Engine.ts       (+~8 líneas — construir STTManager + accessor)
engine/src/engine/Engine.test.ts  (+~10 líneas — test de inyección)
engine/src/core-api/SpablaCore.ts (+~65 líneas — 3 métodos + 3 simulate* + snapshots)
engine/src/core-api/SpablaCore.test.ts (+~230 líneas)
engine/src/core-api/types.ts      (+~35 líneas — inputs/outputs de los 3 métodos)
engine/src/index.ts               (+~18 líneas — exports)
```

**Total estimado:** ~700 líneas nuevas de fuente + ~530 líneas nuevas de tests.

**Advertencia de caps:** `Engine.ts` (296) y `SpablaCore.ts` (288) están cerca
del cap de 300. Al añadir integración, si superan 300 se aplicará el patrón de
Fase 1.5: extraer bloques auxiliares a un archivo hermano (`engine/types.ts` /
`core-api/messaging-support.ts` / etc.) antes de commitear.

---

## 6. Contratos necesarios

Cinco tipos, todos `Readonly` con snapshots frozen. Definidos en
`engine/src/types/stt.ts`.

### 6.1 `STTSession`

```
type STTSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  speaker: "local" | "remote";
  state: STTSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;      // paso a listening
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  currentTurnId: UUID | undefined;           // turno en curso, si lo hay
  turnCount: number;                         // cuántos turnos ha producido
  bytesReceived: number;                     // acumulado de chunks pushados
}>;
```

### 6.2 `STTTurn`

```
type STTTurn = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  callSessionId: UUID;                       // conveniencia para consumers
  startedAt: ISOTimestamp;
  endedAt: ISOTimestamp | undefined;
  partials: ReadonlyArray<STTPartial>;       // orden monotónico por seq
  final: STTFinal | undefined;               // presente solo tras stt.final
  isActive: boolean;                         // true entre open y close
}>;
```

### 6.3 `STTPartial`

```
type STTPartial = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  seq: number;                               // 0-based, monotónico dentro del turno
  text: string;                              // texto acumulado / snapshot
  receivedAt: ISOTimestamp;
}>;
```

### 6.4 `STTFinal`

```
type STTFinal = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  text: string;
  language: LangCode | null;                 // idioma detectado / declarado
  receivedAt: ISOTimestamp;
}>;
```

### 6.5 `STTError`

```
type STTError = Readonly<{
  sessionId: UUID;
  turnId: UUID | undefined;                  // si el error afecta a un turno
  code: string;                              // "audio-format" | "provider-timeout" | ...
  message: string;
  receivedAt: ISOTimestamp;
}>;
```

---

## 7. Estados permitidos (`STTSessionState`)

Máquina finita explícita. Terminales: `completed`, `failed`.

```
type STTSessionState =
  | "idle"          // creada, sin comandos aún (transitorio interno)
  | "listening"     // esperando audio o entre turnos
  | "transcribing"  // procesando audio de un turno activo
  | "completed"     // terminal — stopSTT completado
  | "failed";       // terminal — error irrecuperable
```

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `listening` | interno tras `createSession` — antes de emitir `stt.session.started` |
| `idle` | `failed` | error de arranque (raro; presente por completitud) |
| `listening` | `transcribing` | primer chunk recibido O `simulatePartial` sin turno activo |
| `listening` | `completed` | comando `stop` sin turno activo |
| `listening` | `failed` | `simulateError` |
| `transcribing` | `listening` | `simulateFinal` cierra el turno actual y no hay más pendiente |
| `transcribing` | `completed` | comando `stop` — el turno en curso se cierra sin final |
| `transcribing` | `failed` | `simulateError` |
| terminal (`completed` / `failed`) | — | ninguna salida permitida |

**Nota:** `idle` es transitorio interno. Los consumidores nunca ven una sesión en
`idle` a través de eventos — la sesión se emite ya como `listening` con
`stt.session.started`.

---

## 8. Eventos que emitirá

Cinco eventos añadidos a la unión `EngineEvent`. Todos con `meta { ts, correlationId }`.

| Nombre | Payload |
|---|---|
| `stt.session.started` | `{ session: STTSession }` |
| `stt.partial` | `{ session: STTSession; turn: STTTurn; partial: STTPartial }` |
| `stt.final` | `{ session: STTSession; turn: STTTurn; final: STTFinal }` |
| `stt.failed` | `{ session: STTSession; error: STTError; previousState: STTSessionState }` |
| `stt.session.ended` | `{ session: STTSession }` |

Todos entregados por el mismo `EventBus` — accesibles vía `SpablaCore.subscribe(name, handler)`.

---

## 9. Métodos públicos previstos en `SpablaCore`

### 9.1 `startSTT(input): StartSTTResult`

Firma: `startSTT({ callId, speaker }) → { sessionId }`.

Precondiciones:
- Conversation cargada.
- `CallSession(callId)` existe y está en estado `accepted`.
- No hay ya una `STTSession` no-terminal para ese `(callId, speaker)`.

Efecto:
- Crea `STTSession` internamente en `idle`, transiciona a `listening`.
- Emite `stt.session.started` con el snapshot final.
- Devuelve `{ sessionId }`.

### 9.2 `stopSTT(input): void`

Firma: `stopSTT({ sessionId })`.

Precondiciones:
- La sesión existe.
- La sesión NO está en estado terminal.

Efecto:
- Si hay turno activo, se cierra sin `stt.final` (partial "abandoned").
- Transiciona la sesión a `completed`.
- Emite `stt.session.ended`.

### 9.3 `pushAudioChunk(input): void`

Firma: `pushAudioChunk({ sessionId, chunk })` donde `chunk: Uint8Array`.

**En Fase 3 el chunk es opaco.** El manager registra la llegada pero no procesa
audio. Se usa para:
1. Incrementar `STTSession.bytesReceived`.
2. Provocar la transición `listening → transcribing` la primera vez que llega
   un chunk dentro de una ventana activa.

Precondiciones:
- La sesión existe y NO está en terminal.

### 9.4 Métodos `simulate*` (Fase 3 wire-in de adaptadores)

**Marcados en JSDoc como `wire-in points for adapters / tests` — no forman parte
de la API estable de consumo final.** Serán invocados por el `STTAdapter` real
en Fase 4+, y hoy por los tests de Fase 3.

- **`simulateSTTPartial({ sessionId, text })`** — abre un turno si no hay uno
  activo, empuja un partial con `seq` incrementado, emite `stt.partial`.
- **`simulateSTTFinal({ sessionId, text, language? })`** — cierra el turno
  activo, emite `stt.final`, transiciona la sesión de `transcribing` a
  `listening`.
- **`simulateSTTError({ sessionId, code, message })`** — emite `stt.failed`,
  transiciona a `failed` (terminal).

### 9.5 Snapshots read-only nuevos

- `getSTTSession(sessionId): STTSession | undefined`
- `getSTTTurn(turnId): STTTurn | undefined`
- `listActiveSTTSessions(callId): ReadonlyArray<STTSession>`

---

## 10. Tests exactos previstos

**Total: 55 tests nuevos** (25 STTManager + 30 SpablaCore).
Suite total tras Fase 3: **319 tests** (264 previos + 55).

### 10.1 `STTManager.test.ts` (25 tests)

**createSession (5)**
- crea sesión, transiciona `idle → listening` inmediatamente, emite `stt.session.started`
- rechaza duplicate sessionId
- guarda `callSessionId` y `speaker` verbatim
- snapshot congelado
- `get(sessionId)` devuelve la sesión

**pushChunk / open turn (5)**
- primer chunk transiciona `listening → transcribing`
- abre un `STTTurn` con `isActive: true`
- chunks subsiguientes NO abren un turno nuevo si ya hay uno
- rechaza chunk si la sesión no existe
- rechaza chunk si la sesión está en terminal

**partial + final (6)**
- `simulatePartial` emite `stt.partial` con `seq` monotónico
- múltiples partials del mismo turno comparten `turnId`
- `simulateFinal` emite `stt.final` con `text` y `language`
- `simulateFinal` transiciona `transcribing → listening` y cierra el turno
- el turno cerrado conserva sus partials + final
- `simulateFinal` sin turno activo lanza error

**stop + errors (5)**
- `stop` en `listening` sin turno → `completed`, emite `stt.session.ended`
- `stop` en `transcribing` con turno activo → `completed`, cierra el turno sin final
- `stop` en estado terminal es idempotente (no re-emite)
- `simulateError` transiciona a `failed`, emite `stt.failed` con `previousState`
- `simulateError` en estado terminal es rechazado

**Queries + immutability (4)**
- `list(sessionId)` devuelve turnos en orden cronológico
- turnos cerrados son inmutables (nueva referencia frozen tras cada mutación)
- `getSTTTurn(unknown)` devuelve `undefined`
- `listActiveSessions(callId)` filtra por callId y excluye terminales

### 10.2 `SpablaCore.test.ts` — nuevos describes (30 tests)

**startSTT (5)**
- devuelve sessionId, `getSTTSession` refleja `listening`
- rechaza si no hay conversation cargada
- rechaza si la `CallSession` no existe
- rechaza si la `CallSession` no está en `accepted`
- emite `stt.session.started`

**stopSTT (5)**
- transiciona la sesión a `completed`
- emite `stt.session.ended`
- rechaza sessionId desconocido
- rechaza si la sesión ya está en terminal
- limpia `currentTurnId` si había turno activo

**pushAudioChunk (5)**
- primer chunk transiciona `listening → transcribing`
- chunks acumulan en `bytesReceived`
- rechaza sessionId desconocido
- rechaza si la sesión está en terminal
- múltiples chunks dentro de un turno no crean un turno nuevo

**simulatePartial / simulateFinal / simulateError (5)**
- `simulatePartial` propaga a subscribers y actualiza el turno actual
- `simulateFinal` cierra el turno y transiciona a `listening`
- `simulateError` transiciona a `failed`
- todos rechazan sessionId desconocido
- todos rechazan si la sesión está en terminal

**Eventos (5)**
- subscribe recibe los 5 nombres de eventos STT
- eventos llevan `meta.ts` y `meta.correlationId`
- unsubscribe corta la entrega
- eventos STT fluyen por el mismo bus que Engine + Messaging
- ordering: `stt.session.started` antes de cualquier `stt.partial`

**Encapsulación y compat (5)**
- SpablaCore no expone `STTManager` directamente
- `endCall` NO detiene automáticamente las STT (Fase 6 orquestará; Fase 3 lo deja explícito)
- `sendMessage` sigue funcionando durante una sesión STT activa
- los 264 tests de Fase 2 siguen verdes
- superficie pública: los 3 métodos + 3 `simulate*` + 3 snapshots están en el prototype

---

## 11. Qué está prohibido en Fase 3

Explícito para no arrastrar scope:

- **No Deepgram real.** Ningún import de `@deepgram/sdk`.
- **No OpenAI real.** Ningún fetch a `api.openai.com`.
- **No micrófono.** Ningún acceso a `navigator.mediaDevices`.
- **No audio de navegador.** Ningún `AudioContext`, `ScriptProcessorNode`,
  `AudioWorklet`, `MediaStream`.
- **No traducción.** `stt.final.language` es metadato; no hay salida traducida.
- **No TTS.** Ninguna salida de audio.
- **No WebRTC.** Ningún `RTCPeerConnection`.
- **No UI.** Ningún componente React.
- **No React.** Ninguna dependencia.
- **No Supabase real.** Sin persistencia.
- **No tocar V1.** `git diff` sobre `app/`, `server/` debe seguir en 0.
- **No abrir el `STTAdapter` real.** La interface de Fase 1.5 se mantiene sin
  implementar.
- **No modificar arquitectura.** Sin refactor de módulos existentes salvo el
  aditivo mínimo listado en §5.
- **No añadir métodos fuera del plan.** Los 3 comandos + 3 `simulate*` + 3
  snapshots son el máximo autorizado.

---

## 12. Criterio de fase estable

Fase 3 se considera **estable** — y por tanto se creará el tag protegido
`spabla-v2-phase-3-stt-2026-XX-XX` — sólo si cumple los **siete** criterios:

1. **Suite total ≥ 319 tests verdes.** `npm --prefix engine test` sin fallos.
2. **Cobertura ≥ 85%** en statements, branches, functions, lines. Módulo `stt/`
   con **≥ 95%** individualmente.
3. **Typecheck limpio:** `npm --prefix engine run typecheck` sin errores.
4. **Cero regresiones:** los 264 tests de Fase 2 siguen verdes sin modificación.
5. **Ningún archivo de fuente > 300 líneas.** Absoluto 400. Si `Engine.ts` o
   `SpablaCore.ts` suben, se extrae al patrón `engine/types.ts` de Fase 1.5.
6. **Encapsulación intacta:** SpablaCore no expone `STTManager` ni `bus`. Tests
   de encapsulación pasan sin modificación.
7. **V1 byte-idéntico** al tag `spabla-stable-ot-071-targetlang-translation-2026-07-04`.
   Verificado con `git diff <tag> HEAD -- app/ server/` = 0.

Sólo con los 7 se crea el tag protegido. Cualquier fallo se documenta como
candidato, no como stable.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente autorización
del jefe de proyecto abrirá:
- Rama nueva `spabla-v2/fase-3-stt` desde el tag
  `spabla-v2-phase-2-messaging-2026-07-04`.
- Implementación de los archivos listados en §5.
- Ejecución de los tests listados en §10.
- Commit único al cierre con mensaje `feat(engine): fase 3 — stt module`.

Sin autorización explícita no se toca código.
