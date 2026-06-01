# SPABLA — Estado para la próxima sesión

> Actualizado: 2026-06-01
> Rama activa: `main` — working tree limpio
> Último commit: `082437c` — feat(signaling): validar JWT y membresía en join-room + cache por socket
> Carpeta local: `~/spabla`

---

## 1. Estado actual de SPABLA

| Dimensión | Progreso | Notas |
|---|---|---|
| Auth + RLS | ✅ Completo | Anonymous Auth, Modelo B, 5 tablas con RLS |
| Backend / APIs | 75% | /api/translate protegido; signaling con auth JWT |
| Frontend | 74% | Chat, onboarding, home funcionando |
| Traducción texto | ✅ Completo para beta | Auth, rate limit, longitud, error handling |
| Traducción voz / TTS | 0% | Siguiente prioridad aprobada |
| Videollamada WebRTC | 65% | Señalización segura; TTS pendiente |
| Persistencia / RLS | ✅ Completo | Todas las tablas protegidas |
| **Global** | **~68%** | — |

El flujo principal (onboarding → chat → mensajes traducidos → videollamada con subtítulos de texto) funciona en producción. El "momento diferencial" (escuchar la traducción en voz) no existe todavía.

---

## 2. Arquitectura actual

```
Internet
  │
  ├── Vercel — https://spabla.vercel.app
  │   ├── Next.js 16.2.6 (App Router)
  │   ├── /home           → pantalla de inicio
  │   ├── /onboarding     → registro + signInAnonymously()
  │   ├── /chat?id=UUID   → chat + videollamada integrada
  │   ├── /api/translate  → proxy OpenAI GPT-4o-mini (auth JWT obligatoria)
  │   └── /api/ice-servers → TURN credentials (server-side)
  │
  ├── Render — https://spabla-server.onrender.com
  │   ├── Node.js + Socket.io 4.8.3
  │   ├── Middleware JWT: io.use() valida token via getClaims() ES256
  │   ├── join-room: valida membership contra Supabase + cache por socket
  │   ├── Señalización WebRTC (offer/answer/ICE)
  │   └── Streaming PCM → Deepgram Live STT → transcript-result → /api/translate → subtitle
  │
  └── Supabase — wztkxtgmuaegonlkukeh.supabase.co
      ├── PostgreSQL — users, conversations, participants, messages, files
      ├── RLS activo en todas las tablas (ver sección 5)
      ├── Auth — Anonymous Auth activo, Modelo B (users.id = auth.uid())
      ├── Realtime — suscripción INSERT en messages (funcionando, sin %20)
      └── Storage — tabla files creada, bucket pendiente
```

**Principio fundamental:** una conversación = una única sesión. El `conversationId` (UUID) es el identificador central de todo: URL, Socket.io room, Supabase Realtime filter, y clave de validación en el signaling server.

---

## 3. Migraciones aplicadas

### Migración 1 — Schema base
```sql
ALTER TABLE public.messages ALTER COLUMN type SET DEFAULT 'text';
CREATE TABLE IF NOT EXISTS public.files (...);
```

### Migración 2 — Función helper anti-recursión RLS
```sql
CREATE OR REPLACE FUNCTION public.is_participant(conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM conversation_participants
                     WHERE conversation_id = conv_id AND user_id = auth.uid()); $$;
```

### Función auxiliar shares_conversation (pre-Migración 3)
```sql
CREATE OR REPLACE FUNCTION public.shares_conversation(other_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM conversation_participants cp1
                     JOIN conversation_participants cp2
                       ON cp1.conversation_id = cp2.conversation_id
                     WHERE cp1.user_id = auth.uid()
                       AND cp2.user_id = other_user_id); $$;
```

### Migración 3 — RLS en public.users
```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select"     ON public.users FOR SELECT USING (id = auth.uid() OR shares_conversation(id));
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (id = auth.uid());
-- Nota: se encontró y eliminó una policy "Allow all" preexistente en users.
```

### Migración 4 — RLS en conversations y conversation_participants
```sql
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT
  USING (created_by = auth.uid() OR is_participant(id));
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_select" ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid() OR is_participant(conversation_id));
CREATE POLICY "participants_insert" ON public.conversation_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());
```
*Nota: `created_by` resuelve el problema de RETURNING tras INSERT — el creador puede leer la conversación recién creada antes de ser participante.*

### Migración 5 — RLS en messages y files
```sql
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (is_participant(conversation_id));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (is_participant(conversation_id) AND sender_id = auth.uid());

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_select" ON public.files FOR SELECT USING (is_participant(conversation_id));
CREATE POLICY "files_insert" ON public.files FOR INSERT
  WITH CHECK (is_participant(conversation_id) AND sender_id = auth.uid());
```

---

## 4. Estado RLS por tabla

| Tabla | RLS | Policies activas |
|---|---|---|
| `users` | ✅ ON | `users_select`, `users_insert_own`, `users_update_own` |
| `conversations` | ✅ ON | `conversations_select`, `conversations_insert` |
| `conversation_participants` | ✅ ON | `participants_select`, `participants_insert` |
| `messages` | ✅ ON | `messages_select`, `messages_insert` |
| `files` | ✅ ON | `files_select`, `files_insert` |

No existe ninguna policy `DELETE` en ninguna tabla (decisión explícita).
No existe ninguna policy `"Allow all"` en ninguna tabla.

---

## 5. Policies activas — detalle completo

```
users
  users_select     SELECT  USING (id = auth.uid() OR shares_conversation(id))
  users_insert_own INSERT  WITH CHECK (id = auth.uid())
  users_update_own UPDATE  USING (id = auth.uid())

conversations
  conversations_select  SELECT  USING (created_by = auth.uid() OR is_participant(id))
  conversations_insert  INSERT  WITH CHECK (auth.uid() IS NOT NULL)

conversation_participants
  participants_select  SELECT  USING (user_id = auth.uid() OR is_participant(conversation_id))
  participants_insert  INSERT  WITH CHECK (user_id = auth.uid())

messages
  messages_select  SELECT  USING (is_participant(conversation_id))
  messages_insert  INSERT  WITH CHECK (is_participant(conversation_id) AND sender_id = auth.uid())

files
  files_select  SELECT  USING (is_participant(conversation_id))
  files_insert  INSERT  WITH CHECK (is_participant(conversation_id) AND sender_id = auth.uid())
```

### Funciones SECURITY DEFINER activas

| Función | Propósito | Usada en |
|---|---|---|
| `is_participant(conv_id uuid)` | ¿Es auth.uid() participante de esta conversación? | conversations_select, participants_select, messages_*, files_*, signaling (indirectamente via RLS) |
| `shares_conversation(other_user_id uuid)` | ¿Comparte auth.uid() alguna conversación con otro usuario? | users_select |

---

## 6. Índices creados

```sql
CREATE INDEX idx_participants_user_id   ON public.conversation_participants(user_id);
CREATE INDEX idx_messages_conv_created  ON public.messages(conversation_id, created_at);
CREATE INDEX idx_conversations_created_by ON public.conversations(created_by);
```

---

## 7. Cambios en /api/translate

**Archivo:** `app/api/translate/route.ts`

### Antes
- Sin autenticación: cualquier origen podía llamar directamente
- Sin rate limiting
- Sin límite de longitud
- `catch` devolvía `{ translation: "" }` (bug: mensajes vacíos en producción)

### Después
- **Auth obligatoria** via `getClaims(token)` — verifica firma ES256 localmente con JWKS cacheado; `try/catch` rodea el `await` para cubrir excepciones de tokens malformados/expirados
- **Rate limiting** 20 req/min por `userId` (in-memory Map module-level — ver limitación P1)
- **Límite de texto** 1000 caracteres — devuelve original sin llamar a OpenAI
- **Fix error handling** — todos los paths de error devuelven `{ translation: text }` (nunca string vacío)
- **Header `x-translate-ms`** — duración real de la llamada a OpenAI en cada respuesta (útil para benchmarks)
- **Cliente Supabase singleton** a nivel de módulo — JWKS se cachea para toda la vida de la instancia warm

### Tests de seguridad (9/9 PASS)

| Test | Resultado |
|---|---|
| Sin token | ✅ 401 |
| Token vacío | ✅ 401 |
| Texto plano (no JWT) | ✅ 401 |
| JWT con firma falsa | ✅ 401 |
| Payload manipulado (sub cambiado, firma original) | ✅ 401 |
| JWT expirado (exp pasado, kid real, firma falsa) | ✅ 401 |
| JWT de otro proyecto | ✅ 401 |
| JWT con alg=HS256 (algorithm confusion) | ✅ 401 |
| Token válido | ✅ 200 + traducción |

### Benchmark de latencia (20 muestras, textos 5-15 palabras)

| Métrica | OpenAI solo | Total extremo a extremo |
|---|---|---|
| p50 | 520 ms | 716 ms |
| p95 | 934 ms | 1151 ms |
| p99 | 1065 ms | 1332 ms |

Conclusión: TTS con SpeechSynthesis viable (delay p50 ~870ms desde fin de frase hasta audio traducido).

---

## 8. Cambios en server/signaling.ts

**Commit:** `082437c`

### Antes
- `join-room` aceptaba cualquier UUID sin validación
- Cualquier cliente podía conectarse y escuchar señalización y subtítulos de cualquier sala

### Después

**Capa 1 — Middleware `io.use()`:**
- Rechaza la conexión si no hay token o el token es inválido
- Usa `supabaseAuth.auth.getClaims(token)` (ES256 local, singleton)
- Almacena `socket.data.userId`, `socket.data.token`, `socket.data.authorizedRooms = new Set()`

**Capa 2 — `join-room` con validación de membresía:**
- Valida formato UUID antes de cualquier query
- Cache `authorizedRooms`: si la room ya fue validada en esta conexión, no vuelve a consultar Supabase
- Si no está en cache: dos queries con lógica OR:
  1. `conversation_participants WHERE conversation_id=roomId AND user_id=userId`
  2. Si falla: `conversations WHERE id=roomId AND created_by=userId`
- Si ambas fallan: `socket.emit("join-error", ...)` y return

**Variables de entorno necesarias en Render (nuevas):**
```
SUPABASE_URL      = https://wztkxtgmuaegonlkukeh.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6...  (ver /tmp/spabla_anon_key.txt o .env.local)
```
⚠️ Sin estas variables, el servidor arranca pero rechaza TODAS las conexiones (getClaims falla con SUPABASE_URL vacío).

---

## 9. Cambios en useWebRTC.ts

**Commit:** `082437c` + `86a7c2c`

1. **Importación de `supabase`** desde `@/lib/supabase`
2. **Token en el handshake del socket:**
```typescript
const { data: { session: callSession } } = await supabase.auth.getSession();
const socket = io(SERVER_URL, {
  transports: ["polling", "websocket"],
  auth: { token: callSession?.access_token ?? "" },
});
```
3. **Handler `join-error`:** si el servidor rechaza la sala, llama a `endCall()` y muestra error en UI
4. **Token Bearer en llamadas a `/api/translate`** dentro del handler `transcript-result`

---

## 10. Variables de entorno

### Vercel (Settings → Environment Variables)

| Variable | Tipo | Estado | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | ✅ Configurada | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | ✅ Configurada (corregida) | Verificar que empieza por `eyJh` sin espacios |
| `OPENAI_API_KEY` | Privada | Verificar ✓ | Sin ella, traducción devuelve original silenciosamente |
| `TURN_URLS` | Privada | Verificar ✓ | Para llamadas cross-network |
| `TURN_USERNAME` | Privada | Verificar ✓ | |
| `TURN_CREDENTIAL` | Privada | Verificar ✓ | |

### Render (Environment Variables)

| Variable | Estado | Notas |
|---|---|---|
| `DEEPGRAM_API_KEY` | ✅ Configurada | STT en streaming |
| `PORT` | Auto (10000) | Inyectada por Render |
| `SUPABASE_URL` | ⚠️ **PENDIENTE** | Añadir antes del próximo deploy |
| `SUPABASE_ANON_KEY` | ⚠️ **PENDIENTE** | Añadir antes del próximo deploy |

**Acción requerida:** añadir `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el panel de Render **antes** de que el servidor desplegado actualice. Usar el valor de `/tmp/spabla_anon_key.txt` (208 chars, sin espacios) o `.env.local`.

---

## 11. Tests ejecutados y resultado

### E2E producción — flujo completo (13/13 PASS)
Ejecutado tras migraciones y hardening de /api/translate:
- U1 onboarding → /chat ✅
- signInAnonymously HTTP 200 ✅
- conversationId UUID ✅
- Realtime WebSocket sin %20, frames activos ✅
- U2 join via link ✅
- shares_conversation: U2 detecta idioma de U1 ✅
- Traducción autenticada (200 + x-translate-ms) ✅
- U1 INSERT mensaje 201 ✅
- U2 recibe mensaje de U1 ✅
- U2 INSERT mensaje 201 ✅
- U1 recibe mensaje de U2 ✅
- Sin errores críticos en consola ✅

### Tests de seguridad /api/translate (9/9 PASS)
Ver sección 7.

### Tests de autorización signaling server (6/6 PASS)
Ejecutados contra servidor local con variables Supabase reales:

| Test | Escenario | Resultado |
|---|---|---|
| D | Sin token → rechazado en conexión | ✅ `connect_error: Unauthorized: missing token` |
| A | Creador/participante → aceptado | ✅ |
| B | Invitado via link → aceptado | ✅ |
| C | Token válido, no participante ni creador → rechazado | ✅ `join-error: Not authorized for this room` |
| E | UUID malformado → join-error | ✅ `join-error: Invalid room ID` |
| F | Cache: re-join misma room → aceptado sin nueva query | ✅ |

**Test E del diseño** (creador sin entrada en `conversation_participants`): no simulable via API pública porque RLS bloquea DELETE en `conversation_participants`. Esto confirma que RLS funciona correctamente. La lógica OR está implementada y verificada por inspección de código.

---

## 12. Riesgos pendientes

### P1 — Rate limiting no coordina entre instancias Vercel ⚠️ (ANTES de beta pública)
El `Map` en memoria de `/api/translate` no se comparte entre instancias serverless paralelas. Un atacante que distribuya requests entre instancias puede superar el límite.

**Solución:** Upstash Redis (tier gratuito).
```bash
npm install @upstash/redis
# Variables en Vercel:
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```
Estimación: 2-3 horas.

### P2 — Signaling server no desplegado en Render con las nuevas variables ⚠️ (ACCIÓN INMEDIATA)
El commit `082437c` con la validación JWT está en `main`. Render desplegará automáticamente, pero sin `SUPABASE_URL` y `SUPABASE_ANON_KEY`, el middleware rechazará todas las conexiones.

**Acción:** añadir las dos variables en el panel de Render ANTES de que el deploy automático complete.

### P3 — TTS no implementado
El benchmark confirma viabilidad (p50 ~870ms). Aprobado como próximo paso.

### P4 — Paginación de mensajes ausente
`loadMessages()` hace `SELECT *` sin `LIMIT`. Una conversación con >500 mensajes puede degradar UX.

### P5 — `ScriptProcessorNode` deprecated en useWebRTC.ts
Funciona en todos los navegadores actuales. Migración a `AudioWorklet` documentada en decisions.md.

### P6 — `app/call/[roomId]/page.tsx` activa (ruta obsoleta)
Viola la arquitectura master. Pendiente de eliminar.

### P7 — Render cold start (30-90s en plan gratuito/starter)
Primera llamada tras inactividad parece "congelada". Sin aviso al usuario.

### P8 — Sin manejo explícito de Render cold start en el cliente
El overlay de llamada no muestra feedback durante el cold start del servidor.

---

## 13. Próximos pasos priorizados

### Inmediato (ANTES de cualquier sesión de código)
1. **Añadir `SUPABASE_URL` y `SUPABASE_ANON_KEY` en Render** — sin esto el signaling server en producción rechaza todas las llamadas.

### Prioridad 1 — TTS con Web Speech API (aprobado, ~1 día)
Implementar `SpeechSynthesis` en `useWebRTC.ts`. Cuando llega un `subtitle` remoto final, sintetizarlo en voz. El benchmark confirma viabilidad (p50 ~870ms).

**Archivos:** `app/chat/hooks/useWebRTC.ts`, `app/chat/components/VideoOverlay.tsx`

### Prioridad 2 — Rate limiting con Redis/Upstash (~2-3h)
Reemplazar el `Map` en memoria de `/api/translate` con Upstash Redis.

**Archivo:** `app/api/translate/route.ts`

### Prioridad 3 — Paginación de mensajes (~2h)
Añadir `LIMIT 50` + cursor en `loadMessages()`.

**Archivo:** `app/chat/page.tsx`

### Prioridad 4 — Eliminar ruta obsoleta /call/[roomId] (~30min)
```
Eliminar: app/call/[roomId]/page.tsx
Redirigir: app/call/page.tsx → /home
Eliminar:  lib/webrtc.ts (código muerto)
Eliminar:  next.config.ts (ignorado por Next.js)
```

### Prioridad 5 — REVOKE EXECUTE en funciones SECURITY DEFINER
```sql
REVOKE EXECUTE ON FUNCTION public.is_participant(uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_conversation(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_participant(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.shares_conversation(uuid) TO authenticated;
```

---

## 14. Qué NO debe modificarse

- `server/signaling.ts` — lógica de STT (Deepgram) y WebRTC — solo añadir TTS cuando llegue el momento
- `app/chat/components/VideoOverlay.tsx` — UI de videollamada — no tocar hasta implementar TTS
- `app/api/ice-servers/route.ts` — TURN credentials — no tocar
- Cualquier política RLS activa — no modificar sin pruebas previas y plan de rollback
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel — ya está correcta (208 chars, empieza `eyJh`)

---

## 15. Checklist para retomar mañana

```
[ ] 1. Añadir SUPABASE_URL en Render (panel → Environment Variables)
[ ] 2. Añadir SUPABASE_ANON_KEY en Render (usar /tmp/spabla_anon_key.txt o .env.local)
[ ] 3. Esperar deploy automático de Render (observar logs — debe arrancar sin errores)
[ ] 4. Verificar health: curl https://spabla-server.onrender.com/health
[ ] 5. Ejecutar test E2E de producción completo (onboarding → chat → traducción → Realtime)
[ ] 6. Confirmar que las llamadas WebRTC siguen funcionando (el middleware socket.io ahora requiere token)
[ ] 7. Si todo OK → implementar TTS (SpeechSynthesis en useWebRTC.ts)
[ ] 8. Si TTS OK → rate limiting con Upstash Redis
```

---

## Referencia rápida

| Recurso | URL |
|---|---|
| App producción | https://spabla.vercel.app |
| Signaling health | https://spabla-server.onrender.com/health |
| Supabase SQL Editor | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/sql/new |
| Supabase Auth | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/auth/providers |
| Render dashboard | https://dashboard.render.com |
| GitHub repo | https://github.com/DAVIDLENCINA/SPABLA |
| Valor correcto ANON_KEY | `~/spabla/.env.local` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (208 chars, empieza `eyJh`) |

---

*Ver `docs/PROJECT_STATUS.md` para estado completo del producto.*
*Ver `docs/roadmap.md` para fases con criterios de completitud y decisiones estratégicas.*
*Ver `docs/decisions.md` para historial de decisiones arquitecturales.*
