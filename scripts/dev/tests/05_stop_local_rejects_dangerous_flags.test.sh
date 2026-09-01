#!/usr/bin/env bash
# stop-local.sh must reject --no-backup and --all with exit 1 and MUST
# NOT execute supabase.
set -eu -o pipefail

script="$SCRIPTS_DIR/stop-local.sh"

# Install a shim 'supabase' that would fail the test if invoked.
bindir="$TEST_TMPDIR/bin"
mkdir -p "$bindir"
cat >"$bindir/supabase" <<'EOF'
#!/usr/bin/env bash
echo "TEST-FAIL: supabase invoked with $*" >&2
exit 99
EOF
chmod +x "$bindir/supabase"
export PATH="$bindir:$PATH"

for bad in --no-backup --all; do
  out="$("$script" "$bad" 2>&1)" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || { echo "FAIL $bad exit=$rc"; echo "$out"; exit 1; }
  printf '%s\n' "$out" | grep -q "prohibited" \
    || { echo "FAIL $bad missing 'prohibited'"; echo "$out"; exit 1; }
  # Ensure supabase shim was NEVER called.
  if printf '%s\n' "$out" | grep -q 'TEST-FAIL: supabase invoked'; then
    echo "FAIL $bad: supabase was invoked"; echo "$out"; exit 1
  fi
done

# --help exits 0 without invoking supabase.
out="$("$script" --help 2>&1)" && rc=0 || rc=$?
[ "$rc" -eq 0 ] || { echo "FAIL --help exit=$rc"; echo "$out"; exit 1; }

# Unknown flag exits 2.
out="$("$script" --nonsense 2>&1)" && rc=0 || rc=$?
[ "$rc" -eq 2 ] || { echo "FAIL --nonsense exit=$rc"; echo "$out"; exit 1; }

exit 0
