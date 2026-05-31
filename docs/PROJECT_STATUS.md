# SPABLA — Estado del proyecto

> Última actualización: 2026-05-31
> Carpeta local: `~/spabla` (renombrada desde `~/glot` el 2026-05-31)

---

## Estado general

| Dimensión | Progreso |
|---|---|
| Backend (APIs, señalización, STT) | 58% |
| Frontend (pantallas, componentes) | 74% |
| Traducción (texto) | 70% |
| Traducción (voz / TTS) | 0% |
| Videollamada (WebRTC + subtítulos texto) | 62% |
| Persistencia (Supabase, auth, RLS) | 38% |
| **Global** | **58%** |

El flujo principal de texto — onboarding → chat → mensaje traducido — funciona si las API keys están configuradas en los servicios de despliegue. El momento diferencial del producto (escuchar la traducción en voz durante una llamada) no existe todavía: TTS no está implementado.

---

## URLs de producción

| Servicio | URL |
|---|---|
| Frontend | https://spabla.vercel.app |
| Servidor de señalización | https://spabla-server.onrender.com |
| Repositorio | https://github.com/DAVIDLENCINA/SPABLA |
| Health check (servidor) | https://spabla-server.onrender.com/health |

---

## Arquitectura

```
Internet
  │
  ├── Vercel (frontend)
  │   ├── Next.js 16.2.6 — App Router
  │   ├── /home           → pantalla de inicio
  │   ├── /onboarding     → registro de usuario
  │   ├── /chat?id=UUID   → chat + videollamada integrada
  │   ├── /api/translate  → proxy a OpenAI (server-side)
  │   └── /api/ice-servers → TURN credentials (server-side)
  │
  ├── Render (servidor de señalización)
  │   ├── Node.js + Socket.io
  │   ├── Señalización WebRTC (offer/answer/ICE)
  │   └── Streaming PCM → Deepgram Live STT
  │
  └── Supabase
      ├── PostgreSQL — users, conversations, participants, messages
      ├── Realtime — suscripción a INSERT en messages
      ├── Auth — configurado, pendiente de integrar en la app
      └── Storage — en el modelo de datos, sin implementar
```

### Principio fundamental

**Una conversación = una única sesión.**

El `conversationId` de Supabase es el identificador central de todo el sistema. El mismo UUID se usa como `roomId` en Socket.io, como filtro en Supabase Realtime y como parámetro de URL (`/chat?id={conversationId}`). No existen salas independientes para llamadas ni videollamadas.

### Flujo de videollamada

```
Micrófono
  → AudioContext + ScriptProcessorNode (4096 samples, deprecated)
  → PCM Int16
  → socket.emit("audio-chunk")
  → Render server
  → Deepgram nova-2 (live streaming)
  → "transcript-result" { text, isFinal }
  → si isFinal: fetch /api/translate (OpenAI GPT-4o-mini)
  → socket.emit("subtitle", { original, translated, fromLang })
  → participante remoto recibe subtítulo
  → [TTS pendiente: SpeechSynthesis / ElevenLabs]
```

---

## Tecnologías

### Frontend
| Tecnología | Versión | Rol |
|---|---|---|
| Next.js | 16.2.6 | Framework (App Router) |
| React | 19.2.4 | UI |
| TypeScript | ^5 | Tipado estático |
| Tailwind CSS | ^4 | Estilos base |
| Framer Motion | ^12.40.0 | Animaciones |
| Lucide React | ^1.17.0 | Iconos |
| Socket.io Client | ^4.8.3 | Conexión al servidor de señalización |
| @supabase/supabase-js | ^2.106.2 | Cliente Supabase |

### Backend / Servidor de señalización
| Tecnología | Versión | Rol |
|---|---|---|
| Node.js | Runtime de Render | Proceso persistente |
| Socket.io | ^4.8.3 | Señalización WebRTC + relay de subtítulos |
| @deepgram/sdk | ^3.13.0 | STT en streaming |
| tsx | ^4.0.0 | Ejecutar TypeScript sin compilar |

### Servicios externos
| Servicio | Uso | Crítico |
|---|---|---|
| Supabase | Base de datos, Realtime, Auth, Storage | Sí |
| Deepgram | STT (Speech-to-Text) en streaming | Sí |
| OpenAI GPT-4o-mini | Traducción de texto y subtítulos | Sí |
| Metered.ca | TURN server para NAT traversal | Sí (cross-network) |
| Vercel | Despliegue del frontend | Sí |
| Render | Despliegue del servidor de señalización | Sí |
| ElevenLabs | TTS (Text-to-Speech) — pendiente de integrar | No (aún) |

---

## Variables de entorno

### `.env.local` (frontend local — nunca se versiona)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://wztkxtgmuaegonlkukeh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# TURN — Metered.ca
TURN_URLS=turn:global.relay.metered.ca:80,...
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

### Variables requeridas en Vercel (panel → Settings → Environment Variables)

| Variable | Descripción | Tipo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon de Supabase | Pública |
| `TURN_URLS` | URLs TURN separadas por coma | Privada (server-side) |
| `TURN_USERNAME` | Usuario TURN | Privada (server-side) |
| `TURN_CREDENTIAL` | Contraseña TURN | Privada (server-side) |
| `OPENAI_API_KEY` | Clave OpenAI para traducción | **CRÍTICA — privada** |

> ⚠️ `OPENAI_API_KEY` NO está en `.env.local`. Debe estar en Vercel. Sin ella, toda la traducción falla silenciosamente — el usuario ve el texto original sin aviso de error.

### Variables requeridas en Render (servidor de señalización)

| Variable | Descripción |
|---|---|
| `DEEPGRAM_API_KEY` | Clave Deepgram para STT en streaming |
| `PORT` | Render la inyecta automáticamente (valor: 10000) |

> ⚠️ `DEEPGRAM_API_KEY` debe estar configurada en Render. Sin ella, la transcripción de voz falla y los subtítulos no aparecen.

---

## Cómo arrancar el proyecto en local

### Requisitos previos
- Node.js 20+
- npm
- Archivo `.env.local` completo (ver sección anterior)

### Frontend (Next.js)

```bash
cd ~/spabla
npm install          # solo la primera vez
npm run dev          # arranca en http://localhost:3000
```

### Servidor de señalización (Socket.io + Deepgram)

El servidor NO arranca automáticamente con `npm run dev`. Requiere una terminal separada y la variable `DEEPGRAM_API_KEY` en el entorno local.

```bash
cd ~/spabla
DEEPGRAM_API_KEY=tu_key npm run signaling
# o exportar primero:
export DEEPGRAM_API_KEY=tu_key
npm run signaling
```

El servidor escucha en `http://localhost:3001`. El frontend en local conecta a `https://spabla-server.onrender.com` por defecto. Para conectar al servidor local:

```bash
# En .env.local añadir:
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

### Acceso directo (macOS)

Doble clic en `~/Desktop/SPABLA.command` → abre Terminal en `~/spabla` y lanza Claude Code.

---

## Cómo desplegar

### Frontend → Vercel

El despliegue es automático. Cada `git push` a `main` activa un nuevo build en Vercel.

```bash
cd ~/spabla
git add .
git commit -m "descripción del cambio"
git push
# Vercel detecta el push y despliega automáticamente
```

Tiempo de build aproximado: 30-60 segundos.

### Servidor de señalización → Render

Render también despliega automáticamente desde `main`. El comando de inicio está definido en `railway.json`:

```json
{
  "deploy": {
    "startCommand": "tsx server/signaling.ts",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

> Nota: el archivo se llama `railway.json` por razones históricas (el servidor se alojaba en Railway antes de migrar a Render). El contenido es compatible con Render.

Tiempo de arranque en Render: 30-90 segundos en cold start (plan gratuito o starter). Si el servidor lleva tiempo inactivo, la primera llamada puede aparecer colgada durante ese tiempo.

---

## Estructura de archivos críticos

```
~/spabla/
├── app/
│   ├── page.tsx                          → redirect a /home
│   ├── layout.tsx                        → layout raíz (metadata, body)
│   ├── globals.css                       → estilos base (Tailwind + reset)
│   ├── home/page.tsx                     → pantalla de inicio con grid de modos
│   ├── onboarding/page.tsx               → registro (nombre + idioma)
│   ├── chat/
│   │   ├── page.tsx                      → chat principal + integración WebRTC
│   │   ├── hooks/useWebRTC.ts            → WebRTC + audio pipeline + captions
│   │   └── components/VideoOverlay.tsx  → UI de videollamada (compacto + inmersivo)
│   ├── call/
│   │   ├── page.tsx                      → vacío (retorna null)
│   │   └── [roomId]/page.tsx             → RUTA OBSOLETA (pendiente de eliminar)
│   └── api/
│       ├── translate/route.ts            → proxy OpenAI GPT-4o-mini
│       └── ice-servers/route.ts          → TURN credentials server-side
├── server/
│   └── signaling.ts                      → Socket.io + Deepgram STT
├── lib/
│   ├── supabase.ts                       → cliente Supabase
│   └── webrtc.ts                         → clase GLOTConnection (CÓDIGO MUERTO)
├── docs/
│   ├── PROJECT_STATUS.md                 → este archivo
│   ├── architecture.md                   → conversationId, flujos, prohibiciones
│   ├── decisions.md                      → historial de decisiones arquitecturales
│   ├── product.md                        → V1/V2/V3, flujo canónico
│   ├── roadmap.md                        → fases con criterios de completitud
│   ├── vision.md                         → identidad, misión, principios
│   └── workflow.md                       → agentes, orden de trabajo, reglas
├── agents/                               → roles de agentes IA (orchestrator, cto, etc.)
├── .env.local                            → variables de entorno locales (NO versionado)
├── next.config.js                        → configuración activa de Next.js
├── next.config.ts                        → ARCHIVO VACÍO (ignorado por Next.js — pendiente de eliminar)
├── package.json                          → dependencias y scripts
└── railway.json                          → configuración de despliegue del servidor
```

---

## Modelo de datos (Supabase)

```
users
  id                uuid PK
  name              text
  language_primary  text
  created_at        timestamptz

conversations
  id                uuid PK   ← conversationId
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

files  ← EN EL MODELO, SIN IMPLEMENTAR
  id              uuid PK
  conversation_id uuid FK → conversations.id
  sender_id       uuid FK → users.id
  url             text
  name            text
  mime_type       text
  created_at      timestamptz
```

---

## Qué funciona hoy

| Funcionalidad | Estado | Condición |
|---|---|---|
| Onboarding (nombre + idioma) | ✅ | Siempre |
| Chat — envío de mensajes | ✅ | Siempre |
| Chat — recepción en tiempo real | ✅ | Supabase Realtime + polling fallback |
| Chat — traducción de mensajes | ✅ | Requiere `OPENAI_API_KEY` en Vercel |
| Link de invitación | ✅ | Siempre |
| WebRTC — señalización | ✅ | Siempre (Render activo) |
| WebRTC — TURN relay | ✅ | Requiere credenciales Metered.ca |
| Deepgram STT en streaming | ✅ | Requiere `DEEPGRAM_API_KEY` en Render |
| Subtítulos (texto) en VideoOverlay | ✅ | Requiere las dos keys anteriores |
| VideoOverlay compacto + inmersivo | ✅ | Siempre |
| Selector de idioma durante llamada | ✅ | Reinicia sesión Deepgram al cambiar |
| Fix iOS Safari vídeo remoto | ✅ | Siempre |

---

## Problemas conocidos

### Críticos

**P1 — `OPENAI_API_KEY` ausente en `.env.local`**
Si no está en Vercel, la traducción devuelve el texto original sin error visible. La propuesta de valor central del producto falla en silencio. Verificar en el panel de Vercel antes de cualquier prueba.

**P2 — Sin autenticación real**
El sistema usa `localStorage` como fuente de identidad. No hay llamadas a `supabase.auth.signInAnonymously()`, `signUp()` ni `getUser()` en ningún archivo. El `sender_id` de los mensajes puede ser manipulado por cualquier usuario desde DevTools. RLS no puede funcionar sin `auth.uid()` real.

**P3 — TTS no implementado**
No existe ninguna línea de código relacionada con `SpeechSynthesis`, `SpeechSynthesisUtterance` ni ElevenLabs. El participante que recibe la traducción solo ve texto. El momento diferencial del producto no existe.

### Importantes

**P4 — `targetLang` null en los primeros segundos de llamada**
Si la llamada se inicia antes de que el segundo participante haya seleccionado su idioma, `targetLang` es `null` y la traducción no ocurre. Los primeros utterances pueden perderse sin aviso.

**P5 — `ScriptProcessorNode` deprecado**
Usado en `useWebRTC.ts` para capturar audio. Funciona en todos los navegadores actuales pero está marcado para eliminación en la Web Audio API spec. La migración a `AudioWorklet` está decidida en `docs/decisions.md` pero no implementada.

**P6 — `/call/[roomId]/page.tsx` activa y violando el master**
La ruta sigue existiendo con pipeline diferente (MyMemory, roomId aleatorio, sin Supabase). Cualquier usuario que navegue directamente a `/call/algo` llega a esta pantalla en lugar de recibir un 404 o redirect. Pendiente de eliminar.

**P7 — Señalización no valida `conversationId`**
`server/signaling.ts` acepta cualquier string en `join-room` sin verificarlo contra Supabase. Cualquier cliente puede unirse a cualquier sala conociendo su UUID.

### Menores

**P8 — Rutas rotas en `/home`**
Los cards de "Documentos", "Imágenes" e "Intérprete" enlazan a `/documents`, `/images` e `/interpreter`. Esas rutas no existen. Devuelven 404.

**P9 — Conversaciones recientes son datos falsos**
El array `RECENT` en `home/page.tsx` está hardcodeado con Sophia, Ahmed y Marie. No son conversaciones reales de Supabase.

**P10 — Adjunto de archivos es un stub vacío**
El botón de adjunto abre el file picker pero el handler es `onChange={() => {}}`. No sube ningún archivo.

**P11 — `next.config.ts` vacío coexiste con `next.config.js`**
Next.js carga `next.config.js` (prioridad 1 según `CONFIG_FILES`). `next.config.ts` está siendo ignorado. Es código muerto que puede confundir a futuros desarrolladores.

**P12 — Código muerto en `lib/webrtc.ts`**
La clase `GLOTConnection` nunca se importa. Reliquia de la primera implementación.

**P13 — Sin rate limiting en `/api/translate`**
El endpoint OpenAI no tiene control de frecuencia. Sin autenticación y sin rate limit, la factura de OpenAI puede dispararse.

**P14 — Subtítulos de llamada no se persisten en el chat**
Las frases traducidas durante una videollamada no se escriben como mensajes en Supabase al colgar. El historial de texto y el historial de llamada son mundos separados.

**P15 — Render cold start**
En el plan gratuito o starter, el servidor puede tardar 30-90 segundos en responder tras un período de inactividad. La primera llamada parece "no conectar" durante ese tiempo sin aviso al usuario.

---

## Próximos pasos prioritarios

El orden respeta las dependencias: cada bloque habilita el siguiente.

### Bloque 1 — Verificar keys en producción (30 min, sin código)
Confirmar en el panel de Vercel que `OPENAI_API_KEY` existe. Confirmar en Render que `DEEPGRAM_API_KEY` existe. Sin este paso, nada de lo que sigue tiene sentido en producción.

### Bloque 2 — TTS con Web Speech API (1 día)
Implementar `SpeechSynthesis` en `useWebRTC.ts`. Cuando llega un subtítulo remoto final, sintetizarlo en voz. Añadir selector masculina/femenina en el overlay. Mute automático si el micrófono local está activo (evita feedback).

**Archivos:** `app/chat/hooks/useWebRTC.ts`, `app/chat/components/VideoOverlay.tsx`

### Bloque 3 — Supabase Auth (1 día)
`supabase.auth.signInAnonymously()` en el onboarding. Leer la sesión en el chat con `supabase.auth.getSession()`. El `sender_id` de los mensajes pasa a ser `auth.uid()`.

**Archivos:** `app/onboarding/page.tsx`, `app/chat/page.tsx`

### Bloque 4 — RLS en Supabase (4 horas, panel Supabase)
Activar políticas Row Level Security en `messages`, `conversation_participants`, `users` y el bucket de Storage. Política base: un usuario solo puede leer mensajes si es participante de la conversación.

**Trabajo en:** panel de Supabase → Table Editor → RLS Policies.

### Bloque 5 — Limpiar código obsoleto (1 hora)
- Eliminar `app/call/[roomId]/page.tsx` (ruta obsoleta)
- Redirect `app/call/page.tsx` → `/home`
- Eliminar `lib/webrtc.ts` (nunca se importa)
- Eliminar `next.config.ts` (ignorado, confunde)

### Bloque 6 — AudioWorklet (4-6 horas)
Crear `public/audio-processor.js` (worklet Float32 → Int16 → postMessage). Migrar `useWebRTC.ts` de `ScriptProcessorNode` a `AudioWorkletNode`. Degradación graceful si el navegador no soporta Worklets.

**Archivos:** nuevo `public/audio-processor.js`, `app/chat/hooks/useWebRTC.ts`

### Bloque 7 — Rate limiting en `/api/translate` (2 horas)
Límite por IP (o por sesión Supabase una vez que Auth esté implementado). Respuesta 429 con mensaje claro en la UI.

**Archivo:** `app/api/translate/route.ts`

### Bloque 8 — Conversaciones reales en `/home` (3 horas)
Reemplazar el array `RECENT` hardcodeado con una query a Supabase que devuelva las últimas conversaciones del usuario autenticado. Requiere Bloque 3 completado.

**Archivo:** `app/home/page.tsx`

### Bloque 9 — Archivos (1-2 días)
Subida a Supabase Storage bajo `{conversationId}/{fileId}/{filename}`. Tabla `files` en Supabase. Visualización en el historial del chat como elemento descargable. RLS en el bucket.

**Archivos:** `app/chat/page.tsx`, nueva tabla en Supabase, nuevo bucket en Storage.

### Bloque 10 — Test end-to-end bilateral (medio día)
Dos dispositivos reales en redes distintas, dos idiomas distintos. Validar el flujo completo: onboarding → chat → mensaje traducido → videollamada → subtítulos → TTS → colgar → historial visible.

---

## Estimación total

| Escenario | Tiempo estimado |
|---|---|
| Beta mínima viable (Bloques 1–5) | 3-4 días |
| Beta completa según `product.md` (Bloques 1–10) | 3-4 semanas |

El camino crítico: **verificar keys → TTS → Auth → RLS**. Con esos cuatro bloques, SPABLA tiene un flujo conversacional real, seguro, y con el momento mágico funcionando.

---

## Historial de commits relevantes

| Commit | Descripción |
|---|---|
| `d008005` | Rediseño visual premium del chat |
| `60ab9b2` | Subtítulos traducidos en tiempo real en VideoOverlay |
| `2eca856` | conversationId como roomId de señalización |
| `29ca725` | TURN privado Metered.ca (elimina credenciales demo) |
| `186b1b5` | ICE servers desde servidor (TURN credentials seguras) |
| `f2af395` | Fix overflow horizontal Safari iOS |
| `4af9b0b` | Onboarding + chat con Supabase |
| `118bc6c` | Renombrar GLOT → SPABLA |

---

*Ver `docs/decisions.md` para el historial completo de decisiones arquitecturales.*
*Ver `docs/roadmap.md` para el roadmap por fases con criterios de completitud.*
*Ver `docs/architecture.md` para los flujos de datos y las invariantes del sistema.*
