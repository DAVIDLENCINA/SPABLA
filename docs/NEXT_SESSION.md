# SPABLA — Estado para la próxima sesión

> Actualizado: 2026-06-02
> Rama activa: `main`
> Último commit: `840cae7` — clean: beta limpia
> Working tree: MODIFICADO — cambios sin commit (ver sección abajo)

---

## REGLA OBLIGATORIA ANTES DE PROGRAMAR

**Leer este documento completo antes de escribir una sola línea de código.**

No continuar programación sin revisar PROJECT_STATUS.md y este documento.

---

## Resumen de la sesión (2026-06-02)

### ✅ Completado

**Backend (congelado):**
- Chat funcionando correctamente en producción
- Traducción texto funcionando (server-side, −54% latencia)
- Videollamada con subtítulos funcionando
- Supabase Realtime funcionando (WebSocket sin %20)
- Señalización con JWT funcionando
- RLS en todas las tablas verificado

**Limpieza de código (commiteado en `840cae7`):**
- Eliminadas rutas obsoletas: `/call/[roomId]` → redirect, `/call` → redirect
- Eliminados datos hardcodeados: Sophia/Ahmed/Marie → estado vacío honesto
- Eliminados cards rotos: Documentos/Imágenes/Traductor
- Eliminados tabs rotos: Archivos/Perfil
- Botón adjunto → tooltip "Próximamente"
- Código muerto eliminado: `lib/webrtc.ts`, `next.config.ts`, `SmallBtn`

**Infraestructura Fase 2A (tabla call_signals):**
- Tabla `call_signals` creada en Supabase con RLS
- Políticas: `call_signals_select`, `call_signals_insert`, `call_signals_update`

**Código de Fase 2A implementado (SIN COMMIT — pendiente de validación):**
- `useRingTone.ts` — tono sintético Web Audio API
- `useCallSignaling.ts` — suscripción Realtime a call_signals, estados, timeout 30s
- `IncomingCallOverlay.tsx` — pantalla full screen de llamada entrante
- `chat/page.tsx` — integración completa: banner de voz, subtítulos en chat, overlay entrante
- `VideoOverlay.tsx` — prop `mode: 'voice'|'video'`, modo voz sin cámara

### ❌ No completado

**Pruebas en dispositivos físicos:**
El iPhone no podía acceder a `http://192.168.1.32:3000`. Diagnóstico realizado:
- Next.js confirma escucha en IPv4 `*:3000` ✅
- Firewall de macOS desactivado ✅
- Servidor responde desde el propio Mac (`curl`, `nc` OK) ✅
- **Causa más probable:** AP Isolation en el router o dispositivos en subredes diferentes

Sin pruebas reales, el código de Fase 2A **no se ha commiteado**.

---

## Estado del working tree (CAMBIOS SIN COMMIT)

```
app/chat/hooks/useRingTone.ts           ← NUEVO (tono de llamada)
app/chat/hooks/useCallSignaling.ts      ← NUEVO (suscripción Realtime call_signals)
app/chat/hooks/useTranslatedSpeech.ts   ← NUEVO (Web Speech API TTS)
app/chat/components/IncomingCallOverlay.tsx ← NUEVO (pantalla llamada entrante)
app/chat/page.tsx                       ← MODIFICADO (integración completa)
app/chat/components/VideoOverlay.tsx    ← MODIFICADO (modo voz/video, prop mode)
SPABLA_MASTER.md                        ← NUEVO
docs/PROJECT_STATUS.md                  ← ACTUALIZADO
docs/NEXT_SESSION.md                    ← ACTUALIZADO
```

Todos los cambios compilan sin errores (`npm run build` ✅, `tsc --noEmit` ✅).

---

## Primer paso de la próxima sesión

**ANTES DE NADA:** resolver el acceso Mac ↔ iPhone.

### Opción A — Resolver AP Isolation del router
1. Acceder al panel del router (típicamente `http://192.168.1.1`)
2. Buscar en WiFi: "AP Isolation", "Client Isolation", "Aislamiento de clientes"
3. Desactivarlo
4. Verificar: desde iPhone, abrir `http://192.168.1.32:3000`

### Opción B — Usar hotspot del iPhone (más rápida)
1. iPhone: Ajustes → Punto de acceso personal → Activar
2. Mac: conectarse al hotspot del iPhone
3. En el Mac: `ifconfig | grep "inet "` → anotar la nueva IP (será 172.20.10.x)
4. En el iPhone: `http://172.20.10.x:3000`

### Opción C — Probar directamente en producción (Vercel)
1. Hacer commit + push del código actual
2. Probar en `https://spabla.vercel.app` desde iPhone
3. No depender de la red local

---

## Orden de trabajo para la próxima sesión

```
1. Resolver acceso iPhone (ver opciones arriba)

2. Probar los 8 tests de Fase 2A en dispositivos reales:
   - Llamada entrante aparece en B
   - Tono suena en B
   - Aceptar → llamada conecta
   - Rechazar → status='rejected' en Supabase
   - Cancelar → status='cancelled' en Supabase
   - Llamada perdida (30s) → status='missed' en Supabase
   - Colgar → status='ended' en Supabase
   - Estado limpio tras cada prueba

3. Si los 8 tests pasan → commit + push → deploy a Vercel

4. Fase 2B: rediseño definitivo de las 3 pantallas
   (solo tras confirmar que la lógica funciona)
```

---

## Decisiones tomadas y cerradas

| Decisión | Estado |
|---|---|
| Backend congelado | ✅ Cerrada — no tocar WebRTC/Deepgram/OpenAI/signaling/Supabase |
| Modelo B (users.id = auth.uid()) | ✅ Cerrada |
| Traducción server-side | ✅ Activo (TRANSLATE_SERVER_SIDE=true en Render) |
| Llamada de voz dentro del chat (sin VideoOverlay) | ✅ Cerrada — implementado, pendiente de probar |
| Videollamada mantiene VideoOverlay | ✅ Cerrada |
| call_signals vía Supabase Realtime | ✅ Cerrada |
| No mantener sockets permanentes | ✅ Cerrada |

---

## Pendientes de diseño (Fase 2C — después de validar lógica)

1. **Diseño definitivo de Chat**
   - Historial real de conversaciones (query a Supabase)
   - Mismo ADN visual que llamada/videollamada

2. **Diseño definitivo de Llamada de voz**
   - Dentro del chat, sin cámara, sin VideoOverlay
   - Banner superior fijo: "Llamada activa · 00:32" + Mic + Rojo + Altavoz
   - Subtítulos como mensajes en el flujo del chat

3. **Diseño definitivo de Videollamada**
   - Remoto full screen, local portrait arriba-derecha
   - Subtítulos más discretos (−25-30% tamaño)
   - Máximo 2 líneas visibles
   - Barra de controles unificada: 🎤 📹 🔴 🔊 ⋯

---

## Variables de entorno a verificar antes de pruebas

### Render — verificar que están todas
```
DEEPGRAM_API_KEY    ✅
SUPABASE_URL        ✅
SUPABASE_ANON_KEY   ✅
TRANSLATE_SERVER_SIDE=true ✅
OPENAI_API_KEY      ✅
MEASURE_SECRET      ⚠️ Eliminar antes de beta pública
PORT                ✅ (automática)
```

### Vercel — verificar ANON_KEY correcta
```
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← debe empezar por 'eyJh', 208 chars, sin espacios
NEXT_PUBLIC_SUPABASE_URL        ✅
OPENAI_API_KEY                  ✅
TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL ✅
```

---

## Referencia rápida

| Recurso | URL |
|---|---|
| App producción | https://spabla.vercel.app |
| Signaling health | https://spabla-server.onrender.com/health |
| Supabase SQL Editor | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/sql/new |
| Supabase Table Editor | https://supabase.com/dashboard/project/wztkxtgmuaegonlkukeh/editor |
| Render dashboard | https://dashboard.render.com |
| GitHub repo | https://github.com/DAVIDLENCINA/SPABLA |
| Valor correcto ANON_KEY | `~/spabla/.env.local` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

---

*Ver `SPABLA_MASTER.md` para visión general y stack.*
*Ver `docs/PROJECT_STATUS.md` para estado detallado de funcionalidades.*
*Ver `docs/roadmap.md` para fases y decisiones estratégicas de producto.*
