-- SPABLA V2 · Fase 9 · Hito 9.2.6 — V1-ERADICATION verification suite.
--
-- Governance: Plan Hito 9.2.6 §6 · Commit 3. Runs against the LOCAL
-- Supabase stack after `supabase db reset --local` has applied the full
-- migration chain (V1 baseline → legacy → reconciliation → phase 8 bootstrap
-- → phase 9 reconciliations → V1 runtime retirement). ZERO connection to
-- the productive remote.
--
-- Purpose: verify that `20260817000000_v1_runtime_retirement.sql` has
-- retired every operational V1 object from the FINAL database state while
-- leaving `spabla_v2.*` and the productive V2 posture intact. This replaces
-- the previous `v1_baseline_smoke.test.sql` — the historical baseline is
-- still rebuilt earlier in the chain but is not observable at the end of it.
--
-- Execution model: `psql --set ON_ERROR_STOP=1 -f`. Any RAISE EXCEPTION
-- aborts the test with non-zero exit; the CI job propagates the failure.

\echo '=== v1_runtime_retirement_verification.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- 1. Six V1 tables must be ABSENT from `public`
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_present text;
BEGIN
    SELECT string_agg(t, ',' ORDER BY t)
      INTO v_present
      FROM (VALUES
        ('users'),
        ('conversations'),
        ('conversation_participants'),
        ('messages'),
        ('files'),
        ('call_signals')
      ) AS req(t)
      WHERE EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = req.t
      );

    IF v_present IS NOT NULL THEN
        RAISE EXCEPTION 'v1_retirement: V1 tables still present in public: %', v_present;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 2. Two V1 functions must be ABSENT from `public`
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_present text;
BEGIN
    SELECT string_agg(f, ',' ORDER BY f)
      INTO v_present
      FROM (VALUES ('is_participant'), ('shares_conversation')) AS req(f)
      WHERE EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = req.f
      );

    IF v_present IS NOT NULL THEN
        RAISE EXCEPTION 'v1_retirement: V1 functions still present in public: %', v_present;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 3. Zero policies must reference the retired V1 tables. The tables
--    themselves are gone by test §1, but a defensive check on
--    `pg_policies` guards against a future migration accidentally
--    re-creating any of the 15 named V1 policies on the (recreated)
--    surface.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (tablename IN ('users','conversations','conversation_participants',
                          'messages','files','call_signals')
        OR policyname IN ('users_select','users_insert_own','users_update_own',
                          'conversations_select','conversations_insert',
                          'participants_select','participants_insert',
                          'participants_insert_voice_messages',
                          'messages_select','messages_insert',
                          'files_select','files_insert',
                          'call_signals_select','call_signals_insert','call_signals_update'));

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'v1_retirement: expected 0 V1 policies, got %', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 4. Realtime publication `supabase_realtime` must contain ZERO V1
--    relations. The publication itself is intentionally preserved (as
--    empty) so a future V2 realtime feature can `ALTER PUBLICATION ...
--    ADD TABLE` without recreating the object.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_v1_count int;
    v_v2_count int;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        RAISE EXCEPTION 'v1_retirement: publication supabase_realtime missing (expected preserved-empty)';
    END IF;

    SELECT count(*) INTO v_v1_count
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class      c ON c.oid = pr.prrelid
      JOIN pg_namespace  n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public';

    IF v_v1_count <> 0 THEN
        RAISE EXCEPTION 'v1_retirement: supabase_realtime still contains % public.* relations', v_v1_count;
    END IF;

    -- Guardrail (also asserted historically): zero spabla_v2.* in the
    -- publication at this stage of the hito. If a future V2 realtime
    -- feature explicitly adds tables, THIS test must be updated on that
    -- hito rather than silently loosened.
    SELECT count(*) INTO v_v2_count
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class      c ON c.oid = pr.prrelid
      JOIN pg_namespace  n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'spabla_v2';

    IF v_v2_count <> 0 THEN
        RAISE EXCEPTION 'v1_retirement: supabase_realtime unexpectedly contains % spabla_v2.* relations', v_v2_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 5. `spabla_v2` schema untouched — table shape.
-- ────────────────────────────────────────────────────────────────
-- Eight tables shipped by Fase 8 (bootstrap) + Fase 9.1.1
-- (translations) + Fase 9.3.2-A-Q2 (atomic onboarding): tenants,
-- tenant_memberships, conversations, messages, usage_ledger,
-- message_translations, actor_personal_workspace, actor_lifecycle_state.
-- Match Fase 8 restore-drill's structural expectation as evolved by
-- Q2 (contract §14 rows 39-41, 44 + migration
-- `20260824180000_hito_9_3_2_a_atomic_onboarding.sql`).
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'spabla_v2'
       AND c.relkind = 'r';

    IF v_count <> 8 THEN
        RAISE EXCEPTION 'v1_retirement: spabla_v2 table count expected 8, got %', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 6. `spabla_v2` schema untouched — RLS posture (ENABLE + FORCE on all).
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.relname AS table_name,
               c.relrowsecurity AS rls,
               c.relforcerowsecurity AS force_rls
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'spabla_v2'
           AND c.relkind = 'r'
    LOOP
        IF r.rls IS NOT TRUE THEN
            RAISE EXCEPTION 'v1_retirement: RLS not enabled on spabla_v2.%', r.table_name;
        END IF;
        IF r.force_rls IS NOT TRUE THEN
            RAISE EXCEPTION 'v1_retirement: FORCE RLS missing on spabla_v2.%', r.table_name;
        END IF;
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 7. `spabla_v2` admin functions untouched — 6 functions still present
--    and owned by postgres. Fase 9.3.2-A-Q2 adds
--    `admin_ensure_personal_workspace(uuid)` (contract §9).
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
    v_bad_owner text;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'spabla_v2'
       AND p.proname IN ('admin_create_tenant','admin_add_membership',
                         'admin_deactivate_membership','admin_append_usage',
                         'admin_purge_usage_by_tenant',
                         'admin_ensure_personal_workspace');

    IF v_count <> 6 THEN
        RAISE EXCEPTION 'v1_retirement: spabla_v2 admin function count expected 6, got %', v_count;
    END IF;

    SELECT string_agg(p.proname, ',' ORDER BY p.proname)
      INTO v_bad_owner
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r     ON r.oid = p.proowner
     WHERE n.nspname = 'spabla_v2'
       AND p.proname IN ('admin_create_tenant','admin_add_membership',
                         'admin_deactivate_membership','admin_append_usage',
                         'admin_purge_usage_by_tenant',
                         'admin_ensure_personal_workspace')
       AND r.rolname <> 'postgres';

    IF v_bad_owner IS NOT NULL THEN
        RAISE EXCEPTION 'v1_retirement: spabla_v2 admin functions with unexpected owner: %', v_bad_owner;
    END IF;
END $$;

\echo '=== v1_runtime_retirement_verification.test.sql · OK ==='
