# SPABLA — Roadmap

Basado en SPABLA_MASTER.md. Las fases son secuenciales: cada fase se completa antes de iniciar la siguiente.

---

## Fase 1 — Chat con traducción

**Objetivo:** dos personas con idiomas distintos pueden mantener una conversación de texto con traducción automática e instantánea.

### Criterios de completitud
- [ ] Onboarding funcional: nombre + idioma → conversación creada → `/chat?id={conversationId}`
- [ ] Envío y recepción de mensajes en tiempo real (Supabase Realtime)
- [ ] Traducción automática del mensaje al idioma del destinatario (OpenAI via `/api/translate`)
- [ ] Traducción visible al destinatario sin acción adicional
- [ ] Texto original visible al expandir el mensaje
- [ ] Link de invitación que apunta a `/chat?id={conversationId}`
- [ ] Participante invitado ve el historial de mensajes al unirse
- [ ] RLS activo en Supabase: mensajes solo accesibles para participantes
- [ ] Autenticación real (Supabase Auth) en lugar de `localStorage`

**Agentes responsables:** Backend, Frontend, UX, Security

---

## Fase 2 — Voz

**Objetivo:** los participantes de una conversación pueden iniciar y mantener una llamada de voz con traducción de subtítulos en tiempo real, sin abandonar la conversación.

### Criterios de completitud
- [ ] Botón "Llamar" dentro de `/chat` inicia la llamada sin salir de la conversación
- [ ] La llamada usa el `conversationId` como identificador de sala (no `Math.random()`)
- [ ] Señalización Socket.io valida el `conversationId` antes de crear la sala
- [ ] Transcripción de voz en tiempo real con Deepgram (STT)
- [ ] Traducción de transcripción con `/api/translate`
- [ ] Subtítulos visibles en la pantalla del oyente
- [ ] Síntesis de voz traducida con ElevenLabs (TTS) — oyente escucha la traducción
- [ ] Al colgar, usuario vuelve al chat con historial visible
- [ ] `AudioWorklet` en lugar de `ScriptProcessorNode`
- [ ] TURN server propio (no `openrelay.metered.ca`)

**Agentes responsables:** WebRTC, Backend, Frontend, Security

---

## Fase 3 — Vídeo

**Objetivo:** los participantes pueden iniciar y mantener una videollamada con subtítulos y traducción en tiempo real, integrada en la conversación existente.

### Criterios de completitud
- [ ] Botón "Vídeo" dentro de `/chat` abre el overlay de videollamada sin salir del chat
- [ ] `VideoOverlay.tsx` incluye subtítulos (mismo sistema que la fase de voz)
- [ ] Vídeo local y remoto sin degradación por procesado de audio
- [ ] Modo compacto (overlay sobre el chat) y modo inmersivo (pantalla completa)
- [ ] Al cerrar el overlay, el chat y su historial siguen visibles
- [ ] Funciona en iOS Safari (unlock del elemento video remoto en primer toque)
- [ ] Funciona en mobile (375px) sin overflow

**Agentes responsables:** WebRTC, Frontend, UX, QA

---

## Fase 4 — Archivos

**Objetivo:** los participantes pueden compartir documentos e imágenes dentro de la conversación, accesibles para todos los participantes autorizados.

### Criterios de completitud
- [ ] Botón "Archivo" dentro del chat abre el selector de ficheros
- [ ] Subida a Supabase Storage bajo `{conversationId}/{fileId}/{filename}`
- [ ] Registro en tabla `files` con `conversation_id` y `sender_id`
- [ ] Archivo aparece en el historial de mensajes como elemento descargable
- [ ] RLS en el bucket: solo participantes de la conversación pueden acceder
- [ ] Límite de tamaño por archivo (definir según plan de Supabase)
- [ ] Preview de imágenes inline en el chat

**Agentes responsables:** Backend, Frontend, Security

---

## Fase 5 — Escalado

**Objetivo:** SPABLA soporta múltiples conversaciones simultáneas con múltiples participantes, sin degradación de rendimiento.

### Criterios de completitud
- [ ] Servidor de señalización con soporte horizontal (múltiples instancias con Redis adapter para Socket.io)
- [ ] Paginación de mensajes en el historial (no cargar toda la tabla en memoria)
- [ ] Supabase Realtime con backoff exponencial, sin polling fijo
- [ ] Métricas de latencia STT < 800ms en condiciones de carga
- [ ] Monitorización activa: errores de WebRTC, tasa de conexión TURN, fallos de traducción
- [ ] Tests de carga del servidor de señalización
- [ ] CDN para archivos estáticos y assets públicos

**Agentes responsables:** CTO, Backend, WebRTC

---

## Estado actual

| Fase | Estado |
|---|---|
| Fase 1 — Chat + traducción | 🟡 En progreso (incompleto: auth real, RLS, polling fijo) |
| Fase 2 — Voz | 🟡 Parcial (`/call/[roomId]` existe pero viola el master) |
| Fase 3 — Vídeo | 🟡 Parcial (overlay sin subtítulos) |
| Fase 4 — Archivos | 🔴 Sin implementar |
| Fase 5 — Escalado | 🔴 Sin implementar |

*Última actualización: 2026-06-01*

---

## Decisión de producto — Llamada directa (tipo WhatsApp)

> Estado: **decisión tomada, no implementar todavía.**
> Registrada el 2026-06-01.

### Contexto

El sistema actual de acceso a conversaciones funciona exclusivamente mediante **link de invitación** (`/chat?id={conversationId}`). Este modelo es correcto para la beta y para incorporar participantes externos que no tienen cuenta previa. Sin embargo, no es suficiente para usuarios recurrentes que quieren llamarse directamente.

### Modelo objetivo

| Modo | Cuándo se usa | Estado |
|---|---|---|
| Link de invitación | Beta, usuarios externos, primer contacto | ✅ Implementado |
| Llamada directa | Contactos recurrentes, uso cotidiano | 🔴 Pendiente de diseño e implementación |

### Flujo deseado (llamada directa)

```
Usuario A tiene a Usuario B en su lista de contactos
  → Usuario A pulsa "Llamar" en el perfil de B
  → Sistema crea una call_invitation en Supabase
  → Usuario B recibe notificación de llamada entrante (presence + Realtime)
  → B acepta o rechaza
  → Si acepta: ambos entran al mismo conversationId → WebRTC room
  → Si rechaza o no responde: A ve "llamada no contestada"
```

### Tablas nuevas necesarias

```
contacts
  id              uuid PK
  owner_id        uuid FK → users.id   ← el usuario que guarda el contacto
  contact_id      uuid FK → users.id   ← el usuario guardado
  nickname        text                  ← nombre personalizado opcional
  created_at      timestamptz

presence
  user_id         uuid FK → users.id   PK
  status          text                  ← 'online' | 'offline' | 'busy'
  last_seen       timestamptz
  updated_at      timestamptz

call_invitations
  id              uuid PK
  caller_id       uuid FK → users.id
  callee_id       uuid FK → users.id
  conversation_id uuid FK → conversations.id
  status          text    ← 'pending' | 'accepted' | 'rejected' | 'missed' | 'cancelled'
  created_at      timestamptz
  resolved_at     timestamptz

call_history
  id              uuid PK
  conversation_id uuid FK → conversations.id
  caller_id       uuid FK → users.id
  callee_id       uuid FK → users.id
  started_at      timestamptz
  ended_at        timestamptz
  duration_seconds integer
```

### Dependencias antes de implementar

1. RLS activo en todas las tablas actuales (Fase 1 completa).
2. Sistema de contactos: UI para añadir/buscar usuarios.
3. Push notifications o polling de presencia para notificar llamadas entrantes.
4. El `conversationId` de la llamada directa puede ser una conversación existente entre ambos usuarios (reusar historial) o una nueva.

### Lo que NO cambia

- El `conversationId` sigue siendo el identificador central de todo (WebRTC room, Supabase Realtime, URL).
- La señalización WebRTC en `server/signaling.ts` no cambia de arquitectura.
- Los links de invitación siguen funcionando en paralelo.
