#!/usr/bin/env bash
# SPABLA V2 · Fase 8 · Hito 8.2 — run integration SQL test suites.
#
# Executes the two Hito 8.2 SQL suites against the LOCAL Supabase database.
# Assumes the migration chain has already been applied via
# `scripts/ci/apply-migrations.sh`.
#
# Uses the local Postgres port exposed by the Supabase CLI (default 54322)
# and the fixed local dev password `postgres` documented by the CLI. Zero
# remote connection.
#
# Governance: Plan Hito 8.2 V1.2 §12.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

# LOCAL Supabase Postgres — never a productive URL. Uses the CLI's default
# local dev credentials (documented in the Supabase CLI, ephemeral, non-secret).
# The password is a fixed local-only convention; not a real secret.
PGHOST="127.0.0.1"
PGPORT="54322"
PGUSER="postgres"
PGDATABASE="postgres"
PGPASSWORD="postgres"

export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

echo "[run-integration-tests] applying rls_bootstrap.test.sql"
psql --no-psqlrc --set ON_ERROR_STOP=1 \
     -f supabase/tests/rls_bootstrap.test.sql

echo "[run-integration-tests] applying purge_ledger.test.sql"
psql --no-psqlrc --set ON_ERROR_STOP=1 \
     -f supabase/tests/purge_ledger.test.sql

echo "[run-integration-tests] applying message_translations.test.sql"
psql --no-psqlrc --set ON_ERROR_STOP=1 \
     -f supabase/tests/message_translations.test.sql

# Hito 9.3.2-A-Q2 · atomic onboarding SQL integration suite
echo "[run-integration-tests] applying atomic_onboarding.test.sql"
psql --no-psqlrc --set ON_ERROR_STOP=1 \
     -f supabase/tests/atomic_onboarding.test.sql

# Hito 9.3.2-A-Q2-R3 · concurrency proof with two independent psql backends.
# Verifies the FOR KEY SHARE row lock serializes onboarding against a
# concurrent DELETE FROM auth.users (the exact operation performed by
# `admin.auth.admin.deleteUser` on the Supabase Auth backend).
echo "[run-integration-tests] running onboarding-auth-race.sh (two-backend concurrency)"
"${SCRIPT_DIR}/onboarding-auth-race.sh"

echo "[run-integration-tests] SUITES OK"
