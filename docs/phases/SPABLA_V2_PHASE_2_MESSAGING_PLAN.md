# SPABLA V2 — Fase 2: Messaging Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 2 antes de escribir código.
Base: tag `spabla-v2-engine-foundation-2026-07-04` @ `019a135`.

Este documento **NO autoriza** implementación. Sirve para validar el alcance;
la implementación se abre en una rama separada tras aprobación explícita.

---

## 1. Objetivo de Fase 2

Convertir el stub actual de `SpablaCore.sendMessage` en un **módulo completo de
mensajería con estado**: gestión de mensajes, hilos, transiciones de estado
(created → sent → delivered → read), fallos y lectura de historial. Sin
Supabase real, sin UI, sin transporte de red — solo modelo, máquina de estados,
API pública y tests.

Al cierre de Fase 2, un consumidor de `SpablaCore` puede:
- Enviar un mensaje de texto y observar su ciclo de vida completo vía eventos.
- Recuperar el historial de mensajes de una conversación.
- Marcar mensajes como leídos (con transición a estado terminal).
- Recibir un mensaje entrante (inyectado por una capa superior futura).

---

## 2. Qué problema resuelve

Hoy `SpablaCore.sendMessage(input)` valida el texto, emite `message.sent` y
devuelve un `messageId`. **Nadie almacena ese mensaje.** No hay:

- Historial recuperable (`getMessages` no existe).
- Estado del mensaje después del emit inicial (¿llegó al peer? ¿lo leyó?).
- Manejo de fallos (¿qué pasa si la capa de transporte reporta error?).
- Direccionalidad (¿es un mensaje mío saliente o del peer entrante?).
- Agrupación por hilo (`MessageThread`).

Fase 2 cubre exactamente esos cinco huecos con un módulo `messaging/`
propietario dentro del Engine, atravesado por `SpablaCore`. Sin esto, Fase 3
(STT) no tiene dónde persistir las burbujas de traducción (que también son
mensajes con `source: "voice"`).

---

## 3. Módulos exactos a crear

Un solo módulo interno + una máquina de estados dedicada:

| Módulo | Responsabilidad única |
|---|---|
| `messaging/MessageManager` | Owner exclusivo de `Message` snapshots. CRUD, transiciones, eventos. |
| `messaging/message-status-machine` | Máquina de estados finita para `MessageStatus`. Reutiliza la primitiva genérica `StateMachine` de Fase 1. |

No se crea `MessageThreadManager` como módulo separado en Fase 2 — hilos son
un agregado derivado dentro de `MessageManager` (V2 es 1-a-1: hay un solo hilo
por conversación, ver §5). Si en el futuro V3 introdujera grupos, se
extraería.

---

## 4. Archivos exactos previstos

**Nuevos (5 archivos):**
```
engine/src/messaging/
├── MessageManager.ts             (~230 líneas estimadas)
├── MessageManager.test.ts        (~280 líneas estimadas)
└── message-status-machine.ts     (~35 líneas estimadas)

engine/src/types/
└── message.ts                    (~90 líneas estimadas)
```

**Modificados (aditivos, sin refactor):**
```
engine/src/types/events.ts        (+5 eventos, ~30 líneas añadidas)
engine/src/engine/types.ts        (añadir `messages: MessageManager` en EngineComponents)
engine/src/engine/Engine.ts       (construir MessageManager en constructor)
engine/src/engine/Engine.test.ts  (test de inyección MessageManager, ~15 líneas)
engine/src/core-api/SpablaCore.ts (implementar sendMessage real + getMessages + markAsRead)
engine/src/core-api/SpablaCore.test.ts  (~150 líneas nuevas de tests Core-layer)
engine/src/core-api/types.ts      (añadir GetMessagesInput, GetMessagesResult, MarkAsReadInput)
engine/src/index.ts               (export Message, MessageThread, MessageStatus, MessageDirection)
```

**Total estimado:** ~630 líneas nuevas de fuente + ~450 líneas nuevas de tests.
Ningún archivo excede 300 líneas. Ningún archivo existente sube por encima de
300 con las adiciones planificadas (SpablaCore está en 238 → estimado 285;
Engine en 288 → estimado 295).

---

## 5. Contratos necesarios

Cuatro tipos, todos inmutables (`Readonly`) y emitidos vía snapshots frozen.

### 5.1 `MessageDirection`
```
type MessageDirection = "outgoing" | "incoming";
```

Determina el origen semántico. **Outgoing** = enviado por el local
participant. **Incoming** = recibido del remote (inyectado por la capa
superior que en Fase 4+ conectará con transporte real).

### 5.2 `MessageStatus`
```
type MessageStatus =
  | "created"    // recién creado, aún no confirmado por la capa de transporte
  | "sent"       // capa de transporte confirmó envío
  | "delivered"  // peer confirmó recepción
  | "read"       // peer confirmó lectura
  | "failed";    // fallo en cualquier etapa previa
```

Terminales: `read`, `failed`. Los mensajes `incoming` nacen directamente en
`sent` o `delivered` (no pasan por `created`, ese estado sólo aplica a
outgoing).

### 5.3 `Message`
```
type Message = Readonly<{
  id: UUID;
  conversationId: UUID;
  threadId: UUID;                    // en V2 == conversationId (ver §5.4)
  senderId: UUID;
  text: string;
  language: LangCode | null;         // idioma del texto (puede desconocerse)
  direction: MessageDirection;
  status: MessageStatus;
  createdAt: ISOTimestamp;
  sentAt: ISOTimestamp | undefined;
  deliveredAt: ISOTimestamp | undefined;
  readAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
}>;
```

### 5.4 `MessageThread`
```
type MessageThread = Readonly<{
  id: UUID;                          // idéntico a conversationId en V2 (1-a-1)
  conversationId: UUID;
  participants: ReadonlyArray<UUID>; // sólo local + remote
  messageIds: ReadonlyArray<UUID>;   // orden cronológico de creación
  createdAt: ISOTimestamp;
}>;
```

Un solo hilo por conversación en V2. Si en V3+ se abren grupos, `threadId`
puede empezar a divergir de `conversationId` sin romper el contrato.

---

## 6. Eventos que emitirá

Cinco eventos nuevos añadidos a la unión discriminada `EngineEvent` (misma
mecánica que Fase 1.6 añadió `message.sent`). Payloads:

| Nombre | Payload |
|---|---|
| `message.created` | `{ message: Message }` — outgoing nace en `created` |
| `message.sent` | `{ message: Message }` — reemplaza el evento actual de Fase 1.6, ahora con `Message` completo |
| `message.delivered` | `{ message: Message; previousStatus: MessageStatus }` |
| `message.read` | `{ message: Message; previousStatus: MessageStatus }` |
| `message.failed` | `{ message: Message; stage: MessageStatus; reason: string }` |

Meta común (`ts`, `correlationId`) heredada de la unión.

Cambio importante respecto a Fase 1.6: el evento `message.sent` cambia su
payload de `{ messageId, senderId, text }` a `{ message: Message }`. Es un
cambio incompatible en el shape, pero como Fase 1.6 no tiene consumidores
externos aún (SpablaCore es la única superficie pública y aún no está
distribuida como paquete), el cambio no rompe compatibilidad efectiva. Se
documentará explícitamente en el commit.

---

## 7. Métodos públicos en `SpablaCore`

Tres métodos afectados. La superficie de la fachada crece de 13 a 15 métodos
(sin contar snapshots read-only, que aumentan también).

### 7.1 `sendMessage(input): SendMessageResult` — **actualizado**
Firma actual: `{ text }` → `{ messageId }`.
Comportamiento nuevo:
1. Precondición: conversación cargada.
2. Precondición: texto no vacío.
3. Crear `Message` con `status: "created"`, `direction: "outgoing"`,
   `senderId = localParticipant.userId`, `language = localParticipant.language`.
4. Emitir `message.created`.
5. Transicionar inmediatamente a `sent` y emitir `message.sent`.
   (En Fase 4+ el paso `created → sent` lo controlará el transporte; en Fase 2
   el módulo hace el paso local sin capa de red.)
6. Devolver `{ messageId }` como hoy.

### 7.2 `getMessages(input?): GetMessagesResult` — **nuevo**
Firma: `getMessages({ limit?, before? }) → { messages: ReadonlyArray<Message>; thread: MessageThread }`.
- Precondición: conversación cargada.
- `limit` opcional (default: sin límite).
- `before` opcional: cursor `ISOTimestamp` para paginación descendente.
- Devuelve orden cronológico ascendente (por `createdAt`).
- No emite eventos.

### 7.3 `markAsRead(input): void` — **nuevo**
Firma: `markAsRead({ messageId })`.
- Precondición: conversación cargada.
- Precondición: mensaje existe y es `incoming` (no se marcan como leídos los
  propios). Los `outgoing` sólo pueden llegar a `read` por reporte del peer,
  vía canal futuro.
- Transiciona `delivered → read` (o `sent → read` si el peer omite delivery).
- Emite `message.read`.

Método adicional interno (**no público**) que la capa de transporte de Fase
4+ usará: `notifyIncomingMessage(input)`. En Fase 2 se expone también como
método público de `SpablaCore` para que los tests puedan simular recepción
sin transporte real. Firma provisional: `notifyIncomingMessage({ messageId, senderId, text, language, status? })`.

Snapshots read-only también actualizados:
- `getMessage(messageId): Message | undefined`
- `getThread(): MessageThread | undefined`

---

## 8. Tests exactos previstos

**Total estimado: ~55 tests nuevos** (25 en `MessageManager.test.ts` + 30 en
`SpablaCore.test.ts` bajo el nuevo describe `messaging`). Coverage debe seguir
≥ 85%.

### 8.1 `MessageManager.test.ts` (25 tests)

**Create outgoing (6)**
- crea con status "created", direction "outgoing", timestamps correctos
- rechaza duplicate messageId
- exige conversationId + senderId
- freeze del snapshot
- emite `message.created`
- deja el mensaje disponible por `get(id)`

**Create incoming (4)**
- crea con status "sent" por defecto
- acepta status inicial "delivered" para simular recibo directo
- emite `message.sent` (no `message.created`)
- rechaza duplicate messageId

**Status transitions (7)**
- outgoing: created → sent → delivered → read (happy path)
- outgoing puede ir sent → read (skip delivered)
- rechaza transición hacia atrás (delivered → sent)
- rechaza cambiar estado de un terminal (read, failed)
- fail() desde created / sent / delivered marca failed y registra failedStage + reason
- fail() rechazado en terminal
- emite el evento correspondiente en cada transición

**Queries (4)**
- `list()` devuelve orden cronológico
- `listByDirection("incoming")` filtra correctamente
- `getThread()` devuelve un MessageThread con `messageIds` alineado a `list()`
- `get(unknownId)` devuelve `undefined`

**Freeze / immutabilidad (4)**
- MessageThread frozen
- Cada mutación devuelve nueva referencia
- Message frozen
- `list()` no permite mutación (arrays inmutables)

### 8.2 `SpablaCore.test.ts` — nuevos describes (30 tests)

**sendMessage — comportamiento real (5)**
- devuelve messageId consistente con el mensaje en `getMessage`
- emite `message.created` y `message.sent` en ese orden
- rechaza texto vacío (existente, se mantiene)
- rechaza si no hay conversation cargada (existente, se mantiene)
- `getMessage(messageId)` refleja el snapshot final con `status: "sent"`

**notifyIncomingMessage (5)**
- crea un Message incoming en status `sent`
- rechaza cuando no hay conversation cargada
- rechaza cuando el senderId no coincide con el remote
- emite `message.sent`
- `getMessages().messages` incluye el mensaje entrante

**getMessages (5)**
- devuelve orden cronológico
- respeta `limit`
- respeta `before` (paginación)
- incluye tanto outgoing como incoming
- devuelve thread coherente

**markAsRead (5)**
- transiciona incoming.sent → read
- transiciona incoming.delivered → read
- rechaza intentar marcar un outgoing propio como leído
- rechaza mensajes desconocidos
- emite `message.read`

**Eventos (5)**
- subscribe recibe message.created, message.sent, message.delivered, message.read, message.failed
- eventos llevan `meta.ts` y `meta.correlationId`
- unsubscribe corta la entrega
- eventos se emiten en el bus compartido con eventos Engine (call.*, participant.*)
- ordering: outgoing envía created antes de sent

**Encapsulación y compatibilidad (5)**
- SpablaCore no expone `MessageManager` directamente
- `getEngine`/`getBus` siguen sin existir
- los 209 tests previos siguen verdes
- `startCall` sigue funcionando sin regresión
- `endCall` no borra el historial de mensajes

---

## 9. Qué está prohibido en Fase 2

Explícitas para evitar arrastre de scope:

- **No Supabase real.** MessageManager es 100% in-memory. No conecta con
  ninguna DB. Cuando Fase 7 (endurecimiento) llegue, se añadirá adaptador
  `SupabaseAdapter` que espeja el estado, sin cambiar el módulo.
- **No UI.** Ningún componente React. Ninguna importación de `react`.
  `docs/SPABLA_V2_PRODUCT_CORE.md` §6 principio 1: "la conversación es
  primero" — la UI se construye después, contra la superficie estable.
- **No React.** Ningún hook. Ningún context. Ninguna dependencia de
  `react/react-dom`.
- **No llamadas.** No tocar `SessionManager`, `Engine.initiateCall`,
  `startVideo`, `startInterpreter`. La llamada y el mensajería son ejes
  ortogonales en V2.
- **No traducción.** MessageManager guarda el texto tal cual llega. Cualquier
  traducción es responsabilidad de Fase 4 (`TranslationAdapter`). Los mensajes
  de voz que en el futuro llevarán texto traducido se representan igual, pero
  la traducción ocurre fuera.
- **No WebRTC.** Ningún `RTCPeerConnection`. Ningún transporte P2P. En Fase
  2 los mensajes entrantes se inyectan por `notifyIncomingMessage` desde
  tests o desde una capa futura.
- **No cambiar EventBus.** Sigue síncrono (misma decisión de Fase 1.5).
- **No `Result<T, E>` tipado.** Se sigue lanzando `SpablaCoreError` /
  `MessageManagerError` (misma decisión de Fase 1.5).
- **No tocar V1.** `git diff` sobre `app/`, `server/` debe seguir en 0 al
  cierre de fase.

---

## 10. Criterio de fase estable

Fase 2 se considera **estable** — y por tanto se creará tag
`spabla-v2-phase-2-messaging-2026-XX-XX` — solo si cumple los **siete**
criterios siguientes (extensión de los 5 criterios generales del §8 de
`SPABLA_V2_ENGINE.md`):

1. **Prueba unitaria completa:** todos los tests planificados (~55 nuevos)
   verdes. Suite total al menos **264 tests**. `npm --prefix engine test`
   sin fallos.
2. **Cobertura ≥ 85%** en las cuatro métricas (statements, branches,
   functions, lines). Módulo `messaging/` con **≥ 95%** individualmente.
3. **Typecheck limpio:** `npm --prefix engine run typecheck` sin errores. La
   configuración `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
   sigue activa.
4. **Cero regresiones:** los 209 tests de la Foundation siguen verdes sin
   modificación. `git diff` de los tests existentes en 0.
5. **Ningún archivo > 300 líneas.** Absoluto 400 sin excepciones. Si alguno
   se acerca a 300, se extraen tipos/helpers a un archivo hermano (patrón
   `Engine.ts` + `engine/types.ts` de Fase 1.5).
6. **Encapsulación intacta:** `SpablaCore` no expone `MessageManager` ni
   `bus`. Tests de encapsulación pasan sin cambios.
7. **V1 byte-idéntico** al tag `spabla-stable-ot-071-targetlang-translation-2026-07-04`.
   Verificado con `git diff <tag> HEAD -- app/ server/` = 0.

Sólo con los 7 se creará el tag protegido. Cualquier fallo → se documenta
como candidato, no como stable, y se itera en la misma rama antes de cerrar.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente autorización
del jefe de proyecto abre:
- Rama nueva `spabla-v2/fase-2-messaging` desde el tag
  `spabla-v2-engine-foundation-2026-07-04`.
- Implementación de los archivos listados en §4.
- Ejecución de los tests listados en §8.
- Commit único al cierre con mensaje `feat(engine): fase 2 — messaging module`.

Sin autorización explícita no se toca código.
