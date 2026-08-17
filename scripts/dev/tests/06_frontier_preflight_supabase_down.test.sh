#!/usr/bin/env bash
# check-http-frontier-preconditions.sh must fail when the Supabase
# local stack is down (no containers).
set -eu -o pipefail

bindir="$TEST_TMPDIR/bin"
mkdir -p "$bindir"

# Shim docker: no containers.
cat >"$bindir/docker" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  ps) echo "" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$bindir/docker"

# Shim lsof: nothing bound.
cat >"$bindir/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$bindir/lsof"

# Shim pgrep: no processes.
cat >"$bindir/pgrep" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$bindir/pgrep"

export PATH="$bindir:$PATH"

out="$("$SCRIPTS_DIR/check-http-frontier-preconditions.sh" 2>&1)" && rc=0 || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q 'Supabase local stack' \
  || { echo "FAIL: missing 'Supabase local stack' error"; echo "$out"; exit 1; }

exit 0
