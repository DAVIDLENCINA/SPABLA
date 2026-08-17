# HITO 9.2.5 · VALIDACIÓN INTEGRAL Y ACTA DE CIERRE

**Estado**: **VALIDACIÓN TÉCNICA COMPLETADA · PENDIENTE DE APROBACIÓN DE DIRECCIÓN**.
**Fecha de validación**: 2026-08-17.
**Rama de cierre**: `spabla-v2/hito-9-2-5-f-integral-validation`.
**Base (rama oficial `spabla-v2/thirteen-languages-activation`)**: `76712c0544435aa21c0aa5e5cd5d42b6a0aba68e`.
**Base previa al hito 9.2.5**: `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d`.
**`main` local + remoto (intacta)**: `e6128433d42e1e105529ed2f64212ca527034b6a`.

> **Alcance**: acta técnica de cierre del Hito 9.2.5 (§16.F del Plan `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_5_PLAN.md` V1.1 aprobado y congelado). Documenta la validación integral local de los subhitos ya promocionados A + B + C + D + E, el restore drill, la auditoría final de dependencias, la barrera forense del rango completo y las deudas explícitamente aplazadas.
>
> **Este documento NO declara el hito cerrado ni aprobado**. La aprobación por Dirección y la promoción posterior de este acta a la rama oficial se emiten por órdenes operativas separadas.

---

## §1. Identidad y alcance

Cierre del **Hito 9.2.5 · CORE RELIABILITY & REPRODUCIBILITY GATE** conforme al plan documental `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_5_PLAN.md` (rama documental `spabla-v2/plan-hito-9-2-5-core-reliability`, versión **V1.1 · APROBADO Y CONGELADO POR DIRECCIÓN**, fecha 2026-08-17).

Norma aplicada literalmente: **§16.F** — Validación integral + restore drill + acta breve firmada por Dirección (patrón 9.2.4).

Subhitos incluidos, en orden cronológico de promoción a la rama oficial (todos por fast-forward, sin merge commits):

| # | Subhito | Commit | Título |
|---|---|---|---|
| 1 | 9.2.5-A · Toolchain reproducible | `d150b46` | `chore(dev): add reproducible SPABLA local toolchain` |
| 2 | 9.2.5-A · Frontier isolation | `323cbd4` | `test(v2): verify isolated local startup and HTTP frontier` |
| 3 | 9.2.5-B · Next security upgrade | `684c8c8` | `fix(deps): upgrade Next.js to 16.3.1` |
| 4 | 9.2.5-B · AGENTS canonization | `d14fb21` | `chore(dev): accept Next.js managed agent rules` |
| 5 | 9.2.5-C · Seed POST-only + logs saneados | `b625480` | `fix(v2): make development seed POST-only and diagnosable` |
| 6 | 9.2.5-C · Gate lockdown | `4326921` | `test(v2): lock down both development seed gates` |
| 7 | 9.2.5-D · Authn/authz split (engine) | `e517cee` | `fix(engine): distinguish authentication from hidden resources` |
| 8 | 9.2.5-D · Correlation + envelope | `962e6a4` | `fix(v2): unify authorization errors and correlation` |
| 9 | 9.2.5-D · Non-enumeration | `0e919ae` | `test(v2): lock down authorization non-enumeration` |
| 10 | 9.2.5-D · Scope 42501 to writes | `8cf9cc8` | `fix(engine): scope RLS invisibility to message writes` |
| 11 | 9.2.5-E · Vitest security upgrade | `76712c0` | `test(deps): upgrade Vitest to remove vulnerable test UI` |

Rango completo `14e2cbd..76712c0` → **11 commits**, historial estrictamente lineal, **cero merge commits**.

---

## §2. Toolchain exacto

| Componente | Versión efectiva |
|---|---|
| Node.js | `v24.14.0` |
| npm | `11.9.0` |
| Supabase CLI (local) | `2.113.0` (canonical CI-pin `2.110.0`; drift tolerada por `check-toolchain.sh --report`) |
| PostgreSQL (contenedor local) | 17 (`supabase/config.toml` `major_version = 17`) |
| Docker | reachable ✓ |
| Utilidades | `jq`, `python3`, `curl`, `lsof`, `awk`, `grep`, `sed` presentes ✓ |
| `next` (declarada + efectiva) | `16.3.1` (exacto) |
| `vitest` (root devDep + efectiva) | `4.1.10` (exacto) |
| `vitest` (engine devDep + efectiva) | `4.1.10` (exacto) |
| `@vitest/coverage-v8` (engine devDep + efectiva) | `4.1.10` (exacto) |
| `react`, `react-dom` | `19.2.4` (sin cambio en 9.2.5) |

Ficheros normativos SHA-256 al inicio de la validación:

| Fichero | SHA-256 |
|---|---|
| `package.json` | `a8d1efaec410eafa9b1732dfd77bd84b148fa61423c815fcc9624335fbe22c84` |
| `package-lock.json` | `9b0c83b205d7862a65e0072a74444b8d10d1b2665dc38c48e8104f71c572ca0d` |
| `engine/package.json` | `164fcc532618a764450a8502f38a841fea53d7af4f263433d812fa9ff27e587a` |
| `engine/package-lock.json` | `870dfc1a5086bec8e607a5e8abd25106c957f2e880a38744fe6008eff4896747` |
| `AGENTS.md` | `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb` |
| `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` (untracked) | `954d058d5221b162a910a5d1ea1a2f8dc1792ffcf11c1f7e9a16daf341ae6ab5` |

`npm ci` en ambos workspaces no mutó ninguno de los seis ficheros (SHA-256 post-install idénticos a pre).

---

## §3. Instalación reproducible (`npm ci`)

- Root: `npm ci` 5.8 s, sin `invalid`, sin `unmet peer`. Extraneous en el árbol local: 6 paquetes (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`), residuo de la wasm variant de sharp; no forman parte del lockfile, no se versionan y no afectan a la ejecución productiva ni a los tests.
- Engine: `npm ci` 0.83 s, 76 paquetes; `found 0 vulnerabilities`, sin extraneous, sin invalid, sin unmet.

`npm ls vitest vite @vitest/coverage-v8 --all` post-install:

- Root: `vitest@4.1.10 → @vitest/mocker@4.1.10 + vite@8.2.1 (dedup)`.
- Engine: `vitest@4.1.10 + @vitest/coverage-v8@4.1.10 (peer exact) → @vitest/mocker@4.1.10 + vite@8.2.1`.

`vite-node@2.1.9` desaparece del árbol (integrado en Vitest 4.x).

---

## §4. Validación estática

| Comprobación | Resultado |
|---|---|
| `git diff --check` | exit 0 |
| `npx tsc --noEmit` (root) | exit 0 |
| `npm run typecheck` (engine) | exit 0 |
| `npx eslint app/v2 lib/v2` | **0 errores, 0 warnings** |
| `bash -n` sobre 20+ scripts `.sh` versionados | OK todos |
| `shellcheck` | **no disponible** (no instalado por política del toolchain 9.2.5-A; registrado como limitación) |
| `test.only` / `describe.only` / `test.skip` / `describe.skip` / `eslint-disable` / `@ts-ignore` / `@ts-nocheck` / conflict markers añadidos en el working tree | **0 coincidencias** |
| Working tree (excluido Plan 9.3 untracked) | limpio |

---

## §5. Validación dinámica · Ronda 1

| Suite | Resultado exacto |
|---|---|
| `scripts/dev/tests/run-tests.sh` | **11/11 pass** |
| Engine full (`npx vitest run` en `engine/` con Supabase local + env vars locales) | **1120 passed / 0 failed / 0 skipped** en 41 test files. Duración ≈ 3.1 s. |
| `npm run test:client` con Supabase local | **132 passed / 0 failed / 0 skipped** en 8 test files. Duración ≈ 5.2 s. |
| HTTP-frontier real (`app/api/v2/messages/route.http.integration.test.ts` dentro de test:client) | **13/13 pass** — spawn real de Next dev en `127.0.0.1:3109`, fetch por socket. Incluye los 3 casos de POST invisibility parity, los 3 casos de seed gate OFF sobre socket, el caso de correlation UUID v4 + unicidad + no-reflection. |
| `next build` con env locales (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` bindeadas a `http://127.0.0.1:54321`; `OPENAI_API_KEY=""`; `NEXT_TELEMETRY_DISABLED=1`) | **OK** — 12 rutas estáticas + 8 dinámicas. `AGENTS.md` byte-idéntico antes y después del build (SHA-256 `63f2c50380ed…` invariante; `next build` no invoca al generador de `AGENTS.md`, sólo `next dev` lo hace, y no arrancó dev durante la validación). |

---

## §6. Validación dinámica · Ronda 2 (repetición)

Ejecutada inmediatamente después de la primera ronda, sin reinicio del stack local:

| Suite | Resultado |
|---|---|
| Engine full | **1120 passed / 0 failed / 0 skipped** (estable) |
| `npm run test:client` | **132 passed / 0 failed / 0 skipped** (estable) |
| HTTP frontier explícito (`vitest run … route.http.integration.test.ts`) | **13/13 pass** (estable) |

Sin flakiness observada. Diferencias de duración < 30 %.

---

## §7. Restore drill

- **Local**: `scripts/ci/restore-drill.sh` requiere `psql`. `psql` **no está instalado** en el toolchain local por política del hito 9.2.5-A (documentada en `docs/standards/SPABLA_V2_TOOLCHAIN.md`), y el hito 9.2.5-F **no autoriza instalarlo**. Por tanto el restore drill **NO ha sido ejecutado localmente** en esta validación. Registrada expresamente como limitación local reproducible.
- **CI**: el `Job C · phase-8 restore drill` se ejecuta obligatoriamente sobre cada push a rama y ha finalizado `success` en los CI de todos los subhitos promocionados A/B/C/D/E. El CI de esta candidata `9.2.5-F` (ver §16) validará el mismo Job C sobre el HEAD documental.

Esta separación entre "local no ejecutado" y "CI ejecutado" es explícita: el restore drill queda verificado por CI, no por auditoría local. Dirección debe considerar esta limitación al firmar el acta.

---

## §8. Auditoría final de dependencias (`npm audit --json`, read-only)

Ejecutada al final de la validación, con salida almacenada fuera del repositorio en directorio temporal con permisos `600`.

### Root (`package-lock.json`)

| Severidad | Cuenta |
|---|---|
| critical | **0** |
| high | 7 |
| moderate | **0** |
| low | 2 |
| **total** | **9** |

- **GHSA-5xrq-8626-4rwp** (Vitest UI, CVSS 9.8): **ausente**.
- **GHSA-6gpp-xcg3-4w24** (Next.js middleware/proxy bypass): **ausente**.

### Engine (`engine/package-lock.json`)

| Severidad | Cuenta |
|---|---|
| critical | **0** |
| high | **0** |
| moderate | **0** |
| low | **0** |
| **total** | **0** |

- **GHSA-5xrq-8626-4rwp**: **ausente**.

Los archivos `npm audit` completos se conservan en directorios `/var/folders/**/spabla-9_2_5-f-audit-{root,engine}-XXXXXX.json` (perms `600`, SHA-256 registrados en el journal operativo del hito).

### Advisories residuales clasificados

**No afectan al runtime V2 demostrado en este hito, pero continúan siendo vulnerabilidades reales en V1 o tooling y requieren tratamiento separado.**

| Grupo | Advisories | Alcance | Deuda |
|---|---|---|---|
| **V1 legacy runtime** (chat/call/signaling) | `ws` (GHSA-96hv-2xvq-fx4p, high), `socket.io-parser` (GHSA-2m8v-j782-fhvr, high), `engine.io`, `engine.io-client`, `socket.io-adapter` (high, via ws) | Cargados por `server/signaling.ts` (proceso independiente) y por el bundle client de `app/chat/*` (V1). **NO** cargados por V2 (`app/v2/**`, `lib/v2/**`, `engine/**`, `/api/v2/*`) — verificado por `rg`. | Deuda **D-LEGACY1**; hito de deprecación V1 separado. |
| **Dev-tooling ESLint** | `brace-expansion` (GHSA-3jxr-9vmj-r5cp / -mh99-v99m-4gvg / -rgw5-rvv9-x895, high), `js-yaml` (GHSA-52cp-r559-cp3m / -5p4m-2wfm-xmqj, high), `@babel/core` (GHSA-4x5r-pxfx-6jf8, low) | Transitivas de `eslint-config-next` y `eslint`. Activas sólo durante `npm run lint`. | Deuda **D-ESLINT**; requiere bump `eslint-config-next 16.2.6 → 16.3.1` en hito separado. |
| **Dev-tooling tsx / esbuild** | `esbuild@0.28.0` (GHSA-g7r4-m6w7-qqqr, low, Windows dev-server only) | Vía `tsx@4.22.3` (script `signaling`); también deduped por `vite@8.2.1` post-9.2.5-E. Presente antes del hito. | Deuda **D-ESLINT-adjacent**; requiere bump de `tsx`. |

**Ningún advisory nuevo `high` o `critical` fue introducido por Vitest 4.1.10.** El único low nuevo (`esbuild@0.28.0` vía vite dedup) ya estaba presente vía `tsx` antes del hito.

---

## §9. Matriz semántica de los subhitos A–E

| Subhito | Invariante | Evidencia | Estado |
|---|---|---|---|
| **A** · Toolchain reproducible | Scripts `scripts/dev/*.sh` + `docs/standards/SPABLA_V2_TOOLCHAIN.md`; `.gitignore` cubre `supabase/supabase/` (nested artifact); arranque/parada preservando volumen | 18 ficheros en `scripts/dev/`; check-toolchain report `[ok] no nested supabase/supabase/ artifact`; start-local verifica containers, PGRST schemas, endpoints; stop-local preserva volumen `supabase_db_spabla-hito-8-2-local`; 11/11 tests de scripts | **OK** |
| **B** · Next 16.3.1 | `next` declarado y efectivo en `16.3.1` exacto; AGENTS.md canonizado; GHSA-6gpp-xcg3-4w24 ausente | `package.json.dependencies.next = "16.3.1"`; `npm ls next` → `16.3.1`; `AGENTS.md` contiene bloque `BEGIN:nextjs-agent-rules` canonizado; audit root `next present in vulnerabilities: False` | **OK** |
| **C** · Seed POST-only + logs | `/api/v2/seed` doble-gated; GET/HEAD → 404/405 sin invocar seed; POST único mutante; correlation ID; log sanitizado | `route.ts` implementa 405 `Allow: POST` para GET/HEAD (gate ON) y 404 para todos (gate OFF); test file `route.test.ts` 18/18 pass (incluye 3 escenarios `describe.each` para gate MIXED); `X-SPABLA-Correlation-Id` en 200/500 POST; log JSON sanitizado por whitelist | **OK** |
| **D** · Semántica autz | HTTP 401 sólo authn; 404 para invisibilidad/RLS en `saveMessage`; 403 defensivo `membership_denied`; correlation en toda respuesta; no-enumeración probada; `PersistenceErrorCode` sigue `@internal` (sin cambios de superficie pública); cero migraciones/RLS | `route.ts` mapa `identity_invalid|unauthorized → 401`, `not_found → 404`, `membership_denied → 403`, `constraint_violation → 400`; `saveMessage` intercepta `42501 → not_found` + `23503 → not_found`; mapper genérico `42501 → membership_denied`; `errors.ts` `@internal` + no re-exportado; 3 tests HTTP-frontier de no-enumeración incluidos en 13/13 pass; `git diff supabase/` en el rango = vacío | **OK** |
| **E** · Vitest 4.1.10 | Vitest root + engine 4.1.10 exacto; coverage-v8 engine 4.1.10; CVE crítico ausente; compat oxc acotada al fichero autorizado (`engine/src/core-api/SpablaCore.test.ts`); cero reducción de pruebas | `package.json` (root/engine) `vitest = "4.1.10"`; engine `@vitest/coverage-v8 = "4.1.10"`; audit root/engine sin GHSA-5xrq-8626-4rwp; único ajuste de test movió 3 usos de `implements import(…).X` a imports superiores (documentado en el commit `76712c0`); engine 1120/1120 y client 132/132 preservados | **OK** |

Todos los invariantes de A–E: **verificables y OK** en la HEAD `76712c05…`.

---

## §10. Barrera forense global (rango `14e2cbd..76712c05`)

| Comprobación | Resultado |
|---|---|
| Historial lineal | ✓ (cero merge commits) |
| Cantidad de commits en el rango | 11 (coinciden con la tabla §1) |
| Cada commit pertenece a un subhito claro | ✓ |
| Commits contaminados rechazados (`f9eb314`, `fd7617c`, `6e70931`) como ancestros del HEAD oficial | **exit non-zero en los tres** — no ancestros ✓ |
| Rama contaminada `spabla-v2/hito-9-2-5-a-reproducible-toolchain` local + remota | **eliminada** ✓ (rev-parse retorna `(none)` en ambos) |
| Ramas candidatas conservadas de B/C/D/E | ✓ (`hito-9-2-5-a-toolchain-clean`, `-b-next-security-upgrade`, `-c-safe-seed-http`, `-d-authorization-semantics`, `-e-vitest-security-upgrade`) |
| Secretos (`BEGIN … PRIVATE KEY`, `sk-…{20,}`, `xoxb-…`, `SUPABASE_*_KEY=…`) en el diff | **0 coincidencias** |
| Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) | **0** |
| Binarios / dumps / logs versionados / `node_modules` | **0** |
| Plan 9.3 en el historial | **0 apariciones** (nunca commiteado) |
| Cambios en `main` | **0** |
| Tags no autorizados apuntando al HEAD | **0** |
| Coincidencias del pattern productivo `wztkxtgmuaegonlkukeh` | **4 apariciones** — **todas legítimas y defensivas**: 1 en `scripts/dev/lib/common.sh` como constante `SPABLA_PRODUCTIVE_PROJECT_ID` (guard usada por `check-toolchain.sh` para abortar si aparece en env locales) + 3 en `scripts/dev/tests/03_check_toolchain_productive_env.test.sh` (fixtures del test que verifica que el string **no** se ecoa al output cuando aparece en env). Ninguna es fuga; son barreras contra el project id productivo. |

---

## §11. Exclusiones aceptadas explícitamente

Las siguientes deudas quedan **fuera del alcance del Hito 9.2.5** conforme al Plan V1.1 y a las órdenes operativas emitidas por Dirección durante A–E:

1. **Deuda V1 SEC-DEPS** (`ws`, `socket.io-*`, `engine.io-*`, `@deepgram/sdk` chain): §7 ter del Plan; hito de deprecación V1 separado.
2. **Deuda ESLint-tooling** (`brace-expansion`, `js-yaml`, `@babel/core`, `esbuild@0.28.0` vía tsx): no cubierto por el Plan 9.2.5; requiere autorización de Dirección para un subhito separado (bump `eslint-config-next 16.2.6 → 16.3.1` y/o `tsx`).
3. **Rate limiting** en `/api/v2/messages`: deuda funcional; hito separado.
4. **Timing side-channels**: sin cobertura; hito de auditoría de seguridad separado.
5. **Mapping SQLSTATE 42501 en `translation-store`**: mantiene su propia unión `TranslationStoreError.unauthorized`; hito de refactor V2 futuro si conviene unificar.
6. **AUTH-PERSISTENT-SESSION / Plan 9.3**: hermano separado (`docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` sigue en V1.1 propuesto, sin commit; SHA-256 `954d058d…` intacto).
7. **Cambios en RLS o migraciones**: prohibidos por §2 del Plan.
8. **`AGENTS.md` regeneración automática por `next dev`**: aceptada tras canonización en 9.2.5-B; queda como comportamiento documentado.

---

## §12. Riesgos residuales

1. **Restore drill local no ejecutado** (§7): la validación depende del Job C del CI. Bajo — el Job C es determinista y ha sido verde en todos los subhitos previos.
2. **Dependencia V1 sigue vulnerable** (§11.1): sin exposición demostrable en V2, pero real en el bundle V1 y en `server/signaling.ts`. Requiere hito de deprecación.
3. **6 extraneous packages** en `node_modules` local (residuo wasm sharp): no versionados, no afectan tests ni CI. Se resuelven con `npm install` limpio (no autorizado por 9.2.5-F, dejado para próxima ventana operativa).
4. **CI 2.113.0 local vs 2.110.0 canonical** (Supabase CLI): drift tolerada por `check-toolchain.sh --report`. Sin impacto en la validación local (todos los tests pasan).
5. **Segunda reproducción limpia por tercero** (requisito §16.F y §13.16 del Plan): **NO cubierta** por esta orden operativa. Debe realizarse por miembro distinto del ejecutor bajo revisión de Dirección.

---

## §13. Criterios de rollback

Si Dirección detecta regresión al revisar este acta o durante la reproducción por tercero:

- El rollback se realiza a nivel de subhito individual: `git revert <sha>` del o los commits promocionados afectados, respetando el orden inverso.
- Los subhitos A–E fueron promocionados como fast-forwards independientes; cualquiera es revertible sin afectar a los demás salvo dependencias documentadas:
  - Revertir 9.2.5-E deja Vitest en 2.1.9 (reintroduce GHSA-5xrq-8626-4rwp; UI-only, mitigado por §7 bis del Plan).
  - Revertir 9.2.5-D deja el mapping 42501 → `not_found` global (versión intermedia); si se requiere volver antes, revertir E + D + los 4 commits de D en orden inverso.
  - Revertir 9.2.5-C reabre DEUDA-API-SEED-VERB.
  - Revertir 9.2.5-B reintroduce Next 16.2.6 (con GHSA-6gpp-xcg3-4w24 nominal).
  - Revertir 9.2.5-A retira el toolchain reproducible (rompe scripts `scripts/dev/*`).
- Ningún revert requiere migraciones ni cambios en RLS.

---

## §14. Checklist de Dirección

Elementos que Dirección debe revisar antes de firmar el acta:

- [ ] Confirmar visualmente los 11 SHAs de commits promocionados (§1).
- [ ] Confirmar CI de esta rama `9.2.5-F` verde (Run ID pendiente — ver §16 y reporte final de la orden operativa; el acta identifica el CI como "pendiente" en el momento del commit documental).
- [ ] Confirmar que el restore drill de Job C está verde en el mismo CI.
- [ ] Aprobar o rechazar la lista de deudas aplazadas (§11).
- [ ] Aprobar o rechazar los riesgos residuales (§12), especialmente 12.5 (segunda reproducción por tercero).
- [ ] Autorizar por separado la promoción de este acta a la rama oficial mediante orden operativa distinta.
- [ ] Firmar el acta cambiando su estado a "APROBADA POR DIRECCIÓN" (cambio que exigirá un commit adicional en una orden operativa distinta, no cubierta por esta).

---

## §15. Estado de aprobación

**VALIDACIÓN TÉCNICA COMPLETADA · PENDIENTE DE APROBACIÓN DE DIRECCIÓN.**

Este acta **no está aprobada por Dirección** en el momento de su creación. El cambio de estado a "APROBADA POR DIRECCIÓN" y la eventual promoción de este documento a la rama oficial son actos separados que requieren órdenes operativas independientes.

---

## §16. Prohibición explícita de promoción automática

Este documento **NO autoriza la promoción del Hito 9.2.5 a la rama oficial**. La rama oficial `spabla-v2/thirteen-languages-activation` ya contiene el HEAD `76712c05…` con los 5 subhitos A–E promocionados individualmente. El presente commit documental vive en la rama `spabla-v2/hito-9-2-5-f-integral-validation` y su promoción por fast-forward a la rama oficial es una decisión separada que exige aprobación expresa de Dirección.

Los subhitos posteriores (Hito 9.3 · AUTH-PERSISTENT-SESSION, deuda V1, deuda ESLint, rate limiting, etc.) **NO se abren** por virtud de este documento. Cada uno requiere su propia orden operativa.

---

## §17. CI de esta rama de cierre

El commit documental que introduce este acta desencadena un CI sobre `spabla-v2/hito-9-2-5-f-integral-validation`. El Run ID, la URL y el resultado exacto de los Jobs A/B/C se recogen en el reporte final de la orden operativa 9.2.5-F (fuera de este documento). La orden operativa prohíbe explícitamente modificar este acta después de conocer el CI; la incorporación definitiva del Run ID se realizará, si Dirección lo exige, mediante otra orden operativa distinta.

---

## §18. Veredicto técnico

**APTO PARA REVISIÓN DE DIRECCIÓN.**

Todos los criterios técnicos verificables en el momento de la validación (§13.1–§13.16 del Plan, excepto §13.16 "segunda reproducción por tercero" que queda como riesgo residual §12.5, y §13.15 "restore drill" delegada a Job C del CI) están cumplidos.

La aceptación final del Hito 9.2.5 corresponde a Dirección mediante acta firmada aparte (§13.19 del Plan) y a la orden operativa separada que autorice la promoción de este documento a la rama oficial.
