# SPABLA V2 — Toolchain canónico y arranque local

**Estado**: Vigente.
**Introducido por**: Hito 9.2.5-A (Plan Hito 9.2.5 V1.1).
**Alcance**: Desarrollo local y validación local previa a CI. No sustituye a `AGENTS.md`, `CLAUDE.md` ni al Plan 9.2.5 V1.1.

---

## 1. Toolchain de referencia

| Componente          | Versión canónica | Notas |
|---------------------|------------------|-------|
| Node.js             | 24 LTS (24.14.0 fijado en `.tool-versions`) | Coincide con `.github/workflows/ci.yml` Job A. |
| npm                 | El que viene con Node 24. | No forzar versión distinta. |
| Supabase CLI        | 2.110.0 | Coincide con `supabase/setup-cli@v1 version: "2.110.0"` en CI. |
| PostgreSQL          | 17 | Declarado en `supabase/config.toml` (`major_version = 17`). |
| Docker              | ≥ 24 | Necesario para `supabase start`. |
| Utilidades          | `jq`, `python3`, `curl`, `lsof`, `awk`, `grep`, `sed` | Requeridas por los scripts de `scripts/dev/`. |

Los ficheros `.tool-versions` y `supabase/config.toml` son la única fuente declarativa. `scripts/dev/check-toolchain.sh` valida la coherencia con el entorno local.

---

## 2. Estructura de scripts

```
scripts/dev/
  lib/common.sh                          # constantes + helpers (sin efectos)
  check-toolchain.sh                     # fail-fast toolchain + workdir
  start-local.sh                         # arranque canónico
  stop-local.sh                          # parada segura
  check-http-frontier-preconditions.sh   # preflight tests HTTP-frontier
  tests/                                 # tests de estos scripts (bash)
```

- `lib/common.sh` **sólo se sourcea** desde otros scripts; nunca se ejecuta directamente.
- Cada script imprime diagnósticos por `stderr`; **jamás** imprime valores de variables secretas ni claves de servicio.
- Cada fallo emite `check`, `expected` y `suggestion`. Nada de auto-corrección.

---

## 3. Procedimiento canónico de arranque local

Todos los comandos se ejecutan desde la raíz del repositorio.

```bash
# 1. Verificar toolchain y workdir (fail-fast).
scripts/dev/check-toolchain.sh

# 2. Arrancar el stack Supabase local + verificar coherencia post-arranque.
scripts/dev/start-local.sh

# 3. (Opcional) Ejecutar la suite de integración.
npm --prefix engine run test:integration:supabase

# 4. Parada segura, preservando datos.
scripts/dev/stop-local.sh
```

**Prohibido**:

- `supabase --workdir supabase start` desde la raíz del repositorio. Crea el artefacto `supabase/supabase/` con un `config.toml` por defecto y arranca contenedores con nombres incorrectos.
- `supabase stop --no-backup` en local (borra los volúmenes de datos). El pin CI es una decisión operativa aparte; **local** siempre preserva.
- `docker rm`, `docker volume rm`, `docker system prune`, `docker kill` masivos.
- `brew install/uninstall` de Node, npm, Docker o Supabase CLI sin autorización expresa: afecta a otras herramientas del sistema fuera del alcance de SPABLA.

---

## 4. Aislamiento del HTTP-frontier

El test `app/api/v2/messages/route.http.integration.test.ts` levanta su propio `next dev` en el puerto `3109`. Next 16.2.6 con Turbopack detecta procesos `next dev` concurrentes en la misma raíz de repositorio y falla el arranque del segundo.

Regla operativa:

- Si el desarrollador tiene un `next dev` general corriendo (puerto `3000`) sobre este repo, debe **detenerlo** antes de ejecutar los tests HTTP-frontier.
- `scripts/dev/check-http-frontier-preconditions.sh` bloquea la ejecución cuando la colisión está presente. No mata procesos.

Uso recomendado:

```bash
scripts/dev/check-http-frontier-preconditions.sh \
  && npm --prefix engine run test:integration:supabase -- \
     app/api/v2/messages/route.http.integration.test.ts
```

---

## 5. Alcance estricto y recursos externos

Los scripts de `scripts/dev/` operan **exclusivamente** sobre la infraestructura de SPABLA:

- Sólo actúan sobre el `project_id` canónico declarado en `supabase/config.toml`.
- Sólo detienen contenedores cuyo nombre termina en el sufijo del `project_id` de SPABLA.
- No inspeccionan, comparan, detienen ni renombran ningún proceso, contenedor o volumen que no pertenezca a SPABLA.

Si un recurso externo no gestionado (por ejemplo, un proceso que ocupa uno de los puertos requeridos, o un `next dev` de otro proyecto en la misma máquina) impide arrancar el stack local, los scripts fallan con un mensaje genérico del estilo `port held by a process outside SPABLA scope` o `concurrent 'next dev' in $REPO_ROOT` y **no** intentan resolverlo automáticamente. La resolución queda a criterio del operador desde su propio contexto.

Prohibido, en cualquier caso: `docker prune`, `docker system prune`, `docker rm` masivos, `docker kill` no dirigidos, o cualquier operación que pueda afectar recursos fuera del alcance de SPABLA.

---

## 6. Coherencia con CI

- El toolchain declarado aquí (Node 24, Supabase CLI 2.110.0, PostgreSQL 17) es idéntico al `.github/workflows/ci.yml` Jobs A/B/C.
- Los scripts de `scripts/dev/` **no** invocan `supabase db reset` — esa decisión pertenece a CI (`scripts/ci/apply-migrations.sh`) y a hitos posteriores del propio Plan 9.2.5. Local presupone que la persistencia ya está aplicada o se aplicará explícitamente.
- La evidencia dinámica (checks efectivos, JSON de `supabase status`, listado de contenedores) es reproducible localmente ejecutando los scripts en orden.

---

## 7. Solución de problemas frecuentes

| Síntoma                                             | Causa habitual                                       | Acción segura |
|-----------------------------------------------------|------------------------------------------------------|---------------|
| `check failed: nested artifact supabase/supabase/`  | Se ejecutó `supabase --workdir supabase start`.      | Inspeccionar `supabase/supabase/`. Si no hay datos únicos, borrar manualmente. |
| `PGRST_DB_SCHEMAS in postgrest container`           | El stack se arrancó con `--workdir` incorrecto.      | `scripts/dev/stop-local.sh` + `scripts/dev/start-local.sh`. |
| `HTTP-frontier port 3109 must be free`              | Test frontier anterior colgado.                      | Detener el proceso manualmente tras verificar su PID. |
| `concurrent 'next dev' in $REPO_ROOT`               | Hay un `next dev` general corriendo sobre este repo. | Detener el proceso desde su terminal original. |
| `port held by a process outside SPABLA scope`       | Un proceso ajeno ocupa un puerto requerido.          | Investigar desde el contexto correspondiente; no operar desde estos scripts. |
