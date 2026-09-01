#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · Canonical local Supabase bootstrap.
#
# Runs `supabase start` from the correct REPO_ROOT (never with
# `--workdir supabase`), then applies fail-fast checks on the live
# stack:
#   - project_id efectivo = spabla-hito-8-2-local;
#   - API URL host = 127.0.0.1;
#   - DB URL host = 127.0.0.1;
#   - container names carry the spabla-hito-8-2-local suffix;
#   - PGRST_DB_SCHEMAS includes spabla_v2;
#   - no supabase/supabase/ artifact appeared.
#
# On post-start check failure the script stops the SPABLA stack we just
# started (preserving data) and exits with non-zero.
#
# Never:
#   - executes db reset;
#   - seeds fixtures;
#   - launches Next;
#   - runs tests;
#   - calls OpenAI;
#   - stops, kills or inspects any process outside SPABLA scope;
#   - uses --no-backup, --all or destructive docker commands.
#
# Governance: Plan Hito 9.2.5 V1.1 §5, §10, §11.

set -eu -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
. "$_SCRIPT_DIR/lib/common.sh"

# ─── 1. Preflight ──────────────────────────────────────────────────
REPO_ROOT="$(resolve_repo_root "${BASH_SOURCE[0]}")" || {
  log_err "not inside a valid SPABLA repo"
  exit 1
}
# Preflight uses --report so hard failures (repo root, config, nested
# artifact, productive env leak, Node major, Docker, utilities) still
# abort, but a local Supabase CLI patch drift versus the CI pin surfaces
# as a warning. CI runs check-toolchain.sh in strict mode separately.
log_info "preflight: check-toolchain.sh --report"
"$_SCRIPT_DIR/check-toolchain.sh" --report

cd "$REPO_ROOT"

# ─── 2. Nested artifact must not exist BEFORE start ────────────────
if [ -d "$REPO_ROOT/supabase/supabase" ]; then
  fail_fast "nested supabase/supabase/ exists BEFORE start" \
    "must not exist" \
    "Remove manually after inspection: rm -rf $REPO_ROOT/supabase/supabase"
fi

# ─── 3. If SPABLA is already running, exit idempotently. Otherwise
# every required port must be free before we invoke supabase start.
# This keeps the script safe when a process outside SPABLA scope holds
# any of the ports we need. We never inspect nor mutate that process.
_spabla_already_up() {
  docker ps --format '{{.Names}}' 2>/dev/null \
    | grep -qE "_${SPABLA_PROJECT_ID}$"
}
if _spabla_already_up; then
  log_ok "SPABLA stack already running (project=$SPABLA_PROJECT_ID); skipping start"
else
  for port_name in "SUPABASE_API_PORT $SPABLA_API_PORT" \
                   "SUPABASE_DB_PORT $SPABLA_DB_PORT" \
                   "SUPABASE_STUDIO_PORT $SPABLA_STUDIO_PORT"; do
    set -- $port_name
    label="$1"
    port="$2"
    if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      fail_fast "$label ($port) held by a process outside SPABLA scope" \
        "port must be free before 'supabase start'" \
        "Stop the holder yourself; these scripts never touch external processes."
    fi
  done
fi

# ─── 4. supabase start (no --workdir; CWD is REPO_ROOT) ────────────
log_info "supabase start (workdir=$REPO_ROOT)"
supabase start >/dev/null

# ─── 5. Post-start fail-fast checks ────────────────────────────────
_teardown_on_failure() {
  log_err "post-start check failed; stopping SPABLA stack (preserving data)"
  # Prefer targeted stop; never --no-backup, never --all.
  supabase stop --project-id "$SPABLA_PROJECT_ID" >/dev/null 2>&1 || true
  exit 1
}
trap _teardown_on_failure ERR

STATUS_JSON="$(supabase status -o json 2>/dev/null)"
API_URL="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])')"
DB_URL="$(printf '%s' "$STATUS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["DB_URL"])')"

# 5.1 host checks
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) : ;;
  *) fail_fast "API_URL host" "127.0.0.1 or localhost" "Verify Supabase local stack (unexpected host)" ;;
esac
case "$DB_URL" in
  postgresql://*127.0.0.1*|postgresql://*localhost*) : ;;
  *) fail_fast "DB_URL host" "127.0.0.1 or localhost" "Verify Supabase local stack (unexpected DB URL)" ;;
esac
log_ok "endpoints on local host"

# 5.2 container names carry the project_id suffix
CONTAINERS="$(docker ps --format '{{.Names}}' | grep -E "_${SPABLA_PROJECT_ID}$" | sort)"
if [ -z "$CONTAINERS" ]; then
  fail_fast "spabla containers" \
    "at least one container named supabase_*_${SPABLA_PROJECT_ID}" \
    "Supabase start may have used a different project id; verify supabase/config.toml"
fi
log_ok "containers carry ${SPABLA_PROJECT_ID} suffix"

# 5.3 PostgREST exposes spabla_v2
POSTGREST_ENV="$(docker exec "supabase_rest_${SPABLA_PROJECT_ID}" env 2>/dev/null | grep '^PGRST_DB_SCHEMAS=' || true)"
case "$POSTGREST_ENV" in
  *"$SPABLA_TENANT_SCHEMA"*) : ;;
  *) fail_fast "PGRST_DB_SCHEMAS in postgrest container" \
       "must include ${SPABLA_TENANT_SCHEMA}" \
       "Restart supabase from the correct REPO_ROOT (never with --workdir supabase)" ;;
esac
log_ok "PostgREST exposes ${SPABLA_TENANT_SCHEMA}"

# 5.4 Nested artifact must not have been created by the start command
if [ -d "$REPO_ROOT/supabase/supabase" ]; then
  fail_fast "supabase/supabase/ appeared after start" \
    "must not exist" \
    "Wrong workdir was used somewhere; inspect and remove manually"
fi
log_ok "no nested supabase/supabase/ artifact"

trap - ERR
log_ok "supabase local stack ready (project=$SPABLA_PROJECT_ID)"
