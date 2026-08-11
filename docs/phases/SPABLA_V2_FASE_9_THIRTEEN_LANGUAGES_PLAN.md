# Plan de activación inicial de 13 idiomas — SPABLA V2 · Fase 9

**Tipo**: Plan documental de activación (no plan de fase, no plan de hito).
**Autor**: Jefe de Proyecto.
**Versión**: V1.0.
**Fecha**: 2026-08-11.
**Estado**: PROPUESTO PARA APROBACIÓN DE DIRECCIÓN.
**Rama documental**: `docs/fase-9-thirteen-languages-plan`.
**Rama de trabajo prevista para implementación**: pendiente de asignación por Dirección; no se anticipa numeración de hito.
**HEAD base**: `1de1e37ffe70c248efe93e3faa8ce7d9f00333e1` (`spabla-v2/fase-9-visible-conversation`).
**ADR gobernante**: `ADR-005-LANGUAGE-CATALOG` (V1.0, congelada).
**Dependencias documentales**: ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008.
**Estándar aplicable**: `SPABLA_V2_DOCUMENTATION_STANDARD.md` §2 (tipo Fase / Plan).

---

## §1. Propósito

Establecer, de forma exclusivamente documental, las reglas y los invariantes bajo los cuales SPABLA V2 **activará y expondrá públicamente al usuario** su primera batería de 13 idiomas, sin ampliar el catálogo técnico `LangCode` (55 códigos ISO 639-1 ya congelados por ADR-005 §5), sin migraciones SQL, sin cambios en la clave de caché de `spabla_v2.message_translations`, sin retirada ni sobrescritura de traducciones ya persistidas, y sin abrir todavía el siguiente hito de Fase 9.

Este documento **NO implementa** ningún cambio de código, test, migración ni configuración. Es el contrato previo a cualquier tarea de implementación.

---

## §2. Contexto

- **ADR-005 § 5** publica la primera versión oficial del catálogo con **55 códigos ISO 639-1**, entre los cuales están **los 13 objetivo** de esta activación (`es, ca, en, fr, de, it, pt, zh, ja, ko, ar, hi, ru`).
- **Hito 9.1 y 9.1.1** entregaron: conversación bilingüe visible, TranslationStore, orquestador con single-flight, cache persistente `spabla_v2.message_translations` con PK `(tenant_id, message_id, target_language, translation_version)`, corrección UX del selector, recuperación ante 401. Validaciones visuales aprobadas; CI verde en la rama padre `spabla-v2/fase-9-visible-conversation` @ `1de1e37`.
- La UI actual expone únicamente **6 idiomas** en `LANGUAGE_OPTIONS` (`es, en, fr, de, it, pt`). El resto del catálogo, aunque técnicamente aceptado por `isLangCode`, no está ofrecido al usuario.
- El proveedor productivo es OpenAI `gpt-4o-mini`. El prompt actual es genérico, sin instrucciones de preservación de formato ni de sistema de escritura del destino.
- No existe soporte RTL en la UI; `<html lang="es">` es fijo y no se declara `dir` en ningún bloque.
- La marca `translationVersion` está fija en `v1`. No ha habido nunca un bump previo.
- No existe un Plan formal de Fase 9. Los hitos 9.1 y 9.1.1 se cerraron con auditorías internas pero sin documento de fase publicado. Este Plan **no reemplaza** un Plan de Fase 9 general; se limita a la activación de 13 idiomas.

---

## §3. Alcance

Este Plan gobierna, **de forma aditiva y reversible**:

1. La ampliación de `LANGUAGE_OPTIONS` en `app/v2/chat/page.tsx` a exactamente **13 pares** `{code, label}`, con etiquetas en el idioma propio de cada uno.
2. La ampliación del mapa `LANGUAGE_NAMES` en `lib/v2/server/translate.ts` a 13 entradas, con nombres canónicos exigidos por el proveedor.
3. El endurecimiento del prompt de traducción para producir texto multilingüe consistente, sin transliteración, con preservación de URLs, menciones, emojis, números, nombres propios, saltos de línea y estructura de párrafo.
4. El bump `CURRENT_TRANSLATION_VERSION` de `"v1"` a `"v2"` en `lib/v2/server/translation-runtime.ts`.
5. La inclusión de atributos `lang={idioma}` y `dir="auto"` en cada bloque de mensaje del chat para soportar mezcla LTR/RTL sin cambio del `dir` global de la aplicación.
6. La ampliación del tipo `SeedActor.language` en `lib/v2/server/seed.ts` para no restringir el idioma sembrado al par `"es" | "en"`.
7. La adición de suites Vitest y de smoke real controlado que validen la activación.

Este Plan **no cubre**:

- Ninguna otra corrección UX no derivada directamente de esta activación.
- Rediseño del selector.
- Reforma del pipeline de traducción, del proveedor ni del sistema de cache.
- Cambios en el intervalo de polling.
- Cambios en RLS, migraciones, contratos API, contratos de puertos internos, ADR o Foundation.

---

## §4. Fuera de alcance

Los siguientes trabajos son incompatibles con este Plan y NO deben entrar bajo su cobertura:

1. Reducción, sustitución o reordenación de `LangCode` (55 códigos permanecen intactos).
2. Adopción de `zh-Hans`, `zh-Hant`, `pt-BR`, `pt-PT`, `es-ES`, `es-419`, `ar-*` u otras variantes regionales (requerirían ADR-005-N aditiva).
3. Migración SQL (los CHECKs actuales toleran los 13 códigos sin cambio de schema).
4. Cambios en la política RLS de cualquier tabla del schema `spabla_v2`.
5. Cambios en la clave de caché `(tenant_id, message_id, target_language, translation_version)`.
6. Introducción de `sourceLanguage` en la clave de caché.
7. Retirada, sobrescritura o backfill de filas `translation_version = 'v1'` ya persistidas.
8. Persistencia cross-session de las preferencias de idioma del participante (aplazado a un hito futuro no numerado en este Plan).
9. Detección automática de idioma o cambio silencioso del idioma seleccionado por el usuario.
10. Precomputación de traducciones al enviar (`POST /api/v2/messages` sigue guardando únicamente el mensaje original).
11. Cambio del proveedor de traducción productivo.
12. Ejecución de `supabase db reset --local` como parte de la implementación (los tests SQL que lo requieran usarán su propio CI).
13. Apertura del siguiente hito de Fase 9.
14. Cualquier promoción a `main`, a otra rama de fase, ni creación de tags.
15. Resolución de las deudas conocidas: LINT-9.1 (`react-hooks/set-state-in-effect`), SEC-DEPS (vulnerabilidades altas en `socket.io / engine.io / ws` de V1), POLLING (intervalo de 1,5 s), AUTH-RECOVERY (recuperación 401 sin prueba destructiva end-to-end).

---

## §5. Decisiones de Dirección

Las siguientes decisiones proceden directamente de la orden de Dirección que autoriza este Plan. Se enumeran de forma normativa y son inmutables mientras el Plan permanezca en V1.0:

1. El **núcleo mantiene el catálogo de 55 códigos** definido por ADR-005 §5.
2. La primera versión activada al usuario cubre estos **13 códigos**: `es, ca, en, fr, de, it, pt, zh, ja, ko, ar, hi, ru`.
3. **Catalán (`ca`) es idioma independiente y de primera clase**. Nunca se representa como variante de `es`, nunca se degrada a `es` en el prompt, nunca se sirve una traducción `es` como si fuera `ca`.
4. `zh` se interpreta en esta activación como **chino simplificado**. La etiqueta visible es `中文（简体）`. El nombre que recibe el proveedor es `Simplified Chinese`. `zh-Hant` (tradicional) queda aplazado.
5. **No se incorporan variantes regionales**. Toda propuesta futura de variante requiere ADR-005-N (§4.2 de ADR-005).
6. **Cero migración SQL** para esta activación.
7. **Cero cambio en la clave de caché**.
8. **Cero cambio en `LangCode`** ni en `SUPPORTED_LANG_CODES`.
9. El nuevo prompt multilingüe obliga a `CURRENT_TRANSLATION_VERSION = "v2"`.
10. Las filas `translation_version = 'v1'` **se conservan íntegras**; nunca se eliminan, sobrescriben, migran ni compactan por este Plan.
11. Los mensajes se renderizarán con atributos `lang={idioma}` y `dir="auto"` en cada bloque textual.
12. El **coste máximo autorizado del smoke real** es **0,01 USD**.
13. El siguiente hito de Fase 9 no se abre bajo este Plan.
14. Las deudas de polling, lint y dependencias quedan fuera del Plan.

---

## §6. Relación con ADR-005

Este Plan **NO modifica ADR-005**. Se limita a **activar en superficie** un subconjunto de 13 códigos del catálogo publicado por ADR-005 §5. La activación es un acto de **exposición al usuario**, no una alteración del catálogo canónico:

- ADR-005 permanece congelada en V1.0.
- ADR-005 §3.2 exige incorporación exclusivamente aditiva del catálogo → este Plan no incorpora nada nuevo (los 13 códigos ya estaban desde ADR-005).
- ADR-005 §3.5 prohíbe la fragmentación por conveniencia técnica → este Plan no introduce ningún código adicional.
- ADR-005 §4.3 declara que la actualización documental sin ADR es suficiente cuando no se añade código nuevo, no se propone variante, no se retira código, ni se modifica un criterio de §1 o §2/§3 → este Plan cumple los cuatro puntos y por tanto **no requiere ADR aditiva**.
- ADR-005 §6.1 mantiene abierta la decisión de variante simplificado/tradicional para chino; este Plan la **respeta** eligiendo `zh` base para esta activación.
- ADR-005 §6.2 mantiene abierta la decisión de variantes de portugués; este Plan la **respeta** eligiendo `pt` base.

---

## §7. Distinción entre catálogo técnico y catálogo activado

| Concepto | Valor | Localización | Gobernanza |
|---|---|---|---|
| **Catálogo técnico** de códigos aceptados por `isLangCode` | **55 códigos ISO 639-1** publicados por ADR-005 §5 | `engine/src/types/language.ts` (`LangCode` + `SUPPORTED_LANG_CODES`) | ADR-005 (ampliaciones futuras vía ADR-005-N) |
| **Catálogo activado** para el usuario final en esta activación inicial | **13 códigos** de la lista de Dirección | `app/v2/chat/page.tsx` (`LANGUAGE_OPTIONS`) + `lib/v2/server/translate.ts` (`LANGUAGE_NAMES`) | Este Plan (V1.0) |

Consecuencias:

- Un mensaje persistido con `language = "de"` sigue siendo válido aunque `de` no aparezca en `LANGUAGE_OPTIONS` — nada en la persistencia depende de la lista de UI. Los 55 códigos técnicos siguen totalmente admitidos por el schema, la API y `isLangCode`.
- Ampliar el catálogo activado a más de 13 en el futuro **no requiere Plan nuevo si los códigos ya están en ADR-005 §5**; basta una actualización documental de este Plan (§4.3 de ADR-005).
- Reducir el catálogo activado no requiere ADR (los códigos siguen técnicamente admitidos por el schema); sí requiere una revisión de este Plan.

---

## §8. Tabla oficial de los 13 idiomas activados

Orden alfabético por código, presentación al usuario definida en §14.

| # | Código | Etiqueta visible (idioma nativo) | Nombre enviado al proveedor | Dirección | Script principal |
|---|---|---|---|---|---|
| 1 | `ar` | العربية | Modern Standard Arabic | RTL | Arabic |
| 2 | `ca` | Català | Catalan | LTR | Latin |
| 3 | `de` | Deutsch | German | LTR | Latin |
| 4 | `en` | English | English | LTR | Latin |
| 5 | `es` | Español | Spanish | LTR | Latin |
| 6 | `fr` | Français | French | LTR | Latin |
| 7 | `hi` | हिन्दी | Hindi | LTR | Devanagari |
| 8 | `it` | Italiano | Italian | LTR | Latin |
| 9 | `ja` | 日本語 | Japanese | LTR | Japanese (Kanji, Hiragana, Katakana) |
| 10 | `ko` | 한국어 | Korean | LTR | Hangul |
| 11 | `pt` | Português | Portuguese | LTR | Latin |
| 12 | `ru` | Русский | Russian | LTR | Cyrillic |
| 13 | `zh` | 中文（简体） | Simplified Chinese | LTR | Han (Simplified) |

Reglas de coherencia:

- **La etiqueta visible siempre está en la lengua propia del idioma**. No se traducen las etiquetas a `es` ni a `en`.
- **El nombre enviado al proveedor es en inglés**, siguiendo la convención más estable del ecosistema OpenAI. Cuando aplica precisión adicional (`Simplified Chinese`, `Modern Standard Arabic`), se conserva la precisión.
- **La dirección se aplica por bloque de mensaje**, nunca a nivel de aplicación (§15).
- **El script principal es descriptivo**; el navegador infiere la fuente concreta a partir del atributo `lang`.

---

## §9. Política de chino

1. **Código almacenado**: `zh` en `messages.language`, `conversations.language` y `message_translations.target_language`.
2. **Etiqueta visible**: `中文（简体）`.
3. **Nombre para el proveedor**: `Simplified Chinese`.
4. **`zh-Hant` (chino tradicional) queda aplazado**. Su incorporación futura requiere ADR-005-1 aditiva (§4.2 de ADR-005) justificando §2.1–§2.4. Nada en este Plan preempta esa decisión.
5. **Coexistencia futura garantizada**: si más adelante se adopta `zh-Hant`, las filas históricas de `message_translations` con `target_language = 'zh'` conservan su semántica actual (simplificado) por §3.3 de ADR-005. Ninguna migración retroactiva.
6. **Prohibido en esta activación**: exponer `zh-Hans` o `zh-Hant` en `LANGUAGE_OPTIONS`, aceptar `zh-Hans`/`zh-Hant` como códigos válidos en el guard `isLangCode`, o interpretar `zh` como neutro entre simplificado y tradicional en el prompt.

---

## §10. Política de variantes regionales

1. **Ninguna variante regional se activa** en esta primera versión.
2. Las variantes regionales `pt-BR`, `pt-PT`, `es-ES`, `es-419`, `zh-Hant`, `ar-*`, `en-US`, `en-GB`, `fr-CA`, etc. quedan **fuera del catálogo activado y fuera del catálogo técnico**.
3. Cualquier variante futura requiere:
   - ADR-005-N aditiva conforme a §4.2 de ADR-005;
   - Justificación explícita contra §2.1–§2.4 de ADR-005 (divergencia lingüística demostrable + divergencia técnica multi-proveedor);
   - Ampliación de `LangCode`;
   - Extensión de este Plan o Plan sucesor.
4. **Prohibido** interpretar `es` como `es-ES` o `es-419` en el prompt, o `pt` como `pt-BR`, etc. El proveedor decide su neutralización.

---

## §11. Política de catalán

1. `ca` es idioma independiente y de primera clase.
2. La etiqueta visible es `Català` — nunca `Catalán` (`es`) ni `Catalan` (`en`).
3. El nombre enviado al proveedor es `Catalan`.
4. **Prohibido** representar catalán como variante de `es` en cualquier capa: UI, prompt, tests, seed, logs, métricas.
5. **Prohibido** servir una traducción `es` cuando la audiencia lo solicita como `ca`, aunque el proveedor devuelva contenido parecido.
6. La cache de `message_translations` mantendrá filas `(tenant, msg, "ca", "v2")` completamente separadas de `(tenant, msg, "es", "v2")`.
7. El smoke real (§27) valida explícitamente `es ↔ ca` en ambas direcciones para detectar cualquier colapso hacia `es` por parte del proveedor.

---

## §12. Política de portugués

1. `pt` como base cubre las principales variantes europeas y brasileñas para el propósito de conversación bilingüe visible.
2. La etiqueta visible es `Português`.
3. El nombre enviado al proveedor es `Portuguese`.
4. La decisión de introducir `pt-BR` y `pt-PT` queda aplazada a ADR-005-2 (referenciada por ADR-005 §6.2), no reabierta por este Plan.

---

## §13. Política de árabe estándar moderno

1. `ar` como base representa **Modern Standard Arabic (MSA)**.
2. La etiqueta visible es `العربية`.
3. El nombre enviado al proveedor es `Modern Standard Arabic` (no `Arabic` a secas), para evitar que el proveedor entregue un dialecto regional.
4. `ar` es el único idioma **RTL** del catálogo activado. Toda la política de §15 se apoya en su presencia.
5. Los dialectos (egipcio, marroquí, levantino, del Golfo) quedan resueltos por adapters futuros, nunca por códigos adicionales en este Plan (§5.4 de ADR-005).
6. El smoke real (§27) valida `es → ar` y `ar → es` con al menos un mensaje que combine texto arábigo, una URL y un número, para verificar que el rendering bidi es correcto y que la traducción preserva ambos elementos.

---

## §14. Impacto en UI

1. `app/v2/chat/page.tsx` amplía `LANGUAGE_OPTIONS` a exactamente los 13 pares de §8, con las etiquetas visibles en la lengua propia de cada idioma.
2. **Orden del selector**: alfabético por etiqueta visible en la lengua propia del idioma (`العربية, Català, Deutsch, English, Español, Français, हिन्दी, Italiano, 日本語, 한국어, Português, Русский, 中文（简体）`). Este orden es neutral culturalmente y no privilegia ningún mercado en particular.
3. **Fallback de etiqueta**: si en el futuro se añade un código sin etiqueta nativa disponible, mostrar el código en mayúsculas (`XX`) hasta que se defina la etiqueta oficial. No inventar etiquetas.
4. **Sin cambios** en:
   - `dir` global de la aplicación (`<html lang="es">` permanece);
   - selector "Yo escribo en" / "Leer mensajes en" (ambos permanecen separados, ver §21);
   - lógica de `initialLanguagesFor`;
   - polling;
   - autenticación;
   - composición server-side.
5. **Accesibilidad**: cada `<option>` conserva su `value={code}` y muestra la etiqueta visible como contenido de texto. Los lectores de pantalla reciben el texto tal cual está en la lengua propia; en algunos casos leerán con la fonética del idioma de la interfaz (español actualmente). Esta limitación se registra como observación no bloqueante (§35).

---

## §15. Impacto en accesibilidad y RTL

1. Cada bloque de mensaje (`<li>` en la lista de conversación) declara `lang={m.originalLanguage}`.
2. Cada `<div>` de texto declara `dir="auto"`; el navegador determina la dirección visual a partir del primer carácter de peso fuerte del contenido.
3. El texto original y la traducción se aíslan bidireccionalmente. Cuando un mensaje mezcla scripts (por ejemplo, `Mira este enlace: https://spabla.local` en un mensaje árabe), la envoltura `<bdi>` o `<span dir="auto">` alrededor de la URL, número o mención evita sangrado bidi.
4. **El `dir` global de la aplicación NO cambia**. La aplicación entera permanece LTR; solo los bloques de mensaje en árabe se renderizan RTL por inferencia local.
5. **Prohibido** aplicar `dir="rtl"` fijo a nivel de `<html>` o `<body>` bajo este Plan.
6. **Prohibido** exponer `ar` en `LANGUAGE_OPTIONS` sin haber verificado antes que el rendering bidi es correcto en Safari macOS con un mensaje que mezcle texto arábigo + URL + número.
7. Tipografía: se usa `font-family: system-ui` (default actual del layout). Se confía en la cobertura de scripts que ofrecen las fuentes de sistema en macOS, Windows, Linux, iOS y Android. Este Plan NO añade web-fonts.

---

## §16. Impacto en proveedor

1. `lib/v2/server/translate.ts` amplía `LANGUAGE_NAMES` de las 10 entradas actuales (`es, en, fr, de, it, pt, ja, zh, ar, ru`) a las 13 requeridas, incorporando `ca`, `ko`, `hi` y refinando los tres con precisión adicional:

   ```
   ar: "Modern Standard Arabic"    (antes "Arabic")
   ca: "Catalan"                    (nueva)
   de: "German"
   en: "English"
   es: "Spanish"
   fr: "French"
   hi: "Hindi"                      (nueva)
   it: "Italian"
   ja: "Japanese"
   ko: "Korean"                     (nueva)
   pt: "Portuguese"
   ru: "Russian"
   zh: "Simplified Chinese"         (antes "Chinese")
   ```

2. El fallback actual (`LANGUAGE_NAMES[input.from] ?? input.from`) permanece; los códigos técnicos de `LangCode` no cubiertos por la activación seguirán funcionando con el código ISO 639-1 como nombre bruto, sin regresión.
3. El modelo (`gpt-4o-mini`), `max_tokens` (500) y `temperature` (0) permanecen sin cambios.
4. **Prohibido** cambiar de modelo, de proveedor, de `max_tokens` o de `temperature` bajo este Plan.
5. **Prohibido** enviar los códigos ISO al proveedor sin pasar por `LANGUAGE_NAMES` (el prompt debe recibir el nombre en inglés canónico).

---

## §17. Prompt multilingüe aprobado

El prompt sistema aprobado para la implementación es, conceptualmente:

```
You are a professional translator. Translate the user's message from
{sourceLanguage} to {targetLanguage}.

Preserve URLs, @mentions, emojis, numbers, proper names, line breaks and
paragraph structure. Do not transliterate: use the natural writing system
of the target language.

Return only the translated text, with no preamble, explanation or quotation
marks.
```

Reglas normativas del prompt:

1. `{sourceLanguage}` y `{targetLanguage}` se sustituyen por el valor de `LANGUAGE_NAMES[code]` (§16).
2. **Nunca** debe enviarse el código ISO en bruto sin pasar por el mapa.
3. **Nunca** debe transliterarse (por ejemplo, escribir árabe con letras latinas o japonés en romaji).
4. Los siguientes elementos son inmutables: URLs, `@menciones`, emojis, números, nombres propios (incluyendo `SPABLA`), saltos de línea, párrafos.
5. La respuesta contiene **exclusivamente** el texto traducido; sin preámbulos, sin explicaciones, sin comillas envolventes, sin marcado adicional.
6. La instrucción debe llegar al proveedor **exactamente una vez por combinación** `(tenant, message, targetLanguage, translationVersion)` (garantizado por `TranslationStore.load` + persistencia).

---

## §18. Política de `translationVersion = "v2"`

1. La constante `CURRENT_TRANSLATION_VERSION` en `lib/v2/server/translation-runtime.ts` pasa de `"v1"` a `"v2"` en el mismo commit que introduce el nuevo prompt.
2. **Motivo**: el prompt cambia semánticamente (nueva instrucción de preservación, nueva instrucción anti-transliteración, nueva restricción de salida). Servir traducciones antiguas producidas bajo `v1` bajo el discurso `v2` violaría la coherencia de la caché.
3. **Efecto**: las filas históricas `translation_version = 'v1'` de `spabla_v2.message_translations` **quedan intactas**. La primera vez que un mensaje se solicita bajo `v2`, se produce un `miss`, se traduce con el prompt nuevo y se persiste como fila nueva `(tenant, msg, target, "v2")`. La fila `v1` correspondiente permanece disponible para auditoría o rollback.
4. **Coste one-off** aceptable: cada mensaje activo se retraduce una única vez por idioma de audiencia. El coste real durante la fase de smoke se acota en §28.

---

## §19. Compatibilidad y conservación de registros v1

1. Ninguna fila `translation_version = 'v1'` se elimina, sobrescribe, migra ni compacta por este Plan.
2. La PK compuesta `(tenant_id, message_id, target_language, translation_version)` permite la coexistencia de dos filas para el mismo mensaje y mismo idioma destino con versiones distintas.
3. El código de lectura (`SupabaseTranslationStore.load`) sigue filtrando estrictamente por `translation_version`, por lo que las filas `v1` no se sirven bajo el discurso `v2` ni al revés.
4. Se declara explícitamente que **el conjunto de filas `v1` es documentación de la política de traducción vigente hasta el momento del bump**. No es basura ni debe eliminarse.
5. Si en el futuro se decide purgar `v1`, requerirá un plan documental separado que declare la política de retención y ejecute la limpieza mediante `service_role`, nunca en el pipeline productivo.

---

## §20. Confirmación de cero migraciones

1. Los CHECKs actuales `length(btrim(language)) > 0` (en `conversations`, `messages`) y `length(btrim(target_language)) > 0` (en `message_translations`) toleran cualquier código no vacío, incluidos los 13 activados.
2. La longitud máxima no está acotada; `ca`, `zh`, `ar`, `hi` (2 caracteres) y cualquier BCP 47 futuro (`zh-Hans`, 7 caracteres) encajan sin cambio.
3. **Prohibido** añadir bajo este Plan cualquier migración con `ALTER TABLE`, `ALTER TYPE`, `CREATE TYPE`, `CREATE INDEX`, `CREATE POLICY`, `GRANT` o `REVOKE` sobre `spabla_v2`.
4. La cadena de migraciones existente (`20260101…`, `20260617…`, `20260617…`, `20260730…`, `20260811…`, `20260812…`) permanece inmodificada.

---

## §21. Confirmación de cero cambios de RLS

1. Las políticas RLS de `spabla_v2.messages`, `spabla_v2.message_translations`, `spabla_v2.conversations`, `spabla_v2.tenant_memberships`, `spabla_v2.tenants` y `spabla_v2.usage_ledger` permanecen tal cual las definen las migraciones `20260730160000_phase8_bootstrap.sql` y `20260812000000_fase9_1_1_message_translations.sql`.
2. La matriz de grants (SELECT-only para `authenticated`, escritura reservada a `service_role`) permanece inmutable.
3. `FORCE ROW LEVEL SECURITY` sigue activo en las seis tablas de `spabla_v2`.
4. El aislamiento por tenant es una propiedad estructural que **no se ve afectada** por añadir 13 idiomas: la clave de caché ya lleva `tenant_id`, RLS filtra por membresía activa, y el orquestador respeta `ctx.tenantId`.

---

## §22. Confirmación de cero cambios en cache key

1. La PK de `spabla_v2.message_translations` sigue siendo `(tenant_id, message_id, target_language, translation_version)`.
2. El `singleFlightKey` en `engine/src/adapters/translation-store/resolve-translated-messages.ts` sigue siendo `${tenantId}|${messageId}|${targetLanguage}|${translationVersion}`.
3. **No se añade** `sourceLanguage` a la clave (el `messageId` determina unívocamente el idioma origen del mensaje).
4. **No se añade** `provider`, `model` ni ningún otro campo estructural a la clave (esos campos se conservan como metadatos por fila, no como discriminantes de caché).
5. Añadir los 13 idiomas activa nuevos valores de `target_language` sin colisión con los existentes.

---

## §23. Archivos previstos

| Categoría | Ruta | Cambio |
|---|---|---|
| UI | `app/v2/chat/page.tsx` | Ampliar `LANGUAGE_OPTIONS` a 13; añadir `lang` y `dir="auto"` en bloques de mensaje |
| Servidor | `lib/v2/server/translate.ts` | Ampliar `LANGUAGE_NAMES` a 13; introducir el prompt de §17 |
| Runtime | `lib/v2/server/translation-runtime.ts` | Bump `CURRENT_TRANSLATION_VERSION` a `"v2"` |
| Seed | `lib/v2/server/seed.ts` | Ampliar tipo `SeedActor.language: LangCode` (sin cambio de datos sembrados) |
| Tests engine | `engine/src/utils/chat-labels.test.ts` | Extender assertions sobre los 13 pares `code:label` |
| Tests engine | `engine/src/types/language.test.ts` o nuevo | Cobertura exhaustiva del subconjunto de 13 |
| Tests engine | `engine/src/adapters/translation-store/*.test.ts` (nuevo o extendido) | Matriz 13×13 con fake determinista |
| Documental | `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` | Este documento (V1.0 y sucesivas revisiones) |

**Cero archivos fuera de esta lista.** Migraciones, contratos de puertos, ADRs, `PersistencePort`, Foundation, `translation-store/port.ts`, `translation-store/errors.ts`, `translation-store/single-flight.ts`, `translation-store/supabase-translation-store.ts`, `translation-store/resolve-translated-messages.ts` (excepto tests), `lib/v2/server/composition.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts` permanecen intactos.

---

## §24. Estrategia de implementación

1. La implementación se ejecutará en una **rama de trabajo** que Dirección asignará después de aprobar este Plan. Ese nombre **no se decide aquí**.
2. La rama de trabajo se creará desde `spabla-v2/fase-9-visible-conversation` @ `1de1e37` (HEAD base). Sin rebase, sin merge de otras ramas.
3. La implementación se troza en las tareas atómicas LANG13-01…07 (§25).
4. La promoción final a la rama de fase se realizará por **fast-forward** (método histórico establecido por los hitos 7.x, 8.x, 9.1, 9.1.1).
5. **Prohibido** durante la implementación:
   - `git rebase`, `git commit --amend`, `git push --force`, `git push --force-with-lease`;
   - crear tags;
   - abrir PR sin autorización explícita de Dirección;
   - fusionar directamente a `main`;
   - tocar `main`.
6. **Prohibido** durante la implementación cualquiera de las prohibiciones de §4 (fuera de alcance).

---

## §25. Tareas atómicas propuestas

Los identificadores son internos a este Plan. **No corresponden** a numeración de hito. Cualquier numeración de hito la asigna Dirección al aprobar el Plan y al abrir la rama de trabajo.

### LANG13-01 · Contratos y catálogo activado
- Confirmar por test exhaustivo que los 13 códigos están en `LangCode` y en `SUPPORTED_LANG_CODES`.
- **No modificar** la unión de 55 códigos.
- Añadir tests que rechacen explícitamente `zh-Hans`, `zh-Hant`, `pt-BR`, `pt-PT`, `es-ES`, `ar-EG` como códigos no soportados por `isLangCode`.
- Añadir tests que confirmen que los pares `(from, to)` con `from ≠ to` de los 13 códigos son admitidos por `makeLanguagePair`.

### LANG13-02 · Activación en UI
- Ampliar `LANGUAGE_OPTIONS` a exactamente los 13 pares `{code, label}` de §8.
- Etiquetas en la lengua propia de cada idioma.
- Orden alfabético por etiqueta visible (§14.2).
- **Mantener** separados los selectores "Yo escribo en" y "Leer mensajes en".
- **Mantener** la etiqueta corregida "Leer mensajes en" del Hito 9.1.1.
- Extender `SeedActor.language` de `"es" | "en"` a `LangCode` (sin cambiar los actores sembrados).
- Test de string sobre `page.tsx` (`chat-labels.test.ts`) que asserta los 13 pares presentes y `Ver traducciones en` ausente.

### LANG13-03 · Accesibilidad y RTL
- Añadir `lang={m.originalLanguage}` al `<li>` de cada mensaje.
- Añadir `dir="auto"` al `<div>` del texto original y al `<div>` de la traducción (o al `<li>` completo, decisión de implementación).
- **No cambiar** el `<html lang="es">` de `app/layout.tsx`.
- Envolver URLs, menciones y números dentro de mensajes con `<bdi>` o `<span dir="auto">` si el análisis de implementación lo requiere para mantener el rendering correcto en Safari macOS.
- Test que asserte la presencia de `dir="auto"` y `lang=` en `page.tsx`.
- Validación visual manual controlada de árabe con un mensaje que combine texto arábigo, URL y número.

### LANG13-04 · Proveedor multilingüe
- Ampliar `LANGUAGE_NAMES` con `ca`, `ko`, `hi` y refinar `ar`, `zh` (§16).
- Sustituir el prompt actual por el prompt de §17.
- Bump `CURRENT_TRANSLATION_VERSION` de `"v1"` a `"v2"`.
- **Conservar** todas las filas `v1` existentes en `message_translations` (§19).
- Test unitario que asserte la nueva versión y el nuevo prompt (verificable por lectura del fichero o por interceptor del fake).

### LANG13-05 · Regresión automatizada
Añadir o extender tests Vitest para cubrir:
- Catálogo activado de 13 (LANG13-01).
- Matriz con proveedor falso: 13×13 combinaciones donde `from ≠ to` producen 156 llamadas al fake exactamente una vez por combinación bajo single-flight.
- Passthrough: `from === to` produce **cero** llamadas al fake para cada uno de los 13.
- Caché: dos GETs sucesivos con la misma clave producen **una** llamada al fake.
- Concurrencia: seis GETs simultáneos comparten una llamada al fake vía single-flight.
- Tenant isolation: un actor de tenant B nunca observa traducciones del tenant A, con `target_language` en los 13 activados.
- Normalización: el guard rechaza `"ES"` (mayúsculas), `"es-ES"` (variante), `" es "` (padding).
- RTL: el `<li>` con `originalLanguage = "ar"` renderiza con `lang="ar"` y `dir="auto"`.

### LANG13-06 · Smoke real controlado
Ejecutar con proveedor real (`gpt-4o-mini`), en Supabase local, sobre el tenant demo, con presupuesto máximo autorizado en §28:

| Par | Justificación |
|---|---|
| `es → ca` | Catalán como primera clase; verificar que el proveedor lo distingue de `es`. |
| `ca → es` | Dirección inversa. |
| `es → zh` | Chino simplificado; verificar el script Han. |
| `zh → es` | Inversa. |
| `es → ar` | Único idioma RTL activado; verificar rendering + traducción. |
| `ar → es` | Inversa. |
| `es → hi` | Devanagari. |
| `hi → es` | Inversa. |
| `es → de` | Control latino; par ya validado en Hito 9.1.1 con `es → en`, se refuerza con otro par latino. |
| `de → es` | Inversa. |

- **10 llamadas iniciales** (llenado inicial).
- **Máximo 15 llamadas totales** (permite 5 reintentos por par que devuelva texto vacío o transliteración).
- Después del llenado: 60 segundos de polling continuado con 2 sesiones. El número de filas en `spabla_v2.message_translations` para el tenant demo **debe permanecer constante**.
- Cualquier crecimiento del contador tras el llenado detiene el smoke y se investiga (§30).

### LANG13-07 · Auditoría y promoción
- Suite completa Vitest verde.
- CI de los tres jobs (A, B, C) en verde tras push de la rama de trabajo.
- Auditoría de seguridad: `git diff --check`, escaneo de secretos, verificación de que `PersistencePort`, ADRs, Foundation y migraciones no cambian.
- Coste real del smoke ≤ 0,01 USD.
- Prueba visual manual bajo supervisión de Dirección.
- Promoción por fast-forward a `spabla-v2/fase-9-visible-conversation` únicamente tras aprobación explícita.
- Conservación de la rama de trabajo tras la promoción.

---

## §26. Estrategia de tests

Se separa deliberadamente en tres capas para acotar coste y complejidad:

**Capa A — Contractual (Vitest, sin proveedor)**
- Cubre lo que puede validarse deterministamente en el proceso engine.
- Tiempo esperado: ≤ 500 ms para toda la matriz.
- Cero llamadas reales al proveedor.

**Capa B — Con proveedor falso instrumentado (Vitest, sin red)**
- Fake `TranslationProvider` con contador determinista.
- Matriz 13×13, verificación de single-flight, cache, concurrencia, tenant isolation.
- Cero llamadas reales al proveedor.

**Capa C — Smoke real controlado (manual, con presupuesto acotado)**
- Solo los 10 pares definidos en LANG13-06.
- Ejecuta contra Supabase local y proveedor real.
- Se aborta si sobrepasa los límites de §27 o §30.

Prohibido bajo este Plan:
- Lanzar la matriz 13×13 completa contra el proveedor real (156 llamadas violan §28).
- Sustituir la Capa A o B por sesiones manuales.
- Reducir la Capa C a menos de los 10 pares (elimina la cobertura mínima crítica de catalán, chino, árabe, hindi y control latino).

---

## §27. Smoke real controlado

**Duración**: máximo 5 minutos activos + 2 minutos de polling continuo tras el llenado.

**Pasos**:
1. Verificar precondiciones: rama, HEAD, working tree limpio, Supabase local en `127.0.0.1:54321`, `.env.development.local` sin refs productivas, Next dev en `localhost:3000`.
2. Registrar snapshot t0: filas en `spabla_v2.message_translations` (todos los tenant), GETs acumulados en el log de Next dev.
3. Enviar los 10 mensajes en orden con las direcciones definidas en LANG13-06. Un actor envía, el otro lee.
4. Registrar snapshot t1 tras el llenado: contador de filas en el tenant demo debe haber aumentado en 10; contador global de llamadas al proveedor debe ser 10.
5. Dejar polling continuado 60 segundos.
6. Registrar snapshot t2: filas del tenant demo **inmutables** desde t1; GETs incrementan según el ritmo de polling.
7. Recargar ambos navegadores. Registrar snapshot t3: filas **inmutables** desde t1; timestamps de las filas no cambian.
8. Detener Next dev al cerrar el smoke para evitar coste residual del proveedor.

**Datos de audit**:
- Timestamps t0, t1, t2, t3.
- Deltas de filas y de GETs.
- Contador de llamadas al proveedor (leído de la tabla o del log).
- Coste estimado a partir de tokens de entrada/salida.

---

## §28. Presupuesto máximo autorizado

- **Coste techo del smoke real**: **0,01 USD** (un céntimo de dólar).
- Justificación: `gpt-4o-mini` a $0.15 / 1M input tokens + $0.60 / 1M output tokens. Estimación por llamada ≈ 200 tokens totales → ≈ $0.00003. Diez llamadas iniciales ≈ $0.0003. El techo de $0.01 deja un margen de 33× para reintentos, retraducciones tras un rollback puntual o pruebas de sensibilidad de prompt.
- **Techo duro**: si durante el smoke el coste estimado supera 0,01 USD, abortar y reportar. Ningún reintento puede rebasar el techo.
- **Contador**: el smoke registra tokens de entrada y salida por llamada y calcula el coste acumulado en tiempo real. La detención es inmediata.

---

## §29. Criterios de aceptación

**Contractuales**:
1. Los 13 códigos están en `LangCode` sin cambios en la unión de 55.
2. `LANGUAGE_OPTIONS` contiene exactamente los 13 pares de §8 con etiquetas nativas.
3. `LANGUAGE_NAMES` contiene 13 entradas con los nombres canónicos de §16.
4. `CURRENT_TRANSLATION_VERSION === "v2"`.
5. `<li>` de mensaje declara `lang={originalLanguage}` y `dir="auto"` en su texto.
6. Nueva suite Vitest de matriz 13×13 con fake pasa con exactamente 156 llamadas al fake.
7. Suite completa engine ≥ 750 tests + N nuevos, en verde.
8. TypeScript raíz y engine en verde.
9. Build Next en verde.

**Funcionales (smoke real)**:
10. Los 10 pares del smoke devuelven texto en el script correcto (`zh` en Han, `ar` en arábigo, `hi` en devanagari, `ko` en hangul, `ca` distinguible de `es`).
11. Tras el llenado inicial de 10 filas en `message_translations`, ni un solo GET adicional durante 60 s de polling ni la recarga aumenta el contador.
12. Un mensaje árabe con URL + número se renderiza correctamente en Safari macOS con orden RTL y URL/número preservados.
13. Coste real acumulado ≤ 0,01 USD.

**Seguridad**:
14. Cero cambios en migraciones, RLS, cache key, `PersistencePort`, `TranslationStore` contrato, Foundation, ADRs.
15. Cero secretos añadidos. `git diff --check` limpio.
16. Cero conexión a Supabase productivo. `main` intacto.
17. CI de los tres jobs en verde en la rama de trabajo.

---

## §30. Criterios de parada

Cualquiera de las siguientes causas suspende la implementación y exige reporte inmediato a Dirección **sin** aplicar cambios adicionales:

1. `gpt-4o-mini` devuelve transliteración persistente en `ca`, `zh`, `ar`, `hi`, `ko` tras el prompt nuevo.
2. `gpt-4o-mini` colapsa catalán a español o portugués a español.
3. Safari macOS no renderiza árabe RTL correctamente con `dir="auto"`.
4. Cualquier fila `v1` de `message_translations` resulta modificada, eliminada o sobrescrita durante la implementación.
5. Cualquier cambio no autorizado en migraciones, RLS, cache key, contratos de puertos o ADR.
6. Coste real del smoke supera 0,01 USD antes de completar los 10 pares.
7. Aumento del contador de filas en `message_translations` tras el llenado.
8. Aparición de nuevas violaciones de lint distintas de las 4 registradas en LINT-9.1.
9. Regresión en CI (cualquiera de los tres jobs pasa de verde a rojo).
10. Ambigüedad no resuelta sobre la numeración de hito de la rama de trabajo.

---

## §31. Riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Calidad de traducción desigual entre idiomas (peor en `hi`, `zh`) | Alta | Medio | Smoke real §27 valida los pares críticos con prompt endurecido §17 |
| R2 | Rendering árabe defectuoso sin `dir="auto"` | Certeza si no se aplica | Alto | LANG13-03 es prerrequisito de LANG13-02 al exponer `ar` |
| R3 | Coste inesperado tras bump a `v2` si el chat tiene tráfico real | Baja (Supabase local) | Alto en prod | Cache amortigua desde la primera lectura de cada combinación |
| R4 | Interpretación errónea de `zh` por parte del proveedor | Media | Medio | `LANGUAGE_NAMES.zh = "Simplified Chinese"` fuerza precisión |
| R5 | Pérdida accidental de traducciones `v1` | Baja | Alto | §19 lo prohíbe explícitamente; PK compuesta lo impide estructuralmente |
| R6 | Presión por incorporar variantes regionales sin ADR | Media (largo plazo) | Alto | §10 explícito; ADR-005 §3.5 lo prohíbe |
| R7 | Regresión de tests preexistentes | Baja | Medio | Suite completa se ejecuta en LANG13-05 y CI |
| R8 | Fuga del prompt endurecido a `main` sin bump `v2` | Baja | Medio | LANG13-04 exige commit atómico prompt + bump juntos |
| R9 | Filtración del `SUPABASE_SERVICE_ROLE_KEY` al bundle cliente al añadir traducciones a más idiomas | Nula (no aplica) | Alto | `translation-runtime.ts` sigue con `import "server-only"`; ningún idioma nuevo cambia esa disciplina |
| R10 | Interpretación de la etiqueta "Leer mensajes en" como acción del interlocutor tras añadir más idiomas | Baja | Bajo | Etiqueta ya validada en Hito 9.1.1; sin cambio en este Plan |

---

## §32. Rollback

La reversión es simple porque el Plan es **aditivo y reversible**:

**Escenario 1 — Revertir todo**
- Rollback = `git revert` de los commits de LANG13-01…07 en la rama de trabajo, o abandono de la rama antes de la promoción.
- Efecto: `LANGUAGE_OPTIONS` vuelve a 6, `LANGUAGE_NAMES` vuelve a 10, prompt vuelve al genérico, `CURRENT_TRANSLATION_VERSION` vuelve a `"v1"`.
- Datos: las filas `v2` creadas durante el smoke real permanecen en `message_translations` (no se eliminan; §19 aplica en ambos sentidos). Sirven como registro histórico.

**Escenario 2 — Revertir solo el bump a `v2`**
- Rollback selectivo del commit LANG13-04.
- Efecto: el sistema vuelve a servir `v1`. Las filas `v2` producidas dejan de servirse pero no se eliminan.
- Coste: los mensajes activos se retraducen bajo `v1` cuando se consulten (miss de caché a nivel `v1`, si el mensaje ya tenía `v1` se sirve; si no, se retraduce con el prompt anterior).

**Escenario 3 — Revertir solo la ampliación de UI**
- Rollback selectivo del commit LANG13-02 dejando el resto (backend + `v2`).
- Efecto: los 13 idiomas permanecen técnicamente disponibles vía API pero no se ofrecen al usuario en el selector.
- Puede usarse como estado intermedio si se detecta un defecto UX puntual en un idioma concreto.

**Prohibido en cualquier rollback**:
- Eliminar filas de `message_translations`.
- Modificar migraciones.
- Alterar ADRs.
- Force-push.

---

## §33. Seguridad y tenant isolation

1. La activación de 13 idiomas **no introduce ningún vector de tenant leakage**. Todas las lecturas siguen pasando por `SupabaseTranslationStore.load` con `authenticated` client + RLS activo (Hito 9.1.1).
2. Las escrituras siguen exclusivamente en server-side vía `service_role` dentro del boundary `import "server-only"`. Ninguna clave privilegiada llega al navegador.
3. La política RLS `message_translations_read` filtra por membresía activa; añadir 13 idiomas no cambia ese filtrado.
4. La composite FK `(tenant_id, message_id) → messages(tenant_id, id)` sigue imponiendo aislamiento estructural.
5. El guard `record.tenantId === ctx.tenantId` en `SupabaseTranslationStore.saveServerSide` se aplica igual a los 13 idiomas.
6. LANG13-05 incluye test específico de tenant isolation con los 13 idiomas activados.

---

## §34. Observabilidad y control de costes

1. Cada llamada real al proveedor produce, como registro mínimo, una fila en `spabla_v2.message_translations` con `provider = "openai"`, `model = "gpt-4o-mini"`, `translation_version = "v2"`. Este registro es la evidencia auditable del llenado de caché.
2. El log del servidor Next dev registra cada GET a `/api/v2/messages`; el ratio "GETs / filas nuevas por segundo" es el termómetro operativo del comportamiento de caché durante el smoke.
3. Para el smoke: el operador humano debe contabilizar explícitamente el coste estimado por llamada y detener antes de rebasar §28.
4. Fuera del alcance de este Plan (queda como observación no bloqueante):
   - Integración con `usage_ledger` de las llamadas al proveedor (requeriría decisión sobre `metric_kind` y `idempotency_key`, aplazada).
   - Dashboard de coste en tiempo real (requeriría infraestructura de observabilidad no existente).
   - Alertas de rate limit del proveedor.

---

## §35. Deudas explícitamente excluidas

Las siguientes deudas técnicas conocidas del proyecto **NO se resuelven bajo este Plan** y **no bloquean** su ejecución:

| Deuda | Descripción | ¿Bloquea este Plan? |
|---|---|---|
| **LINT-9.1** | 4 errores `react-hooks/set-state-in-effect` en `app/v2/chat/page.tsx`. Preexistentes desde Hito 9.1. | No |
| **SEC-DEPS** | 9 vulnerabilidades altas en `socket.io`, `engine.io`, `ws`. Dependencias transitivas del signaling V1. | No |
| **POLLING** | Intervalo 1,5 s. ~3 000 GETs acumulados en tests breves. Coste amortizado por la caché desde Hito 9.1.1. | No |
| **AUTH-RECOVERY** | Recuperación ante 401 cubierta por tests contractuales pero sin prueba destructiva end-to-end. | No |

Observaciones adicionales que no son deudas sino limitaciones aceptadas por este Plan:

- **Preferencias persistentes cross-session**: aplazado.
- **Detección automática de idioma**: aplazado; nunca cambio silencioso.
- **Screen-reader phonetics para etiquetas nativas**: aceptado con limitación (§14.5).
- **Web-fonts adicionales**: no se añaden; se confía en `system-ui` (§15.7).

Cada una de estas deudas y observaciones tendrá su propio artefacto documental cuando Dirección lo autorice.

---

## §36. Procedimiento de promoción

1. La implementación se completa en la rama de trabajo asignada por Dirección.
2. Cada tarea LANG13-N produce **un commit atómico** con mensaje descriptivo.
3. La CI (`ci.yml`) debe estar verde en los tres jobs (A engine, B Supabase integration, C phase-8 restore drill) en la rama de trabajo antes de proponer la promoción.
4. La promoción a `spabla-v2/fase-9-visible-conversation` se realiza mediante **fast-forward** (`git merge --ff-only`), método histórico establecido por los hitos 7.x, 8.x, 9.1, 9.1.1.
5. Tras la promoción, la rama de trabajo se **conserva** para trazabilidad. No se borra.
6. **Prohibido**: `git rebase`, `git commit --amend`, `git push --force`, creación de tags, apertura de PR sin autorización, fusión a `main`, cualquier modificación de `main`.
7. La aprobación final para promover requiere:
   - Dictamen del auditor: "PLAN LANG13 IMPLEMENTADO Y APTO PARA PROMOCIÓN";
   - Aprobación explícita de Dirección;
   - Adjuntar informe del smoke real con coste registrado.

---

## §37. Estado de aprobación

- **V1.0 — 2026-08-11**: PROPUESTO PARA APROBACIÓN DE DIRECCIÓN.
- El documento es inmutable mientras permanece en V1.0 salvo por la aprobación de Dirección, que lo puede pasar a `APROBADO Y CONGELADO` sin cambios.
- Cualquier modificación material posterior exige nueva versión (V1.1, V2.0, etc.) y trazabilidad de cambios.
- Este Plan queda subordinado a ADR-005 y a los principios de ADR-003, ADR-004; nunca los sobrescribe.

---

## Anexo A — Índice de identificadores del Plan

- **Plan**: `SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.0.
- **Rama documental**: `docs/fase-9-thirteen-languages-plan`.
- **HEAD base**: `1de1e37ffe70c248efe93e3faa8ce7d9f00333e1`.
- **ADR gobernante**: `ADR-005-LANGUAGE-CATALOG` V1.0.
- **Tareas**: LANG13-01, LANG13-02, LANG13-03, LANG13-04, LANG13-05, LANG13-06, LANG13-07.
- **Versión de traducción a introducir**: `v2`.
- **Versión de traducción a conservar**: `v1`.
- **Coste techo del smoke real**: 0,01 USD.
- **Idiomas activados**: `es, ca, en, fr, de, it, pt, zh, ja, ko, ar, hi, ru` (13).
- **Idiomas técnicos preservados en `LangCode`**: 55.
