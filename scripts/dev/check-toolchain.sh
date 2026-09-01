#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · Toolchain and workdir fail-fast checks.
#
# Read-only: prints diagnostics, never mutates the filesystem, Docker or
# any Supabase project. Exits 0 when every check passes, 1 on the first
# failure. Errors identify the failing check, the expected value and a
# safe corrective suggestion; secret values are never printed.
#
# Usage:
#   scripts/dev/check-toolchain.sh              # full check
#   scripts/dev/check-toolchain.sh --strict     # (default) exit on first mismatch
#   scripts/dev/check-toolchain.sh --report     # continue past soft warnings
#
# Governance: Plan Hito 9.2.5 V1.1 §5, §5-bis, §7, §10, §11.

set -eu -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
. "$_SCRIPT_DIR/lib/common.sh"

MODE="strict"
for arg in "$@"; do
  case "$arg" in
    --strict) MODE="strict" ;;
    --report) MODE="report" ;;
    --help|-h)
      cat <<EOF
Usage: check-toolchain.sh [--strict|--report]
Verifies local SPABLA V2 toolchain and workdir preconditions.
  --strict  (default) exit 1 on the first failure.
  --report  continue past soft warnings; still exit 1 on hard failures.
EOF
      exit 0
      ;;
    *)
      log_err "unknown arg: $arg"
      exit 2
      ;;
  esac
done

# ─── 1. Repo root resolution ───────────────────────────────────────
REPO_ROOT="$(resolve_repo_root "${BASH_SOURCE[0]}")" || {
  fail_fast "repo root anchors present" \
    "package.json + supabase/config.toml + scripts/ci/apply-migrations.sh in a common ancestor" \
    "Run this script from a valid SPABLA V2 clone."
}
log_ok "repo root = $REPO_ROOT"

# ─── 2. Canonical files present ────────────────────────────────────
for rel in package.json supabase/config.toml scripts/ci/apply-migrations.sh package-lock.json; do
  [ -f "$REPO_ROOT/$rel" ] || fail_fast "canonical file '$rel'" \
    "exists at repo root" \
    "Restore the file from git or clone a fresh copy."
done
log_ok "canonical files present"

# ─── 3. Config project_id matches the canonical constant ───────────
CONFIG_PROJECT_ID="$(awk -F'=' '/^project_id[[:space:]]*=/ {gsub(/[[:space:]]|\"/,"",$2); print $2; exit}' "$REPO_ROOT/supabase/config.toml")"
[ "$CONFIG_PROJECT_ID" = "$SPABLA_PROJECT_ID" ] || fail_fast \
  "supabase/config.toml project_id" \
  "$SPABLA_PROJECT_ID" \
  "Do not edit config.toml. If it changed, coordinate with Dirección."
log_ok "config.toml project_id = $CONFIG_PROJECT_ID"

# ─── 4. Config declares spabla_v2 in [api].schemas ─────────────────
grep -qE '^schemas[[:space:]]*=.*"spabla_v2"' "$REPO_ROOT/supabase/config.toml" \
  || fail_fast "config.toml [api].schemas" \
     "must include \"spabla_v2\"" \
     "Do not edit config.toml. Restore from git."
log_ok "config.toml [api].schemas includes spabla_v2"

# ─── 5. Nested supabase/supabase/ artifact must NOT exist ──────────
if [ -d "$REPO_ROOT/supabase/supabase" ]; then
  fail_fast "nested artifact supabase/supabase/" \
    "must not exist (created only when 'supabase --workdir supabase start' runs from repo root)" \
    "Remove manually after verifying it holds no unsaved data: rm -rf $REPO_ROOT/supabase/supabase"
fi
log_ok "no nested supabase/supabase/ artifact"

# ─── 5-bis. Productive env vars must NOT leak locally ──────────────
# Run early: safety-critical, independent of toolchain versions.
for var in NEXT_PUBLIC_SUPABASE_URL SUPABASE_URL SPABLA_TEST_SUPABASE_URL \
           SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  val="${!var-}"
  if [ -n "$val" ] && printf '%s' "$val" | grep -q "$SPABLA_PRODUCTIVE_PROJECT_ID"; then
    fail_fast "env var '$var' points to productive project" \
      "unset or 127.0.0.1:$SPABLA_API_PORT (local)" \
      "unset $var (or export a local Supabase URL)."
  fi
done
log_ok "no productive Supabase URL/key in env"

# ─── 6. Node.js major version ──────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  fail_fast "node executable" "node 24 in PATH" \
    "Install Node 24 (see docs/standards/SPABLA_V2_TOOLCHAIN.md; do NOT run brew uninstall)."
fi
NODE_VER="$(node --version 2>/dev/null || true)"
NODE_MAJOR="${NODE_VER#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "$NODE_MAJOR" != "24" ]; then
  if [ "$MODE" = "report" ]; then
    log_warn "node version = $NODE_VER (expected v24.x)"
  else
    fail_fast "node major version" "v24.x (canonical toolchain)" \
      "Switch to Node 24 via mise/asdf/nvm without altering system-wide tools outside SPABLA scope."
  fi
else
  log_ok "node = $NODE_VER"
fi

# ─── 7. Supabase CLI version ───────────────────────────────────────
if ! command -v supabase >/dev/null 2>&1; then
  fail_fast "supabase executable" "supabase 2.110.0 in PATH" \
    "Install Supabase CLI 2.110.0 (see docs/standards/SPABLA_V2_TOOLCHAIN.md; do NOT brew uninstall)."
fi
SUPA_VER="$(supabase --version 2>/dev/null | tr -d '[:space:]')"
if [ "$SUPA_VER" != "2.110.0" ]; then
  if [ "$MODE" = "report" ]; then
    log_warn "supabase CLI = $SUPA_VER (canonical 2.110.0; --report tolerates)"
  else
    fail_fast "supabase CLI version" "2.110.0 (canonical, matches CI)" \
      "Install 2.110.0 in a repo-local or user-local path (see docs/standards/SPABLA_V2_TOOLCHAIN.md)."
  fi
else
  log_ok "supabase CLI = $SUPA_VER"
fi

# ─── 8. Docker availability ────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  fail_fast "docker executable" "docker in PATH (>= 24)" \
    "Install Docker Desktop or docker CLI (see docs/standards/SPABLA_V2_TOOLCHAIN.md)."
fi
if ! docker info >/dev/null 2>&1; then
  fail_fast "docker daemon" "running and reachable" \
    "Start Docker Desktop (or dockerd)."
fi
log_ok "docker daemon reachable"

# ─── 9. Utility helpers ────────────────────────────────────────────
for util in jq python3 curl awk grep sed lsof; do
  command -v "$util" >/dev/null 2>&1 || fail_fast "utility '$util'" \
    "present in PATH" \
    "Install $util (macOS 'brew install $util'; do not remove other tools)."
done
log_ok "utility helpers present"

# ─── 10. (moved earlier — see §5-bis) ──────────────────────────────

# ─── 11. OPENAI_API_KEY sanity check (must be empty for tests) ─────
# Only warn: some workflows legitimately keep the key set for the Next
# process launched later. The stronger guarantee lives in start-local.sh
# / the test runner.
if [ -z "${OPENAI_API_KEY-}" ]; then
  log_ok "OPENAI_API_KEY unset or empty (safe for tests)"
else
  _openai_val="${OPENAI_API_KEY}"
  _openai_len=${#_openai_val}
  log_warn "OPENAI_API_KEY is set (length=$_openai_len). Ensure test/next processes override it with OPENAI_API_KEY=\"\"."
  unset _openai_val _openai_len
fi

# ─── 12. Port occupancy by unknown processes ───────────────────────
# We do NOT kill anything and we do NOT identify the owner beyond a
# PID. If a required port is held, we surface it as a generic warning:
# any action on that process is out of scope for this repository.
for port_name in "NEXT_PORT $SPABLA_NEXT_PORT" \
                 "SUPABASE_API_PORT $SPABLA_API_PORT" \
                 "SUPABASE_DB_PORT $SPABLA_DB_PORT" \
                 "SUPABASE_STUDIO_PORT $SPABLA_STUDIO_PORT"; do
  set -- $port_name
  label="$1"
  port="$2"
  if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    holder_pid="$(lsof -i ":$port" -sTCP:LISTEN -Fp 2>/dev/null | awk '/^p/{print substr($0,2); exit}')"
    log_warn "$label ($port) held by PID ${holder_pid:-unknown} (process outside SPABLA scope; do not stop from these scripts)"
  fi
done

log_ok "check-toolchain complete"
exit 0
