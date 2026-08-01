-- SPABLA V2 · Fase 8 · Hito 8.2 — V1 baseline smoke test.
--
-- Governance: Plan Hito 8.2 V1.2 §11 (baseline smoke). Runs against the
-- LOCAL Supabase stack after `supabase db reset --local` has applied the
-- full migration chain: baseline → legacy → reconciliation → phase8 bootstrap.
-- ZERO connection to the productive remote.
--
-- Execution model: `psql --set ON_ERROR_STOP=1 -f`. Any RAISE EXCEPTION
-- aborts the test with non-zero exit; the CI job propagates the failure.

\echo '=== v1_baseline_smoke.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- 1. Six V1 tables exist in public with expected columns and defaults
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_missing text;
BEGIN
    SELECT string_agg(t, ',' ORDER BY t)
      INTO v_missing
      FROM (VALUES
        ('users'),
        ('conversations'),
        ('conversation_participants'),
        ('messages'),
        ('files'),
        ('call_signals')
      ) AS req(t)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = req.t
      );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'v1_smoke: missing V1 tables: %', v_missing;
    END IF;
END $$;

-- messages.source column exists NOT NULL DEFAULT 'text' (from legacy)
DO $$
DECLARE
    v_is_nullable text;
    v_default     text;
BEGIN
    SELECT is_nullable, column_default
      INTO v_is_nullable, v_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'messages'
       AND column_name  = 'source';

    IF v_is_nullable IS NULL THEN
        RAISE EXCEPTION 'v1_smoke: messages.source column missing';
    END IF;
    IF v_is_nullable <> 'NO' THEN
        RAISE EXCEPTION 'v1_smoke: messages.source must be NOT NULL, got %', v_is_nullable;
    END IF;
    IF v_default IS NULL OR v_default NOT LIKE '%text%' THEN
        RAISE EXCEPTION 'v1_smoke: messages.source default missing or wrong: %', v_default;
    END IF;
END $$;

-- messages_source_check constraint present (CHECK source IN text/voice)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'messages_source_check'
    ) THEN
        RAISE EXCEPTION 'v1_smoke: messages_source_check constraint missing';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 2. 15 policies present with expected commands (post-reconciliation)
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
    v_missing text;
BEGIN
    SELECT string_agg(p, ',' ORDER BY p)
      INTO v_missing
      FROM (VALUES
        ('call_signals::call_signals_insert::INSERT'),
        ('call_signals::call_signals_select::SELECT'),
        ('call_signals::call_signals_update::UPDATE'),
        ('conversation_participants::participants_insert::INSERT'),
        ('conversation_participants::participants_select::SELECT'),
        ('conversations::conversations_insert::INSERT'),
        ('conversations::conversations_select::SELECT'),
        ('files::files_insert::INSERT'),
        ('files::files_select::SELECT'),
        ('messages::messages_insert::INSERT'),
        ('messages::messages_select::SELECT'),
        ('messages::participants_insert_voice_messages::INSERT'),
        ('users::users_insert_own::INSERT'),
        ('users::users_select::SELECT'),
        ('users::users_update_own::UPDATE')
      ) AS req(p)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND (tablename || '::' || policyname || '::' || cmd) = req.p
      );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'v1_smoke: missing/wrong V1 policies: %', v_missing;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('users','conversations','conversation_participants',
                         'messages','files','call_signals');

    IF v_count <> 15 THEN
        RAISE EXCEPTION 'v1_smoke: expected 15 V1 policies, got %', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 3. Functions is_participant and shares_conversation exist as
--    SECURITY DEFINER, STABLE, LANGUAGE sql, owner postgres
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema,
               p.proname AS name,
               p.prosecdef AS security_definer,
               p.provolatile AS volatility,
               l.lanname AS language,
               ro.rolname AS owner
          FROM pg_proc p
          JOIN pg_namespace n  ON n.oid  = p.pronamespace
          JOIN pg_language  l  ON l.oid  = p.prolang
          JOIN pg_roles     ro ON ro.oid = p.proowner
         WHERE n.nspname = 'public'
           AND p.proname IN ('is_participant', 'shares_conversation')
    LOOP
        IF r.security_definer IS NOT TRUE THEN
            RAISE EXCEPTION 'v1_smoke: %.%: not SECURITY DEFINER', r.schema, r.name;
        END IF;
        IF r.volatility <> 's' THEN
            RAISE EXCEPTION 'v1_smoke: %.%: expected STABLE, got %', r.schema, r.name, r.volatility;
        END IF;
        IF r.language <> 'sql' THEN
            RAISE EXCEPTION 'v1_smoke: %.%: expected sql, got %', r.schema, r.name, r.language;
        END IF;
        IF r.owner <> 'postgres' THEN
            RAISE EXCEPTION 'v1_smoke: %.%: owner expected postgres, got %', r.schema, r.name, r.owner;
        END IF;
    END LOOP;

    IF (SELECT count(*) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('is_participant','shares_conversation')) <> 2 THEN
        RAISE EXCEPTION 'v1_smoke: expected 2 V1 functions, got a different count';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 4. RLS ENABLED on 6 V1 tables, FORCE RLS OFF (V1 fidelity)
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname IN ('users','conversations','conversation_participants',
                             'messages','files','call_signals')
    LOOP
        IF r.rls IS NOT TRUE THEN
            RAISE EXCEPTION 'v1_smoke: RLS not enabled on public.%', r.table_name;
        END IF;
        IF r.force_rls IS NOT FALSE THEN
            RAISE EXCEPTION 'v1_smoke: FORCE RLS unexpectedly on public.% (V1 fidelity)', r.table_name;
        END IF;
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 5. supabase_realtime — deterministic final state
--    (i) publish flags all TRUE; (ii) membership = exactly
--    {public.messages, public.call_signals}; (iii) zero spabla_v2 tables
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_flags record;
    v_count int;
    v_v2_count int;
    v_membership_bad boolean;
BEGIN
    SELECT p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate
      INTO v_flags
      FROM pg_publication p
     WHERE p.pubname = 'supabase_realtime';

    IF v_flags IS NULL THEN
        RAISE EXCEPTION 'v1_smoke: publication supabase_realtime missing';
    END IF;
    IF NOT (v_flags.pubinsert AND v_flags.pubupdate AND v_flags.pubdelete AND v_flags.pubtruncate) THEN
        RAISE EXCEPTION 'v1_smoke: publish flags not all TRUE (i=%, u=%, d=%, t=%)',
            v_flags.pubinsert, v_flags.pubupdate, v_flags.pubdelete, v_flags.pubtruncate;
    END IF;

    -- Cardinality exactly 2
    SELECT count(*) INTO v_count
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime';

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'v1_smoke: supabase_realtime membership cardinality expected 2, got %', v_count;
    END IF;

    -- Exact membership set
    v_membership_bad := EXISTS (
        SELECT 1 FROM pg_publication_rel pr
          JOIN pg_publication p ON p.oid = pr.prpubid
          JOIN pg_class c ON c.oid = pr.prrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE p.pubname = 'supabase_realtime'
           AND (n.nspname <> 'public'
                OR c.relname NOT IN ('messages','call_signals'))
    );

    IF v_membership_bad THEN
        RAISE EXCEPTION 'v1_smoke: supabase_realtime contains unexpected relation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
          JOIN pg_publication p ON p.oid = pr.prpubid
          JOIN pg_class c ON c.oid = pr.prrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE p.pubname = 'supabase_realtime'
           AND n.nspname = 'public' AND c.relname = 'messages'
    ) THEN
        RAISE EXCEPTION 'v1_smoke: supabase_realtime missing public.messages';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
          JOIN pg_publication p ON p.oid = pr.prpubid
          JOIN pg_class c ON c.oid = pr.prrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE p.pubname = 'supabase_realtime'
           AND n.nspname = 'public' AND c.relname = 'call_signals'
    ) THEN
        RAISE EXCEPTION 'v1_smoke: supabase_realtime missing public.call_signals';
    END IF;

    -- Zero spabla_v2.* in the publication
    SELECT count(*) INTO v_v2_count
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'spabla_v2';

    IF v_v2_count <> 0 THEN
        RAISE EXCEPTION 'v1_smoke: supabase_realtime contains spabla_v2 tables (count=%)', v_v2_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 6. Key indexes present
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_missing text;
BEGIN
    SELECT string_agg(i, ',' ORDER BY i)
      INTO v_missing
      FROM (VALUES
        ('idx_participants_user_id'),
        ('idx_conversations_created_by'),
        ('idx_messages_conv_created')
      ) AS req(i)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = req.i
      );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'v1_smoke: missing V1 indexes: %', v_missing;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 7. Grants baseline — authenticated has SELECT on all 6 tables;
--    both functions grant EXECUTE to PUBLIC (V1 fidelity)
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_missing_tables text;
    v_missing_funcs text;
BEGIN
    SELECT string_agg(t, ',' ORDER BY t)
      INTO v_missing_tables
      FROM (VALUES
        ('users'),('conversations'),('conversation_participants'),
        ('messages'),('files'),('call_signals')
      ) AS req(t)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND table_name = req.t
           AND grantee = 'authenticated'
           AND privilege_type = 'SELECT'
      );

    IF v_missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'v1_smoke: missing SELECT grants to authenticated on: %', v_missing_tables;
    END IF;

    SELECT string_agg(f, ',' ORDER BY f)
      INTO v_missing_funcs
      FROM (VALUES ('is_participant'), ('shares_conversation')) AS req(f)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.role_routine_grants
         WHERE routine_schema = 'public'
           AND routine_name = req.f
           AND grantee = 'PUBLIC'
           AND privilege_type = 'EXECUTE'
      );

    IF v_missing_funcs IS NOT NULL THEN
        RAISE EXCEPTION 'v1_smoke: missing EXECUTE grant to PUBLIC on: %', v_missing_funcs;
    END IF;
END $$;

\echo '=== v1_baseline_smoke.test.sql · OK ==='
