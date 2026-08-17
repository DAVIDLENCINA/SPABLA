#!/usr/bin/env bash
# start-local.sh must abort when a required port is held by a process
# outside SPABLA scope (i.e., SPABLA is not already up and lsof reports
# the API port bound). It must NOT invoke `supabase start`.
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null
mkdir -p "$FAKE_ROOT/scripts/dev/lib"
cp "$SCRIPTS_DIR/lib/common.sh" "$FAKE_ROOT/scripts/dev/lib/common.sh"
cp "$SCRIPTS_DIR/check-toolchain.sh" "$FAKE_ROOT/scripts/dev/check-toolchain.sh"
cp "$SCRIPTS_DIR/start-local.sh" "$FAKE_ROOT/scripts/dev/start-local.sh"
chmod +x "$FAKE_ROOT/scripts/dev/check-toolchain.sh" \
         "$FAKE_ROOT/scripts/dev/start-local.sh"

bindir="$TEST_TMPDIR/bin"
mkdir -p "$bindir"

# lsof: port 54321 held, everything else free.
cat >"$bindir/lsof" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *:54321*)
    printf 'p99999\n'
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$bindir/lsof"

# docker: no SPABLA containers running.
cat >"$bindir/docker" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  ps) echo "" ;;
  info) exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$bindir/docker"

# supabase: must NOT be invoked with 'start'. If it is, fail loudly.
cat >"$bindir/supabase" <<'EOF'
#!/usr/bin/env bash
if [ "${1-}" = "start" ]; then
  echo "TEST-FAIL: supabase start was invoked despite busy port" >&2
  exit 99
fi
echo "2.110.0"
EOF
chmod +x "$bindir/supabase"

# node stub returning v24.
cat >"$bindir/node" <<'EOF'
#!/usr/bin/env bash
echo "v24.14.0"
EOF
chmod +x "$bindir/node"

export PATH="$bindir:$PATH"

out="$("$FAKE_ROOT/scripts/dev/start-local.sh" 2>&1)" && rc=0 || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q 'held by a process outside SPABLA scope' \
  || { echo "FAIL: missing generic port-busy message"; echo "$out"; exit 1; }
if printf '%s\n' "$out" | grep -q 'TEST-FAIL: supabase start was invoked'; then
  echo "FAIL: supabase start was invoked despite busy port"; echo "$out"; exit 1
fi

exit 0
