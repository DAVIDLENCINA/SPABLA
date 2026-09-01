#!/usr/bin/env bash
# No dev script may invoke kill, pkill, killall, `docker kill`,
# `docker rm`, `docker stop` on anything, or `supabase stop` with any
# argument other than `--project-id spabla-hito-8-2-local`.
#
# We shim those tools so any invocation is recorded; then we execute
# check-toolchain, the frontier preflight (with a healthy shimmed
# environment) and stop-local; finally we assert nothing was called
# that mutates external processes.
set -eu -o pipefail

bindir="$TEST_TMPDIR/bin"
logdir="$TEST_TMPDIR/log"
mkdir -p "$bindir" "$logdir"

_shim() {
  # $1 = tool name; log every invocation to $logdir/<name>.log
  local name="$1"
  cat >"$bindir/$name" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$logdir/$name.log"
exit 0
EOF
  chmod +x "$bindir/$name"
}
for t in kill pkill killall; do _shim "$t"; done

# docker: log destructive subcommands, but still respond to read-only
# queries (ps, info, exec, volume ls) so the scripts can run.
cat >"$bindir/docker" <<EOF
#!/usr/bin/env bash
case "\$1" in
  kill|rm|stop|prune) echo "\$*" >> "$logdir/docker-mutation.log"; exit 0 ;;
  ps) echo "supabase_kong_spabla-hito-8-2-local" ;;
  info) exit 0 ;;
  exec) echo "PGRST_DB_SCHEMAS=public,graphql_public,spabla_v2" ;;
  volume) echo "" ;;
  system) echo "\$*" >> "$logdir/docker-mutation.log"; exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$bindir/docker"

# supabase: log every invocation with full args.
cat >"$bindir/supabase" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$logdir/supabase.log"
case "\$1" in
  --version) echo "2.110.0" ;;
  status) printf '{"API_URL":"http://127.0.0.1:54321","DB_URL":"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}' ;;
  *) : ;;
esac
EOF
chmod +x "$bindir/supabase"

# lsof: nothing bound.
cat >"$bindir/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$bindir/lsof"

# node stub returning v24.
cat >"$bindir/node" <<'EOF'
#!/usr/bin/env bash
echo "v24.14.0"
EOF
chmod +x "$bindir/node"

# pgrep: none.
cat >"$bindir/pgrep" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$bindir/pgrep"

export PATH="$bindir:$PATH"

# 1. check-toolchain (must never mutate anything).
"$SCRIPTS_DIR/check-toolchain.sh" --report >/dev/null 2>&1 || true

# 2. HTTP-frontier preflight (must never mutate anything).
"$SCRIPTS_DIR/check-http-frontier-preconditions.sh" >/dev/null 2>&1 || true

# 3. stop-local (must only invoke supabase stop --project-id …).
"$SCRIPTS_DIR/stop-local.sh" >/dev/null 2>&1 || true

# ─── Assertions ────────────────────────────────────────────────────
for f in kill pkill killall docker-mutation; do
  if [ -e "$logdir/$f.log" ]; then
    echo "FAIL: forbidden invocation recorded in $f.log:"
    cat "$logdir/$f.log"
    exit 1
  fi
done

# supabase.log may exist. Every entry MUST be either --version, status,
# or "stop --project-id spabla-hito-8-2-local".
if [ -e "$logdir/supabase.log" ]; then
  while IFS= read -r line; do
    case "$line" in
      "--version") : ;;
      "status -o json") : ;;
      "status") : ;;
      "stop --project-id spabla-hito-8-2-local") : ;;
      "") : ;;
      *)
        echo "FAIL: unauthorised supabase invocation: $line"
        exit 1
        ;;
    esac
  done <"$logdir/supabase.log"
fi

exit 0
