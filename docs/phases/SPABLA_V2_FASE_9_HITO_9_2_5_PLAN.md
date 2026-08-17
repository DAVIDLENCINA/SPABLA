# SPABLA V2 — Fase 9 — Hito 9.2.5

**CORE RELIABILITY & REPRODUCIBILITY GATE**

**Tipo**: Plan de hito (documental).
**Versión**: **V1.1**.
**Estado**: **APROBADO Y CONGELADO POR DIRECCIÓN**.
**Naturaleza**: plan documental que **NO autoriza implementación**. La implementación de cada subhito (§16) exige orden operativa separada.
**Fecha aprobación**: 2026-08-17.
**Rama documental**: `spabla-v2/plan-hito-9-2-5-core-reliability`.
**Rama oficial de fase**: `spabla-v2/thirteen-languages-activation`.
**HEAD base auditado**: `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d`.
**Auditoría origen**: informe forense dinámico final entregado el 2026-08-17.
**Plan padre en Fase 9**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_PLAN.md` V1.1 (APROBADO Y CONGELADO).
**Plan hermano**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.1 (PROPUESTO, pendiente de aprobación; NO afectado por este hito).

> **Autoridad**: Este plan aprueba el alcance normativo del Hito 9.2.5. La ejecución operativa exige orden separada por subhito. Ninguna línea de código, migración, configuración, dependencia, test o pipeline CI puede modificarse bajo esta aprobación.

---

## §0. Historial de versiones

- **V1.0 — 2026-08-17**: propuesta inicial redactada tras la segunda auditoría forense dinámica.
- **V1.1 — 2026-08-17**: revisión, corrección y aprobación por Dirección. Cambios materiales:
  - Cabecera pasa a `V1.1 · APROBADO Y CONGELADO POR DIRECCIÓN`.
  - Vulnerabilidades tabulan CVE/GHSA/CVSS/URL primaria y ámbito (runtime/build/test/legacy) — antes eran descripciones cualitativas.
  - Contenedores de subhitos operativos 9.2.5-A a 9.2.5-F, cada uno con orden operativa propia y commit separado.
  - Nueva §5 bis · Regla operativa **TEST-RUNNER-ISOLATION** (no coexistir `next dev` con `route.http.integration.test.ts`).
  - Nueva §8 bis · **AUTHORIZATION-SEMANTICS** — decisión pendiente sobre 200 vs 403 vs 404 con recomendación técnica razonada; NO se implementa en este hito.
  - Nueva §7-bis · **VITEST-SECURITY** — política operativa que separa CVE de Vitest UI del uso `vitest run` de SPABLA; upgrade `vitest 2.x → 4.x` **aislado** de otros upgrades.
  - Nueva §7-ter · **LEGACY-DEPS** — deuda socket.io/engine.io/ws separada; determinar si llega al bundle V2 antes de clasificar.
  - Nueva §5 · Regla de arranque canónico con **fail-fast checks** (project_id efectivo, PGRST_DB_SCHEMAS esperado, nombres de contenedores, host local, ausencia de `supabase/supabase/`).
  - Matriz §12 no fija «1181» como mínimo eterno; fija cero regresión + cero skip no justificado + desglose por suite.
  - Añadida sección de rollback específica por subhito.
  - Corrección tipográfica: cero truncaciones («NO AUTORIZA IMPLEMENTACIÓN» completo en la cabecera).

---

## §1. Objetivo

Convertir la reproducibilidad y la fiabilidad del núcleo SPABLA V2 en un derecho **ejercido** y verificable por terceros, no en un supuesto no probado. El hito debe garantizar que cualquier miembro del equipo (o el agente CLI) puede, siguiendo un único procedimiento canónico documentado y en un tiempo acotado, arrancar Supabase local, aplicar la cadena oficial de migraciones, sembrar los fixtures, ejecutar la matriz completa de tests en verde, y detener el entorno preservando datos, con paridad estricta local / CI.

Adicionalmente, priorizar el triage de vulnerabilidades de dependencias distinguiendo runtime, build, test y legacy V1, y fijar el toolchain (Supabase CLI, Node, Docker) para que local y CI produzcan los mismos resultados.

---

## §2. Alcance

Cubre exclusivamente:

1. Fijación de toolchain (§4).
2. Arranque local canónico con fail-fast (§5).
3. Regla operativa TEST-RUNNER-ISOLATION (§5 bis).
4. Paridad local / CI probada por reconstrucción real (§6).
5. Triage de vulnerabilidades con evidencia primaria (§7).
6. Política operativa VITEST-SECURITY (§7 bis).
7. Política LEGACY-DEPS (§7 ter).
8. Separación V1 / V2 (§8).
9. Decisión pendiente AUTHORIZATION-SEMANTICS (§8 bis).
10. Bootstrap y seed de desarrollo (§9).
11. Protección explícita de RB Platform (§10).
12. Preservación de datos locales (§11).
13. Matriz de aceptación (§12).
14. Criterios de aceptación medibles (§13).
15. Riesgos (§14).
16. Evidencias forenses del 2026-08-17 (§15).
17. Subhitos y rollback por subhito (§16).
18. Condiciones de salida (§17).

**Fuera de alcance** (para hitos posteriores):

- Cualquier funcionalidad de producto nueva.
- Sesión persistente auth (cubierta por Hito 9.3, plan hermano).
- OTP, passkeys, dispositivos vinculados, multicuenta, nativo iOS/Android.
- Refactor arquitectónico del núcleo.
- Introducción de tabla nueva `spabla_v2.*`.
- Cambios en RLS o SECURITY DEFINER functions ya en uso.
- Migración de proveedores de traducción o de auth.
- Deprecación de rutas V1 legacy (`app/api/translate/route.ts`, `app/api/tts/route.ts`, `server/signaling.ts`).

---

## §3. No alcance (prohibiciones explícitas del hito)

- No introducir código productivo nuevo durante la ejecución del hito.
- No modificar `PersistencePort` ni contratos públicos del engine.
- No alterar el catálogo de 13 idiomas UI ni el catálogo técnico de 55 (ADR-005).
- No modificar policies RLS existentes de `spabla_v2.*` (ADR-008).
- No introducir dependencias productivas nuevas más allá del upgrade acotado de `next` (§7).
- No cambiar Supabase Auth por otro proveedor.
- No implementar la decisión AUTHORIZATION-SEMANTICS (§8 bis) sin subhito 9.2.5-D específico.
- No romper la deuda deliberadamente aplazada: OBS-PROVIDER, AUTH-PERSISTENT-SESSION (Hito 9.3), DEUDA-AUTH-REVOCATION.

---

## §4. Toolchain fijado

Divergencias entre local y CI son un **defecto por diseño**.

| Herramienta | Versión canónica | Origen |
|---|---|---|
| Node.js | **24 LTS** | CI `.github/workflows/ci.yml:48` |
| npm | consistente con Node 24 | derivado |
| Docker | ≥ 24 | requisito Supabase local |
| Supabase CLI | **2.110.0** | CI pinneado. Local del agente auditó con 2.113.0 sin regresión funcional una vez el workdir fue correcto. La política canónica es 2.110.0. |
| PostgreSQL cliente | 17 | CI Job C |
| ESLint | 9.x (`eslint-config-next 16.2.6`) | package.json |
| TypeScript | 5.9.3 | lockfile |
| vitest | **2.1.9** (baseline actual; upgrade a 4.x tratado en §7 bis) | root + engine |

**Reglas duras del subhito 9.2.5-A**:
- Documentar en un fichero versionado (candidato: `docs/standards/SPABLA_V2_TOOLCHAIN.md`) las versiones canónicas.
- Publicar `scripts/dev/check-toolchain.sh` (u equivalente) que aborte con exit != 0 si detecta desalineación crítica.
- Documentar cómo instalar la versión canónica de Supabase CLI sin `brew install/uninstall` global (opciones: `mise`, `asdf`, binario descargado a `~/.local/bin`, Docker envoltura).
- Prohibir cualquier documentación o script que use `brew install/uninstall` sobre herramientas del toolchain sin autorización expresa.
- No alterar el toolchain de RB Platform.

---

## §5. Arranque local canónico

Procedimiento único autorizado. Cualquier desviación es un defecto operativo.

```bash
# 1. Precondiciones
cd <REPO_ROOT>   # p.ej. /Users/davidlencina/SPABLA
lsof -i :3000 -i :54321 -i :54322 -i :54323 -i :54324   # deben estar libres
docker ps --format '{{.Names}}' | grep supabase | grep -v spabla-hito || true   # RB Platform Exited

# 2. Arrancar Supabase local (SIN --workdir; leer config desde CWD)
supabase start
# Verificar fail-fast (deben coincidir todos):
#   - project_id efectivo == "spabla-hito-8-2-local"
#     supabase status -o json | jq -r '.API_URL'   # http://127.0.0.1:54321
#   - Nombres de contenedores == 'supabase_*_spabla-hito-8-2-local'
#     docker ps --format '{{.Names}}' | grep -E '^supabase_.*_spabla-hito-8-2-local$'
#   - PGRST_DB_SCHEMAS == "public,graphql_public,spabla_v2"
#     docker exec supabase_rest_spabla-hito-8-2-local env | grep PGRST_DB_SCHEMAS
#   - Host efectivo == 127.0.0.1 (no proyecto productivo)
#   - Cero artefacto local:
#     test ! -d supabase/supabase   # si existe, workdir fue incorrecto → abortar

# 3. Aplicar cadena oficial de migraciones (contiene db reset local)
bash scripts/ci/apply-migrations.sh
# Verificar 6 migraciones aplicadas en orden lexicográfico.

# 4. Arrancar Next dev con OpenAI bloqueado y gates dev activos
export NEXT_PUBLIC_SUPABASE_URL="$(supabase status -o json | jq -r .API_URL)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status -o json | jq -r .ANON_KEY)"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
export OPENAI_API_KEY=""
export SPABLA_V2_ENABLE_DEV_SEED=1
export NODE_ENV=development
npx next dev

# 5. Sembrar fixtures locales (una única vez por sesión)
curl -X POST http://127.0.0.1:3000/api/v2/seed

# 6. Al terminar: preservar datos (default de 'supabase stop' == --backup)
kill $(lsof -ti :3000)
supabase stop   # SIN --no-backup (prohibido)
```

**Errores prohibidos documentados**:

- `supabase --workdir supabase start` ejecutado **desde el repo root**: la CLI busca `supabase/supabase/config.toml`, no lo encuentra, arranca con config default sin `spabla_v2`, y crea el artefacto local `supabase/supabase/{.branches,.temp,snippets}`. Origen del incidente FORENSIC-DYN-001 refutado.
- `supabase stop --no-backup`: destruye volúmenes locales sin backup.
- `supabase db reset --local` invocado directamente sin `apply-migrations.sh` como wrapper.
- Modificación de `.env.local` o `.env.development.local` (propiedad del usuario; nunca los toca el script canónico).

El procedimiento debe materializarse en `scripts/dev/bootstrap.sh` (o equivalente) que además de ejecutar los pasos verifique precondiciones y aborte fail-fast ante cualquier divergencia enumerada arriba.

---

## §5 bis. TEST-RUNNER-ISOLATION (regla operativa nueva)

`app/api/v2/messages/route.http.integration.test.ts` **levanta su propio `next dev` en el puerto 3109** (o el que fije `SPABLA_TEST_NEXT_PORT`). Next 16.2.6 aborta si detecta otro `next dev` sobre el mismo repo dir `.next/`.

Reglas de operación:

- **Prohibido** ejecutar `route.http.integration.test.ts` mientras un `next dev` general esté activo sobre el mismo repositorio.
- El HTTP-frontier tiene su propio ciclo de vida (spawn en `beforeAll`, kill en `afterAll`).
- Antes de ejecutar cualquier suite que incluya `route.http.integration.test.ts`, el script canónico de tests debe:
  1. Comprobar que no hay proceso `next-server` usando el mismo directorio del repositorio.
  2. Si lo hay, o bien detenerlo controladamente con notificación al operador, o bien abortar con mensaje claro.
- Un fallo por colisión de procesos **NO se clasifica como defecto del producto** — es un incidente operativo y debe reflejarse como tal en el reporte de tests.

Este bloque de reglas debe entrar en la documentación de bootstrap (§9) y no en el código de tests.

---

## §6. Paridad local / CI

Objetivo: la salida de `apply-migrations.sh` + suite completa de tests debe producir cifras **idénticas** en local y CI (con margen sólo para crecimiento legítimo declarado).

Requisitos del hito:

- Fijar toolchain (§4) — condición necesaria.
- Script `scripts/dev/reproduce-ci.sh` (o equivalente) que encapsule la secuencia completa: `start`, `apply-migrations.sh`, `seed` opcional, `npm run test:client`, `cd engine && npx vitest run`, `npm run build`.
- Baseline auditado 2026-08-17: 1181 tests agregados verde. Ver §12 para política de baseline.
- Cualquier divergencia local ↔ CI se registra como incidente y bloquea la promoción del hito.

---

## §7. Seguridad de dependencias — evidencia primaria

Triage exhaustivo del `npm audit --json` ejecutado 2026-08-17 sobre `14e2cbd`. Cada entrada cita fuente primaria (GHSA + Security Advisory / NVD) y aplicabilidad real.

### §7.1 Runtime aplicable

| Paquete | Versión | Fix | Sev | GHSA / CVE | CVSS | Título | Origen | Aplicable a SPABLA |
|---|---|---|---|---|---|---|---|---|
| `next` | 16.2.6 | 16.3.1 (minor, no-breaking según npm audit) | high | [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) | (no CVSS numeric) | Next.js: Middleware / Proxy bypass en App Router usando Turbopack y single locale | Direct | **SÍ**. SPABLA usa App Router (`app/**`) y Turbopack en `next dev`. La exposición a middleware/proxy bypass depende de si SPABLA usa middleware.ts o proxy config. Verificar antes del upgrade. |

**Nota crítica**: el rango afectado es `9.3.4-canary.0 - 16.3.0-preview.10`. `16.2.6` cae dentro; **16.3.1 corrige** según npm audit fixAvailable. Antes de subir se debe confirmar en el changelog oficial de Next 16.3.1 que efectivamente cierra GHSA-6gpp-xcg3-4w24.

### §7.2 Build-time (afecta a build/CI pero no a runtime público)

| Paquete | Versión afectada | Sev | GHSA | CVSS | Título | Aplicable |
|---|---|---|---|---|---|---|
| `sharp` (transitivo Next Image) | `<0.35.0` | high | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | (n/a) | libvips CVE-2026-33327/33328/35590/35591 | Sólo si Next Image procesa entradas atacante-controlladas en build (rutas dinámicas). SPABLA usa `<img>` estático para el logo; no Next Image. **Fix inherente a upgrade Next 16.3.1**. |
| `postcss` | `<=8.5.22` | high | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | 6.1 | XSS via unescaped `</style>` en CSS stringify | Sólo en build con CSS atacante-controlado; SPABLA controla su CSS. Fix vía Next 16.3.1. |
| `nanoid` | `<=3.3.17` | high | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | 5.9 | Loop indefinido con tamaño negativo | Requiere entrada atacante-controlada al tamaño; SPABLA no lo usa productivamente. Fix disponible en cascada. |
| `brace-expansion` | `<=1.1.17 || 3.0.0 - 5.0.8` | high | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | 5.3 | DoS por expansion exponencial | Sólo shell / glob patterns atacante-controlados. Build/CI, no runtime. |
| `js-yaml` | `4.0.0 - 4.3.0` | high | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | 5.3 | DoS complejidad cuadrática merge keys | Sólo si YAML atacante-controlado. Build/CI. |
| `@babel/core` | `<=7.29.0` | low | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | 3.2 | Arbitrary File Read via sourceMappingURL | Build tooling. Sin impacto runtime. |

### §7.3 Test tooling (SPABLA no ejecuta Vitest UI)

| Paquete | Versión | Fix | Sev | GHSA | CVSS | Aplicable |
|---|---|---|---|---|---|---|
| `vitest` | `<=3.2.5` | 4.1.10 (major, breaking) | **critical** | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | **9.8** | Vitest **UI** server: arbitrary file read + execution | **CVE activo sólo si Vitest UI está escuchando** (`vitest --ui`). SPABLA usa `vitest run` (headless). **NO aplicable en CI**. Aplicable como riesgo latente en máquinas de desarrolladores. Mitigación: §7 bis. |
| `@vitest/coverage-v8` | `<=3.2.5` | 4.1.10 | critical | (mismo tree) | 9.8 | Idem | Idem |
| `@vitest/mocker`, `vite-node`, `vite`, `esbuild` | varias | vía vitest 4.x | moderate/high | GHSAs varias | — | Test-runtime; misma superficie. Vite [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) (Path Traversal en Optimized Deps `.map`) y esbuild [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (CORS del dev server) requieren dev server activo. |

### §7.4 V1 legacy

| Paquete | Sev | GHSA | Origen | Trato |
|---|---|---|---|---|
| `ws 8.0.0-8.20.1` | high | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) — CVSS 7.5 | transitive vía `socket.io` | Deuda SEC-DEPS V1. Fuera del hito. §7 ter. |
| `socket.io-parser 4.0.0-4.2.6` | high | [GHSA-2m8v-j782-fhvr](https://github.com/advisories/GHSA-2m8v-j782-fhvr) — CVSS 7.5 | idem | Idem |
| `engine.io 0.7.8-0.7.9 \|\| 6.0.0-6.6.8` | high | Zero-attachment memory exhaustion | idem | Idem |
| `engine.io-client` / `socket.io-adapter` | high | varios | idem | Idem |

### §7.5 Criterio de bloqueo del núcleo

Al cierre del hito 9.2.5 debe cumplirse simultáneamente:

- **Cero** vulnerabilidad crítica aplicable a runtime.
- **Cero** vulnerabilidad alta aplicable a runtime sin decisión escrita de mitigación o upgrade.
- **Cero** vulnerabilidad de tooling que pueda exfiltrar secretos de CI sin política operativa clara.
- Toda vuln aplazada consta por CVE/GHSA con motivo y ETA.

---

## §7 bis. VITEST-SECURITY (política operativa)

- El CVE crítico [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) afecta al **servidor UI de Vitest**, activado con `vitest --ui`.
- SPABLA no usa Vitest UI. Los tests se ejecutan con `vitest run` (headless).
- **Prohibición operativa**: cualquier uso de `vitest --ui` en entornos con secretos productivos o de CI queda vetado hasta que se complete el upgrade `vitest 2.x → 4.x`.
- Documentar la prohibición en `docs/standards/SPABLA_V2_CODE_STANDARD.md` o equivalente.
- El upgrade a Vitest 4.x es un **cambio mayor aislado** (subhito 9.2.5-E). NO se combina con el upgrade de Next (subhito 9.2.5-B).
- Antes de subir Vitest, ejecutar compat check completo: `test:client` + engine + client suites con env local + CI. Cualquier regresión aborta el upgrade.
- Rollback: revert del commit que sube versión.

---

## §7 ter. LEGACY-DEPS (política)

- Las vulns de `socket.io/engine.io/ws` proceden de la infraestructura V1 (signaling, chat V1, TTS V1) heredada de `spabla-stable-*` tags y del binario `server/signaling.ts`.
- El subhito 9.2.5 debe **determinar por análisis estático + inspección de bundle** si esos módulos llegan a:
  - Bundle cliente `.next/static/**` productivo.
  - Bundle server `.next/server/**` productivo.
  - Runtime real en producción.
- Si NO llegan: reclasificar como **deuda legacy no bloqueante** y aplazarla a un hito de deprecación V1 separado.
- Si LLEGAN: elevar a hito correctivo separado con prioridad alta.
- Este análisis y su clasificación son producto del subhito 9.2.5-A o 9.2.5-C; **no implementación** de upgrade.

---

## §8. Separación V1 / V2

Auditoría 2026-08-17 confirma 2 rutas V1 legacy que llaman a OpenAI (`app/api/translate/route.ts:88`, `app/api/tts/route.ts:58`) además de la ruta V2 productiva (`lib/v2/server/translate.ts:99`).

Requisitos del subhito 9.2.5-C:

- Marcar con comentarios explícitos qué archivos pertenecen a V1 legacy en `app/api/**` y `server/**`.
- Documentar políticas: qué V1 sigue soportado, qué V1 se retirará, qué no puede regresionar.
- Verificar que no hay dependencias productivas entre `app/v2/**` + `lib/v2/**` + `engine/**` y las rutas legacy V1.
- No retirar V1 legacy en este hito (fuera de alcance).

---

## §8 bis. AUTHORIZATION-SEMANTICS (decisión pendiente de Dirección)

**Observación forense 2026-08-17**: `GET /api/v2/messages?tenantId=<T>&conversationId=<C>&to=es` con:
- Actor A autenticado con JWT válido (`getClaims` OK).
- `<T>` es un UUID válido pero **A no es miembro** activo de ese tenant.

devuelve actualmente **HTTP 200 con `{"items":[], "actorId":"<A>"}`** — RLS filtra a nivel de fila y el handler no distingue "no autorizado" de "no hay mensajes".

### §8 bis.1 Alternativas

| Alternativa | Semántica | Ventajas | Riesgos | Impacto UI |
|---|---|---|---|---|
| **200 vacío** (actual) | Comportamiento silencioso: RLS aplica, cliente ve lista vacía | Minimiza enumeración de tenants. Simple. | Oculta autorización incorrecta; un cliente malformado que envía tenant ajeno recibe éxito y puede confundir estado | El cliente no aprende nada útil |
| **403 Forbidden** | Semántica REST clara: petición comprendida, autorización denegada | Diagnóstico limpio | **Revela que el tenant existe** o al menos que la petición fue evaluada más allá de auth; **facilita enumeración** de tenants por atacantes autenticados | El cliente puede reaccionar (mensaje al usuario) |
| **404 Not Found** | Oculta existencia del recurso al no autorizado | Balance seguridad + semántica | **Confunde "recurso ausente" con "no autorizado"**; complica debug legítimo | Cliente indistinguible entre "no existe" y "no autorizado" |

### §8 bis.2 Recomendación técnica razonada (para aprobación posterior)

**Propuesta**: mantener 200 vacío para el path GET de listado por defecto **cuando el actor está autenticado válidamente y RLS filtra**, pero **añadir en la respuesta un campo `membershipContext`** ("member" | "non_member") derivado del server-side `spabla_v2.tenant_memberships` para hacer la ausencia de resultados **auto-explicable sin filtrar recursos ajenos**. El cliente puede reaccionar sin habilitar enumeración masiva (el atacante ya sabe que su token no le pertenece al tenant).

Rechazos:
- 403 puro habilita enumeración con `authenticated` role.
- 404 puro rompe semántica REST y complica soporte.

**Decisión final la toma Dirección** en el subhito 9.2.5-D específico. Este plan la registra sin implementarla.

### §8 bis.3 Restricciones para el subhito 9.2.5-D

- Cualquier decisión debe soportarse en tests HTTP-frontier reales (patrón 9.2.4).
- No romper el contrato actual sin adaptar los tests unitarios y de integración correspondientes.
- Documentar la decisión en un ADR complementario si cambia el mapping semántico.

---

## §9. Bootstrap y seed de desarrollo

Consolidar en un único documento operativo (`docs/standards/SPABLA_V2_DEV_BOOTSTRAP.md` o similar) el procedimiento §5. Debe incluir:

- Precondiciones explícitas (puertos, RB Platform, `.env.local`).
- Comandos exactos con verificaciones intermedias fail-fast.
- Errores comunes y su diagnóstico (workdir incorrecto, gate seed off, colisión de puertos, coexistencia `next dev` + HTTP-frontier).
- Política de rotación de contraseñas fixture (nunca en logs).
- Política de retención de fixtures entre sesiones.
- **`POST /api/v2/seed`** como único método autorizado para bootstrap.
- **Prohibición explícita** de invocar `GET /api/v2/seed` como probe (deuda `DEUDA-API-SEED-VERB` a cerrar en 9.2.5-C).

### §9.1 SEED-DIAGNOSTICS (subhito 9.2.5-C)

Requisitos del cambio autorizable al endpoint seed:

- **Respuesta pública segura**: mantener el mismo shape actual `{"error":"seed_failed"}` con HTTP 500 sin detalles al cliente.
- **Registro interno server-side** debe incluir causa técnica, código de error, correlation ID único por invocación; NO contraseñas, tokens ni service-role keys.
- **`GET /api/v2/seed`** debe rechazar sin ejecutar la lógica de siembra: 405 Method Not Allowed o 404 (a decidir; ambas son válidas si el gate ya devuelve 404 en producción).
- **Sólo `POST /api/v2/seed`** ejecuta la mutación.
- El endpoint sigue limitado a desarrollo mediante los dos gates existentes (`NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1`).

---

## §10. Protección de RB Platform

`rb-platform-i5-local` es un proyecto Supabase local distinto que coexiste con SPABLA en el mismo host Docker.

Requisitos del hito:

- Documento operativo debe listar los nombres de containers y volúmenes de RB Platform como **intocables**.
- Script de bootstrap debe advertir si detecta containers RB Platform running.
- Cualquier `docker rm` o `docker volume rm` debe requerir doble confirmación.
- `supabase stop` sin `--all` es preferible; `--all` prohibido.
- Prohibición explícita de `docker system prune` durante el hito.

Evidencia auditoría §15: RB Platform permaneció intacto (Exited desde hace 5 días, volúmenes preservados) durante toda la sesión dinámica.

---

## §11. Preservación de datos locales

`supabase stop --no-backup` borra volúmenes locales sin backup. La auditoría del Hito 9.2.4 lo ejecutó por confusión con la orden operativa. Consecuencia: los datos de la conversación demo se perdieron.

Requisitos:

- **Prohibición explícita** de `--no-backup` en cualquier documentación, script o guía operativa del proyecto SPABLA.
- Recordatorio de que `supabase stop` **sin flags** preserva por defecto en CLI 2.110.0 y 2.113.0.
- Política clara: si se necesita reinstalar el stack desde cero, ejecutar `apply-migrations.sh` (que hace `db reset --local`) — no `--no-backup`.
- Documentar qué datos son reconstruibles automáticamente (schemas, seed fixture) y cuáles requieren re-generación humana (conversaciones demo con historial de mensajes).

---

## §12. Matriz de pruebas

Política de baseline: **cero regresión + cero skip no justificado + todos los tests esperados descubiertos y ejecutados**. NO se fija «1181» como mínimo eterno; se acepta crecimiento legítimo declarado.

### §12.A Estáticas (obligatorias antes de cualquier cambio)

- `git diff --check` exit 0.
- `npx tsc --noEmit -p tsconfig.json` exit 0.
- `cd engine && npx tsc --noEmit` exit 0.
- `npx eslint app/v2 lib/v2 app/api/v2 --max-warnings=0` exit 0.
- `npm run build` (con env local, `OPENAI_API_KEY=""`) — 12/12 rutas verde.

### §12.B Unit (baseline auditado 2026-08-17)

- Cliente sin env: 48 passed / 14 skipped (tests integration se saltan por env-gated).
- Engine sin env: 1057 passed / 62 skipped.

**Regla**: los skipped **legítimos** son aquellos env-gated `test.skipIf(!ENABLED)`. Cualquier otro skip debe justificarse individualmente en el reporte de tests del subhito.

### §12.C Integration (baseline auditado 2026-08-17)

- Cliente con env: 62 passed / 0 skipped (48 unit + 11 direct-handler + 3 HTTP-frontier).
- Engine con env: 1119 passed / 0 skipped (1057 unit + 62 integration).

Desglose por suite:

| Suite | Tests |
|---|---|
| `app/api/v2/messages/route.integration.test.ts` | 11 |
| `app/api/v2/messages/route.http.integration.test.ts` | 3 |
| `engine/src/adapters/persistence/supabase/supabase-persistence.integration.test.ts` | 26 |
| `engine/src/adapters/persistence/usage/usage-emitter.integration.test.ts` | 21 |
| `engine/src/adapters/translation-store/supabase/supabase-translation-store.integration.test.ts` | 9 |
| `engine/src/adapters/persistence/supabase/fase9-visible-conversation.integration.test.ts` | 6 |
| **Total integration** | **76** |

Baseline total agregado: **1181 passed / 0 skipped / 0 failed**. Puede crecer legítimamente por tests añadidos por los subhitos del propio 9.2.5 (recomendado: cada subhito añade cobertura de su alcance).

### §12.D Forenses (obligatorias post-cambio)

- JWT ausente / corrupto → **401** real.
- Actor sin membership activa → comportamiento actual **200 con items=[]** (§8 bis pendiente de decisión).
- Actor A no puede leer datos de otro tenant.
- `authenticated` no puede INSERT en `message_translations` → **403 permission denied**.
- `service_role` sí puede persistir.
- Cache miss con `OPENAI_API_KEY=""` → `translation:null`, `translationError:"provider_unavailable"`, **cero fila nueva** en `message_translations`.

### §12.E CI

Job A + Job B + Job C verde en CI oficial contra el mismo HEAD del candidato del subhito.

### §12.F Verificaciones específicas del hito 9.2.5

- Migraciones desde cero: `apply-migrations.sh` en stack fresh → exit 0.
- PostgREST expone `spabla_v2`: `docker exec supabase_rest_spabla-hito-8-2-local env | grep PGRST_DB_SCHEMAS` → contiene `spabla_v2`.
- Cero artefacto `supabase/supabase/` tras `supabase start` desde repo root.
- Herramienta fail-fast (`scripts/dev/check-toolchain.sh` o equivalente) aborta cuando se detecta workdir incorrecto o CLI desalineada.
- `OPENAI_API_KEY=""` durante todos los tests del subhito.
- Cero conexión productiva.
- Cero contaminación de RB Platform.
- Cero secretos en logs, bundle o repositorio.

---

## §13. Criterios de aceptación

El hito 9.2.5 sólo podrá cerrarse cuando:

1. Toolchain fijado y documentado (§4).
2. Script canónico único de bootstrap operativo, documentado y con fail-fast (§5, §5 bis).
3. Script canónico de reproducción de CI (§6) que produce el baseline auditado en local.
4. Cero vuln crítica aplicable a runtime (§7).
5. Cero vuln alta runtime sin decisión escrita (§7).
6. Política VITEST-SECURITY documentada (§7 bis).
7. Clasificación LEGACY-DEPS con evidencia de bundle (§7 ter).
8. Documento V1/V2 delimitando responsabilidades (§8).
9. Decisión AUTHORIZATION-SEMANTICS emitida por Dirección y ADR/subhito 9.2.5-D redactado (implementación puede ser posterior).
10. Documento operativo único de bootstrap y seed (§9).
11. Endpoint seed cierra DEUDA-API-SEED-VERB (§9.1).
12. Protección de RB Platform documentada y verificable (§10).
13. Prohibición explícita de `--no-backup` documentada (§11).
14. Matriz de tests §12 verde en local y en CI.
15. Restore drill desde cero verde.
16. Segunda reproducción limpia por tercero.
17. **Cero llamadas a OpenAI** durante toda la validación del hito.
18. **Cero uso de producción** durante toda la validación del hito.
19. Aceptación final de Dirección con acta breve (patrón 9.2.4).

---

## §14. Riesgos

- **R1**: upgrade `next 16.2.6 → 16.3.1` puede introducir regresiones sutiles en App Router / Turbopack. Mitigación: baselines completos + `next build` verificado + rollback via revert.
- **R2**: upgrade `vitest 2.x → 4.x` es major y puede romper suites. Mitigación: aislarlo en subhito 9.2.5-E, no combinarlo con Next.
- **R3**: divergencia CLI Supabase 2.110.0 (CI) vs 2.113.0 (local del agente) puede reintroducirse. Mitigación: `check-toolchain.sh` fail-fast.
- **R4**: Docker host con RB Platform puede ser dañado por comandos amplios (`prune`, `--all`). Mitigación: §10 explícita.
- **R5**: `.env.local` y `.env.development.local` son propiedad del usuario y no deben tocarse. Mitigación: script de bootstrap NO modifica esos archivos.
- **R6**: workdir incorrecto (`--workdir supabase` desde repo root) genera artefacto `supabase/supabase/`. Mitigación: script canónico + verificación fail-fast §5.
- **R7**: coexistencia `next dev` general + `route.http.integration.test.ts` bloquea suite HTTP-frontier. Mitigación: regla TEST-RUNNER-ISOLATION §5 bis.
- **R8**: decisión AUTHORIZATION-SEMANTICS mal ejecutada puede habilitar enumeración de tenants. Mitigación: subhito 9.2.5-D con ADR + tests HTTP-frontier de todos los escenarios.
- **R9**: dependencia de `next 16.3.1` no publicada aún o retirada antes de cerrar el subhito. Mitigación: verificar disponibilidad y firma del release oficial antes de subir.

---

## §15. Evidencias obtenidas en la auditoría 2026-08-17

Auditoría forense dinámica ejecutada sobre worktree `/tmp/spabla-core-forensic-14e2cbd` desde SHA oficial `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d`.

### §15.1 Cadena de custodia

- Plan V1.1 pendiente Hito 9.3: SHA-256 `954d058d5221b162a910a5d1ea1a2f8dc1792ffcf11c1f7e9a16daf341ae6ab5` (byte-idéntico).
- Patch de seguridad: `/tmp/SPABLA_HITO_9_3_PLAN_V1_1_PENDING.patch` SHA-256 `86e4388b0d7438eb7d8dc1fec8ee2dadb82ef43d45183c0319830384168c53c6`.
- Repo principal sin cambios adicionales durante la auditoría.

### §15.2 Reconstrucción

- `supabase start` desde repo root: aplicó 6 migraciones automáticamente. Containers etiquetados con project id efectivo `spabla-hito-8-2-local`.
- `bash scripts/ci/apply-migrations.sh` posterior: reset + reaplicación de las 6 migraciones. Exit 0.
- PostgREST cargó `PGRST_DB_SCHEMAS=public,graphql_public,spabla_v2`.

### §15.3 Auditoría de BD post-migración

- 6 tablas `spabla_v2.*` con RLS + FORCE RLS.
- 8 policies (todas para `authenticated`; cero para `anon` o `PUBLIC`).
- 5 admin functions SECURITY DEFINER (owner `postgres`, `search_path=pg_catalog, spabla_v2`).
- Grants: `service_role` con INSERT/SELECT/UPDATE/DELETE; `authenticated` sólo SELECT (+ INSERT en 2 tablas). Cero grants a `anon`.

### §15.4 Seed

- `POST /api/v2/seed` (una vez) → 200. 2 users, 1 tenant, 2 memberships activas, 1 conversación vacía.

### §15.5 Integraciones 76/76

Todas verdes en local con toolchain 2.113.0 y workdir correcto, coincidencia con CI oficial `31959706190` (CLI 2.110.0 pinneada).

### §15.6 Matriz forense auth/RLS

- JWT ausente → 401 ✅
- JWT corrupto (signature flip) → 401 ✅
- Actor A → tenant válido A → 200 con items=[] ✅
- Actor B → tenant A (B es miembro) → 200 con items=[] ✅
- Actor A → tenant C (A NO es miembro) → **200 con items=[]** — origen de §8 bis.
- `authenticated` INSERT en `message_translations` → **403 permission denied** ✅
- `service_role` INSERT → 409 FK missing (grant funciona) ✅
- 5 401s consecutivos con JWT corrupto → cero bucle ✅
- Cache miss con `OPENAI_API_KEY=""` → `translation:null, translationError:"provider_unavailable"` ✅
- Cero fila nueva en `message_translations` tras cache miss ✅

### §15.7 Baselines completos

- `git diff --check` exit 0 · tsc raíz + engine exit 0 · ESLint V2 exit 0 · `next build` 12/12.
- Client suite con env: 62/62 verde.
- Engine suite con env: 1119/1119 verde.
- **Total agregado**: 1181 passed / 0 skipped / 0 failed.

### §15.8 Triage vulnerabilidades

Ver §7. Cero crítica aplicable a runtime. 1 alta runtime (`next 16.2.6` — GHSA-6gpp-xcg3-4w24; fix minor 16.3.1). Vitest crítico [GHSA-5xrq-8626-4rwp CVSS 9.8] es UI-only.

---

## §16. Subhitos operativos y rollback

La implementación del Hito 9.2.5 se divide en 6 subhitos independientes. Cada uno exige orden operativa propia, commit atómico separado, CI verde, y rollback definido. Ninguno se promociona automáticamente.

### §16.A Hito 9.2.5-A · Guardas de reproducibilidad y workdir

- Fijar toolchain (§4).
- Script `scripts/dev/bootstrap.sh` + `scripts/dev/check-toolchain.sh` con fail-fast.
- Documento `SPABLA_V2_TOOLCHAIN.md`.
- Añadir a `.gitignore` el patrón `supabase/supabase/` para prevenir contaminación accidental.
- Cierra tareas: FORENSIC-DYN-001 (reclasificado), FORENSIC-DYN-003, FORENSIC-DYN-006, FORENSIC-CORE-002, FORENSIC-CORE-003, política §5 y §5 bis, §11.
- Rollback: revert del commit único.

### §16.B Hito 9.2.5-B · Upgrade acotado de Next

- Upgrade `next 16.2.6 → 16.3.1` **exclusivo** (sin masivos).
- Sin `npm audit fix`.
- Lockfile controlado.
- Ejecutar suite completa + build + análisis del diff `package-lock.json`.
- Verificar cierre efectivo de GHSA-6gpp-xcg3-4w24 en changelog Next 16.3.1.
- Rollback: revert del commit único (afecta `package.json` + `package-lock.json`).

### §16.C Hito 9.2.5-C · Diagnóstico seguro del seed y verbo HTTP

- Endpoint `/api/v2/seed`: `GET` → 405/404 sin ejecutar; `POST` único método mutante.
- Registro interno server-side con causa técnica + correlation ID; sin exponer al cliente.
- Comentarios V1/V2 explícitos en `app/api/**`.
- Cierra tareas: FORENSIC-DYN-002, DEUDA-API-SEED-VERB.
- Rollback: revert del commit único.

### §16.D Hito 9.2.5-D · Decisión e implementación de semántica de autorización

- **Requisito previo**: decisión de Dirección sobre §8 bis.
- Redacción de ADR si cambia el mapping actual.
- Implementación con tests HTTP-frontier cubriendo los 3 escenarios (miembro, no miembro con tenant existente, tenant inexistente).
- Rollback: revert del commit; el mapping 200 vacío actual queda restablecido.

### §16.E Hito 9.2.5-E · Evaluación/upgrade aislado de Vitest

- Sólo si Dirección lo prioriza; el CVE es UI-only y ya está mitigado por §7 bis.
- Upgrade `vitest 2.1.9 → 4.x` aislado, sin combinar con Next.
- Compat check exhaustivo antes del commit.
- Cierra tareas: FORENSIC-DYN-004.
- Rollback: revert del commit único.

### §16.F Hito 9.2.5-F · Validación integral y acta de Dirección

- Ejecutar la matriz §12 completa contra el HEAD que incluye A + B + C + D + E (o los que se hayan completado).
- Restore drill desde cero.
- Segunda reproducción limpia por tercero.
- Acta breve firmada por Dirección (patrón 9.2.4).
- Rollback: si el acta detecta regresión, revert de los subhitos afectados antes de la promoción.

---

## §17. Condiciones de salida

El hito 9.2.5 se declara completado cuando:

1. Todos los criterios §13 verificados con evidencia reproducible.
2. Todos los subhitos §16 promocionados o formalmente aplazados con decisión de Dirección.
3. CI oficial verde sobre el commit de cierre.
4. Segunda reproducción limpia por tercero confirma paridad local/CI.
5. Aceptación de Dirección firmada en acta breve.
6. Rama candidata promocionada por fast-forward a la rama oficial.
7. Plan Hito 9.3 (AUTH-PERSISTENT-SESSION) sigue congelado en V1.1 sin modificaciones.
8. `main` intacta.

Post-cierre: el hito 9.3.1 (Continuidad web) queda desbloqueado técnicamente y depende sólo de la respuesta de Dirección a §15.1 y §15.2 del Plan 9.3 V1.1.

---

## Anexo A — Referencias

- Plan Hito 9.2 V1.1 (APROBADO Y CONGELADO): `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_PLAN.md`.
- Plan Hito 9.3 V1.1 (PROPUESTO, sin commit): `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md`.
- Acta 9.2.4 (aprobada): `docs/audit_reports/AUDIT_2026-08-14_pref-acceptance-jefe.md`.
- CI oficial de referencia: run `31959706190` @ `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d`.
- Auditoría estática (informe agente 2026-08-17 primera parte): entregada en pantalla.
- Auditoría dinámica final (informe agente 2026-08-17 tercera parte): entregada en pantalla, incluye §15.
- GHSA-6gpp-xcg3-4w24 (Next.js middleware/proxy bypass): https://github.com/advisories/GHSA-6gpp-xcg3-4w24
- GHSA-5xrq-8626-4rwp (Vitest UI arbitrary file): https://github.com/advisories/GHSA-5xrq-8626-4rwp
- GHSA-96hv-2xvq-fx4p (ws memory DoS): https://github.com/advisories/GHSA-96hv-2xvq-fx4p
- GHSA-4w7w-66w2-5vf9 (Vite path traversal `.map`): https://github.com/advisories/GHSA-4w7w-66w2-5vf9
- GHSA-67mh-4wv8-2f99 (esbuild dev server CORS): https://github.com/advisories/GHSA-67mh-4wv8-2f99
- Documentación oficial Supabase CLI: https://supabase.com/docs/reference/cli

## Anexo B — Identificadores

- **Plan**: `SPABLA_V2_FASE_9_HITO_9_2_5_PLAN.md` V1.1 (APROBADO Y CONGELADO 2026-08-17).
- **Rama documental**: `spabla-v2/plan-hito-9-2-5-core-reliability`.
- **HEAD base**: `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d`.
- **Subhitos operativos** (nomenclatura oficial): 9.2.5-A · Guardas de reproducibilidad y workdir · 9.2.5-B · Upgrade acotado de Next · 9.2.5-C · Diagnóstico seguro del seed y verbo HTTP · 9.2.5-D · Semántica de autorización · 9.2.5-E · Evaluación/upgrade aislado de Vitest · 9.2.5-F · Validación integral y acta de Dirección.
- **Deudas heredadas del acta 9.2.4 abordadas**: DEUDA-API-SEED-VERB (en 9.2.5-C, cerrada) + DEUDA-UX-SEED-MISSING (queda en 9.3.1 según Plan 9.3 V1.1).
- **Hallazgos de la auditoría dinámica abordados**: FORENSIC-DYN-001 (reclasificado como error operativo), 002 (9.2.5-C), 003 (9.2.5-A), 004 (9.2.5-E), 005 (9.2.5-B), 006 (9.2.5-A), 007 (invariante confirmada), 008 (9.2.5-D).
