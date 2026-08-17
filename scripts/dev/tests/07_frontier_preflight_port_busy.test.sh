#!/usr/bin/env bash
# check-http-frontier-preconditions.sh must fail when port 3109 is
# already bound.
set -eu -o pipefail

bindir="$TEST_TMPDIR/bin"
mkdir -p "$bindir"

# Shim lsof: pretend port 3109 is bound.
cat >"$bindir/lsof" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *:3109*)
    if printf '%s' "$*" | grep -q '\-F'; then
      printf 'p12345\ncnode\n'
    fi
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$bindir/lsof"

# Shim docker: pretend Supabase is up.
cat >"$bindir/docker" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  ps) echo "supabase_kong_spabla-hito-8-2-local" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$bindir/docker"

# Shim pgrep: no processes.
cat >"$bindir/pgrep" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$bindir/pgrep"

export PATH="$bindir:$PATH"

out="$("$SCRIPTS_DIR/check-http-frontier-preconditions.sh" 2>&1)" && rc=0 || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q 'HTTP-frontier port 3109' \
  || { echo "FAIL: missing frontier port error"; echo "$out"; exit 1; }

exit 0
