#!/usr/bin/env bash
# Verifies that check-toolchain.sh fails when a productive Supabase URL
# leaks into the environment (never printing the value itself).
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null
mkdir -p "$FAKE_ROOT/scripts/dev/lib"
cp "$SCRIPTS_DIR/lib/common.sh" "$FAKE_ROOT/scripts/dev/lib/common.sh"
cp "$SCRIPTS_DIR/check-toolchain.sh" "$FAKE_ROOT/scripts/dev/check-toolchain.sh"
chmod +x "$FAKE_ROOT/scripts/dev/check-toolchain.sh"

# Fabricate a URL that mentions the productive project id.
export NEXT_PUBLIC_SUPABASE_URL="https://wztkxtgmuaegonlkukeh.supabase.co"

output="$("$FAKE_ROOT/scripts/dev/check-toolchain.sh" 2>&1)" && rc=0 || rc=$?

[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$output"; exit 1; }
printf '%s\n' "$output" | grep -q "NEXT_PUBLIC_SUPABASE_URL' points to productive project" \
  || { echo "FAIL: missing productive-project error message"; echo "$output"; exit 1; }
# Must NOT echo the leaked URL value.
if printf '%s\n' "$output" | grep -q "wztkxtgmuaegonlkukeh"; then
  # It's fine to mention the id in the check name (fixed constant); we
  # forbid printing the ENV VALUE. As a proxy, ensure the full URL is
  # not present (protocol + host).
  if printf '%s\n' "$output" | grep -q "https://wztkxtgmuaegonlkukeh.supabase.co"; then
    echo "FAIL: script echoed the productive URL value"
    echo "$output"
    exit 1
  fi
fi

exit 0
