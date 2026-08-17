#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · Safe local Supabase shutdown.
#
# Stops the SPABLA local stack (project_id=spabla-hito-8-2-local)
# preserving all data volumes. Operates exclusively on the canonical
# SPABLA project id and never runs destructive docker commands.
#
# --no-backup is explicitly rejected: attempting to pass it exits with
# a non-zero status without touching Supabase.
#
# Never:
#   - uses --no-backup;
#   - uses --all;
#   - runs docker rm, docker volume rm, docker system prune;
#   - runs supabase db reset;
#   - stops, kills or inspects any process outside SPABLA scope.
#
# Governance: Plan Hito 9.2.5 V1.1 §5, §10, §11.

set -eu -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
. "$_SCRIPT_DIR/lib/common.sh"

for arg in "$@"; do
  case "$arg" in
    --no-backup|--all)
      log_err "flag '$arg' is prohibited by SPABLA V2 policy (Plan 9.2.5 V1.1 §11)"
      exit 1
      ;;
    --help|-h)
      cat <<EOF
Usage: stop-local.sh
Stops the SPABLA local Supabase stack ($SPABLA_PROJECT_ID) preserving
data volumes. No flags are accepted. Only the SPABLA project id is
targeted; processes outside SPABLA scope are never touched.
EOF
      exit 0
      ;;
    *)
      log_err "unknown arg: $arg"
      exit 2
      ;;
  esac
done

REPO_ROOT="$(resolve_repo_root "${BASH_SOURCE[0]}")" || {
  log_err "not inside a valid SPABLA repo"
  exit 1
}

# Attempt to stop only the SPABLA project. `supabase stop` without
# --no-backup preserves data by default in CLI 2.110.0 / 2.113.0.
cd "$REPO_ROOT"
if ! supabase stop --project-id "$SPABLA_PROJECT_ID" >/dev/null 2>&1; then
  # If the project is not running the CLI still exits 0 in current
  # versions; a real failure here is worth reporting but not fatal for
  # idempotency.
  log_warn "supabase stop returned non-zero (project may already be stopped)"
fi

# Verify no SPABLA containers remain running. We match strictly on the
# canonical project id suffix so no unrelated container is examined.
SPABLA_STILL_UP="$(docker ps --format '{{.Names}}' | grep "_${SPABLA_PROJECT_ID}$" || true)"
if [ -n "$SPABLA_STILL_UP" ]; then
  log_warn "SPABLA containers still running after stop:"
  printf '  %s\n' $SPABLA_STILL_UP
  exit 1
fi

log_ok "SPABLA stack stopped (project=$SPABLA_PROJECT_ID), data preserved"
