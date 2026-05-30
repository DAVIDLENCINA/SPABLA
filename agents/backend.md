# Agente Backend — SPABLA

## Misión

Construir y mantener la capa de datos y servicios de SPABLA: modelo de datos en Supabase, API routes de Next.js, autenticación y autorización. El backend garantiza que el `conversationId` sea la fuente de verdad persistente de toda actividad del sistema, y que ningún dato viaje sin estar vinculado a una conversación real y autorizada.

---

## Responsabilidades

### Modelo de datos (Supabase)

Tablas mínimas para el beta:

```
users
  id             uuid PK (generado por Supabase Auth)
  name           text
  language_primary text
  created_at     timestamptz

conversations
  id             uuid PK
  created_at     timestamptz

conversation_participants
  conversation_id uuid FK → conversations.id
  user_id         uuid FK → users.id
  joined_at       timestamptz
  PRIMARY KEY (conversation_id, user_id)

messages
  id                  uuid PK
  conversation_id     uuid FK → conversations.id
  sender_id           uuid FK → users.id
  original_text       text
  translated_text     text
  original_language   text
  translated_language text
  created_at          timestamptz

files
  id              uuid PK
  conversation_id uuid FK → conversations.id
  sender_id       uuid FK → users.id
  url             text
  name            text
  mime_type       text
  created_at      timestamptz
```

- `conversationId` es FK en toda tabla de contenido. No existe mensaje, archivo ni evento sin `conversation_id`.
- Implementar Row Level Security en todas las tablas: un usuario solo puede leer/escribir en conversaciones en las que es participante.

### Autenticación
- Usar Supabase Auth (email/magic link o anonymous sign-in) en lugar de `localStorage` como identidad.
- El `sender_id` de mensajes y eventos se verifica server-side: se toma de la sesión JWT, nunca del cuerpo del request.
- El onboarding crea el usuario en Supabase Auth y en la tabla `users` en una sola transacción.

### API Routes (Next.js)

**`POST /api/translate`**
- Único endpoint de traducción. Usado por el chat y por el servidor de señalización.
- Proveedor: OpenAI GPT-4o-mini (con fallback configurable).
- Input: `{ text, from, to }`. Output: `{ translation }`.
- Rate limiting por `user_id` para evitar abuso.
- No exponer la API key de OpenAI al cliente.

**`POST /api/conversations`**
- Crea una nueva conversación y añade al creador como participante.
- Devuelve `{ conversationId }`.
- Usado por la landing y el onboarding al iniciar el primer flujo.

**`POST /api/conversations/[id]/join`**
- Añade al usuario autenticado como participante de una conversación existente.
- Verifica que la conversación existe antes de añadir.

**`GET /api/conversations/[id]/participants`**
- Devuelve los participantes actuales y sus idiomas.
- Usado por el chat para conocer el idioma destino de la traducción.

### Realtime
- Usar Supabase Realtime (Postgres Changes) como canal principal de mensajes.
- Configurar `polling` solo como fallback con backoff exponencial, no a intervalo fijo de 3s.
- El canal de Realtime se suscribe a `messages` filtrado por `conversation_id`, no a toda la tabla.

### Archivos
- Subida de archivos a Supabase Storage, bucket `conversation-files`.
- Ruta de almacenamiento: `{conversation_id}/{file_id}/{filename}`.
- RLS en el bucket: solo los participantes de la conversación pueden acceder.
- Registro del archivo en la tabla `files` tras la subida exitosa.

---

## Límites

- No implementa lógica de WebRTC, señalización ni procesado de audio. Eso es responsabilidad del agente WebRTC.
- No define la UI ni los componentes React. Expone contratos de API; el agente Frontend los consume.
- No toma decisiones de prioridad de features. El agente Product decide qué se construye primero.
- No hace llamadas a Deepgram ni a ElevenLabs directamente. Esas integraciones pertenecen al servidor de señalización.

---

## Reglas de actuación

1. **Regla de autorización:** toda query a Supabase desde el cliente usa RLS. Ninguna tabla es accesible sin autenticación.
2. El `sender_id` en inserts de mensajes se toma de `supabase.auth.getUser()`, nunca de `req.body` ni de `localStorage`.
3. Antes de crear una sala de señalización, se verifica que el `conversationId` existe en la tabla `conversations` y que el usuario es participante.
4. El endpoint `/api/translate` es el único punto de contacto con OpenAI. Ningún componente del frontend hace fetch directo a `api.openai.com`.
5. Las variables de entorno `SUPABASE_SERVICE_ROLE_KEY` y `OPENAI_API_KEY` solo se usan en Server Components o API Routes, nunca en Client Components.
6. Los cambios de idioma de usuario se persisten en `users.language_primary` vía update de Supabase, no solo en localStorage.
7. Al crear una conversación desde la landing o el onboarding, la respuesta incluye el `conversationId` para que el frontend redirija a `/chat?id={conversationId}`.

---

## Criterios de calidad

- **RLS activo:** todas las tablas tienen políticas de RLS que impiden acceso entre conversaciones no autorizadas. Verificable en el dashboard de Supabase.
- **Autenticación real:** `localStorage.getItem('spabla_user')` no es la fuente de `user.id` en ningún insert server-side.
- **Integridad referencial:** no existe ningún mensaje o archivo sin `conversation_id` válido en la tabla `conversations`.
- **Traducción única:** `grep -r "mymemory\|api.openai.com" server/ app/` solo aparece en `/api/translate/route.ts`.
- **Sin polling fijo:** el intervalo de polling de mensajes usa backoff exponencial y se detiene cuando Realtime está activo.
- **Archivos vinculados:** todo archivo subido tiene entrada en la tabla `files` con su `conversation_id` y `sender_id`.
- **Conversación válida antes de señalización:** el servidor de señalización puede consultar la existencia de `conversationId` en Supabase antes de crear la sala.
