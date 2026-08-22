#!/usr/bin/env bash
# SPABLA V2 · Hito 9.3.1-Q3-E2E · Runner canónico de la barrera
# experimental de continuidad de sesión (13 escenarios de Q2 §20).
#
# Orquesta:
#   1. Precondiciones (repo root, herramientas, .env).
#   2. Supabase local vía scripts/dev/start-local.sh (idempotente).
#   3. Cadena de migraciones vía scripts/ci/apply-migrations.sh.
#   4. Espera de salud real de PostgREST (200 en /rest/v1/).
#   5. `next dev` en puerto E2E aislado (por defecto 3111).
#   6. Espera de salud HTTP de Next (GET /api/v2/bootstrap responde).
#   7. Ejecución de Playwright (Chromium only).
#   8. Cleanup en trap: kill Next, kill Playwright, kill Chromium,
#      supabase stop, liberación de puertos.
#
# Devuelve el exit code de Playwright. NO ejecuta `supabase db reset`
# a menos que se pase --reset (para no reventar fixtures manuales del
# desarrollador). En CI Job D siempre se pasa --reset.
#
# Uso:
#   scripts/e2e/run-auth-continuity.sh [--reset]
#
# Gobernanza: orden operativa Hito 9.3.1-Q3-E2E §FASE 3.

set -eu -o pipefail

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    *) echo "[run-auth-continuity] unknown flag: $arg" >&2; exit 2 ;;
  esac
done

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${_SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

E2E_NEXT_PORT="${SPABLA_E2E_NEXT_PORT:-3111}"
E2E_BASE_URL="http://127.0.0.1:${E2E_NEXT_PORT}"
NEXT_PID=""
NEXT_PGID=""
NEXT_LOG="$(mktemp -t spabla-e2e-next.XXXXXX)"

log() { printf '[e2e] %s\n' "$*" >&2; }

_cleanup() {
  local ec=$?
  set +e
  log "cleanup: tearing down Next dev and helpers"
  if [ -n "${NEXT_PID:-}" ]; then
    # Prefer group kill (turbopack workers) then fallback to pid.
    if [ -n "${NEXT_PGID:-}" ]; then
      kill -TERM -- -"${NEXT_PGID}" 2>/dev/null || true
      sleep 2
      kill -KILL -- -"${NEXT_PGID}" 2>/dev/null || true
    fi
    kill -TERM "${NEXT_PID}" 2>/dev/null || true
    sleep 1
    kill -KILL "${NEXT_PID}" 2>/dev/null || true
  fi
  # Kill any residual Chromium child from Playwright (belt and braces).
  pkill -f "chromium.*--remote-debugging" 2>/dev/null || true
  # DO NOT stop Supabase local — the developer may have started it
  # manually. CI Job D wraps this script with its own supabase stop.
  if [ -f "${NEXT_LOG}" ]; then rm -f "${NEXT_LOG}"; fi
  exit "$ec"
}
trap _cleanup EXIT INT TERM

# ─── 1. Precondiciones básicas ─────────────────────────────────────
command -v supabase >/dev/null || { echo "supabase CLI missing" >&2; exit 1; }
command -v npx       >/dev/null || { echo "npx missing" >&2; exit 1; }
command -v python3   >/dev/null || { echo "python3 missing" >&2; exit 1; }
command -v curl      >/dev/null || { echo "curl missing" >&2; exit 1; }
command -v lsof      >/dev/null || { echo "lsof missing" >&2; exit 1; }

# ─── 2. Arranque Supabase local (idempotente) ──────────────────────
# En CI arrancamos crudo con `supabase start` (mismo patrón que
# Jobs B/C). Evitamos `scripts/dev/start-local.sh` en este runner
# porque su post-start check exige que PostgREST ya exponga el
# schema `spabla_v2` — que no existe hasta aplicar migraciones. En
# local, si Supabase ya está corriendo, `supabase start` es
# idempotente.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "_spabla-hito-8-2-local$"; then
  log "supabase local already up (skipping start)"
else
  log "starting supabase local (supabase start)"
  supabase start >/dev/null
fi

# ─── 3. Migraciones ────────────────────────────────────────────────
if [ "$RESET" -eq 1 ]; then
  log "applying migration chain (supabase db reset --local)"
  bash "${REPO_ROOT}/scripts/ci/apply-migrations.sh"
else
  log "skipping db reset (--reset not passed); assuming migrations already applied"
fi

# ─── 4. Extraer env local ──────────────────────────────────────────
log "extracting Supabase local env"
STATUS_JSON="$(supabase status -o json 2>/dev/null)"
SUPABASE_URL="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])')"
ANON_KEY="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ANON_KEY"])')"
SERVICE_KEY="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"

# ─── 5. Salud de PostgREST ─────────────────────────────────────────
log "waiting for PostgREST readiness"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "${SUPABASE_URL}/rest/v1/" -H "apikey: ${ANON_KEY}"; then
    break
  fi
  sleep 1
done

# ─── 6. Puerto Next libre ──────────────────────────────────────────
if lsof -i ":${E2E_NEXT_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[e2e] port ${E2E_NEXT_PORT} already in use — aborting" >&2
  exit 1
fi

# ─── 7. Arranque Next dev en puerto aislado ────────────────────────
log "starting next dev on ${E2E_BASE_URL}"
# `setsid` crea un nuevo process group para poder matar el árbol
# completo (turbopack worker incluido) en el trap. En macOS
# `setsid` puede no estar disponible; ahí `nohup` + `set -m` sirve
# de fallback aceptable.
if command -v setsid >/dev/null; then
  NODE_ENV=development \
  NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}" \
  SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}" \
  SPABLA_V2_ENABLE_DEV_SEED=0 \
    setsid npx next dev -p "${E2E_NEXT_PORT}" -H 127.0.0.1 \
      >"${NEXT_LOG}" 2>&1 &
  NEXT_PID=$!
  NEXT_PGID="${NEXT_PID}"
else
  NODE_ENV=development \
  NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}" \
  SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}" \
  SPABLA_V2_ENABLE_DEV_SEED=0 \
    npx next dev -p "${E2E_NEXT_PORT}" -H 127.0.0.1 \
      >"${NEXT_LOG}" 2>&1 &
  NEXT_PID=$!
  # Best-effort: on shells without setsid the child stays in our pgid.
  NEXT_PGID=""
fi

# ─── 8. Salud de Next ──────────────────────────────────────────────
log "waiting for next dev readiness at ${E2E_BASE_URL}"
READY=0
for _ in $(seq 1 90); do
  # No usar `-f`: 401 sin token es una respuesta LEGÍTIMA del handler
  # y prueba que Next terminó de compilar. Miramos el status con -w
  # y aceptamos cualquier 2xx/3xx/4xx (Next está sirviendo).
  STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
             "${E2E_BASE_URL}/api/v2/bootstrap" 2>/dev/null || echo "000")"
  case "$STATUS" in
    2*|3*|4*) READY=1; break ;;
    *) : ;;
  esac
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "[e2e] next dev never became ready within 90s" >&2
  echo "---- next log tail ----" >&2
  tail -60 "${NEXT_LOG}" >&2 || true
  exit 1
fi
log "next dev ready"

# ─── 9. Ejecutar Playwright ────────────────────────────────────────
log "running Playwright (chromium)"
set +e
SPABLA_E2E_BASE_URL="${E2E_BASE_URL}" \
SPABLA_E2E_SUPABASE_URL="${SUPABASE_URL}" \
SPABLA_E2E_SUPABASE_ANON_KEY="${ANON_KEY}" \
SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}" \
  npx playwright test --project chromium
PLAYWRIGHT_EC=$?
set -e

log "Playwright finished with exit code ${PLAYWRIGHT_EC}"
exit "${PLAYWRIGHT_EC}"
