#!/usr/bin/env bash
# SPABLA V2 · Fase 8 · Hito 8.5 — restore drill.
#
# Runs entirely against the LOCAL Supabase stack of the CI runner (Job C).
# Assumes `supabase start` has already brought the stack up and
# `supabase db reset --local` has applied the full migration chain to the
# default database (`postgres`).
#
# Drill workflow:
#   1. Confirm the source database identity, migration hashes, and
#      structural baseline in the SOURCE database (`postgres`).
#   2. Dump the schema (schema-only) covering `public`, `spabla_v2`,
#      `extensions`, and `auth` so the target keeps `auth.uid()` for RLS
#      verification.
#   3. Create an INDEPENDENT target database `restored_target` in the
#      same PostgreSQL cluster.
#   4. Restore the dump into the target database.
#   5. Run structural, RLS, ACL, ownership, isolation, idempotency and
#      purge verifications exclusively against the TARGET database.
#   6. Emit an artifact-friendly plain-text report.
#   7. Refuse to run any verification against the SOURCE by mistake.
#
# Zero productive Supabase connectivity. Zero secrets in output.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

# Ephemeral local-only credentials (Supabase CLI convention). Not secrets.
PGHOST="127.0.0.1"
PGPORT="54322"
PGUSER="postgres"
PGPASSWORD="postgres"
export PGHOST PGPORT PGUSER PGPASSWORD

SOURCE_DB="postgres"
TARGET_DB="restored_target"

DUMP_PATH="${RUNNER_TEMP:-/tmp}/phase8-dump.sql"
REPORT_PATH="${RUNNER_TEMP:-/tmp}/phase8-drill-report.txt"

log() { printf '[restore-drill] %s\n' "$*"; }

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

psql_src() {
  PGDATABASE="${SOURCE_DB}" psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 "$@"
}

psql_tgt() {
  PGDATABASE="${TARGET_DB}" psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 "$@"
}

require_target() {
  local dbname
  dbname="$(psql_tgt -c "SELECT current_database()")"
  if [ "${dbname}" != "${TARGET_DB}" ]; then
    log "FATAL: verification pointed to '${dbname}' instead of '${TARGET_DB}'"
    exit 42
  fi
}

# ---------------------------------------------------------------------
# 0. Prepare the report
# ---------------------------------------------------------------------

{
  echo "SPABLA V2 · Fase 8 · Hito 8.5 restore drill report"
  echo "---------------------------------------------------"
  echo "Timestamp UTC:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Commit SHA:         ${GITHUB_SHA:-unknown}"
  echo "Workflow run:       ${GITHUB_RUN_ID:-unknown}"
  echo "Runner OS:          ${RUNNER_OS:-unknown}"
  echo "Node:               $(node --version 2>/dev/null || echo 'n/a')"
  echo "Supabase CLI:       $(supabase --version 2>/dev/null || echo 'n/a')"
  echo "psql client:        $(psql --version 2>/dev/null || echo 'n/a')"
  echo "pg_dump client:     $(pg_dump --version 2>/dev/null || echo 'n/a')"
  echo "PostgreSQL server:  $(psql_src -c "SELECT current_setting('server_version')")"
  echo "Source database:    ${SOURCE_DB}"
  echo "Target database:    ${TARGET_DB}"
  echo ""
  echo "== Migration files (sha256) =="
  for f in supabase/migrations/*.sql; do
    printf "  %s  %s\n" "$(sha256sum "$f" | awk '{print $1}')" "$(basename "$f")"
  done
  echo ""
} > "${REPORT_PATH}"

# ---------------------------------------------------------------------
# 1. Source baseline
# ---------------------------------------------------------------------

log "verifying source database structural baseline"

SOURCE_TENANTS=$(psql_src -c "SELECT count(*) FROM spabla_v2.tenants")
SOURCE_LEDGER=$(psql_src -c "SELECT count(*) FROM spabla_v2.usage_ledger")

{
  echo "== Source baseline =="
  echo "  tenants:        ${SOURCE_TENANTS}"
  echo "  usage_ledger:   ${SOURCE_LEDGER}"
  echo ""
} >> "${REPORT_PATH}"

# ---------------------------------------------------------------------
# 2. Schema-only dump (public, spabla_v2, extensions, auth)
# ---------------------------------------------------------------------

log "dumping schema-only from source"

SRC_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${SOURCE_DB}"
# `--no-owner` drops `SET ROLE supabase_admin;` and `ALTER ... OWNER TO
# supabase_admin;` statements the source cluster produces for objects it
# provisions internally; the restoring role (`postgres` in the target)
# cannot impersonate `supabase_admin` and would abort otherwise. We keep
# ACLs (`GRANT`/`REVOKE`) so the ACL matrix in the target reflects the
# bootstrap posture verbatim.
pg_dump \
  --schema-only \
  --no-owner \
  --no-comments \
  --schema=public \
  --schema=spabla_v2 \
  --schema=extensions \
  --schema=auth \
  -f "${DUMP_PATH}" \
  "${SRC_URL}"

DUMP_BYTES=$(wc -c < "${DUMP_PATH}" | tr -d ' ')
DUMP_SHA=$(sha256sum "${DUMP_PATH}" | awk '{print $1}')

{
  echo "== Dump artifact =="
  echo "  path:  ${DUMP_PATH}"
  echo "  size:  ${DUMP_BYTES} bytes"
  echo "  sha256: ${DUMP_SHA}"
  echo ""
} >> "${REPORT_PATH}"

# ---------------------------------------------------------------------
# 3. Create INDEPENDENT target database in the same cluster
# ---------------------------------------------------------------------

log "creating independent target database ${TARGET_DB}"

# Safety: force-drop any leftover target from prior runs then create fresh.
PGDATABASE="${SOURCE_DB}" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${TARGET_DB}" \
  -c "CREATE DATABASE ${TARGET_DB} TEMPLATE template0 OWNER postgres"

# ---------------------------------------------------------------------
# 4. Restore the dump into the target
# ---------------------------------------------------------------------

log "restoring dump into ${TARGET_DB}"

TGT_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${TARGET_DB}"
psql --no-psqlrc --set ON_ERROR_STOP=1 -f "${DUMP_PATH}" "${TGT_URL}" > /tmp/restore.log 2>&1 || {
  log "restore failed; tail:"
  tail -40 /tmp/restore.log
  exit 1
}

# Verify we are talking to the target from here on.
require_target

TARGET_DBNAME=$(psql_tgt -c "SELECT current_database()")
if [ "${TARGET_DBNAME}" != "${TARGET_DB}" ]; then
  log "FATAL: target sanity check failed (got '${TARGET_DBNAME}')"
  exit 42
fi

# ---------------------------------------------------------------------
# 5. Structural verifications on the TARGET
# ---------------------------------------------------------------------

log "structural verifications on ${TARGET_DB}"

TGT_SCHEMA_TABLES=$(psql_tgt -c "
  SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'spabla_v2'
     AND c.relkind = 'r'
")
TGT_V1_TABLES=$(psql_tgt -c "
  SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN ('users','conversations','conversation_participants','messages','files','call_signals')
")
TGT_POLICIES=$(psql_tgt -c "
  SELECT count(*) FROM pg_policies WHERE schemaname = 'spabla_v2'
")
TGT_RLS_OK=$(psql_tgt -c "
  SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'spabla_v2'
     AND c.relkind = 'r'
     AND c.relrowsecurity = TRUE
     AND c.relforcerowsecurity = TRUE
")
TGT_ADMIN_FN=$(psql_tgt -c "
  SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'spabla_v2'
     AND p.proname IN ('admin_create_tenant','admin_add_membership',
                       'admin_deactivate_membership','admin_append_usage',
                       'admin_purge_usage_by_tenant')
")

{
  echo "== Structural (target) =="
  echo "  spabla_v2 tables:     ${TGT_SCHEMA_TABLES} (expected 5)"
  echo "  V1 public tables:     ${TGT_V1_TABLES} (expected 6)"
  echo "  spabla_v2 policies:   ${TGT_POLICIES}"
  echo "  ENABLE+FORCE RLS:     ${TGT_RLS_OK} of 5 spabla_v2 tables"
  echo "  admin_* functions:    ${TGT_ADMIN_FN} of 5"
  echo ""
} >> "${REPORT_PATH}"

if [ "${TGT_SCHEMA_TABLES}" != "5" ] || [ "${TGT_V1_TABLES}" != "6" ] \
   || [ "${TGT_RLS_OK}" != "5" ] || [ "${TGT_ADMIN_FN}" != "5" ]; then
  log "FATAL: structural mismatch after restore"
  exit 1
fi

# ---------------------------------------------------------------------
# 6. Ownership + ACL matrix (target)
# ---------------------------------------------------------------------

log "verifying ownership and ACL matrix on target"

TGT_OWNERS_OK=$(psql_tgt -c "
  SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'spabla_v2'
     AND p.proname IN ('admin_create_tenant','admin_add_membership',
                       'admin_deactivate_membership','admin_append_usage',
                       'admin_purge_usage_by_tenant')
     AND r.rolname = 'postgres'
")

acl_check() {
  local func_sig="$1" role="$2" expected="$3"
  local actual
  actual=$(psql_tgt -c "
    SELECT has_function_privilege('${role}', '${func_sig}', 'EXECUTE')
  ")
  if [ "${actual}" != "${expected}" ]; then
    log "FATAL: ACL mismatch for ${func_sig} / ${role} (expected ${expected}, got ${actual})"
    exit 1
  fi
  printf '  %-70s %s\n' "${func_sig} / ${role}" "${actual}" >> "${REPORT_PATH}"
}

{
  echo "== ACL matrix (target) =="
} >> "${REPORT_PATH}"

for fsig in \
  "spabla_v2.admin_append_usage(uuid,uuid,text,text,numeric,text,uuid,uuid,text,timestamptz,boolean)" \
  "spabla_v2.admin_purge_usage_by_tenant(uuid,text)" \
  "spabla_v2.admin_create_tenant(text)" \
  "spabla_v2.admin_add_membership(uuid,uuid,text)" \
  "spabla_v2.admin_deactivate_membership(uuid,uuid)"
do
  acl_check "${fsig}" "service_role" "t"
  acl_check "${fsig}" "anon" "f"
  acl_check "${fsig}" "authenticated" "f"
done

{
  echo ""
  echo "  admin_* functions owned by postgres: ${TGT_OWNERS_OK} of 5"
  echo ""
} >> "${REPORT_PATH}"

if [ "${TGT_OWNERS_OK}" != "5" ]; then
  log "FATAL: ownership mismatch"
  exit 1
fi

# ---------------------------------------------------------------------
# 7. Functional isolation + idempotency + purge on the TARGET
# ---------------------------------------------------------------------

log "seeding synthetic fixtures and running functional drills on target"

psql --no-psqlrc --set ON_ERROR_STOP=1 -f supabase/tests/rls_bootstrap.test.sql "${TGT_URL}" > /tmp/rls_target.log 2>&1 || {
  log "rls_bootstrap drill failed on target; tail:"
  tail -30 /tmp/rls_target.log
  exit 1
}

psql --no-psqlrc --set ON_ERROR_STOP=1 -f supabase/tests/purge_ledger.test.sql "${TGT_URL}" > /tmp/purge_target.log 2>&1 || {
  log "purge drill failed on target; tail:"
  tail -30 /tmp/purge_target.log
  exit 1
}

{
  echo "== Functional drills (target) =="
  echo "  rls_bootstrap.test.sql:   OK"
  echo "  purge_ledger.test.sql:    OK"
  echo ""
} >> "${REPORT_PATH}"

# ---------------------------------------------------------------------
# 8. Final: confirm we ran everything on the target, not on source
# ---------------------------------------------------------------------

require_target

# Source untouched invariants (never mutated during the drill).
SRC_TENANTS_END=$(psql_src -c "SELECT count(*) FROM spabla_v2.tenants")
SRC_LEDGER_END=$(psql_src -c "SELECT count(*) FROM spabla_v2.usage_ledger")

{
  echo "== Source integrity =="
  echo "  tenants before drill: ${SOURCE_TENANTS}"
  echo "  tenants after drill:  ${SRC_TENANTS_END}"
  echo "  ledger before drill:  ${SOURCE_LEDGER}"
  echo "  ledger after drill:   ${SRC_LEDGER_END}"
  echo ""
  echo "VERDICT: PASS"
} >> "${REPORT_PATH}"

log "restore drill PASS. Report at ${REPORT_PATH}"
