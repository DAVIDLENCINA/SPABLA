# SPABLA — Arquitectura

---

## Principio fundamental

> Una conversación = una única sesión.
> Todo sucede dentro de la misma conversación.
> `conversationId` es la entidad principal del sistema.

Ningún componente del sistema crea una sesión, sala o contexto de comunicación independiente del `conversationId`. El `conversationId` de Supabase es el mismo identificador que se usa como `roomId` en Socket.io. No existe una entidad "sala" separada.

---

## conversationId como sesión única

El `conversationId` es el hilo conductor de todo lo que ocurre en SPABLA:

- Los **mensajes** tienen `conversation_id`.
- Los **archivos** tienen `conversation_id`.
- La **señalización WebRTC** usa `conversationId` como `roomId`.
- Los **subtítulos** emitidos por el servidor llevan `conversationId` en el payload.
- El **historial** de la conversación persiste independientemente del modo activo (chat, llamada, vídeo).

Invariante absoluta: **no existe ningún evento del sistema sin `conversationId`**.

---

## Prohibición de salas independientes

**Cuando una llamada o videollamada nace desde una conversación existente, está prohibido:**

1. Generar un `roomId` nuevo con `Math.random()` o cualquier otro generador aleatorio.
2. Crear una entidad de "sala" separada en la base de datos.
3. Redirigir al usuario a una URL distinta de `/chat?id={conversationId}`.
4. Compartir un link de invitación que apunte a la sala en lugar de a la conversación.
5. Abrir una sesión de señalización Socket.io con un identificador distinto al `conversationId`.

**Excepción:** una llamada iniciada directamente desde la landing (sin conversación previa) crea primero la conversación en Supabase y luego usa su `conversationId` como roomId. Nunca al revés.

---

## Mensajes

```
Usuario A escribe mensaje
    │
    ▼
POST /api/translate (server-side, OpenAI GPT-4o-mini)
    │   { text, from: idiomaA, to: idiomaB }
    ▼
INSERT messages (Supabase)
    │   conversation_id, sender_id, original_text, translated_text,
    │   original_language, translated_language, created_at
    ▼
Supabase Realtime emite INSERT al canal
    │   messages:conversation_id=eq.{conversationId}
    ▼
Usuario B recibe el mensaje en su idioma sin acción adicional
```

**Reglas:**
- `sender_id` se obtiene de `supabase.auth.getUser()` en el servidor, nunca del cuerpo del request.
- Si hay más de dos participantes con idiomas distintos, se traduce al idioma de cada destinatario.
- Si el emisor y el receptor tienen el mismo idioma, no se llama a la API de traducción.

---

## Llamadas de voz

```
Usuario A pulsa "Llamar" en /chat?id={conversationId}
    │
    ▼
useWebRTC.startCall(conversationId)         ← roomId = conversationId
    │
    ▼
socket.emit("join-room", conversationId)
    │
    ▼
Servidor valida conversationId en Supabase
    │   ¿existe? ¿es participante el usuario?
    ▼
socket.to(conversationId).emit("user-joined")
    │
    ▼
Negociación WebRTC (offer → answer → ICE candidates)
    │
    ▼
Stream de audio P2P establecido
    │
    ├── AudioWorklet → PCM int16 → socket.emit("audio-chunk")
    │       │
    │       ▼
    │   Servidor → Deepgram Live STT
    │       │
    │       ▼
    │   Servidor → POST /api/translate
    │       │
    │       ▼
    │   socket.to(conversationId).emit("subtitle", { original, translated, fromLang, toLang })
    │       │
    │       ▼
    │   [ElevenLabs TTS] → audio sintetizado al oyente
    │
    └── Al colgar: usuario permanece en /chat?id={conversationId}
```

---

## Videollamadas

Idéntico al flujo de llamada de voz, con estas diferencias:

- El stream incluye vídeo (`getUserMedia({ video: true, audio: true })`).
- La videollamada se renderiza en `VideoOverlay.tsx` como capa sobre el chat.
- `VideoOverlay` tiene dos modos: compacto (220px flotante) e inmersivo (pantalla completa).
- Los subtítulos se renderizan dentro del `VideoOverlay`.
- Al cerrar el overlay, el historial del chat sigue visible.
- **No existe una ruta `/call/[roomId]` en el flujo de usuario.**

---

## Archivos

```
Usuario A selecciona archivo en el chat
    │
    ▼
Upload a Supabase Storage
    │   bucket: conversation-files
    │   path: {conversationId}/{fileId}/{filename}
    ▼
INSERT files (Supabase)
    │   conversation_id, sender_id, url, name, mime_type, created_at
    ▼
Supabase Realtime emite INSERT
    │
    ▼
Archivo aparece en el historial como elemento descargable
```

RLS en el bucket: solo participantes de la conversación pueden acceder al path `{conversationId}/*`.

---

## Traducción

**Proveedor único:** OpenAI GPT-4o-mini vía `POST /api/translate`.

Ningún componente del cliente hace fetch directo a proveedores externos de traducción. Ningún componente del servidor usa MyMemory, DeepL ni otro proveedor alternativo.

```
POST /api/translate
Body: { text: string, from: LangCode, to: LangCode }
Response: { translation: string }
```

La ruta está protegida por autenticación (token Supabase) y rate limiting por `user_id`.

El servidor de señalización llama a esta ruta internamente para traducir subtítulos antes de emitirlos a los destinatarios.

---

## Stack tecnológico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript | Interfaz de usuario |
| Base de datos | Supabase (PostgreSQL) | Persistencia, auth, realtime, storage |
| Tiempo real (mensajes) | Supabase Realtime (Postgres Changes) | Notificación de mensajes nuevos |
| Señalización | Socket.io (servidor independiente) | Negociación WebRTC |
| Audio/Vídeo P2P | WebRTC | Streams de audio y vídeo |
| STT | Deepgram nova-2 | Transcripción de voz a texto |
| Traducción | OpenAI GPT-4o-mini via `/api/translate` | Traducción de mensajes y subtítulos |
| TTS | ElevenLabs | Síntesis de voz traducida |
| Despliegue frontend | Vercel | Build y CDN |
| Despliegue señalización | Railway / Render | Proceso Node.js persistente |
| TURN | Coturn propio o Twilio TURN | Relay para NAT traversal en redes restrictivas |

---

## Modelo de datos

```
users
  id                uuid PK (Supabase Auth)
  name              text
  language_primary  text
  created_at        timestamptz

conversations
  id                uuid PK          ← conversationId
  created_at        timestamptz

conversation_participants
  conversation_id   uuid FK → conversations.id
  user_id           uuid FK → users.id
  joined_at         timestamptz
  PRIMARY KEY (conversation_id, user_id)

messages
  id                    uuid PK
  conversation_id       uuid FK → conversations.id
  sender_id             uuid FK → users.id
  original_text         text
  translated_text       text
  original_language     text
  translated_language   text
  created_at            timestamptz

files
  id              uuid PK
  conversation_id uuid FK → conversations.id
  sender_id       uuid FK → users.id
  url             text
  name            text
  mime_type       text
  created_at      timestamptz
```

---

## Seguridad

**Autenticación:** Supabase Auth. `user.id` obtenido siempre de `supabase.auth.getUser()` en el servidor.

**RLS activo en todas las tablas:**
- `messages`: accesible solo si `conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())`
- `files`: misma política.
- `conversation_participants`: `user_id = auth.uid()` para reads.
- Storage bucket `conversation-files`: acceso restringido a participantes.

**Señalización:** el servidor Socket.io valida `conversationId` contra Supabase antes de procesar cualquier evento. CORS restringido a orígenes de producción. Credenciales TURN efímeras, nunca hardcodeadas en código.

**Secretos:** ninguna API key (OpenAI, Deepgram, ElevenLabs) aparece en el bundle del cliente ni en archivos versionados.

---

## Despliegue

```
Internet
    │
    ├── Vercel — frontend Next.js + /api/translate → OpenAI
    │
    ├── Railway / Render — servidor Socket.io + Deepgram + ElevenLabs
    │
    ├── Supabase — PostgreSQL + Realtime + Storage + Auth
    │
    └── TURN server (Coturn / Twilio) — relay WebRTC
```

---

## Invariantes del sistema

Estas condiciones deben ser verdaderas en todo momento:

1. `messages.conversation_id` siempre apunta a una fila existente en `conversations`.
2. El `roomId` de Socket.io siempre es igual al `conversationId` de Supabase.
3. Ningún archivo en Storage existe sin una fila en `files` con el mismo `conversation_id`.
4. Un usuario no puede leer mensajes ni unirse a llamadas en conversaciones en las que no es participante.
5. Ninguna API key externa aparece en el bundle del cliente.
6. No existe ningún generador de `roomId` con `Math.random()` en el código de producción.
