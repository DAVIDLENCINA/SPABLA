# SPABLA V2 · Hito 9.2.5-F — REVALIDACIÓN INTEGRAL POST V1-ERADICATION

**Fecha del acta**: 2026-08-19
**Rama de revalidación**: `spabla-v2/hito-9-2-5-f-post-v1-validation`
**Base exacta**: `0eaa2bae697dc20464aabaa40bc14e24a1ff1d5c` (rama oficial `spabla-v2/thirteen-languages-activation` tras la promoción de Hito 9.2.6 V1-ERADICATION)
**CI oficial basal**: [`32268502343`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32268502343) — completed / success / attempt=1 / Jobs A/B/C todos verdes

---

## 1 · Objeto y alcance

Este acta documenta la **revalidación integral primaria** de las barreras técnicas del Hito 9.2.5-F ejecutada **después** de la promoción del Hito 9.2.6 V1-ERADICATION. La validación se realiza sobre una nueva rama, `spabla-v2/hito-9-2-5-f-post-v1-validation`, creada desde el commit oficial exacto `0eaa2bae…`, sin modificar código y con la única modificación versionada de este propio documento.

## 2 · Base exacta

- Rama base: `spabla-v2/thirteen-languages-activation`
- HEAD base: `0eaa2bae697dc20464aabaa40bc14e24a1ff1d5c`
- Rama nueva: `spabla-v2/hito-9-2-5-f-post-v1-validation`
- HEAD nuevo (pre-commit documental): `0eaa2bae697dc20464aabaa40bc14e24a1ff1d5c`

## 3 · Relación con la validación histórica

- Rama histórica `spabla-v2/hito-9-2-5-f-integral-validation` @ `2852be40ab489372acdbf4e28a9523c6b8a2130c` **queda congelada** y preservada como evidencia previa a la erradicación de V1.
- Esta revalidación **no la modifica, no la reescribe y no la sustituye**.
- La validación histórica no puede utilizarse como cierre definitivo del Hito 9.2.5-F porque fue ejecutada **antes** de retirar el runtime V1 del árbol. Por lo tanto, la nueva evidencia técnica se produce en esta acta.

## 4 · Confirmación de V1-ERADICATION promocionada

La rama oficial contiene los cuatro commits del Hito 9.2.6 sobre `76712c05…`:

```
bea8d8924e42e145ec4ec1e82653eb77b3f547d9  refactor(v2): remove legacy V1 user and API surfaces
ad289a3365078cd39b08bba17406cdf6479d4825  refactor(v2): remove legacy signaling runtime and dependencies
f0eefa52af283c274497f4b96020f56bb9522eb1  chore(database): retire legacy V1 runtime schema
0eaa2bae697dc20464aabaa40bc14e24a1ff1d5c  test(v2): satisfy zero-warning lint gate
```

Promoción vía fast-forward al oficial (run [`32268502343`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32268502343), Jobs A/B/C verdes).

## 5 · Inventario de runtime final (cero V1 operativo)

| Superficie V1 | Estado |
|---|---|
| `app/chat`, `app/home`, `app/onboarding`, `app/call` | ABSENT (4/4) |
| `app/api/translate`, `app/api/tts`, `app/api/ice-servers`, `app/api/debug-trace` | ABSENT (4/4) |
| `lib/supabase.ts`, `server/signaling.ts`, `railway.json` | ABSENT (3/3) |
| Deps directas `socket.io`, `socket.io-client`, `@deepgram/sdk`, `framer-motion`, `lucide-react`, `ts-node`, `tsx` en `package.json` | GONE (7/7) |
| Deps transitivas `socket.io`, `socket.io-client`, `engine.io`, `engine.io-client`, `socket.io-adapter`, `socket.io-parser`, `@deepgram/sdk`, `framer-motion`, `lucide-react`, `ts-node`, `tsx` en `package-lock.json` | ABSENT (11/11) |
| Script npm `signaling` | AUSENTE |
| Ficheros `useCallSignaling|useDictation|useRingTone|useTranslatedSpeech|useVoiceTranscription|useWebRTC|VideoOverlay|VoiceCaptionsOverlay|spablaTrace` en `app|lib` | 0 archivos |
| Imports operativos `from 'socket.io|@deepgram|framer-motion|lucide-react|ts-node|tsx'` en `app|lib|engine` | 0 imports |

Inventario de dependencias directas del root actual:
- productivas (4): `@supabase/supabase-js ^2.106.2`, `next 16.3.1`, `react 19.2.4`, `react-dom 19.2.4`
- dev (9): `@tailwindcss/postcss ^4`, `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9`, `eslint-config-next 16.2.6`, `tailwindcss ^4`, `typescript ^5`, `vitest 4.1.10`

## 6 · Resultados estáticos

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` (raíz) | 0 | — |
| `npx tsc --noEmit` (engine) | 0 | — |
| `npx eslint --max-warnings 0 app/v2 app/api/v2 lib/v2` | 0 | 0 errores / 0 warnings |
| Escaneo secretos / project IDs productivos | — | 0 hits |
| Escaneo conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) en `app|lib|engine|scripts|docs|.github|supabase` | — | 0 hits |
| Artefactos versionados (`node_modules/` o `.env` en `git ls-files`) | — | 0 hits |

## 7 · Rondas dinámicas separadas

### Ronda 1

| Suite | Comando | Exit | Detalle | Duración (approx.) |
|---|---|---|---|---|
| tsc raíz | `npx tsc --noEmit` | 0 | — | 2 s |
| tsc engine | `npx tsc --noEmit` (cwd engine) | 0 | — | 0 s |
| ESLint V2 | `npx eslint --max-warnings 0 app/v2 app/api/v2 lib/v2` | 0 | 0/0 | 2 s |
| Engine | `vitest run` (cwd engine) | 0 | 1057 pass + 63 skip = 1120 | 1 s |
| Cliente | `npm run test:client` | 0 | 112 pass + 24 skip = 136 | 1 s |
| scripts/dev | `bash scripts/dev/tests/run-tests.sh` | 0 | 11/11 | 5 s |
| Supabase apply | `bash scripts/ci/apply-migrations.sh` (post `supabase start`) | 0 | Cadena de 7 migraciones aplicada desde vacío | 16 s |
| SQL integration | `bash scripts/ci/run-integration-tests.sh` | 0 | 4/4 suites (`v1_runtime_retirement_verification`, `rls_bootstrap`, `purge_ledger`, `message_translations`) | 1 s |
| HTTP-frontier — 1er intento | `vitest run … route.http.integration.test.ts` | **1** | Fallo transitorio: `tenant insert failed: Could not query the database for the schema cache. Retrying.` — PostgREST aún reload de schema cache tras `db reset`. Tests: 13 skipped por caída del `beforeAll`. | 1 s |
| HTTP-frontier — retry tras `sleep 10` | mismo comando | 0 | 13/13 | 4 s |

**Observación operativa Ronda 1**: el primer intento de HTTP-frontier tras el `apply-migrations` reciente falló por reload de schema cache de PostgREST (comportamiento estándar del stack local tras un `db reset`). Se resolvió esperando 10 s a que PostgREST reindexara. Ronda 2 incorpora esa espera profiláctica y pasa a la primera. En CI (Ubuntu, timing distinto) el comportamiento no se ha reproducido en el run oficial `32268502343`.

### Ronda 2

| Suite | Comando | Exit | Detalle | Duración (approx.) |
|---|---|---|---|---|
| tsc raíz | `npx tsc --noEmit` | 0 | — | 2 s |
| tsc engine | `npx tsc --noEmit` (cwd engine) | 0 | — | 1 s |
| ESLint V2 | `npx eslint --max-warnings 0 app/v2 app/api/v2 lib/v2` | 0 | 0/0 | 2 s |
| Engine | `vitest run` (cwd engine) | 0 | 1057 pass + 63 skip = 1120 | 1 s |
| Cliente | `npm run test:client` | 0 | 112 pass + 24 skip = 136 | 1 s |
| scripts/dev | `bash scripts/dev/tests/run-tests.sh` | 0 | 11/11 | 4 s |
| Supabase apply (limpio) | `bash scripts/ci/apply-migrations.sh` | 0 | Reset DB + 7 migraciones | 15 s |
| Wait PostgREST schema cache | `sleep 10` | — | Profiláctico | 10 s |
| SQL integration | `bash scripts/ci/run-integration-tests.sh` | 0 | 4/4 suites OK | 1 s |
| HTTP-frontier | `vitest run … route.http.integration.test.ts` | 0 | 13/13 en primera pasada | 3 s |

Ambas rondas convergen a **cero fallos** y a los mismos totales; se cumplen todos los mínimos exigidos por §8 (Engine 1120, Cliente 136, HTTP-frontier 13/13, scripts/dev 11/11, SQL 4/4, ESLint 0/0, tsc 0/0).

## 8 · Estado final de base de datos

Consultas directas por `psql` contra el stack local tras `supabase db reset --local` + cadena de 7 migraciones:

| Aserción | Esperado | Observado |
|---|---|---|
| `spabla_v2.*` tables | 6 | **6** ✓ |
| `spabla_v2.*` ENABLE + FORCE RLS | 6 | **6** ✓ |
| `spabla_v2.*` admin functions | 5 | **5** ✓ |
| V1 tables en `public` | 0 | **0** ✓ |
| V1 functions en `public` | 0 | **0** ✓ |
| V1 policies en `public` | 0 | **0** ✓ |
| Relaciones `public.*` en `supabase_realtime` | 0 | **0** ✓ |
| Publicación `supabase_realtime` (preservada vacía) | 1 | **1** ✓ |
| `auth.users` presente | 1 | **1** ✓ |
| `graphql_public` schema | 1 | **1** ✓ |
| `storage.buckets` | (n/a, `[storage].enabled=false`) | 0 (esperado por config) |

Migraciones históricas V1 conservadas en disco (`20260101000000_v1_baseline.sql`, `20260617000000_add_message_source.sql`, `20260617000100_reconcile_v1_voice_policy.sql`) — reproducen V1 durante el `db reset` y la migración forward-only `20260817000000_v1_runtime_retirement.sql` las retira del estado final.

## 9 · Restore drill

Ejecución canónica local con GNU sed antepuesto en el `PATH` (`/opt/homebrew/opt/gnu-sed/libexec/gnubin`) para compensar la incompatibilidad preexistente BSD-sed de macOS. **`scripts/ci/restore-drill.sh` no fue modificado.**

- Comando: `RUNNER_TEMP=/tmp bash scripts/ci/restore-drill.sh`
- Exit code: **0**
- Verdict: **PASS**

Reporte estructural del restore drill (target restaurado):

```
== Structural (target) ==
  spabla_v2 tables:     6 (expected 6)
  V1 public tables:     0 (expected 0)
  spabla_v2 policies:   8
  ENABLE+FORCE RLS:     6 of 6 spabla_v2 tables
  admin_* functions:    5 of 5
```

Reporte del restore drill del CI oficial `32268502343` Job C: **success**, duración 3 m 13 s, sobre el mismo SHA `0eaa2bae…`.

## 10 · Matriz HTTP real

Ejecutada contra `next start` local sobre el build limpio, sin navegador, sin producción (Supabase local up para env; puerto 3000 libre antes y después):

```
PATH                      | CODE | LOCATION
--------------------------------------------------------------------------------
/                         | 307  | /v2/chat
/v2/chat                  | 200  |
/home                     | 404  |
/chat                     | 404  |
/onboarding               | 404  |
/call/test                | 404  |
/api/translate            | 404  |
/api/tts                  | 404  |
/api/ice-servers          | 404  |
/api/debug-trace          | 404  |
```

Aserciones satisfechas: redirect `/` → `/v2/chat` con 307; `/v2/chat` accesible (200); 8/8 rutas V1 devuelven 404.

## 11 · Build y rutas

`npm run build` sobre árbol limpio (`rm -rf .next` previo): exit 0.

Matriz de rutas del build:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/v2/messages
├ ƒ /api/v2/seed
└ ○ /v2/chat
```

- 3 estáticas: `/`, `/_not-found`, `/v2/chat`.
- 2 dinámicas: `/api/v2/messages`, `/api/v2/seed`.
- 0 rutas V1.

## 12 · Bundle

Escaneo textual de `.next/**`:

| Fingerprint | Ficheros con match textual | Runtime real incorporado |
|---|---|---|
| `socket.io` | 0 | 0 |
| `@deepgram` | 0 | 0 |
| `framer-motion` | 0 | 0 |
| `lucide-react` | 2 (`required-server-files.json` y `.js`) | **0** — entrada `experimental.optimizePackageImports` del default de Next 16 (75 entradas en la allow-list, `lucide-react` es una de ellas); no importado por código propio |
| `/home`, `/onboarding`, `/api/translate`, `/api/tts`, `/api/ice-servers`, `/api/debug-trace` | 0 | 0 |
| `useCallSignaling`, `useDictation`, `useWebRTC` | 0 | 0 |

Grep de `require\(['"]lucide-react|from ['"]lucide-react` en `.next/**`: **0 matches**. Análogo para `socket.io`, `@deepgram`, `framer-motion`: **0 matches** cada uno.

## 13 · Auditoría de dependencias

| Métrica | Resultado |
|---|---|
| `npm audit --omit=dev` (root) | **0 vulnerabilidades** |
| `npm audit` root completo | 3 vulnerabilidades: `@babel/core` low, `brace-expansion` high, `js-yaml` high (dev-only) |
| `npm audit` engine | **0 vulnerabilidades** |
| Paquetes V1 en `package-lock.json` (`socket.io`, `socket.io-client`, `engine.io`, `engine.io-client`, `socket.io-adapter`, `socket.io-parser`, `@deepgram/sdk`, `framer-motion`, `lucide-react`, `ts-node`, `tsx`) | ABSENT (11/11) |
| Nuevos high / critical vs base `76712c05…` | 0 |

Los 3 advisories residuales son estrictamente devDependencies transitivas del tooling ESLint / Babel; no exponen runtime productivo. **No se ejecutó `npm audit fix`, `npm update`, `npm install`, `npm uninstall` ni `npm ci --omit=optional`** durante esta revalidación.

## 14 · CI oficial basal

- Run: [`32268502343`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32268502343)
- SHA evaluado: `0eaa2bae697dc20464aabaa40bc14e24a1ff1d5c`
- Trigger: `push` sobre `spabla-v2/thirteen-languages-activation`
- Status / Conclusion: `completed` / `success`
- `run_attempt`: 1 (`previous_attempt_url = null`)
- Job A — engine: success (29 s)
- Job B — Supabase integration: success (2 m 4 s)
- Job C — phase-8 restore drill: success (3 m 13 s)

## 15 · Plan 9.3 y AGENTS.md

- `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` — SHA-256 `954d058d5221b162a910a5d1ea1a2f8dc1792ffcf11c1f7e9a16daf341ae6ab5` — **untracked e intacto**, custodia temporal fuera del repositorio con permisos 700/600 (`/tmp/plan93-revalidation-custody.klOUtQ`).
- `AGENTS.md` — SHA-256 `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb` — intacto.

## 16 · Riesgos residuales

1. **Despliegues externos no inspeccionables desde el repositorio**: no puede afirmarse la ausencia de un despliegue V1 activo en Railway / Vercel / DNS; solo la ausencia de configuración versionada que lo describa. Ver §17.
2. **Incompatibilidad BSD-sed en `scripts/ci/restore-drill.sh`** (preexistente, no introducida en 9.2.5-F ni en 9.2.6). No bloqueante en CI Ubuntu. Requiere GNU sed local para reproducir el drill en macOS.
3. **PostgREST schema cache warmup tras `db reset`**: causa fallos transitorios en HTTP-frontier si se ejecuta inmediatamente después de aplicar la cadena de migraciones. Mitigado en Ronda 2 con `sleep 10` previo al fetch de `supabase status -o json`. En CI Job B no se ha manifestado (timing distinto).
4. **3 advisories dev-only** (`@babel/core` low, `brace-expansion` high, `js-yaml` high) — sin exposición runtime, transitivos de tooling; prohibida su corrección en el alcance de esta revalidación.
5. **Datos V1 en instalaciones productivas**: fuera del alcance; no se tocó nada productivo. La migración de retirada actúa sobre el estado final del stack local.

## 17 · Despliegues externos no inspeccionados

Los siguientes canales están fuera del alcance de esta revalidación por prohibición explícita de la orden:
- Railway (retirado del repositorio con la eliminación de `railway.json` en el commit `ad289a3…`; no se ha verificado si la app sigue desplegada externamente).
- Vercel / Netlify / Fly / Render (sin evidencia versionada; no verificados).
- DNS y CDN.
- Instancias productivas de Supabase (nunca contactadas).

**Conclusión limitada**: solo puede afirmarse que **no existe configuración de despliegue versionada** que describa un despliegue V1 activo.

## 18 · Producción no tocada

- Cero conexiones a Supabase productivo.
- Cero llamadas a APIs externas.
- Cero commits sobre `main`.
- Cero modificaciones a la rama histórica `spabla-v2/hito-9-2-5-f-integral-validation`.
- Cero llaves productivas leídas o expuestas.
- Cero despliegues.
- Cero tags creados.
- Cero ramas borradas.

## 19 · Reproducción independiente pendiente

Esta revalidación es la **primera y única ejecución técnica** de las barreras 9.2.5-F sobre el árbol post V1-ERADICATION. La orden §16.F de 9.2.5-F exige una segunda reproducción limpia por un actor independiente que no haya realizado esta revalidación. Dicha reproducción independiente **queda pendiente** y no puede sustituirse por una re-ejecución del mismo actor.

## 20 · Barreras de promoción

- **Técnicas**: todas las barreras validadas por esta revalidación están **verdes** (§7-§13).
- **Reproducción independiente**: **pendiente**.
- **Aprobación de Dirección**: **no aplicada** ni afirmada por este acta.
- **Cierre definitivo del Hito 9.2.5-F**: **no declarado** aquí.

---

## Veredicto

**HITO 9.2.5-F · REVALIDACIÓN POST V1-ERADICATION TÉCNICAMENTE CORRECTA · REPRODUCCIÓN INDEPENDIENTE PENDIENTE**
