#!/usr/bin/env bash
# SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2-R3 · Race auth-delete vs onboarding.
#
# Purpose: prove that the row lock added by Q2-R3
# (`SELECT id FROM auth.users WHERE id = p_actor_id FOR KEY SHARE`
# inside `spabla_v2.admin_ensure_personal_workspace`) actually
# serializes the onboarding transaction against a concurrent
# `DELETE FROM auth.users` — the exact operation performed by
# `admin.auth.admin.deleteUser` on the Supabase Auth backend.
#
# This test is intentionally executed as a bash orchestrator that
# spawns two independent `psql` sessions with real, separate
# PostgreSQL backends. It does NOT use Promise.all, timers, or
# any in-process pseudo-concurrency. Coordination is enforced with
# on-disk barrier files and `pg_locks` observation from a third
# read-only session.
#
# Governance:
#   · Contract Q1-RR-SCOPE §14 rows 47/48 + 53/54, §17-ter H.
#   · Hito 9.3.2-A-Q2-R3 order (FASE 6).
#
# Exit codes:
#   0 · all scenarios pass.
#   1 · any scenario fails; details on stderr.

set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=54322}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

log()  { printf '[q2-r3-race] %s\n'  "$*" >&2; }
fail() { printf '[q2-r3-race] FAIL: %s\n' "$*" >&2; exit 1; }

# Wait until the given PID has been reported by pg_stat_activity as
# waiting on a lock. Times out after ~5 seconds.
wait_until_blocked() {
  local pid="$1"
  local attempts=0
  while [ "$attempts" -lt 50 ]; do
    local state
    state=$(psql -Atc "SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid = $pid;")
    if [ "$state" = "Lock" ]; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done
  return 1
}

# -----------------------------------------------------------------
# Test fixtures. Each scenario uses a fresh actor UUID to keep the
# preconditions independent.
# -----------------------------------------------------------------
ACTOR_S1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ACTOR_S2='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
ACTOR_S3_A='cccccccc-cccc-cccc-cccc-ccccccccccc1'
ACTOR_S3_B='cccccccc-cccc-cccc-cccc-ccccccccccc2'

seed_actor() {
  local id="$1"
  psql -v ON_ERROR_STOP=1 -c "
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES ('$id'::uuid, 'authenticated', 'authenticated', 'race-$id@example.test', 'x', now(), now(), now())
    ON CONFLICT (id) DO NOTHING;
  " > /dev/null
}

# Cleanup residues from previous runs.
psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM spabla_v2.tenant_memberships
   WHERE actor_id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
  DELETE FROM spabla_v2.actor_personal_workspace
   WHERE actor_id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
  DELETE FROM auth.users
   WHERE id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
" > /dev/null

# -----------------------------------------------------------------
# SCENARIO 1 · Onboarding wins the race.
#
# Backend A opens a transaction, calls the RPC internals up to the
# FOR KEY SHARE (replicated via a DO block that mirrors the exact
# same lock statement + advisory lock), waits ~2 s, then commits.
# Backend B tries to `DELETE FROM auth.users` for the same id ~0.3 s
# later. Expectation: backend B's DELETE waits until backend A commits.
# We observe the block from a third session via pg_stat_activity.
# -----------------------------------------------------------------
log "SCENARIO 1 · onboarding wins"
seed_actor "$ACTOR_S1"
BAR_S1=$(mktemp -u /tmp/q2r3-s1-XXXX)

# Backend A: DO block that acquires the RPC row lock AND holds it
# for 2 seconds; then writes barrier file to signal completion.
# `PGAPPNAME` gives PostgreSQL a distinctive application_name so
# `pg_stat_activity` lookups are unambiguous — psql lookups from
# this orchestrator use the default application_name.
(
  PGAPPNAME='q2r3-s1-a' psql -v ON_ERROR_STOP=1 <<EOF > /tmp/q2r3-s1-a.log 2>&1
    BEGIN;
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('$ACTOR_S1', 9321)
    );
    SELECT u.id FROM auth.users u WHERE u.id = '$ACTOR_S1'::uuid FOR KEY SHARE;
    SELECT pg_sleep(2.0);
    COMMIT;
EOF
  touch "${BAR_S1}.a-done"
) &
PID_A=$!

# Capture backend A's PID via distinctive application_name.
sleep 0.3
BACKEND_A_PID=$(psql -Atc "
  SELECT pid FROM pg_catalog.pg_stat_activity
   WHERE application_name = 'q2r3-s1-a'
   ORDER BY backend_start DESC
   LIMIT 1;
")
if [ -z "$BACKEND_A_PID" ]; then
  wait "$PID_A" || true
  fail "S1: could not locate backend A pid"
fi

# Backend B: DELETE, must block until backend A commits.
START=$(date +%s%N)
(
  PGAPPNAME='q2r3-s1-b' psql -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id='$ACTOR_S1'::uuid;" > /tmp/q2r3-s1-b.log 2>&1
  touch "${BAR_S1}.b-done"
) &
PID_B=$!

# Wait until backend B shows Lock wait_event_type (proof of block).
sleep 0.2
BACKEND_B_PID=$(psql -Atc "
  SELECT pid FROM pg_catalog.pg_stat_activity
   WHERE application_name = 'q2r3-s1-b'
   ORDER BY backend_start DESC
   LIMIT 1;
")
if [ -z "$BACKEND_B_PID" ]; then
  wait "$PID_B" || true
  wait "$PID_A" || true
  fail "S1: could not locate backend B pid"
fi
if ! wait_until_blocked "$BACKEND_B_PID"; then
  wait "$PID_B" || true
  wait "$PID_A" || true
  fail "S1: backend B never entered Lock wait state — FOR KEY SHARE did not block DELETE"
fi
log "S1 · backend B is blocked on Lock (proof of FOR KEY SHARE ↔ DELETE incompatibility)"

# Verify the exact lock relationship via pg_locks.
BLOCKERS=$(psql -Atc "
  SELECT pg_catalog.pg_blocking_pids($BACKEND_B_PID)::text;
")
case "$BLOCKERS" in
  *"$BACKEND_A_PID"*) log "S1 · pg_blocking_pids reports A ($BACKEND_A_PID) blocks B ($BACKEND_B_PID)";;
  *) fail "S1: expected backend A pid $BACKEND_A_PID in blockers, got: $BLOCKERS";;
esac

wait "$PID_A" || true
wait "$PID_B" || true
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
log "S1 · total elapsed ${ELAPSED_MS}ms (delete waited on onboarding)"
[ "$ELAPSED_MS" -ge 1500 ] || fail "S1: DELETE finished in ${ELAPSED_MS}ms; expected >= 1500ms of wait"
grep -q "COMMIT" /tmp/q2r3-s1-a.log     || fail "S1: backend A did not commit; log: $(cat /tmp/q2r3-s1-a.log)"
grep -q "DELETE 1" /tmp/q2r3-s1-b.log   || fail "S1: backend B did not delete row; log: $(cat /tmp/q2r3-s1-b.log)"
[ -f "${BAR_S1}.a-done" ] && [ -f "${BAR_S1}.b-done" ] || fail "S1: barrier files missing"
rm -f "${BAR_S1}"*
log "S1 · PASS"

# -----------------------------------------------------------------
# SCENARIO 2 · Deletion wins the race.
#
# Backend B commits DELETE before backend A calls the RPC. The RPC
# must raise P0002 and NOT create any mapping / tenant / membership.
# We verify by asserting the RPC exits with SQLSTATE P0002 and that
# `spabla_v2.actor_personal_workspace` remains empty for that actor.
# -----------------------------------------------------------------
log "SCENARIO 2 · deletion wins"
seed_actor "$ACTOR_S2"

# Backend B: DELETE (no transaction, commit immediately).
psql -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id='$ACTOR_S2'::uuid;" > /dev/null

# Backend A: RPC. Should RAISE P0002.
set +e
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM spabla_v2.admin_ensure_personal_workspace('$ACTOR_S2'::uuid);" > /tmp/q2r3-s2.log 2>&1
RC=$?
set -e
[ "$RC" -ne 0 ] || fail "S2: RPC did NOT fail after actor deletion"
grep -q "auth actor not found" /tmp/q2r3-s2.log || fail "S2: expected 'auth actor not found', got: $(cat /tmp/q2r3-s2.log)"

# Assert side-effects absent.
LEFTOVER=$(psql -Atc "SELECT count(*) FROM spabla_v2.actor_personal_workspace WHERE actor_id='$ACTOR_S2'::uuid;")
[ "$LEFTOVER" = "0" ] || fail "S2: RPC created mapping despite deletion; leftover=$LEFTOVER"
log "S2 · PASS · RPC rejected with P0002, zero side effects"

# -----------------------------------------------------------------
# SCENARIO 3 · Absence of deadlock, distinct actors.
#
# Two backends run the full onboarding flow concurrently for DIFFERENT
# actors. Neither should block the other; no deadlock should occur.
# This proves the lock scope is per-row (per actor), not table-wide.
# -----------------------------------------------------------------
log "SCENARIO 3 · absence of deadlock, distinct actors"
seed_actor "$ACTOR_S3_A"
seed_actor "$ACTOR_S3_B"

START=$(date +%s%N)
(
  psql -v ON_ERROR_STOP=1 -c "SELECT * FROM spabla_v2.admin_ensure_personal_workspace('$ACTOR_S3_A'::uuid);" > /tmp/q2r3-s3-a.log 2>&1
) &
PID_A=$!
(
  psql -v ON_ERROR_STOP=1 -c "SELECT * FROM spabla_v2.admin_ensure_personal_workspace('$ACTOR_S3_B'::uuid);" > /tmp/q2r3-s3-b.log 2>&1
) &
PID_B=$!
wait "$PID_A" || fail "S3: backend A failed"
wait "$PID_B" || fail "S3: backend B failed"
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
log "S3 · both onboardings completed in ${ELAPSED_MS}ms with no deadlock"

# Verify both actors got their own tenant, not shared.
T_A=$(psql -Atc "SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id='$ACTOR_S3_A'::uuid;")
T_B=$(psql -Atc "SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id='$ACTOR_S3_B'::uuid;")
[ -n "$T_A" ] && [ -n "$T_B" ] || fail "S3: missing mapping for one actor (a=$T_A b=$T_B)"
[ "$T_A" != "$T_B" ]           || fail "S3: two actors shared the same tenant ($T_A)"
log "S3 · PASS · distinct tenants ($T_A, $T_B)"

# -----------------------------------------------------------------
# Cleanup.
# -----------------------------------------------------------------
psql -v ON_ERROR_STOP=1 -c "
  DELETE FROM spabla_v2.tenant_memberships
   WHERE actor_id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
  DELETE FROM spabla_v2.actor_personal_workspace
   WHERE actor_id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
  DELETE FROM auth.users
   WHERE id IN ('$ACTOR_S1'::uuid, '$ACTOR_S2'::uuid, '$ACTOR_S3_A'::uuid, '$ACTOR_S3_B'::uuid);
" > /dev/null

log "ALL SCENARIOS PASS"
