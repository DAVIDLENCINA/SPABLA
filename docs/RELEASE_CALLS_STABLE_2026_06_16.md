# SPABLA — Calls Stable Release · 2026-06-16

Tag: `calls-stable-2026-06-16`  
Commit HEAD: `2ebdbc6`  
Rama: `main`

---

## Estado validado

Prueba realizada el 16/06/2026 con dos navegadores reales (Chrome normal + Chrome incógnito), dos usuarios distintos, misma conversación.

| Componente | Estado |
|---|---|
| Chat en tiempo real | ✅ Operativo |
| Traducción automática | ✅ Operativo |
| Señalización de llamadas (`call_signals`) | ✅ Operativo |
| Realtime Supabase (canal por conversación) | ✅ Operativo |
| RLS Supabase | ✅ Operativo |
| Detección de llamada entrante | ✅ Operativo |
| Aceptar / Rechazar llamada | ✅ Operativo |
| Audio de llamada (WebRTC) | ✅ Operativo |
| Ringback (llamante) | ✅ Beep 440 Hz 200ms / 1s |
| Ringtone (receptor) | ✅ Doble campanada 880→660 Hz / 3.7s |
| Tono se detiene al aceptar | ✅ Confirmado |
| Redirect tras onboarding preserva `?id=` | ✅ Confirmado |
| Sesión anónima fresca en onboarding | ✅ Confirmado |

---

## Commits relevantes (sesión 2026-06-16)

```
2ebdbc6  feat(calls): distinguish ringback and incoming ringtone
7508f03  fix(calls): resume audio context before ringtone playback
d085561  fix(auth): force fresh anonymous session on onboarding
5a9453c  fix(auth): preserve chat redirect after onboarding
3b40299  chore(calls): track call signaling hooks
44f4683  fix(webrtc): preserve call during temporary socket reconnect
```

---

## Causa raíz encontrada y resuelta

### Problema: `isDifferentCaller === false` en el receptor

El receptor descartaba la llamada entrante porque `row.caller_id === userId` en su navegador.

### Cadena de causas

1. **`spabla_user` en localStorage compartido.** Si el navegador receptor (o incógnito) ya había registrado un usuario anteriormente, el `localStorage` conservaba ese usuario. La chat page lo encontraba y no redirigía a onboarding — ambos lados terminaban con el mismo `userId`.

2. **Supabase `initialize()` restaura sesión al arrancar.** Al importar el módulo `supabase`, `GoTrueClient._recoverAndRefresh()` lee `sb-<project-ref>-auth-token` de `localStorage` y restaura la sesión existente antes de que el código de la app actúe.

3. **`signInAnonymously()` no hacía `signOut()` previo.** Si una sesión previa existía y `signInAnonymously()` recibía sesión nula del servidor (por cualquier motivo), `_saveSession` no se invocaba y la sesión anterior permanecía activa.

4. **El redirect tras onboarding descartaba el `?id=`.** Un usuario nuevo abriendo un link compartido era redirigido a `/onboarding` pero al completarlo volvía a `/chat` sin el `?id=`, creando una conversación diferente a la del llamante.

### Fixes aplicados

| Fix | Archivo |
|---|---|
| `signOut()` antes de `signInAnonymously()` | `app/onboarding/page.tsx` |
| Redirect preserva URL con `?redirect=` | `app/chat/page.tsx` + `app/onboarding/page.tsx` |
| `Suspense` boundary para `useSearchParams` | `app/onboarding/page.tsx` |
| `await ctx.resume()` antes de `playBurst` | `app/chat/hooks/useRingTone.ts` |

---

## Sistemas que NO deben re-investigarse salvo evidencia nueva

Los siguientes sistemas fueron revisados, están correctamente implementados y **no son causa de ningún problema conocido**:

- **WebRTC** — negociación, ICE, single-offerer, anti-glare, null refs en `endCall`: resuelto en commits previos.
- **TURN / ICE servers** — `/api/ice-servers` operativo.
- **Socket.IO** — no forma parte del stack de señalización; la señalización usa Supabase Realtime exclusivamente.
- **Supabase Realtime** — canal `call_signals:<conversationId>` con filtro por `conversation_id`. Ambos navegadores reciben `PAYLOAD_RECEIVED` y `CHANNEL_STATUS = SUBSCRIBED` correctamente.
- **RLS** — reglas validadas; el receptor puede actualizar `call_signals` (aceptar/rechazar).
- **`call_signals` tabla** — esquema y lógica de estados (`ringing → accepted/rejected/cancelled/missed/ended`) correctos.

---

## Arquitectura de identidad en uso

- Auth: Supabase Anonymous Auth (`signInAnonymously`)
- Identidad local: `localStorage["spabla_user"]` — objeto `{ id, name, language_primary }`
- Sesión Supabase: `localStorage["sb-<ref>-auth-token"]`
- Al cargar la app: `getSession()` verifica que el `id` en `spabla_user` coincide con el `session.user.id`; si no coincide, recarga el usuario correcto de la tabla `users`
- Al hacer onboarding: `signOut()` forzado → `signInAnonymously()` → insert en tabla `users` → `localStorage["spabla_user"]` actualizado

---

## Notas para próximas sesiones

- Los archivos `TEMP_*.ts`, `TEMP_*.diff` y `TRANSLATION_FLOW.md` en la raíz son restos de sesiones anteriores. No están commiteados. Pueden eliminarse cuando se desee.
- El sistema de sonido usa Web Audio API (sin librerías). Si se quiere mejorar la calidad de audio, considerar osciladores con tipo `triangle` en lugar de `sine` para el ringtone.
- El sistema de llamadas no tiene soporte de video en este milestone. `VideoOverlay` existe pero la integración con la señalización no está validada.
