#!/usr/bin/env bash
# Verifies that resolve_repo_root walks up correctly and rejects
# invalid workdirs.
set -eu -o pipefail

FAKE_ROOT="$TEST_TMPDIR/repo"
bash "$FIXTURES_DIR/make-repo.sh" "$FAKE_ROOT" >/dev/null

# shellcheck source=../lib/common.sh
. "$SCRIPTS_DIR/lib/common.sh"

# 1. From the root itself.
got="$(resolve_repo_root "$FAKE_ROOT/dummy-script")"
[ "$got" = "$FAKE_ROOT" ] || { echo "FAIL root: got=$got"; exit 1; }

# 2. From a deep subdirectory.
mkdir -p "$FAKE_ROOT/a/b/c"
got="$(resolve_repo_root "$FAKE_ROOT/a/b/c/x.sh")"
[ "$got" = "$FAKE_ROOT" ] || { echo "FAIL deep: got=$got"; exit 1; }

# 3. From a directory without the anchors: must fail.
mkdir -p "$TEST_TMPDIR/unrelated"
if resolve_repo_root "$TEST_TMPDIR/unrelated/x.sh" >/dev/null 2>&1; then
  echo "FAIL unrelated should have errored"
  exit 1
fi

# 4. From an incomplete repo (missing config.toml): must fail.
mkdir -p "$TEST_TMPDIR/partial/scripts/ci"
touch "$TEST_TMPDIR/partial/package.json"
touch "$TEST_TMPDIR/partial/scripts/ci/apply-migrations.sh"
if resolve_repo_root "$TEST_TMPDIR/partial/x.sh" >/dev/null 2>&1; then
  echo "FAIL partial should have errored"
  exit 1
fi

exit 0
