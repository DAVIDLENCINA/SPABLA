#!/usr/bin/env bash
# check-toolchain.sh must abort when supabase/config.toml declares a
# project_id different from the canonical SPABLA one.
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null
# Overwrite config.toml with a non-canonical project_id.
cat >"$FAKE_ROOT/supabase/config.toml" <<'EOF'
project_id = "some-other-project-name"

[api]
schemas = ["public", "graphql_public", "spabla_v2"]
EOF

mkdir -p "$FAKE_ROOT/scripts/dev/lib"
cp "$SCRIPTS_DIR/lib/common.sh" "$FAKE_ROOT/scripts/dev/lib/common.sh"
cp "$SCRIPTS_DIR/check-toolchain.sh" "$FAKE_ROOT/scripts/dev/check-toolchain.sh"
chmod +x "$FAKE_ROOT/scripts/dev/check-toolchain.sh"

out="$("$FAKE_ROOT/scripts/dev/check-toolchain.sh" 2>&1)" && rc=0 || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: expected non-zero exit"; echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -q "supabase/config.toml project_id" \
  || { echo "FAIL: missing project_id error"; echo "$out"; exit 1; }
# Must NOT print the offending name; only the check name and the
# expected canonical value.
if printf '%s\n' "$out" | grep -q "some-other-project-name"; then
  echo "FAIL: script echoed the non-canonical project id"; echo "$out"; exit 1
fi

exit 0
