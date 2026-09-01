#!/usr/bin/env bash
# start-local.sh must abort with a nested-artifact error BEFORE calling
# `supabase start`. This test creates the nested artifact in a fake
# repo, copies the scripts and shims supabase so the test fails if it
# is invoked.
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null
mkdir -p "$FAKE_ROOT/supabase/supabase"
touch "$FAKE_ROOT/supabase/supabase/config.toml"
mkdir -p "$FAKE_ROOT/scripts/dev/lib"
cp "$SCRIPTS_DIR/lib/common.sh" "$FAKE_ROOT/scripts/dev/lib/common.sh"
cp "$SCRIPTS_DIR/check-toolchain.sh" "$FAKE_ROOT/scripts/dev/check-toolchain.sh"
cp "$SCRIPTS_DIR/start-local.sh" "$FAKE_ROOT/scripts/dev/start-local.sh"
chmod +x "$FAKE_ROOT/scripts/dev/check-toolchain.sh" \
         "$FAKE_ROOT/scripts/dev/start-local.sh"

bindir="$TEST_TMPDIR/bin"
mkdir -p "$bindir"
cat >"$bindir/supabase" <<'EOF'
#!/usr/bin/env bash
echo "TEST-FAIL: supabase invoked with $*" >&2
exit 99
EOF
chmod +x "$bindir/supabase"

export PATH="$bindir:$PATH"

out="$("$FAKE_ROOT/scripts/dev/start-local.sh" 2>&1)" && rc=0 || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q 'nested artifact' \
  || { echo "FAIL: missing 'nested artifact' in output"; echo "$out"; exit 1; }
if printf '%s\n' "$out" | grep -q 'TEST-FAIL: supabase invoked'; then
  echo "FAIL: supabase was invoked despite nested artifact"
  echo "$out"; exit 1
fi

exit 0
