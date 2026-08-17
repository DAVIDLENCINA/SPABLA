#!/usr/bin/env bash
# Verifies that check-toolchain.sh fails when supabase/supabase/ exists.
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null
mkdir -p "$FAKE_ROOT/supabase/supabase"
touch "$FAKE_ROOT/supabase/supabase/config.toml"

# Copy scripts/dev/ into the fake repo so the resolver detects it there.
mkdir -p "$FAKE_ROOT/scripts/dev/lib"
cp "$SCRIPTS_DIR/lib/common.sh" "$FAKE_ROOT/scripts/dev/lib/common.sh"
cp "$SCRIPTS_DIR/check-toolchain.sh" "$FAKE_ROOT/scripts/dev/check-toolchain.sh"
chmod +x "$FAKE_ROOT/scripts/dev/check-toolchain.sh"

output="$("$FAKE_ROOT/scripts/dev/check-toolchain.sh" 2>&1)" && rc=0 || rc=$?

[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$output"; exit 1; }
printf '%s\n' "$output" | grep -q 'nested artifact' \
  || { echo "FAIL: missing 'nested artifact' in output"; echo "$output"; exit 1; }

exit 0
