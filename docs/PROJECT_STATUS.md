# SPABLA — Estado del proyecto

> Última actualización: 2026-06-02
> Carpeta local: `~/spabla`
> Rama activa: `main`
> Último commit: `840cae7` — clean: beta limpia

---

## Estado general

| Dimensión | Progreso | Notas |
|---|---|---|
| Backend (APIs, señalización, STT) | ✅ 90% | Congelado. No tocar. |
| Frontend (pantallas, componentes) | 🟡 65% | UX/UI es la prioridad actual |
| Traducción texto | ✅ Completo | Server-side, −54% latencia p50 |
| Traducción voz / TTS | 🟡 20% | Web Speech API implementada (default OFF) |
| Videollamada (WebRTC + subtítulos) | 🟡 70% | Funciona, rediseño UX pendiente |
| Llamada de voz | 🟡 40% | Funciona, UX pendiente de rediseño completo |
| Llamada entrante (ring/accept/reject) | 🔴 30% | Infraestructura creada, no probada en real |
| Persistencia (Supabase, auth, RLS) | ✅ Completo | Modelo B, RLS en 6 tablas |
| **Global** | **~68%** | — |

---

## Lo que funciona hoy en producción

| Funcionalidad | Estado | Notas |
|---|---|---|
| Onboarding (nombre + idioma) | ✅ | signInAnonymously() + Modelo B |
| Chat — envío/recepción mensajes | ✅ | Supabase Realtime + polling fallback |
| Chat — traducción automática | ✅ | OpenAI GPT-4o-mini |
| Link de invitación | ✅ | /chat?id=UUID |
| WebRTC — señalización | ✅ | JWT en handshake, membership validado |
| WebRTC — TURN relay | ✅ | Metered.ca |
| Deepgram STT | ✅ | nova-2 streaming |
| Subtítulos en videollamada | ✅ | Historial + parciales |
| Traducción server-side | ✅ | TRANSLATE_SERVER_SIDE=true |
| VideoOverlay compacto + inmersivo | ✅ | iOS Safari fix activo |
| Anonymous Auth (Supabase) | ✅ | users.id = auth.uid() |
| RLS en todas las tablas | ✅ | 6 tablas + policies + índices |
| JWT en /api/translate | ✅ | getClaims ES256, rate limit in-memory |
| Web Speech API TTS | 🟡 | Implementada, no validada en producción |

---

## Infraestructura de base de datos

### Tablas con RLS activo

| Tabla | Policies activas |
|---|---|
| `users` | `users_select`, `users_insert_own`, `users_update_own` |
| `conversations` | `conversations_select`, `conversations_insert` |
| `conversation_participants` | `participants_select`, `participants_insert` |
| `messages` | `messages_select`, `messages_insert` |
| `files` | `files_select`, `files_insert` |
| `call_signals` | `call_signals_select`, `call_signals_insert`, `call_signals_update` |

### Funciones SECURITY DEFINER
- `is_participant(conv_id uuid)`
- `shares_conversation(other_user_id uuid)`

### Índices de producción
- `idx_participants_user_id`
- `idx_messages_conv_created`
- `idx_conversations_created_by`

### Columnas añadidas
- `conversations.created_by` (DEFAULT auth.uid()) — resuelve RETURNING tras INSERT

---

## Código no commiteado (pendiente de validación)

Los siguientes cambios están en el working tree local pero **NO están commiteados ni pusheados**:

| Archivo | Cambio | Estado |
|---|---|---|
| `app/chat/hooks/useRingTone.ts` | Nuevo — tono sintético Web Audio API | Sin commit |
| `app/chat/hooks/useCallSignaling.ts` | Nuevo — suscripción Realtime a call_signals | Sin commit |
| `app/chat/components/IncomingCallOverlay.tsx` | Nuevo — pantalla llamada entrante | Sin commit |
| `app/chat/hooks/useTranslatedSpeech.ts` | Nuevo — Web Speech API TTS | Sin commit |
| `app/chat/page.tsx` | Modificado — integra call signaling, banner de voz, subtítulos en chat | Sin commit |
| `app/chat/components/VideoOverlay.tsx` | Modificado — modo voz eliminado, modo vídeo refinado, prop `mode` | Sin commit |

**Razón:** las pruebas en dispositivos físicos no se pudieron completar por problema de conectividad Mac ↔ iPhone (router con posible AP Isolation o diferencia de subred).

---

## Problemas conocidos

### Críticos (bloquean beta pública)

**P1 — Rate limiting no coordina entre instancias Vercel**
El Map en memoria de `/api/translate` no se comparte. Requiere Upstash Redis.

**P2 — /measure-translate expuesto en producción**
Endpoint de benchmark activo con acceso a OPENAI_API_KEY de Render. Eliminar antes de beta abierta.

**P3 — Llamada entrante no probada en real**
El flujo `call_signals` + tono + aceptar/rechazar está implementado pero no validado en dispositivos físicos.

### Importantes

**P4 — Sin paginación de mensajes**
`loadMessages()` sin LIMIT. Conversaciones largas pueden degradar UX.

**P5 — Render cold start**
30-90s en plan starter. Sin feedback al usuario.

**P6 — ScriptProcessorNode deprecated**
Funciona hoy, pero marcado para eliminación en Web Audio API spec.

### Menores

**P7 — Conversaciones recientes en /home hardcodeadas**
Se muestra estado vacío honesto (sin Sophia/Ahmed/Marie). El historial real requiere query a Supabase.

**P8 — Botón adjunto muestra "Próximamente"**
Funcionalidad no implementada. Tooltip visible al pulsar.

---

## Benchmarks de latencia (medidos en producción)

### /api/translate (browser-side, DESACTIVADO con flag)
| Métrica | OpenAI solo | Total extremo-a-extremo |
|---|---|---|
| p50 | 520ms | 716ms |
| p95 | 934ms | 1151ms |

### Traducción server-side (Render→OpenAI, ACTIVO)
| Métrica | Render→OpenAI | Total pipeline |
|---|---|---|
| p50 | 660ms | ~985ms |
| p95 | 848ms | ~1350ms |

**Mejora activada:** −54% en p50 respecto a la versión browser-side.

---

## Rutas de la aplicación

| Ruta | Estado | Notas |
|---|---|---|
| `/` | ✅ | Redirect server-side a `/home` |
| `/home` | ✅ | 3 cards funcionales, estado vacío honesto |
| `/onboarding` | ✅ | signInAnonymously() + Modelo B |
| `/chat?id=UUID` | ✅ | Chat completo + llamadas |
| `/call/[roomId]` | ✅ | Redirect a `/home` (ruta obsoleta eliminada) |
| `/documents` | 🔴 | No existe (cards eliminados del home) |
| `/images` | 🔴 | No existe |
| `/interpreter` | 🔴 | No existe |
