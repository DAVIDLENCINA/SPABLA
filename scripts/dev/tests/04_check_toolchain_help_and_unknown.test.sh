#!/usr/bin/env bash
# --help prints usage and exits 0; unknown flag exits 2.
set -eu -o pipefail

script="$SCRIPTS_DIR/check-toolchain.sh"

out="$("$script" --help 2>&1)" && rc=0 || rc=$?
[ "$rc" -eq 0 ] || { echo "FAIL --help exit=$rc"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q 'Usage: check-toolchain.sh' \
  || { echo "FAIL --help missing usage"; echo "$out"; exit 1; }

out="$("$script" --bogus 2>&1)" && rc=0 || rc=$?
[ "$rc" -eq 2 ] || { echo "FAIL unknown arg exit=$rc (expected 2)"; echo "$out"; exit 1; }

exit 0
