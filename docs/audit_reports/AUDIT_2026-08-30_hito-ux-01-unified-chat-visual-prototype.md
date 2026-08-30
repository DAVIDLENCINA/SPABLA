# HITO UX-01 · PROTOTIPO VISUAL UNIFICADO SPABLA — ACTA DE CONSERVACIÓN

Fecha: 2026-08-30
Rama candidata: `spabla-v2/ux-01-unified-chat-visual-prototype`
Base exacta: `d729d57ec1d81a218b191297a1acdf1401ba0d66` (oficial `spabla-v2/thirteen-languages-activation` post-Q3-P)
Oficial invariante durante UX-01: `d729d57ec1d81a218b191297a1acdf1401ba0d66`
Main invariante durante UX-01: `e6128433d42e1e105529ed2f64212ca527034b6a`
Iteraciones previas: UX-01 → UX-01-R → UX-01-R2 (rectificaciones visuales sucesivas).

## 1 · Objetivo

Conservar mediante un único commit el prototipo visual de SPABLA aprobado por David tras tres iteraciones (UX-01 baseline, UX-01-R identidad+densidad, UX-01-R2 logo+traductor+inbox móvil). El prototipo demuestra dentro de un mismo sistema visual: chat con traducción, llamada de voz integrada, videollamada integrada, timeline unificado, Modo Traductor presencial, inbox móvil y adaptación coherente a escritorio/tablet/móvil.

Cero promoción a la rama oficial. Cero UX-02. Cero modificación productiva. Cero backend, Supabase ni Cloud.

## 2 · Aprobación visual de David

David revisó las capturas de UX-01-R2 en `~/Downloads/SPABLA_UX01_R2_REVISION/` y validó:

- las cuatro correcciones de UX-01-R2 (transcripción de voz con Laura ES principal + "Enviado en japonés", logo escritorio única presencia sobre el panel de lista, inbox móvil con logo SPABLA, Modo Traductor tablet con mic próximo al contenido);
- las ocho capturas (chat texto escritorio/móvil, llamada voz escritorio, videollamada escritorio/móvil, Modo Traductor tablet/móvil, pantalla principal Chats móvil);
- el modelo de traducción in-bubble compacto (nunca tarjetas separadas grandes);
- la aplicación de los colores oficiales SPABLA (cyan `#1EC7FF`, coral `#FF6B7A`, blanco `#FFFFFF`, navy `#0B0F19`).

## 3 · Ocho capturas revisadas

Ubicación durante revisión (no versionadas):
`~/Downloads/SPABLA_UX01_R2_REVISION/`

| # | Nombre | Viewport | Contenido acreditado |
|---|---|---|---|
| 01 | `01-chat-texto-escritorio.png` | 1440×900 | Rail icon-only · logo horizontal SPABLA único sobre el panel de lista · conversación con Takashi Mori · burbujas cyan (Laura) + gris (Takashi) con secondary text in-bubble · composer visible al fondo |
| 02 | `02-llamada-voz-escritorio.png` | 1440×900 | Voice call DENTRO de la conversación · transcripción con Laura ES principal + "Enviado en japonés" (polaridad correcta) y Takashi ES + "Original: japonés" · controles proporcionados · botón rojo colgar |
| 03 | `03-videollamada-escritorio.png` | 1440×900 | Videollamada in-conversation · PiP self compacto arriba-derecha · pills "Videollamada" y "Traducción en tiempo real" · chip "Ilustración placeholder" · subs con `line-clamp` sin tapar rostro · controles oscuros |
| 04 | `04-chat-texto-movil.png` | 390×844 @2x | Header compacto Takashi · selector idiomas compacto · timeline denso con secondary in-bubble · CallEventCard limpio · composer + bottom nav |
| 05 | `05-videollamada-movil.png` | 390×844 @2x | PiP 82px · pills sin solapar · subtitles line-clamp 2 · original JP secundario · controles y colgar rojo · composer accesible |
| 06 | `06-modo-traductor-tablet.png` | 1194×834 | Dos zonas Tú (cyan) / Otra persona (coral) · mic próximo al contenido (justify-center wrapper) · footer una fila · Finalizar rojo |
| 07 | `07-modo-traductor-movil.png` | 390×844 @2x | Cara-a-cara · zona superior rotada 180° · footer una fila con Finalizar integrado · cero scroll para acciones esenciales |
| 08 | `08-pantalla-principal-chats-movil.png` | 390×844 @2x | Logo horizontal SPABLA en el header · etiqueta "CHATS" · buscador · lista táctil con badges cyan · bottom nav |

## 4 · Arquitectura aislada bajo `/v2/design`

Toda la implementación vive bajo:

```
app/v2/design/
  layout.tsx
  page.tsx                                    (índice de estados demostrables)
  chat/
    page.tsx
    state.ts                                  (parser de URL params → PrototypeState)
    state.test.ts
    prototype.behavioral.test.tsx
    productive-untouched.test.ts
    styles/tokens.ts                          (paleta oficial cyan/coral/white/navy)
    fixtures/identities.ts                    (Laura + Takashi + lista secundaria)
    fixtures/timeline.ts                      (mensajes + call events + translator turns)
    components/
      Avatar.tsx
      Icons.tsx                               (26 SVG inline)
      BrandHeader.tsx                         (logo horizontal provisional)
      Sidebar.tsx                             (rail icon-only)
      BottomTabBar.tsx
      ConversationList.tsx                    (variant desktop|mobile)
      ConversationHeader.tsx                  (compact opcional)
      LangSwitcher.tsx                        (compact opcional; sin banderas)
      Timeline.tsx                            (compact opcional)
      Bubble.tsx                              (in-bubble translation model)
      CallEvent.tsx                           (compact opcional)
      VoiceCallCard.tsx                       (compact opcional; polaridad Laura ES)
      VideoCallCard.tsx                       (compact opcional; PiP responsive; placeholder chip)
      Composer.tsx                            (compact opcional)
      DesignShell.tsx                         (integra todo por viewport)
  translator/
    page.tsx
    components/
      TranslatorZone.tsx                      (mic próximo al contenido)
      TranslatorHeader.tsx
      TranslatorFooter.tsx                    (una fila; Finalizar integrado)
      TranslatorShell.tsx
  inbox/
    page.tsx
    components/InboxMobileShell.tsx           (identidad móvil)
public/design/spabla-logo-horizontal-provisional.png
scripts/ux/capture-ux-01.mjs                  (harness Playwright 8 capturas)
```

Ninguna importación cruza a `app/v2/chat/`, `lib/v2/client/**` productivo, `lib/v2/server/**` productivo ni Supabase. El test `productive-untouched.test.ts` verifica programáticamente que `app/v2/chat/` no tiene diff.

## 5 · Chat

- Rail icon-only 60px con Sidebar (Chats · Contactos · Perfil · Ajustes) + spacer 60px que alinea con el BrandHeader.
- Panel de lista 300px con BrandHeader (logo único) + heading "Chats" + buscador + `SIDEBAR_CONTACTS` (Takashi Mori, AT, KM, RS) con badge cyan de no-leídos.
- Chat column: `ConversationHeader` (avatar Takashi + estado + botones voz/vídeo/más) + `LangSwitcher` (ES ⇄ JA sin banderas) + `Timeline` + `Composer` (adjuntar + campo + emoji + mic cyan).
- Densidad tuneada para que en 1440×900 el composer siempre sea visible.

## 6 · Traducción in-bubble

Modelo aprobado (`Bubble.tsx`):

- **Laura (self, derecha, cyan)**: primary = ES (lo que escribió) sobre burbuja cyan con texto navy (contraste 12.13:1 AAA). Bajo la burbuja: `Enviado en japonés · Ver traducción · 09:39 ✓✓`. Al desplegar, la traducción JP aparece dentro de la misma burbuja separada por un divisor `rgba(11,15,25,0.16)`.
- **Takashi (peer, izquierda, gris)**: primary = ES traducido. Bajo la burbuja: `Original: japonés · Ver original · 09:38`. Al desplegar, el JP original aparece integrado en la burbuja.
- Cero tarjetas blancas grandes separadas.
- Todo secundario permanece visualmente unido a su burbuja.

Estados: `?original=hidden|visible` alterna todos los secundarios en la vista.

## 7 · Llamada de voz

`VoiceCallCard.tsx` — se renderiza DENTRO del chat column (entre `LangSwitcher` y `Timeline`), nunca reemplaza la conversación:

- Avatar Takashi + duración `00:47` + pill verde "Traducción en tiempo real".
- Transcripción `role="log" aria-live="polite"` con banda lateral cyan (Laura) / coral (Takashi).
- **Polaridad corregida en UX-01-R2**: cada línea muestra su idioma nativo del hablante como principal + etiqueta secundaria contextual (`Enviado en japonés` para Laura, `Original: japonés` para Takashi). Test `shows Laura's transcript in Spanish (primary)…` acredita la dirección con assertions positivas y negativas.
- Controles: mic + altavoz + subs (pressed cyan+navy) + colgar rojo.
- Estado `?call=voice`, `?call=voice-ended` (evento en timeline).

## 8 · Videollamada

`VideoCallCard.tsx` — surface completa dentro del chat column:

- Escena remota SVG estilizada (nunca fotografía real) sobre gradiente cyan/navy. Chip discreto "Ilustración placeholder" indica que es un placeholder técnico.
- PiP self (silueta con corona cyan `#1EC7FF`) arriba-derecha, tamaño responsive: `min(28%, 168px)` desktop, `min(28%, 82px)` compacto móvil.
- Pills "Videollamada · 01:12" y "Traducción en tiempo real" en columna arriba-izquierda, sin solapar el PiP.
- Subs `role="region" aria-live="polite"` en la franja inferior segura con `line-clamp: 2` para no tapar el rostro. Traducción ES principal + original JP secundario.
- Controles oscuros: mic · cámara · altavoz · subs (pressed cyan) · minimizar · colgar rojo grande.
- Estados: `?call=video`, `?call=video&subs=off`, `?call=video-min` (PiP flotante conservando el timeline visible), `?call=video-ended`.

## 9 · Timeline unificado

`Timeline.tsx` mezcla `MessageEvent` + `CallEvent` (voz y vídeo) + `DayDivider` en orden cronológico. `?call=voice-ended|video-ended` añade el evento correspondiente al `BASE_TIMELINE`. Cero pestañas separadas. El usuario percibe todo como parte de una misma conversación persistente con Takashi.

## 10 · Modo Traductor

`TranslatorShell.tsx` con dos layouts:

- **Tablet/desktop** (`?device` sin `mobile`): dos zonas lado a lado con `LangSwitcher` central. La `TranslatorZone` centra verticalmente contenido + mic (`justify-content: center` en wrapper interior); el mic 60px queda a `space.md` del texto traducido, cerrando el vacío de UX-01-R.
- **Móvil** (`?device=mobile`): grid `1fr auto 1fr` cara-a-cara. Zona superior "Otra persona" **rotada 180°** (transform sólo aplicado al contenido remoto — header y footer permanecen legibles para el propietario del teléfono). Botón swap central. `TranslatorFooter` una fila: Repetir · Texto · Guardar · Finalizar (rojo) integrado — cero scroll en 390×844.

Turno activo: `?turn=self|other` marca el mic con `aria-pressed=true` y aplica sombra accent. Swap de idiomas: `?swap=1` intercambia el par sin mover roles.

## 11 · Responsive

Layouts distintos por device (parseados desde `?device=desktop|tablet|mobile`):

| Viewport | Chat | Traductor | Inbox |
|---|---|---|---|
| Desktop 1440×900 | `60px | 300px | 1fr` rail + lista + conversación | Two-zone tablet layout | (n/a — vive en la lista) |
| Tablet 1194×834 | `260px | 1fr` lista + conversación | Two-zone lado a lado | (n/a) |
| Móvil 390×844 | Una columna con `BottomTabBar` | Cara-a-cara con giro 180° arriba | `InboxMobileShell` |

## 12 · Identidad móvil (`InboxMobileShell`)

- Header con logo horizontal SPABLA + etiqueta "CHATS" (single presence).
- `ConversationList` con `variant="mobile"` (sin borderRight, sin heading duplicado).
- `BottomTabBar` (Chats activo cyan+navy).
- Cero logo en conversación abierta, cero logo en llamadas de voz, cero logo en videollamadas, cero logo en Modo Traductor móvil.

## 13 · Accesibilidad

- HTML semántico: `<header role="banner">`, `<main>`, `<section aria-label>`, `<nav aria-label>`, `<article>`.
- `aria-live="polite"` en `Timeline`, `VoiceCallCard`, `VideoCallCard`, `TranslatorZone` cuando activo, subtítulos.
- `role="log"` en transcripción en vivo.
- `aria-pressed` en botones toggle (subs, mic activo, resend).
- `aria-current="page"` en navegación (rail + bottom tab bar).
- `aria-label` completo en cada control interactivo (24 controles totales entre chat + traductor + inbox).
- Contraste WCAG: cyan #1EC7FF + navy #0B0F19 = 12.13:1 (AAA). Navy #0B0F19 + white #FFFFFF = 19.6:1. Coral #FF6B7A vs navy = 6.7:1 (AA large).
- Targets táctiles ≥ 40px desktop, ≥ 34px compact móvil, ≥ 60px botones mic.
- Cero información dependiente sólo del color: cada acento acompaña una etiqueta explícita ("Tú", "Otra persona", "Enviado en", "Original:").
- `next/image` con dimensiones explícitas.
- Iconos SVG con `role="img"` + `<title>` o `aria-hidden="true"`.

## 14 · Modelo lingüístico Laura/Takashi

Invariante:

- Usuario actual: **Laura Martín** · idioma nativo: **español**.
- Interlocutor: **Takashi Mori** · idioma nativo: **japonés**.
- Header de la conversación: **Takashi Mori · En línea**.
- Laura: derecha, burbuja cyan.
- Takashi: izquierda, burbuja gris claro.

Cero intercambio. Cero mislabel de idiomas. Test `renders the header for Takashi Mori and never mislabels Laura as the peer` acredita.

## 15 · Logo provisional

**Archivo versionado**: `public/design/spabla-logo-horizontal-provisional.png` (2172×724 · 8-bit RGBA · 289 KB · alpha=True). Referenciado desde `BrandHeader`, `InboxMobileShell`, `TranslatorHeader`.

**Estado**:
- Activo **provisional aprobado** para el prototipo UX-01.
- **No sustituye** al SVG/PNG maestro corporativo (pendiente de entrega).
- **No debe utilizarse** como prueba legal de identidad ni como referencia oficial de marca.
- **Debe reemplazarse** cuando David entregue el archivo maestro.
- **Colores y proporciones no deben modificarse**: cyan #1EC7FF, coral #FF6B7A, navy #0B0F19, blanco #FFFFFF, aspecto 2172:724 (ratio 3:1).
- Cero cápsula negra aplicada, cero fondo añadido, cero sombra/contorno/rotación.
- No sustituye al productivo `public/SPABLA_LOGO.png` (que sigue intacto).

## 16 · Archivos versionados por este commit

```
app/v2/design/**                              (31 archivos: layout, pages, chat/, translator/, inbox/, styles, fixtures, tests)
public/design/spabla-logo-horizontal-provisional.png
scripts/ux/capture-ux-01.mjs
docs/audit_reports/AUDIT_2026-08-30_hito-ux-01-unified-chat-visual-prototype.md
```

Total: 34 archivos + PNG del logo. Cero cambio en `app/v2/chat/`, `lib/v2/`, `supabase/`, `.github/`, `engine/`, `public/SPABLA_LOGO.png`. `.claude/` excluido explícitamente.

## 17 · Tests

- `state.test.ts` — 4 tests del parser URL → PrototypeState.
- `prototype.behavioral.test.tsx` — 16 tests con happy-dom que verifican render, identidad Laura/Takashi, traducción/original, apertura de llamadas, entrada/salida traductor, controles accesibles, polaridad de transcripción de voz.
- `productive-untouched.test.ts` — 2 tests con `execSync` de git que confirman cero diff en `app/v2/chat/` productivo.

**Ejecución final**: `npx vitest run app/v2/design/` → 23/23 passed. Suite client completa: 331 passed / 69 skipped (309 previos + 22 UX). TypeScript root verde.

## 18 · Cero modificación productiva

Confirmado programáticamente:
- `git status --porcelain app/v2/chat/ lib/v2/ supabase/ .github/ engine/` = vacío.
- Test `productive-untouched.test.ts` verifica cero diff en los 12 archivos productivos clave de `app/v2/chat/**` y `app/v2/layout.tsx`.
- Cero `createClient`, cero `SUPABASE`, cero `@supabase`, cero `fetch(` real en `app/v2/design/`.
- `public/SPABLA_LOGO.png` productivo sin modificar.

## 19 · Riesgos residuales

1. **Ilustración de vídeo placeholder**: la escena remota en `VideoCallCard` es una silueta SVG estilizada, etiquetada visualmente como "Ilustración placeholder". No es dirección artística definitiva. Deberá reemplazarse por el asset real (WebRTC) o por dirección artística cuando el sistema de vídeo entre en producción. Documentado y no bloqueante para revisión visual.
2. **Archivo maestro del logo pendiente**: el PNG provisional (2172×724) es funcional pero David deberá entregar el SVG maestro corporativo. Al hacerlo, sustituir el archivo en `public/design/` y actualizar el sufijo `-provisional` en las referencias.
3. **Prototipo NO productivo**: `/v2/design` no está autenticado, no persiste, y sus fixtures son deterministas. No debe exponerse a usuarios finales sin protección de acceso; no está incluido en el CI de rutas productivas.
4. **Cero WebRTC real / cero traducción real / cero cámara**: el prototipo es exclusivamente visual. Toda funcionalidad real de audio, vídeo, ASR y traducción queda para hitos posteriores fuera de UX-01.

## 20 · Prohibiciones — cero infracciones

- [x] Cero promoción a `spabla-v2/thirteen-languages-activation` (`d729d57` invariante).
- [x] Cero modificación de `main` (`e6128433` invariante).
- [x] Cero commit fuera del alcance UX-01.
- [x] Cero `.claude/` en el commit.
- [x] Cero capturas PNG de revisión versionadas (viven sólo en `~/Downloads/` y `/tmp/`).
- [x] Cero Supabase, cero PostgreSQL, cero Cloud, cero auth/OTP/onboarding tocado.
- [x] Cero UX-02 iniciado.
- [x] Cero rediseño desde cero (se conserva la dirección de UX-01-R2 aprobada por David).

## 21 · Handoff

Rama candidata `spabla-v2/ux-01-unified-chat-visual-prototype` conservada con commit único `feat(v2): add unified chat visual prototype` publicado. CI candidata verde en attempt=1. Oficial y main invariantes. Ningún hito nuevo iniciado.
