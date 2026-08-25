#!/usr/bin/env bash
# SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q3 · Runner for the atomic
# onboarding browser barrier.
#
# Mirror of `scripts/e2e/run-auth-continuity.sh` — separate script so
# the two barriers can be maintained independently and run on
# distinct isolated ports. Boots:
#
#   1. Supabase local (idempotent — `supabase start`).
#   2. Migration chain (`--reset` in CI, skipped locally by default).
#   3. Waits for PostgREST readiness.
#   4. Starts `next dev` on `SPABLA_E2E_NEXT_PORT` (default 3121),
#      isolated from auth-continuity's 3111 to prevent port clashes
#      when both runners are invoked back-to-back on the same box.
#   5. Waits for Next dev readiness (any HTTP status ≠ 000).
#   6. Runs `npx playwright test e2e/onboarding.spec.ts --project chromium`.
#   7. Cleans up: kills Next, kills residual Chromium, releases port.
#
# Usage:
#   scripts/e2e/run-onboarding-e2e.sh [--reset]
#
# `--reset` triggers `scripts/ci/apply-migrations.sh` (used by Job E
# in CI). Locally the developer may omit it if migrations are already
# applied.

set -eu -o pipefail

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    *) echo "[run-onboarding-e2e] unknown flag: $arg" >&2; exit 2 ;;
  esac
done

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${_SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

E2E_NEXT_PORT="${SPABLA_E2E_NEXT_PORT:-3121}"
E2E_BASE_URL="http://127.0.0.1:${E2E_NEXT_PORT}"
NEXT_PID=""
NEXT_PGID=""
NEXT_LOG="$(mktemp -t spabla-e2e-onboarding-next.XXXXXX)"
CUSTODY_LOG="${SPABLA_E2E_CUSTODY_LOG:-$(mktemp -t spabla-e2e-onboarding-custody.XXXXXX)}"
SUPABASE_STARTED_BY_RUNNER=0  # Q3-R custody flag

log() { printf '[e2e-onboarding] %s\n' "$*" >&2; }

# Q3-R · Custody snapshot: containers, next dev processes, port
# usage. Called at start and end of the run. If the end snapshot
# diverges from the initial snapshot the runner logs a warning.
# When the runner started Supabase itself, the divergence is
# corrected in cleanup (`supabase stop`); when the developer had
# Supabase running before, the runner NEVER touches it.
_snapshot() {
  # `set -e -o pipefail` would abort the runner if any grep/lsof
  # returns 1 (which happens whenever the pattern is absent — a
  # legitimate outcome, not an error). Disable it locally.
  local tag="$1"
  set +e
  {
    echo "== custody snapshot [${tag}] =="
    echo "-- containers --"
    docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null | grep -E "spabla|supabase" | sort
    echo "-- next/playwright/chromium PIDs from this runner --"
    if [ -n "${NEXT_PID:-}" ]; then
      ps -p "${NEXT_PID}" -o pid,command 2>/dev/null | tail -n +2
    fi
    echo "-- port ${E2E_NEXT_PORT} --"
    if lsof -iTCP:"${E2E_NEXT_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      lsof -iTCP:"${E2E_NEXT_PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "BUSY", $1, "pid="$2}'
    else
      echo "port ${E2E_NEXT_PORT} free"
    fi
    echo ""
  } >> "${CUSTODY_LOG}"
  set -e
}

_cleanup() {
  local ec=$?
  set +e
  log "cleanup: tearing down Next dev and helpers"
  if [ -n "${NEXT_PID:-}" ]; then
    if [ -n "${NEXT_PGID:-}" ]; then
      kill -TERM -- -"${NEXT_PGID}" 2>/dev/null || true
      sleep 2
      kill -KILL -- -"${NEXT_PGID}" 2>/dev/null || true
    fi
    kill -TERM "${NEXT_PID}" 2>/dev/null || true
    sleep 1
    kill -KILL "${NEXT_PID}" 2>/dev/null || true
  fi
  pkill -f "chromium.*--remote-debugging" 2>/dev/null || true
  # Q3-R · Only tear down Supabase if the RUNNER started it. If the
  # developer had it running (or Job E started it earlier), leave
  # it alone — matches the initial custody state.
  if [ "${SUPABASE_STARTED_BY_RUNNER}" = "1" ]; then
    log "cleanup: stopping Supabase (runner started it)"
    supabase stop --no-backup 2>/dev/null || true
  else
    log "cleanup: leaving Supabase running (pre-existing before runner)"
  fi
  _snapshot "final"
  log "custody log: ${CUSTODY_LOG}"
  if [ -f "${NEXT_LOG}" ]; then rm -f "${NEXT_LOG}"; fi
  exit "$ec"
}
trap _cleanup EXIT INT TERM

command -v supabase >/dev/null || { echo "supabase CLI missing" >&2; exit 1; }
command -v npx       >/dev/null || { echo "npx missing" >&2; exit 1; }
command -v python3   >/dev/null || { echo "python3 missing" >&2; exit 1; }
command -v curl      >/dev/null || { echo "curl missing" >&2; exit 1; }
command -v lsof      >/dev/null || { echo "lsof missing" >&2; exit 1; }

# Q3-R · Record whether Supabase was already up BEFORE this runner
# invoked anything. Determines the cleanup policy at the end.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "_spabla-hito-8-2-local$"; then
  log "supabase local already up (custody: pre-existing, will NOT be stopped)"
  SUPABASE_STARTED_BY_RUNNER=0
else
  log "starting supabase local (custody: runner-owned, will be stopped in cleanup)"
  supabase start >/dev/null
  SUPABASE_STARTED_BY_RUNNER=1
fi
_snapshot "initial"

if [ "$RESET" -eq 1 ]; then
  log "applying migration chain via scripts/ci/apply-migrations.sh"
  bash "${REPO_ROOT}/scripts/ci/apply-migrations.sh"
else
  log "skipping db reset (--reset not passed)"
fi

log "extracting Supabase local env"
STATUS_JSON="$(supabase status -o json 2>/dev/null)"
SUPABASE_URL="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])')"
ANON_KEY="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ANON_KEY"])')"
SERVICE_KEY="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
PG_URL="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["DB_URL"])')"

log "waiting for PostgREST readiness"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "${SUPABASE_URL}/rest/v1/" -H "apikey: ${ANON_KEY}"; then
    break
  fi
  sleep 1
done

if lsof -i ":${E2E_NEXT_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[e2e-onboarding] port ${E2E_NEXT_PORT} already in use — aborting" >&2
  exit 1
fi

log "starting next dev on ${E2E_BASE_URL}"
if command -v setsid >/dev/null; then
  NODE_ENV=development \
  NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}" \
  NEXT_PUBLIC_SPABLA_E2E_HOOK=1 \
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
  NEXT_PUBLIC_SPABLA_E2E_HOOK=1 \
  SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}" \
  SPABLA_V2_ENABLE_DEV_SEED=0 \
    npx next dev -p "${E2E_NEXT_PORT}" -H 127.0.0.1 \
      >"${NEXT_LOG}" 2>&1 &
  NEXT_PID=$!
  NEXT_PGID=""
fi

log "waiting for next dev readiness at ${E2E_BASE_URL}"
READY=0
for _ in $(seq 1 90); do
  STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
             "${E2E_BASE_URL}/api/v2/bootstrap" 2>/dev/null || echo "000")"
  case "$STATUS" in
    2*|3*|4*) READY=1; break ;;
    *) : ;;
  esac
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "[e2e-onboarding] next dev never became ready within 90s" >&2
  echo "---- next log tail ----" >&2
  tail -60 "${NEXT_LOG}" >&2 || true
  exit 1
fi
log "next dev ready"

log "running Playwright (chromium, onboarding.spec.ts only)"
set +e
SPABLA_E2E_BASE_URL="${E2E_BASE_URL}" \
SPABLA_E2E_SUPABASE_URL="${SUPABASE_URL}" \
SPABLA_E2E_SUPABASE_ANON_KEY="${ANON_KEY}" \
SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}" \
SPABLA_E2E_PG_URL="${PG_URL}" \
SPABLA_E2E_NEXT_PORT="${E2E_NEXT_PORT}" \
SPABLA_E2E_REPO_ROOT="${REPO_ROOT}" \
  npx playwright test e2e/onboarding.spec.ts --project chromium
PLAYWRIGHT_EC=$?
set -e

log "Playwright finished with exit code ${PLAYWRIGHT_EC}"
exit "${PLAYWRIGHT_EC}"
