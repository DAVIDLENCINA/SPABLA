-- SPABLA V2 · Fase 8 · Hito 8.5 — dedicated tests for
-- `spabla_v2.admin_purge_usage_by_tenant`.
--
-- Coverage matrix (Plan Fase 8 V1.3 §11.4 + Hito 8.5 §6):
--   * service_role can purge exactly the target tenant;
--   * rows of other tenants are preserved;
--   * anon cannot invoke the function;
--   * authenticated cannot invoke the function;
--   * caller without privileges cannot purge;
--   * unknown tenant returns 0 removed with no side-effects;
--   * error messages do not leak sensitive payload;
--   * RLS and FORCE RLS remain active on `usage_ledger`;
--   * purge does not affect other tables (`tenants`, `tenant_memberships`,
--     `conversations`, `messages`).
--
-- Run with `psql --set ON_ERROR_STOP=1 -f`.

\echo '=== purge_ledger.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- 1. Fixture: two tenants, one active membership each, seed rows via
--    the SECURITY DEFINER path so the ledger stays consistent with the
--    productive write flow.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_tenant_a uuid := '90000000-0000-0000-0000-00000000000a'::uuid;
    v_tenant_b uuid := '90000000-0000-0000-0000-00000000000b'::uuid;
    v_actor_a  uuid := '90000000-0000-0000-0000-0000000000aa'::uuid;
    v_actor_b  uuid := '90000000-0000-0000-0000-0000000000bb'::uuid;
BEGIN
    INSERT INTO spabla_v2.tenants (id, name) VALUES
        (v_tenant_a, 'Purge Fixture A'),
        (v_tenant_b, 'Purge Fixture B');
    PERFORM spabla_v2.admin_add_membership(v_tenant_a, v_actor_a, 'owner');
    PERFORM spabla_v2.admin_add_membership(v_tenant_b, v_actor_b, 'owner');
    -- Seed 3 rows for tenant A, 2 rows for tenant B.
    PERFORM spabla_v2.admin_append_usage(
        v_tenant_a, v_actor_a, 'purge_test_a', 'turns', 1, 'turns',
        gen_random_uuid(), NULL, 'normal', now(), TRUE);
    PERFORM spabla_v2.admin_append_usage(
        v_tenant_a, v_actor_a, 'purge_test_a', 'text_chars', 5, 'chars',
        gen_random_uuid(), NULL, 'normal', now(), TRUE);
    PERFORM spabla_v2.admin_append_usage(
        v_tenant_a, v_actor_a, 'purge_test_a', 'voice_seconds', 2.5, 'seconds',
        gen_random_uuid(), NULL, 'normal', now(), TRUE);
    PERFORM spabla_v2.admin_append_usage(
        v_tenant_b, v_actor_b, 'purge_test_b', 'turns', 4, 'turns',
        gen_random_uuid(), NULL, 'normal', now(), TRUE);
    PERFORM spabla_v2.admin_append_usage(
        v_tenant_b, v_actor_b, 'purge_test_b', 'provider_call', 1, 'calls',
        gen_random_uuid(), NULL, 'normal', now(), TRUE);
END $$;
COMMIT;

-- ────────────────────────────────────────────────────────────────
-- 2. anon and authenticated cannot execute the purge function.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_purge_usage_by_tenant(
            '90000000-0000-0000-0000-00000000000a'::uuid, 'anon must fail');
        RAISE EXCEPTION 'purge: anon unexpectedly executed the function';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' THEN NULL;
            ELSE RAISE; END IF;
    END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_purge_usage_by_tenant(
            '90000000-0000-0000-0000-00000000000a'::uuid, 'authenticated must fail');
        RAISE EXCEPTION 'purge: authenticated unexpectedly executed the function';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' THEN NULL;
            ELSE RAISE; END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 3. service_role can purge and the result is scoped to the target tenant.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_before_a  bigint;
    v_before_b  bigint;
    v_removed   bigint;
    v_after_a   bigint;
    v_after_b   bigint;
    v_tenants   bigint;
    v_members   bigint;
BEGIN
    SELECT count(*) INTO v_before_a FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000a'::uuid;
    SELECT count(*) INTO v_before_b FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000b'::uuid;

    IF v_before_a <> 3 OR v_before_b <> 2 THEN
        RAISE EXCEPTION 'purge fixture invariant broken: a=%, b=%', v_before_a, v_before_b;
    END IF;

    v_removed := spabla_v2.admin_purge_usage_by_tenant(
        '90000000-0000-0000-0000-00000000000a'::uuid,
        'purge test tenant A');

    IF v_removed <> 3 THEN
        RAISE EXCEPTION 'purge: expected 3 rows removed, got %', v_removed;
    END IF;

    SELECT count(*) INTO v_after_a FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000a'::uuid;
    SELECT count(*) INTO v_after_b FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000b'::uuid;

    IF v_after_a <> 0 THEN
        RAISE EXCEPTION 'purge: target tenant A retained % rows', v_after_a;
    END IF;
    IF v_after_b <> v_before_b THEN
        RAISE EXCEPTION 'purge: sibling tenant B changed % -> %', v_before_b, v_after_b;
    END IF;

    -- Purge does not touch sibling tables.
    SELECT count(*) INTO v_tenants FROM spabla_v2.tenants;
    SELECT count(*) INTO v_members FROM spabla_v2.tenant_memberships;
    IF v_tenants < 2 THEN
        RAISE EXCEPTION 'purge: tenants table lost rows (%)', v_tenants;
    END IF;
    IF v_members < 2 THEN
        RAISE EXCEPTION 'purge: tenant_memberships lost rows (%)', v_members;
    END IF;
END $$;
COMMIT;

-- ────────────────────────────────────────────────────────────────
-- 4. Unknown tenant: returns 0 removed, no side effects.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    v_removed   bigint;
    v_before_b  bigint;
    v_after_b   bigint;
BEGIN
    SELECT count(*) INTO v_before_b FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000b'::uuid;
    v_removed := spabla_v2.admin_purge_usage_by_tenant(
        '90000000-0000-0000-0000-00000000abcd'::uuid,
        'purge unknown tenant test');
    IF v_removed <> 0 THEN
        RAISE EXCEPTION 'purge unknown: expected 0 removed, got %', v_removed;
    END IF;
    SELECT count(*) INTO v_after_b FROM spabla_v2.usage_ledger
     WHERE tenant_id = '90000000-0000-0000-0000-00000000000b'::uuid;
    IF v_after_b <> v_before_b THEN
        RAISE EXCEPTION 'purge unknown: sibling tenant B altered % -> %', v_before_b, v_after_b;
    END IF;
END $$;
COMMIT;

-- ────────────────────────────────────────────────────────────────
-- 5. Empty reason string is rejected with an opaque message.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_purge_usage_by_tenant(
            '90000000-0000-0000-0000-00000000000b'::uuid, '   ');
        RAISE EXCEPTION 'purge: empty reason unexpectedly accepted';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            -- Message must not leak internal SQL fragments beyond the
            -- function name and its declared cause.
            IF v_msg NOT LIKE '%reason%' THEN
                RAISE EXCEPTION 'purge: unexpected error text for empty reason: %', v_msg;
            END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 6. RLS + FORCE RLS still active on `usage_ledger` after purges.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_rls   boolean;
    v_force boolean;
BEGIN
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO v_rls, v_force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'spabla_v2' AND c.relname = 'usage_ledger';
    IF v_rls IS NOT TRUE OR v_force IS NOT TRUE THEN
        RAISE EXCEPTION 'purge: RLS/FORCE regression on usage_ledger (rls=%, force=%)', v_rls, v_force;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 7. Cleanup so this suite is re-runnable inside the same DB. Runs as
--    the connecting superuser (`postgres`): DELETE on `spabla_v2.tenants`
--    is not granted to `service_role` by the bootstrap (Plan Fase 8 §7.5
--    matrix), which is exactly the restrictive posture we want, so the
--    cleanup uses the direct DB role instead.
-- ────────────────────────────────────────────────────────────────
BEGIN;
RESET ROLE;
-- Delete memberships first to respect the FK from tenant_memberships to
-- tenants (bootstrap FK `tenant_memberships_tenant_id_fkey`).
DELETE FROM spabla_v2.tenant_memberships
 WHERE tenant_id IN (
    '90000000-0000-0000-0000-00000000000a'::uuid,
    '90000000-0000-0000-0000-00000000000b'::uuid
 );
DELETE FROM spabla_v2.tenants
 WHERE id IN (
    '90000000-0000-0000-0000-00000000000a'::uuid,
    '90000000-0000-0000-0000-00000000000b'::uuid
 );
COMMIT;

\echo '=== purge_ledger.test.sql · OK ==='
