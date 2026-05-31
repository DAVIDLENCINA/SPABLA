# SPABLA — Estado para la próxima sesión

> Actualizado: 2026-06-01
> Carpeta local del proyecto: `~/spabla`
> Rama activa: `main` — working tree limpio
> Último commit: `62b5b21` — docs(roadmap): decisión estratégica — app móvil nativa

---

## Estado al cierre de esta sesión

### ✅ Completado

- Migraciones 1 y 2 ejecutadas y verificadas en Supabase SQL Editor:
  - `messages.type` tiene DEFAULT `'text'`
  - Tabla `files` creada
  - Función `is_participant()` con SECURITY DEFINER activa
- Bloque B implementado (Anonymous Auth con Modelo B):
  - `onboarding/page.tsx`: `signInAnonymously()` + INSERT con `id = auth.uid()`
  - `chat/page.tsx`: `getSession()` + guard `hasRedirected` con `useRef`
  - `home/page.tsx`: `getSession()` + guard `hasRedirected` con `useRef`
- Modelo B verificado manualmente en Supabase: `auth_id = public_id`, `modelo_b_ok = true`
- Flujo completo verificado en producción (`spabla.vercel.app`):
  - `/home` → `/onboarding` estable, sin flickering
  - Onboarding → `signInAnonymously()` → INSERT en `public.users` → `/chat?id=UUID`
  - Usuario creado con `id = auth.uid()` confirmado
- Push a GitHub (`main`) completado: commits `3366208` → `62b5b21`
- Decisiones de producto documentadas en `docs/roadmap.md`:
  - Llamada directa tipo WhatsApp (tablas: contacts, presence, call_invitations, call_history)
  - App móvil nativa (ruta: web → PWA opcional → React Native/Expo)

### ⚠️ Pendiente — ANTES de la próxima sesión

**P1 — Supabase Realtime falla en producción (causa pendiente de confirmar)**

**Síntoma confirmado:** el test de producción capturó este error literal en consola:
```
WebSocket connection to '...?apikey=%20eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
failed: HTTP Authentication failed; no valid credentials available
```
El `%20` es un espacio URL-encoded al inicio del API key. Realtime no conecta; el chat cae al polling de fallback cada 3s.

**Causa probable (inferencia, no confirmación):** la variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel podría tener un espacio al inicio. En `.env.local` el valor es correcto (sin espacio). No se ha leído directamente la variable en el panel de Vercel.

**Acción para la próxima sesión:**
1. Abrir el panel de Vercel manualmente:
   ```
   https://vercel.com/dashboard → SPABLA → Settings → Environment Variables
   ```
2. Ver el valor actual de `NEXT_PUBLIC_SUPABASE_ANON_KEY` y confirmar si hay espacio.
3. Si lo hay, reemplazarlo por el valor correcto (sin espacios):
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6dGt4dGdtdWFlZ29ubGt1a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODQ5ODUsImV4cCI6MjA5NTU2MDk4NX0.EkYOcUi6jciTCJ0luhRdhx_nF-I5ntrJ6WLa_FmOKtE
   ```
4. Si NO hay espacio, buscar la causa real del `%20` antes de modificar nada.

**P2 — No activar RLS hasta confirmar que Realtime funciona**

Orden obligatorio:
1. Corregir `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel → verificar Realtime
2. Solo entonces ejecutar Migraciones 3, 4 y 5 (RLS)

### 🔴 Regla operativa añadida

**No usar Vercel CLI (`vercel`, `npx vercel`) sin autorización explícita del usuario.**
El comando `npx vercel whoami` abre una ventana de autenticación en el navegador sin previo aviso. Cualquier acción sobre Vercel debe hacerse manualmente desde el panel web salvo que el usuario indique lo contrario.

---

---

## Decisiones tomadas y cerradas (no reabrir)

### Modelo B — identidad única aprobado

`users.id = auth.uid()` en toda la base de datos.

- No existe columna `auth_id`.
- El onboarding llama a `signInAnonymously()` y pasa el UUID resultante explícitamente como `id` en el INSERT a `users`.
- Las políticas RLS usan `auth.uid()` directamente, sin subqueries de mapeo.
- Los 156 mensajes y 6 usuarios de prueba existentes quedan inaccesibles tras activar RLS. Pérdida aceptada.

### Anonymous Auth

Activado y verificado el 2026-05-31. Respuesta confirmada:
```
is_anonymous: true
role: authenticated
```

### Datos existentes en Supabase (estado real verificado)

| Tabla | Filas | Columnas reales |
|---|---|---|
| `users` | 6 | id, name, avatar, language_primary, language_secondary, created_at |
| `conversations` | 23 | id, created_at |
| `conversation_participants` | 43 | conversation_id, user_id |
| `messages` | 156 | id, conversation_id, sender_id, original_text, translated_text, original_language, translated_language, type, created_at |
| `files` | NO EXISTE | — |

Nota: `messages.type` existe con valor `'text'` en todos los registros. El código no lo envía en INSERT. Hay un DEFAULT implícito o un trigger en la BD — se confirma y formaliza en la Migración 1.

---

## Estado de ejecución de la Fase 1

### ✅ Completado

- Anonymous Auth activado en el panel de Supabase.

### ⏳ Pendiente — Migraciones 1 y 2 en SQL Editor

**No se han ejecutado todavía.** Requieren acción manual en el panel de Supabase porque la anon key no tiene permisos DDL.

**Ruta exacta:**
```
https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh
→ SQL Editor → New query
```

**SQL a ejecutar (bloque completo, en un solo run):**

```sql
-- ══════════════════════════════════════════════
-- MIGRACIÓN 1: Schema base
-- ══════════════════════════════════════════════

-- 1A. Asegurar DEFAULT en messages.type
ALTER TABLE public.messages
  ALTER COLUMN type SET DEFAULT 'text';

-- 1B. Crear tabla files
CREATE TABLE IF NOT EXISTS public.files (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid        NOT NULL,
  url             text        NOT NULL,
  name            text        NOT NULL,
  mime_type       text        NOT NULL,
  size_bytes      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════
-- MIGRACIÓN 2: Función helper anti-recursión RLS
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_participant(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;
```

**SQL de verificación (ejecutar inmediatamente después):**

```sql
-- Verificar Migración 1A
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'messages'
  AND column_name  = 'type';
-- Esperado: column_default = 'text'::text

-- Verificar Migración 1B
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'files';
-- Esperado: files

-- Verificar Migración 2
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'is_participant';
-- Esperado: is_participant | DEFINER
```

### 🔴 Pospuesto — Migraciones 3, 4 y 5 (RLS)

**RLS NO se activa hasta que el código del Bloque B esté funcionando.**

Motivo: si RLS se activa con el código antiguo, la app rompe completamente para todos los usuarios. El código actual no genera `users.id = auth.uid()`, por lo que las políticas rechazarían todos los INSERTs. Activar RLS primero es un error de orden.

### 🔴 Pendiente — Bloque B (cambios de código)

Son los tres archivos a modificar antes de activar RLS:

| Archivo | Cambio principal |
|---|---|
| `app/onboarding/page.tsx` | Añadir `signInAnonymously()`. Pasar `id: session.user.id` en el INSERT a `users`. |
| `app/chat/page.tsx` | Leer sesión con `supabase.auth.getSession()`. Usar `session.user.id` como `sender_id`. Redirigir a `/onboarding` si no hay sesión. |
| `app/home/page.tsx` | Verificar sesión de Auth, no solo `localStorage`. Redirigir si no hay sesión activa. |

---

## Orden de ejecución para la próxima sesión

```
1. Ejecutar Migraciones 1 + 2 en SQL Editor (si no se hizo al cerrar)
   └── Verificar con el SQL de comprobación

2. Bloque B — código
   ├── app/onboarding/page.tsx
   ├── app/chat/page.tsx
   └── app/home/page.tsx

3. Verificación de código (sin RLS)
   ├── npm run dev → crear usuario nuevo
   ├── Confirmar en Supabase que users.id = auth.uid()
   ├── Enviar mensaje → confirmar sender_id = auth.uid()
   └── Invitar segundo usuario → confirmar que ambos ven el chat

4. Solo si el paso 3 pasa: activar RLS
   ├── Migración 3 — users
   ├── Migración 4 — conversations + participants
   └── Migración 5 — messages + files

5. Verificación de seguridad
   ├── Usuario A no puede leer conversaciones de usuario B
   └── Manipular localStorage no da acceso a datos ajenos

6. git push → deploy a Vercel
```

---

## Primer comando de la próxima sesión

Si las Migraciones 1 y 2 ya están ejecutadas, el primer paso es:

```bash
cd ~/spabla && claude
```

Y dar la instrucción:
```
Empieza el Bloque B. Modifica onboarding/page.tsx para implementar
signInAnonymously() con Modelo B (users.id = auth.uid()).
```

Si las Migraciones 1 y 2 NO están ejecutadas todavía, el primer paso es ir al SQL Editor:
```
https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/sql/new
```
Y ejecutar el SQL de Migraciones 1 y 2 de este documento.

---

## Riesgos conocidos para la próxima sesión

**R1 — Usuarios con localStorage antiguo (sin sesión Auth)**
Tras el Bloque B, cualquier usuario que tenga un `spabla_user` antiguo en localStorage (sin sesión de Supabase Auth válida) será redirigido a `/onboarding` al abrir la app. Creará un perfil nuevo. Sus mensajes anteriores no serán accesibles. Para una beta privada con pocos usuarios conocidos, es gestionable comunicándolo con antelación.

**R2 — RLS puede bloquear queries legítimas si las políticas tienen errores**
El riesgo más alto de la Fase 1. Mitigación: activar RLS tabla a tabla, probar entre cada paso, y tener listo el rollback:
```sql
ALTER TABLE public.{tabla} DISABLE ROW LEVEL SECURITY;
```

**R3 — `messages.type` DEFAULT no confirmado**
Si la Migración 1A falla (el tipo ya existe con un DEFAULT diferente o hay un CHECK constraint), los nuevos mensajes podrían fallar en INSERT. La Migración 1A incluye la verificación previa.

**R4 — `is_participant()` con SECURITY DEFINER**
La función tiene acceso sin RLS a `conversation_participants`. Si hay un bug lógico en la función, podría permitir acceso incorrecto. La función es simple (EXISTS + WHERE), el riesgo es bajo pero debe revisarse con atención en el test de seguridad del paso 5.

**R5 — OPENAI_API_KEY sin confirmar en Vercel**
Sigue pendiente de verificar. Sin ella, la traducción falla silenciosamente en producción. Confirmar en el panel de Vercel antes del deploy final.

---

## Archivos que NO deben tocarse en la próxima sesión

- `server/signaling.ts` — la señalización WebRTC no cambia en Fase 1
- `app/chat/hooks/useWebRTC.ts` — no cambia en Fase 1
- `app/chat/components/VideoOverlay.tsx` — no cambia en Fase 1
- `app/api/translate/route.ts` — no cambia en Fase 1
- `app/api/ice-servers/route.ts` — no cambia en Fase 1

---

## Referencia rápida de URLs y recursos

| Recurso | URL |
|---|---|
| Supabase SQL Editor | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/sql/new |
| Supabase Auth settings | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/auth/providers |
| Supabase Table Editor | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/editor |
| Vercel project | https://vercel.com/dashboard |
| Render dashboard | https://dashboard.render.com |
| App en producción | https://spabla.vercel.app |
| Señalización (health) | https://spabla-server.onrender.com/health |
| GitHub repo | https://github.com/DAVIDLENCINA/SPABLA |

---

*Ver `docs/PROJECT_STATUS.md` para el estado completo del producto.*
*Ver `docs/decisions.md` para el historial de decisiones arquitecturales.*
