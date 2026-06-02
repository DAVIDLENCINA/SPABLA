# SPABLA — Master Document

> Última actualización: 2026-06-02
> Rama activa: `main`
> Último commit desplegado: `840cae7` — clean: beta limpia

---

## Qué es SPABLA

SPABLA es una plataforma de comunicación multilingüe en tiempo real.
Permite a dos personas que hablan idiomas distintos comunicarse mediante chat de texto, llamadas de voz y videollamadas, con traducción simultánea automática y subtítulos en tiempo real.

**Propuesta de valor central:** el idioma desaparece. La conversación permanece.

---

## Estado actual (2026-06-02)

| Dimensión | Estado |
|---|---|
| Chat con traducción | ✅ Funcionando en producción |
| Videollamada con subtítulos | ✅ Funcionando en producción |
| Llamada de voz | 🟡 Funciona pero sin UX adecuada |
| Llamada entrante (aceptar/rechazar) | 🔴 Infraestructura creada, no probada |
| TTS (escuchar traducción en voz) | 🟡 Web Speech API implementada (default OFF) |
| Autenticación (Anonymous Auth) | ✅ Modelo B activo, users.id = auth.uid() |
| RLS en todas las tablas | ✅ Activo y verificado |
| Señalización WebRTC con JWT | ✅ Activo y verificado |
| Traducción server-side | ✅ TRANSLATE_SERVER_SIDE=true en Render |

---

## URLs de producción

| Servicio | URL |
|---|---|
| Frontend | https://spabla.vercel.app |
| Servidor de señalización | https://spabla-server.onrender.com |
| Health signaling | https://spabla-server.onrender.com/health |
| Repositorio | https://github.com/DAVIDLENCINA/SPABLA |

---

## Arquitectura

```
Internet
  │
  ├── Vercel — https://spabla.vercel.app
  │   ├── Next.js 16.2.6 (App Router)
  │   ├── /home          → pantalla de inicio
  │   ├── /onboarding    → registro + signInAnonymously()
  │   ├── /chat?id=UUID  → chat + llamadas integradas
  │   ├── /api/translate → proxy OpenAI GPT-4o-mini (JWT obligatorio)
  │   └── /api/ice-servers → TURN credentials (server-side)
  │
  ├── Render — https://spabla-server.onrender.com
  │   ├── Node.js + Socket.io 4.8.3
  │   ├── Middleware JWT (getClaims ES256, verifica en handshake)
  │   ├── join-room valida membership en Supabase + cache por socket
  │   ├── Señalización WebRTC (offer/answer/ICE)
  │   ├── Streaming PCM → Deepgram Live STT → traducción server-side
  │   └── TRANSLATE_SERVER_SIDE=true → Render llama OpenAI directamente
  │
  └── Supabase — wztkxtgmuaegonlkukeh.supabase.co
      ├── PostgreSQL — users, conversations, participants, messages, files, call_signals
      ├── RLS activo en TODAS las tablas
      ├── Auth — Anonymous Auth, Modelo B (users.id = auth.uid())
      ├── Realtime — mensajes + call_signals
      └── Funciones: is_participant(), shares_conversation()
```

**Principio fundamental:** una conversación = una única sesión. El `conversationId` es el identificador central de todo el sistema.

---

## Decisiones arquitecturales congeladas (no tocar)

1. **Backend congelado** — WebRTC, Deepgram, OpenAI, signaling, Supabase
2. **Modelo B** — `users.id = auth.uid()` en toda la base de datos
3. **Traducción server-side** — Render llama a OpenAI directamente (−54% latencia p50)
4. **JWT en signaling** — `io.use()` + validación de membership por room
5. **RLS** — todas las tablas protegidas, sin políticas "Allow all"

---

## Stack tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Next.js | 16.2.6 | Framework (App Router) |
| React | 19.2.4 | UI |
| TypeScript | ^5 | Tipado |
| Supabase JS | ^2.106.2 | DB, Auth, Realtime |
| Socket.io | ^4.8.3 | Señalización WebRTC |
| Deepgram SDK | ^3.13.0 | STT en streaming |
| Framer Motion | ^12.40.0 | Animaciones |

---

## Variables de entorno críticas

### Vercel
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← verificar que empieza por `eyJh` sin espacios
- `OPENAI_API_KEY`
- `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`

### Render
- `DEEPGRAM_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `TRANSLATE_SERVER_SIDE=true`
- `OPENAI_API_KEY`
- `MEASURE_SECRET` ← endpoint de benchmark, eliminar antes de beta pública
- `PORT` (inyectada automáticamente por Render)

---

## Roadmap de producto

### Fase actual: UX/UI (congelado backend)

**Prioridad 1 — Llamada entrante funcional**
- Implementar flujo completo: llamar → recibir → aceptar/rechazar → conectar
- tabla `call_signals` ya creada con RLS
- Probar en dispositivos físicos reales

**Prioridad 2 — Diseño definitivo de las 3 pantallas**
- Chat: estado vacío honesto, historial real de conversaciones
- Llamada de voz: dentro del chat, sin VideoOverlay, sin cámara
- Videollamada: rediseño premium, subtítulos más discretos

**Prioridad 3 — TTS con proveedor premium**
- Benchmark confirma viabilidad: p50 870ms total (STT+translate+speak)
- Candidato: OpenAI TTS vía `/api/tts`

### Futuro (post-beta)

- Rate limiting multi-instancia (Upstash Redis)
- Paginación de mensajes
- Sistema de contactos + presencia
- Llamada directa tipo WhatsApp
- App móvil nativa (React Native + Expo)

---

## Reglas de trabajo

1. **Antes de cualquier sesión de código:** leer `PROJECT_STATUS.md` y `NEXT_SESSION.md`
2. **No activar RLS sin probar primero el código** con un usuario real
3. **No usar Vercel CLI sin autorización explícita**
4. **No hacer commit sin build limpio** (`npm run build`)
5. **Backend congelado** — no tocar WebRTC, Deepgram, OpenAI, signaling, Supabase
