# Hito 9.2.5-J · Reproducción técnica independiente post V1-ERADICATION

Fecha de ejecución: 2026-08-20 (Europe/Madrid)

Ejecutor: **OpenAI Codex CLI 0.148.0 · modelo gpt-5.6-sol**

Ámbito: reproducción técnica; sin promoción, merge ni apertura del Plan 9.3.

## 1. Identidad e independencia

Esta reproducción fue ejecutada por OpenAI Codex CLI, no por Claude ni por otro actor. Todas las cifras y conclusiones de este documento proceden de inspecciones del árbol verificado y ejecuciones realizadas durante este hito.

No se abrió, leyó, resumió ni utilizó como fuente `docs/audit_reports/AUDIT_2026-08-19_hito-9-2-5-integral-validation-post-v1.md`. Tampoco se consultaron actas anteriores para obtener resultados o formato.

El Plan 9.3 no se abrió ni se leyó. Solo se midieron sus metadatos, se calculó su SHA-256 y se realizó la copia de custodia exigida.

## 2. Base exacta y CI basal

- Rama oficial verificada: `spabla-v2/thirteen-languages-activation`.
- SHA local y remoto: `70a9fd7d284ce97eea4528aaefc8314726e22a2e` en ambos casos.
- `main` local y remoto: `e6128433d42e1e105529ed2f64212ca527034b6a`.
- Revalidación documental previa local/remota: `b80f192ec82f71bb6a44d8dcc215985b20bc4727`.
- Rama histórica 9.2.5-F local/remota: `2852be40ab489372acdbf4e28a9523c6b8a2130c`.
- `git fetch origin` se ejecutó sin `--prune`, exit 0.
- CI basal: run `32360896768`, `push`, attempt 1, SHA `70a9fd7d284ce97eea4528aaefc8314726e22a2e`, status `completed`, conclusion `success`.
- URL basal: `https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32360896768`.
- Job A — engine: `success`.
- Job B — Supabase integration: `success`.
- Job C — phase-8 restore drill: `success`; restore drill `PASS`.
- Job C resolvió `psql` y `pg_dump` a `/usr/lib/postgresql/17/bin/`; ambos informaron PostgreSQL 17.11.

## 3. Precondiciones

- Raíz Git: `/Users/davidlencina/spabla` (el shell macOS mostró la misma ruta con distinta capitalización).
- Rama inicial: `spabla-v2/thirteen-languages-activation`; HEAD inicial exacto: `70a9fd7d284ce97eea4528aaefc8314726e22a2e`.
- `AGENTS.md` leído íntegramente; SHA-256: `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb`.
- No había merge, rebase, cherry-pick, revert, bisect ni sequencer en curso.
- Estado local inicial, únicamente: `?? .claude/` y `?? docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md`.
- Inventario sin contenido: `.claude/` era un directorio no versionado; el Plan medía 27,149 bytes y no estaba versionado.
- Puertos 3000, 54321 y 54322 libres.
- No había procesos Next ni contenedores Supabase/Docker en ejecución. Docker Desktop estaba disponible como daemon local, con cero contenedores, para poder ejecutar las fases autorizadas.
- Toolchain: Node 24.14.0, npm/npx 11.9.0, Supabase CLI local 2.113.0 y Docker client/server 29.7.2.
- La CLI Supabase local difiere del pin CI 2.110.0; el preflight canónico `--report` lo clasificó como warning tolerado.

## 4. Custodia del Plan 9.3

- Directorio temporal: `/tmp/spabla-hito-9-2-5-j.WQFg29`, creado con `mktemp -d`, modo 700.
- Copia: mismo nombre de fichero, modo 600, tamaño 27,149 bytes.
- SHA-256 original: `954d058d5221b162a910a5d1ea1a2f8dc1792ffcf11c1f7e9a16daf341ae6ab5`.
- SHA-256 copia: `954d058d5221b162a910a5d1ea1a2f8dc1792ffcf11c1f7e9a16daf341ae6ab5`.
- Coinciden entre sí y con la referencia esperada. El original no fue modificado ni versionado.

## 5. Rama utilizada

- Rama creada: `spabla-v2/hito-9-2-5-j-independent-reproduction`.
- Se verificó antes que no existía local ni remotamente.
- Base exacta: `70a9fd7d284ce97eea4528aaefc8314726e22a2e`.
- No se ejecutó merge, rebase, cherry-pick, amend ni promoción.

## 6. Inventario cero V1

Ausencias verificadas en filesystem y `git ls-files`:

- `app/chat`, `app/home`, `app/onboarding`, `app/call`.
- `app/api/translate`, `app/api/tts`, `app/api/ice-servers`, `app/api/debug-trace`.
- `lib/supabase.ts`, `server/signaling.ts`, `railway.json`.

Dependencias y scripts:

- `socket.io`, `socket.io-client`, `@deepgram/sdk`, `framer-motion`, `lucide-react`, `ts-node` y `tsx`: cero dependencias directas y cero entradas instalables `node_modules/<paquete>` en los manifests/locks raíz y engine.
- `tsx` aparece dos veces en cada lock únicamente como clave de peer opcional de tooling; no existe entrada `node_modules/tsx` y `npm ls` no encontró ninguno de los paquetes V1 consultados.
- Script npm `signaling`: ausente.
- Imports/requires operativos de esos paquetes: cero.
- Ficheros o símbolos exactos de hooks/overlays V1: cero.
- `node_modules` versionado: 0 entradas; `.env` versionado: 0 entradas.
- Conflict markers: 0.
- Patrones de JWT y tokens GitHub productivos: 0. Los patrones sintéticos de URL Supabase/OpenAI encontrados están confinados a tests de detección/sanitización y no son credenciales productivas.

Las migraciones `20260101000000_v1_baseline.sql` y `20260617000100_reconcile_v1_voice_policy.sql` se conservan como historia reproducible. La migración final `20260817000000_v1_runtime_retirement.sql` elimina la superficie V1 del estado final. Esta conservación histórica no se clasifica como runtime V1 activo.

## 7. Validación estática independiente

| Comando | Exit | Duración | Resultado |
|---|---:|---:|---|
| `npx tsc --noEmit` | 0 | 2 s | PASS |
| `(cd engine && npx tsc --noEmit)` | 0 | 1 s | PASS |
| `npx eslint --max-warnings 0 app/v2 app/api/v2 lib/v2` | 0 | 2 s | PASS, 0 warnings |

## 8. Ronda dinámica 1

| Barrera | Exit | Duración | Medición |
|---|---:|---:|---|
| TypeScript raíz | 0 | 1 s | PASS |
| TypeScript engine | 0 | 1 s | PASS |
| ESLint V2 | 0 | 2 s | PASS |
| Suite engine completa | 0 | 1 s | 1,057 passed; 63 skipped; 0 failed; 37 test files passed y 4 skipped |
| Suite cliente completa | 0 | 1 s | 112 passed; 24 skipped; 0 failed; 7 test files passed y 2 skipped |
| Suite `scripts/dev` | 0 | 6 s | 11 passed; 0 failed |
| Migraciones limpias canónicas | 0 | 16 s | 7 migraciones reaplicadas desde reset |
| Estabilización PostgREST corregida | 0 | 5 s | HTTP 200 + espera acotada de 5 s |
| Integración SQL | 0 | <1 s | 4 suites OK; 0 failed |
| HTTP-frontier real | 0 | 4 s | 13 passed; 0 skipped; 0 failed |

Los 63 skips de engine corresponden a cuatro ficheros de integración Supabase condicionados por variables de entorno. Los 24 skips cliente corresponden a 13 HTTP-frontier y 11 handler-integration condicionados. La frontera HTTP real se ejecutó después de migraciones con sus variables locales y obtuvo 13/13; los skips no se ocultaron ni se contaron como pass.

Suites SQL: `v1_runtime_retirement_verification`, `rls_bootstrap`, `purge_ledger` y `message_translations`, todas `OK`.

## 9. Ronda dinámica 2

| Barrera | Exit | Duración | Medición |
|---|---:|---:|---|
| TypeScript raíz | 0 | 1 s | PASS |
| TypeScript engine | 0 | 1 s | PASS |
| ESLint V2 | 0 | 2 s | PASS |
| Suite engine completa | 0 | 2 s | 1,057 passed; 63 skipped; 0 failed; 37 test files passed y 4 skipped |
| Suite cliente completa | 0 | <1 s | 112 passed; 24 skipped; 0 failed; 7 test files passed y 2 skipped |
| Suite `scripts/dev` | 0 | 6 s | 11 passed; 0 failed |
| Migraciones limpias canónicas | 0 | 18 s | 7 migraciones reaplicadas desde reset |
| Estabilización PostgREST | 0 | 5 s | HTTP 200 al primer sondeo + espera acotada de 5 s |
| Integración SQL | 0 | <1 s | 4 suites OK; 0 failed |
| HTTP-frontier real | 0 | 3 s | 13 passed; 0 skipped; 0 failed |

La ronda 2 no reutilizó resultados de la ronda 1.

## 10. Base de datos V2

Tras un reset limpio adicional (exit 0, 17 s), medición directa con `psql` 17.11 contra PostgreSQL server 17.6:

- Tablas `spabla_v2`: 6 — `conversations`, `message_translations`, `messages`, `tenant_memberships`, `tenants`, `usage_ledger`.
- ENABLE RLS: 6/6; FORCE RLS: 6/6.
- Políticas V2: 8.
- Funciones administrativas esperadas: 5/5, todas `SECURITY DEFINER` y propiedad de `postgres`.
- Tablas V1 en `public`: 0/6.
- Funciones V1 en `public`: 0/2.
- Políticas V1 en `public`: 0/15.
- Publicación `supabase_realtime`: presente (1) y vacía (0 relaciones totales; por tanto 0 `public.*`).
- `auth.users`: presente.
- `graphql_public`: presente.
- Schema administrado `storage`: presente por bootstrap Supabase; `[storage] enabled = false` en config y 0 contenedores Storage del proyecto en ejecución. Comportamiento conforme a configuración.

## 11. Restore drill PostgreSQL 17

- Script: `scripts/ci/restore-drill.sh`, sin modificación.
- Ajuste macOS permitido: PATH antepuesto con GNU sed 4.10 ya instalado.
- `psql`: `/opt/homebrew/opt/postgresql@17/bin/psql`, PostgreSQL 17.11 Homebrew.
- `pg_dump`: `/opt/homebrew/opt/postgresql@17/bin/pg_dump`, PostgreSQL 17.11 Homebrew.
- Target independiente: `restored_target`.
- Exit 0; duración 2 s; veredicto del script: `PASS`.
- Target restaurado, verificación directa: 6 tablas V2, 6/6 ENABLE+FORCE RLS, 8 políticas V2, 5/5 funciones admin, 0 tablas V1 y 0 funciones V1.

## 12. Matriz HTTP real de producción

Supabase local disponible (REST HTTP 200), `.next` eliminado, build limpio exit 0 y Next 16.3.1 arrancado con `next start` en 127.0.0.1:3000.

| Ruta | Status | Location |
|---|---:|---|
| `/` | 307 | `http://127.0.0.1:3000/v2/chat` |
| `/v2/chat` | 200 | — |
| `/home` | 404 | — |
| `/chat` | 404 | — |
| `/onboarding` | 404 | — |
| `/call/test` | 404 | — |
| `/api/translate` | 404 | — |
| `/api/tts` | 404 | — |
| `/api/ice-servers` | 404 | — |
| `/api/debug-trace` | 404 | — |

Next fue detenido; el puerto 3000 quedó libre.

## 13. Build y bundle

Se realizaron dos builds limpios: uno para la matriz (exit 0, 6 s) y el definitivo para bundle (exit 0, 5 s), eliminando únicamente `.next` antes de cada uno.

Rutas generadas:

- Estáticas: `/`, `/_not-found`, `/v2/chat`.
- Dinámicas: `/api/v2/messages`, `/api/v2/seed`.
- Internas adicionales de manifiesto: error global y favicon.

Clasificación del escaneo:

- `socket.io`, `@deepgram` y `framer-motion`: 0 coincidencias.
- `lucide-react`: coincidencias solo en metadatos/caché de configuración Next (`experimental.optimizePackageImports`); no está instalado, no aparece en rutas/artifacts de aplicación y no es un import ejecutable.
- Rutas `app/chat`, `app/home`, `app/onboarding`, `app/call` y APIs V1: 0 coincidencias de artifact path.
- `/home`: el match inicial era parte de la ruta local `/opt/homebrew` en caché de Turbopack, no una ruta HTTP.
- `/chat`: matches atribuibles a `/v2/chat`, al endpoint externo legítimo `/v1/chat/completions` y a comentarios/metadatos; el manifiesto no contiene `/chat` V1.
- `/call`: matches de imports de tipos/state machine del engine, no una ruta HTTP.
- Hooks/overlays V1 exactos: 0. Los matches iniciales `useCall` eran prefijos de `useCallback`; la búsqueda con límites de palabra dio cero.
- Conclusión: no se detectó runtime ejecutable V1 en el build.

## 14. Dependencias y auditoría

| Ámbito | Exit | Duración | Resultado |
|---|---:|---:|---|
| Raíz, `npm audit --omit=dev` | 0 | 1 s | 0 vulnerabilidades productivas |
| Raíz, `npm audit` | 1 | 1 s | 3 dev: 1 low, 2 high, 0 critical |
| Engine, `npm audit` | 0 | <1 s | 0 vulnerabilidades |

Las vulnerabilidades dev afectan a `@babel/core`, `brace-expansion` y `js-yaml`. No se ejecutó `npm audit fix`, `npm update` ni cambio de dependencias. Los locks permanecieron idénticos a la base oficial; por ello esta reproducción introdujo 0 high/critical nuevos y 0 vulnerabilidades productivas nuevas.

## 15. Incidencias y reintentos

1. El primer `git fetch origin` dentro del sandbox no pudo escribir `.git/FETCH_HEAD`; se repitió el mismo comando con autorización, exit 0.
2. El primer filtro de log del Job C coincidió con el nombre del job presente en cada línea y resultó demasiado amplio; se repitió con extracción de campos antes del filtro. Las versiones efectivas quedaron medidas sin usar conclusiones previas.
3. La primera pasada del inventario usó `path` como variable en zsh, alterando el PATH; la pasada parcial se invalidó y se repitió completa con otra variable.
4. El host carecía de cliente PostgreSQL 17. Se instaló `postgresql@17` 17.11 por Homebrew; no se modificó el repositorio ni sus dependencias.
5. En ronda 1, el primer predicado de espera exigió HTTP 200 y `.State.Health=healthy`; PostgREST devolvió 200 en 15 sondeos pero el contenedor no define healthcheck. El comando de espera terminó 1 sin ejecutar SQL. Se corrigió el predicado a HTTP 200 directo + 5 s y pasó. No hubo fallo de schema cache ni reintento de una suite.
6. La primera matriz curl se ejecutó en el namespace de loopback del sandbox y devolvió `000`; no fueron respuestas HTTP. Se repitió contra el mismo Next vivo en el contexto local autorizado y produjo la matriz válida anterior.
7. No hubo retry de tests, migraciones, SQL, restore drill, builds, audits ni CI basal.

## 16. Riesgos residuales

- Tres vulnerabilidades exclusivamente dev en el audit raíz: 1 low y 2 high; ninguna productiva ni critical.
- Drift local Supabase CLI 2.113.0 frente a pin CI 2.110.0. El CI basal sí usa 2.110.0 y quedó verde.
- El cache binario de Turbopack contiene metadatos y entorno de build; sus coincidencias textuales requieren clasificación y no deben equipararse a imports o rutas ejecutables.
- El CI de la nueva rama solo puede conocerse después del commit/push; se registrará en el reporte final sin crear un segundo commit.

## 17. Working tree final

Antes de crear este acta y con Next/Supabase detenidos, el único estado no versionado era:

- `?? .claude/`
- `?? docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md`

Tras el commit documental, esos dos elementos deben continuar intactos y no versionados. Ningún código, workflow, dependencia, Plan 9.3 ni contenido de `.claude/` fue modificado.

## 18. SHA-256 del acta

SHA-256 canónico (calculado sobre este documento excluyendo únicamente la línea que contiene el propio valor): `76006d6f05066becfd699ad8b0187d5fc13d38f8e87058939923ffb97ff6d596`.

El SHA-256 byte-a-byte del fichero final no puede incluirse dentro del mismo fichero sin cambiar el hash por autorreferencia. Se calculará después de fijar el contenido y se registrará externamente en el reporte final.

## 19. Veredicto independiente

**REPRODUCCIÓN INDEPENDIENTE VERDE CON RIESGOS RESIDUALES**

El árbol oficial reproducido mantiene cero superficie operativa V1, supera estática, dos rondas dinámicas, estructura/seguridad DB V2, restore PostgreSQL 17, frontera HTTP y builds limpios, y no introduce vulnerabilidades productivas nuevas. Este veredicto no promueve ni cierra ramas o planes.
