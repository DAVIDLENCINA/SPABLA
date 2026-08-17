#!/usr/bin/env bash
# SPABLA V2 · Hito 9.2.5-A · Test runner for scripts/dev/.
#
# Discovers every executable *.test.sh sibling and runs it in isolation.
# A test is considered passing if it exits with status 0. Any non-zero
# status marks the whole run as failed.
#
# Each test receives:
#   TEST_TMPDIR — a per-test temp directory (auto-created, auto-removed);
#   FIXTURES_DIR — path to test fixture helpers;
#   SCRIPTS_DIR — path to scripts/dev/ (the scripts under test).
#
# The runner does not require jq, python or docker. Individual tests may.

set -eu -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$_SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$_SCRIPT_DIR/fixtures"
export SCRIPTS_DIR FIXTURES_DIR

PASS=0
FAIL=0
FAILED_NAMES=""

for test in "$_SCRIPT_DIR"/*.test.sh; do
  [ -e "$test" ] || continue
  name="$(basename "$test")"
  tmp="$(mktemp -d -t "spabla-devtest-${name%.test.sh}-XXXXXX")"
  # Use env -i for a clean environment, then re-export what we need.
  if TEST_TMPDIR="$tmp" \
     SCRIPTS_DIR="$SCRIPTS_DIR" \
     FIXTURES_DIR="$FIXTURES_DIR" \
     HOME="${HOME:-/tmp}" \
     PATH="$PATH" \
     bash "$test" >"$tmp/stdout" 2>"$tmp/stderr"; then
    printf '[pass] %s\n' "$name"
    PASS=$((PASS + 1))
  else
    status=$?
    printf '[FAIL] %s (exit=%d)\n' "$name" "$status"
    printf '       stdout:\n'
    sed 's/^/         /' "$tmp/stdout" || true
    printf '       stderr:\n'
    sed 's/^/         /' "$tmp/stderr" || true
    FAIL=$((FAIL + 1))
    FAILED_NAMES="$FAILED_NAMES $name"
  fi
  rm -rf "$tmp"
done

printf '\nSummary: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%s\n' "$FAILED_NAMES"
  exit 1
fi
exit 0
