#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · HTTP-frontier test preflight.
#
# `app/api/v2/messages/route.http.integration.test.ts` spawns its own
# `next dev` on port 3109. Running a second `next dev` from the SAME
# repository directory (typically the developer's general dev server on
# port 3000) breaks the frontier test in Next 16.2.6: Turbopack detects
# a concurrent Next dev in the same project root and fails.
#
# This script blocks the frontier tests when the collision is present.
# It never kills the concurrent process; it only reports and exits with
# a non-zero status so the operator can stop it deliberately.
#
# Never:
#   - kills any process;
#   - removes .next;
#   - stops Supabase;
#   - stops, kills or inspects any process outside SPABLA scope.
#
# Governance: Plan Hito 9.2.5 V1.1 §5-bis (TEST-RUNNER-ISOLATION), §11.

set -eu -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
. "$_SCRIPT_DIR/lib/common.sh"

FRONTIER_PORT="${SPABLA_TEST_NEXT_PORT:-3109}"

REPO_ROOT="$(resolve_repo_root "${BASH_SOURCE[0]}")" || {
  log_err "not inside a valid SPABLA repo"
  exit 1
}

# 1. Frontier port must be free.
if lsof -i ":$FRONTIER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  holder="$(lsof -i ":$FRONTIER_PORT" -sTCP:LISTEN -Fpc 2>/dev/null | awk '/^p/{p=substr($0,2)} /^c/{c=substr($0,2)} END{print p " " c}')"
  fail_fast "HTTP-frontier port $FRONTIER_PORT" \
    "must be free" \
    "Stop the process holding port $FRONTIER_PORT (PID: $holder). Do NOT kill it blindly; verify ownership first."
fi

# 2. Detect an already-running Next dev spawned from THIS repository.
# We match against processes whose command line references `next dev`
# and whose CWD (or a resolvable ancestor) matches REPO_ROOT.
if command -v pgrep >/dev/null 2>&1; then
  # -f: full command line; -l: also print command; ignore self.
  next_pids="$(pgrep -f 'next(-server)?( |$)|node .*next(-|/)dev' 2>/dev/null || true)"
  colliding=""
  for pid in $next_pids; do
    [ "$pid" = "$$" ] && continue
    if command -v lsof >/dev/null 2>&1; then
      cwd="$(lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}')"
      # A next dev living inside our repo (or exactly at it) is a
      # collision.
      case "$cwd" in
        "$REPO_ROOT"|"$REPO_ROOT"/*)
          colliding="$colliding $pid"
          ;;
      esac
    fi
  done
  if [ -n "$colliding" ]; then
    fail_fast "concurrent 'next dev' in $REPO_ROOT" \
      "no Next dev process running from this repo" \
      "Stop those processes yourself (PIDs:$colliding). The HTTP-frontier test cannot run alongside them (Next 16.2.6 collision)."
  fi
fi

# 3. Port 3000 free (soft warning): a Next dev on 3000 is allowed only
# if it is NOT rooted in this repo (step 2 already exits on that case).
if lsof -i ":${SPABLA_NEXT_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  log_warn "port $SPABLA_NEXT_PORT is held (not rooted in this repo). Frontier test uses port $FRONTIER_PORT so this is tolerated."
fi

# 4. Supabase local stack must be up: the frontier test needs API +
# service role to seed fixtures and authenticate.
if ! docker ps --format '{{.Names}}' | grep -qE "_${SPABLA_PROJECT_ID}$"; then
  fail_fast "Supabase local stack" \
    "at least one container supabase_*_${SPABLA_PROJECT_ID}" \
    "Run scripts/dev/start-local.sh first."
fi

log_ok "HTTP-frontier preconditions satisfied (port $FRONTIER_PORT free, no colliding Next dev, Supabase up)"
