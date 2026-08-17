#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · Common helpers for dev scripts.
#
# Provides:
#   - REPO_ROOT resolution from any CWD;
#   - canonical project_id constants;
#   - logging helpers (never prints secrets);
#   - fail-fast helpers.
#
# Sourced by other scripts. Never invoked directly.

set -u

# ─── Colours (only when stdout is a TTY) ─────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  readonly _RESET=$'\033[0m'
  readonly _RED=$'\033[31m'
  readonly _GREEN=$'\033[32m'
  readonly _YELLOW=$'\033[33m'
  readonly _CYAN=$'\033[36m'
  readonly _BOLD=$'\033[1m'
else
  readonly _RESET=""
  readonly _RED=""
  readonly _GREEN=""
  readonly _YELLOW=""
  readonly _CYAN=""
  readonly _BOLD=""
fi

# ─── Canonical identifiers ──────────────────────────────────────
readonly SPABLA_PROJECT_ID="spabla-hito-8-2-local"
readonly SPABLA_TENANT_SCHEMA="spabla_v2"
readonly SPABLA_LOCAL_HOST="127.0.0.1"
readonly SPABLA_API_PORT="54321"
readonly SPABLA_DB_PORT="54322"
readonly SPABLA_STUDIO_PORT="54323"
readonly SPABLA_NEXT_PORT="3000"

# Productive project id (must never leak into local env). Kept as a
# constant so grep-based sanity checks can rely on a single source.
readonly SPABLA_PRODUCTIVE_PROJECT_ID="wztkxtgmuaegonlkukeh"

# ─── Repo-root resolution ───────────────────────────────────────
# Given the absolute path of a script inside the repo, compute the
# canonical REPO_ROOT (which contains `supabase/config.toml`,
# `package.json`, `scripts/ci/apply-migrations.sh`). Exits with non-zero
# if the resolved path is not a valid SPABLA repo root.
resolve_repo_root() {
  local script_path="$1"
  local dir
  dir="$(cd "$(dirname "$script_path")" && pwd)"
  # Walk up until we find the canonical anchors, up to 6 levels.
  local i=0
  while [ "$i" -lt 6 ]; do
    if [ -f "$dir/package.json" ] \
       && [ -f "$dir/supabase/config.toml" ] \
       && [ -f "$dir/scripts/ci/apply-migrations.sh" ]; then
      printf '%s' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
    i=$((i + 1))
  done
  return 1
}

# ─── Logging helpers ────────────────────────────────────────────
log_info() {
  printf '%s[info]%s %s\n' "${_CYAN}" "${_RESET}" "$*" >&2
}
log_ok() {
  printf '%s[ok]%s %s\n' "${_GREEN}" "${_RESET}" "$*" >&2
}
log_warn() {
  printf '%s[warn]%s %s\n' "${_YELLOW}" "${_RESET}" "$*" >&2
}
log_err() {
  printf '%s[err]%s %s\n' "${_RED}" "${_RESET}" "$*" >&2
}

# fail-fast wrapper that prints the expected value and a safe suggestion
# without echoing any secret value.
fail_fast() {
  local check="$1"
  local expected="$2"
  local suggestion="$3"
  log_err "check failed: ${_BOLD}${check}${_RESET}"
  log_err "  expected  : ${expected}"
  log_err "  suggestion: ${suggestion}"
  exit 1
}
