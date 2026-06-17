# TRANSLATION_FLOW — SPABLA

Estado: verificado visualmente 2026-06-15  
Dirección verificada: ES → EN (Hola → Hello)  
Dirección auditada (código): EN → ES

---

## Archivos críticos

| Archivo | Rol |
|---|---|
| `app/chat/page.tsx` | Cliente: `translate()`, `sendMessage()`, render |
| `app/api/translate/route.ts` | Servidor: auth, rate limit, OpenAI, respuesta |
| `lib/supabase.ts` | Cliente Supabase compartido |

---

## Tablas y campos críticos

### `messages`
| Campo | Tipo | Rol |
|---|---|---|
| `original_text` | text | Texto original enviado |
| `translated_text` | text | Texto traducido (resultado de OpenAI) |
| `original_language` | text | Idioma del emisor (ej. `"es"`) |
| `translated_language` | text | Idioma al que se tradujo (ej. `"en"`) |
| `sender_id` | uuid | Determina `isMe` en render |
| `conversation_id` | uuid | Filtro de canal Realtime |

### `users`
| Campo | Rol |
|---|---|
| `language_primary` | Idioma del usuario — controla dirección de traducción |

### `conversation_participants`
| Campo | Rol |
|---|---|
| `conversation_id` | Agrupa participantes |
| `user_id` | Identifica al otro usuario para obtener su idioma |

---

## Flujo completo

```
Usuario escribe → sendMessage() [page.tsx:181]
  │
  ├─ query conversation_participants (excluye sender)
  ├─ query users WHERE language_primary ≠ sender.language_primary
  │
  ├─ [sin otro participante] → translated = original, sin traducción
  ├─ [mismo idioma]          → translated = original, sin traducción
  │
  └─ [idiomas distintos] → translate(text, from, to) [page.tsx:157]
        │
        ├─ supabase.auth.getSession() → access_token
        ├─ [sin token] → retorna text original
        │
        └─ POST /api/translate { text, from, to } + Bearer token
              │
              ├─ getClaims(token) — verifica JWT ES256 localmente
              ├─ [token inválido] → 401
              ├─ isRateLimited(userId) — 20 req/min
              ├─ [sin OPENAI_API_KEY] → devuelve text original (silencioso)
              ├─ [text.length > 1000] → devuelve text original (silencioso)
              │
              └─ fetch OpenAI gpt-4o-mini
                    │
                    ├─ [error HTTP] → devuelve text original
                    └─ 200 → { translation: "..." }

  ← translated = data.translation || text

INSERT messages {
  original_text,
  translated_text: translated,
  original_language: sender.language_primary,
  translated_language: otherUser.language_primary
}
  │
  └─ Supabase Realtime INSERT → setMessages([...prev, payload.new])
       └─ [Realtime caído] → polling cada 3s (loadMessages)
```

---

## Render (crítico)

```typescript
// page.tsx:350-352
const displayText = isMe
  ? msg.original_text
  : (msg.translated_language === user.language_primary
     ? (msg.translated_text || msg.original_text)
     : msg.original_text);
```

**Regla:** el receptor ve `translated_text` solo si `msg.translated_language === receiver.language_primary`.

**Consecuencia:** si `translated_language` no coincide exactamente con `language_primary` del receptor, ve el texto original sin aviso.

---

## Dependencias externas

| Dependencia | Uso | Fallo |
|---|---|---|
| `OPENAI_API_KEY` | Traducción | Fallback silencioso al original |
| Supabase Auth | JWT en `/api/translate` | 401, sin traducción |
| Supabase Realtime | Entrega de mensajes | Polling como fallback |
| `gpt-4o-mini` | Motor de traducción | Fallback al original si HTTP ≠ 200 |

---

## Puntos sensibles

1. **`OPENAI_API_KEY` vacía** — falla en silencio, HTTP 200, devuelve original. Ya ocurrió en producción.

2. **`translated_language` debe ser exactamente `language_primary` del receptor** — cualquier discrepancia (mayúsculas, código incorrecto) hace que el receptor vea el original sin aviso.

3. **Rate limit 20 req/min** — en conversaciones rápidas puede alcanzarse. Sin aviso en UI.

4. **`text.length > 1000`** — fallback silencioso. Sin aviso en UI.

5. **Mensajes pre-existentes** — los insertados cuando `OPENAI_API_KEY` estaba vacía tienen `translated_text = original_text`. No se recuperan solos.

6. **Sin otro participante al enviar** — el mensaje se guarda sin traducir. Si el otro usuario se une después, verá el original.

7. **`data.translation || text`** — si OpenAI devuelve string vacío `""`, se muestra el original. Correcto por diseño, pero opaco.

---

## Qué NO debe modificarse sin pruebas de regresión

- Lógica de render `isMe / translated_language / translated_text` (`page.tsx:348-391`)
- Schema `INSERT` de `messages` — cualquier campo renombrado rompe render y persistencia
- Endpoint `/api/translate` — URL hardcoded en `translate()` via `window.location.origin`
- `getClaims()` — reemplazar por otro método de auth invalida todos los tokens en vuelo
- `language_primary` en tabla `users` — es la clave de toda la lógica de dirección
- `gpt-4o-mini` como modelo — cambiar a otro modelo puede alterar comportamiento de respuesta

---

## Checklist de regresión

Ejecutar antes de cualquier cambio en `page.tsx`, `route.ts` o schema de `messages`.

### Caso 1 — ES → EN básico
- [ ] User ES envía: `Hola`
- [ ] Servidor log: `final translation: Hello`
- [ ] User EN ve: `Hello` en burbuja

### Caso 2 — EN → ES básico
- [ ] User EN envía: `Hello`
- [ ] Servidor log: `final translation: Hola`
- [ ] User ES ve: `Hola` en burbuja

### Caso 3 — Mensaje largo (>50 palabras, <1000 chars)
- [ ] User ES envía párrafo largo
- [ ] User EN ve traducción completa (no truncada)
- [ ] `translated_text` en DB ≠ `original_text`

### Caso 4 — URL en mensaje
- [ ] User ES envía: `Visita https://example.com hoy`
- [ ] User EN ve traducción con URL intacta
- [ ] URL no se altera ni se rompe

### Caso 5 — Emoji
- [ ] User ES envía: `Hola 👋`
- [ ] User EN ve: `Hello 👋` (emoji preservado)

### Caso 6 — Multilínea
- [ ] User ES envía mensaje con saltos de línea
- [ ] User EN ve traducción con estructura preservada

### Caso 7 — Persistencia tras recarga
- [ ] User EN ve `Hello` en pantalla
- [ ] User EN recarga el navegador
- [ ] User EN sigue viendo `Hello` (no `Hola`)
- [ ] `translated_text` en DB conserva valor correcto

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL=       # cliente y servidor
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # cliente y servidor
OPENAI_API_KEY=                 # solo servidor — si vacía, traducción silentemente rota
```
