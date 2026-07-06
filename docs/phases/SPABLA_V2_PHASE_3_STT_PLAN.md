# SPABLA V2 — Fase 3: STT Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 3 antes de escribir
código. Base: tag `spabla-v2-phase-2-messaging-2026-07-04` @ `4229cda`.

Este documento **NO autoriza** implementación. Cuando la implementación
abra, será en la rama `spabla-v2/fase-3-stt` desde el tag base, con
commit único al cierre.

Fuentes normativas transversales que rigen este plan (no se re-imprimen
aquí; se referencian):

- Reglas de código y prohibiciones transversales:
  [`../standards/SPABLA_V2_CODE_STANDARD.md`](../standards/SPABLA_V2_CODE_STANDARD.md).
- Criterios universales de "estable":
  [`../standards/SPABLA_V2_RELEASE_STANDARD.md`](../standards/SPABLA_V2_RELEASE_STANDARD.md).
- Estándar documental:
  [`../SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).

---

## 1. Objetivo de Fase 3

Construir el módulo **STT** (Speech-to-Text) del Engine. Modelo puro en
memoria: sesiones, turnos, parciales, finales, transiciones de estado,
gestión de errores y superficie pública en `SpablaCore`. **Sin proveedor
real de STT. Sin captura real de audio.** Los tests inyectan chunks
binarios simulados y verifican el pipeline de eventos.

Al cierre de Fase 3 un consumidor de `SpablaCore` puede:

- Iniciar una sesión de STT vinculada a una `CallSession` en estado `accepted`.
- Enviar chunks de audio (bytes opacos) al motor.
- Recibir eventos `stt.partial`, `stt.final`, `stt.failed` con `turnId`
  estable.
- Detener la sesión limpiamente.
- Recibir eventos atribuidos a la etapa exacta en caso de fallo.

---

## 2. Qué problema resuelve

Hoy el Engine no tiene concepto de voz. `SpablaCore` no puede reflejar
que un usuario está hablando dentro de una llamada, ni emitir el texto
transcribido de una intervención, ni vincular una transcripción a una
`CallSession` activa, ni manejar el fallo de una sesión de STT (retry /
dropout / silence).

Sin estos primitivos, la Fase 4 (traducción de texto) no tiene fuente
que consumir y la Fase 5 (TTS) tampoco tiene disparador. Fase 3 provee
el primer eslabón del pipeline **capture → STT → MT → TTS**, aislado del
transporte y del proveedor real.

---

## 3. Qué NO hará todavía

- **No integración con proveedor real** (Deepgram Live, OpenAI Realtime,
  Whisper streaming). El `STTAdapter` definido en Fase 1.5 permanece como
  interface no implementada; **no se abre en esta fase**.
- **No captura real** desde `navigator.mediaDevices` ni `MediaStream`.
- **No `AudioContext` / `ScriptProcessorNode` / `AudioWorklet`.**
- **No decimación / conversión de sample rate.** Los chunks entran como
  bytes opacos (`Uint8Array`) y se registran sin transformación.
- **No transporte real.** Los chunks se inyectan directamente vía comando
  en tests.
- **No VAD real.** Los turnos se abren/cierran por acción explícita
  (comando en tests o adaptador futuro). No hay detección automática de
  habla.
- **No integración con `TurnPipelineManager`** (existe desde Fase 1.5,
  pero Fase 3 mantiene `STTTurn` como snapshot propio; la orquestación
  cross-eslabón llega en Fase 5–6).

Las prohibiciones transversales — proveedores IA, APIs del navegador,
React, Supabase real, tocar V1, modificar arquitectura, `Result<T,E>`,
etc. — vienen dadas por
[`SPABLA_V2_CODE_STANDARD.md §6`](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales)
y no se reimprimen aquí.

---

## 4. Módulos exactos a crear

Un módulo interno + una máquina de estados.

| Módulo | Responsabilidad única |
|---|---|
| `stt/STTManager` | Owner exclusivo de `STTSession` + `STTTurn` snapshots. Recibe chunks, acepta comandos simulados de partial/final/error, aplica la máquina de estados, emite eventos. |
| `stt/stt-session-machine` | Máquina finita para `STTSessionState`, reutilizando la primitiva `StateMachine` de Fase 1. |

**No se crea `STTTurnManager` separado.** Los turnos viven dentro de
`STTManager` (uno activo a la vez por sesión, coherente con la decisión
de producto 1-a-1 = un speaker por sesión).

---

## 5. Archivos exactos previstos

**Nuevos (4 archivos):** `engine/src/stt/STTManager.ts` (~260), `STTManager.test.ts` (~300), `stt-session-machine.ts` (~40); `engine/src/types/stt.ts` (~120 — los 5 contratos).

**Modificados (aditivos):** `types/events.ts` (+5 eventos, ~35), `engine/types.ts` (+1), `engine/Engine.ts` (+~8), `engine/Engine.test.ts` (+~10), `core-api/SpablaCore.ts` (+~65), `core-api/SpablaCore.test.ts` (+~230), `core-api/types.ts` (+~35), `index.ts` (+~18).

**Total estimado:** ~700 líneas de fuente + ~530 de tests.

**Advertencia de caps** ([Code Standard §3](../standards/SPABLA_V2_CODE_STANDARD.md#3-tamaño-de-archivo)): `Engine.ts` (296) y `SpablaCore.ts` (288) están cerca del cap. Si superan 300 se aplica el patrón de extracción (`stt-ops.ts`) antes de commitear.

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
  bytesReceived: number;                     // acumulado de chunks
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
  seq: number;                               // 0-based, monotónico
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
  turnId: UUID | undefined;
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

`idle` es transitorio interno. Los consumidores nunca ven una sesión en
`idle` a través de eventos — la sesión se emite ya como `listening` con
`stt.session.started`.

---

## 8. Eventos que emitirá

Cinco eventos añadidos a la unión `EngineEvent`. Todos con
`meta { ts, correlationId }`.

| Nombre | Payload |
|---|---|
| `stt.session.started` | `{ session: STTSession }` |
| `stt.partial` | `{ session: STTSession; turn: STTTurn; partial: STTPartial }` |
| `stt.final` | `{ session: STTSession; turn: STTTurn; final: STTFinal }` |
| `stt.failed` | `{ session: STTSession; error: STTError; previousState: STTSessionState }` |
| `stt.session.ended` | `{ session: STTSession }` |

Todos entregados por el mismo `EventBus`, accesibles vía
`SpablaCore.subscribe(name, handler)`.

---

## 9. Métodos públicos previstos en `SpablaCore`

### 9.1 `startSTT({ callId, speaker }): { sessionId }`

Precondiciones: conversation cargada; `CallSession(callId)` existe y está en `accepted`; no hay ya una `STTSession` no-terminal para ese `(callId, speaker)`. Efecto: crea `STTSession` en `idle`, transiciona a `listening`, emite `stt.session.started`.

### 9.2 `stopSTT({ sessionId }): void`

Precondiciones: sesión existe y NO está en terminal. Efecto: si hay turno activo, se cierra sin `stt.final` (partial "abandoned"); transiciona a `completed`; emite `stt.session.ended`.

### 9.3 `pushAudioChunk({ sessionId, chunk: Uint8Array }): void`

En Fase 3 el chunk es opaco. El manager incrementa `bytesReceived` y provoca `listening → transcribing` la primera vez. Precondición: sesión existe y NO está en terminal.

### 9.4 Métodos `simulate*` (wire-in de adaptadores)

Marcados en JSDoc como `wire-in points for adapters / tests` — no forman parte de la API estable. Serán invocados por el `STTAdapter` real en Fase 4+, y hoy por los tests.

- **`simulateSTTPartial({ sessionId, text })`** — abre un turno si no hay uno activo, empuja partial con `seq` incrementado, emite `stt.partial`.
- **`simulateSTTFinal({ sessionId, text, language? })`** — cierra el turno activo, emite `stt.final`, transiciona a `listening`.
- **`simulateSTTError({ sessionId, code, message })`** — emite `stt.failed`, transiciona a `failed` (terminal).

### 9.5 Snapshots read-only nuevos

- `getSTTSession(sessionId): STTSession | undefined`
- `getSTTTurn(turnId): STTTurn | undefined`
- `listActiveSTTSessions(callId): ReadonlyArray<STTSession>`

---

## 10. Tests exactos previstos

**Total: 55 tests nuevos** (25 STTManager + 30 SpablaCore).
Suite total tras Fase 3: **319 tests** (264 previos + 55).

### 10.1 `STTManager.test.ts` (25 tests)

**createSession (5)**: crea + transición `idle → listening` + emite
`stt.session.started`; rechaza duplicate sessionId; guarda
`callSessionId` y `speaker` verbatim; snapshot congelado;
`get(sessionId)` devuelve la sesión.

**pushChunk / open turn (5)**: primer chunk hace `listening →
transcribing`; abre `STTTurn` con `isActive: true`; chunks subsiguientes
NO abren turno nuevo; rechaza chunk si la sesión no existe; rechaza
chunk si la sesión está terminal.

**partial + final (6)**: `simulatePartial` emite `stt.partial` con
`seq` monotónico; múltiples partials del mismo turno comparten `turnId`;
`simulateFinal` emite `stt.final` con `text` + `language`;
`simulateFinal` hace `transcribing → listening` y cierra el turno; el
turno cerrado conserva partials + final; `simulateFinal` sin turno
activo lanza error.

**stop + errors (5)**: `stop` en `listening` sin turno → `completed`,
emite `stt.session.ended`; `stop` en `transcribing` con turno activo →
`completed`, cierra sin final; `stop` en terminal es idempotente;
`simulateError` transiciona a `failed` con `previousState`;
`simulateError` en terminal es rechazado.

**Queries + immutability (4)**: `list(sessionId)` devuelve turnos en
orden cronológico; turnos cerrados son inmutables (nueva referencia
frozen tras cada mutación); `getSTTTurn(unknown)` devuelve `undefined`;
`listActiveSessions(callId)` filtra por callId y excluye terminales.

### 10.2 `SpablaCore.test.ts` — nuevos describes (30 tests)

**startSTT (5)**: devuelve sessionId + `getSTTSession` refleja
`listening`; rechaza sin conversation; rechaza si CallSession no existe;
rechaza si CallSession no está en `accepted`; emite
`stt.session.started`.

**stopSTT (5)**: transición a `completed`; emite `stt.session.ended`;
rechaza sessionId desconocido; rechaza terminal; limpia `currentTurnId`.

**pushAudioChunk (5)**: primer chunk hace `listening → transcribing`;
`bytesReceived` acumula; rechaza sessionId desconocido; rechaza
terminal; múltiples chunks en un turno no crean otro.

**simulatePartial / Final / Error (5)**: `simulatePartial` propaga a
subs y actualiza el turno; `simulateFinal` cierra el turno y transiciona
a `listening`; `simulateError` transiciona a `failed`; los tres
rechazan sessionId desconocido; los tres rechazan terminal.

**Eventos (5)**: subscribe recibe los 5 nombres STT; eventos llevan
`meta.ts` y `meta.correlationId`; unsubscribe corta la entrega; los
eventos STT fluyen por el mismo bus que Engine + Messaging; ordering:
`stt.session.started` antes de cualquier `stt.partial`.

**Encapsulación y compat (5)**: SpablaCore no expone `STTManager`
directamente; `endCall` NO detiene automáticamente las STT (Fase 6
orquestará); `sendMessage` sigue funcionando durante una sesión STT
activa; los 264 tests de Fase 2 siguen verdes; superficie pública: los 3
métodos + 3 `simulate*` + 3 snapshots están en el prototype.

---

## 11. Prohibiciones específicas de Fase 3

Aplican todas las prohibiciones transversales de
[`SPABLA_V2_CODE_STANDARD.md §6`](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales)
(proveedores IA, APIs del navegador, React, Supabase real, tocar V1,
modificar arquitectura, feature flags, `Result<T,E>`, `useRef` cross-módulo).

DELTA específico de Fase 3:

- **No abrir el `STTAdapter` real.** La interface de Fase 1.5 se
  mantiene sin implementar.
- **No añadir métodos fuera del plan.** Los 3 comandos + 3 `simulate*` +
  3 snapshots son el máximo autorizado.
- **No añadir Deepgram, OpenAI Realtime ni Whisper** por nombre, ni
  siquiera como string literal.
- **No detección real de VAD.** Turnos abiertos/cerrados solo por
  comando explícito.

---

## 12. Criterio de fase estable — DELTA

Aplican los ocho criterios universales de
[`SPABLA_V2_RELEASE_STANDARD.md §2`](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
sin excepción. DELTA específico de Fase 3:

- **Suite mínima**: 319 tests verdes (264 previos + 55 nuevos).
- **Módulo de dominio**: `engine/src/stt/` con cobertura ≥ 95 % en las
  cuatro métricas.
- **Base tag**: `spabla-v2-phase-2-messaging-2026-07-04` @ `4229cda`.
- **Prohibiciones específicas**: ver §11.
- **Tag propuesto al cierre**: `spabla-v2-phase-3-stt-<YYYY-MM-DD>`.

Cualquier fallo se documenta como candidato, no como stable, y se itera
en la misma rama antes de cerrar.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente
autorización del jefe de proyecto abrirá:

- Rama nueva `spabla-v2/fase-3-stt` desde el tag
  `spabla-v2-phase-2-messaging-2026-07-04`.
- Implementación de los archivos listados en §5.
- Ejecución de los tests listados en §10.
- Commit único al cierre con mensaje `feat(engine): fase 3 — stt module`.

Sin autorización explícita no se toca código.
