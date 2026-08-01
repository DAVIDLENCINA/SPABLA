-- SPABLA V2 · Fase 8 · Hito 8.2 — RLS bootstrap test suite.
--
-- Governance: Plan Hito 8.2 V1.2 §11 (rls_bootstrap tests). Runs against the
-- LOCAL Supabase stack after `supabase db reset --local` has applied the full
-- chain of migrations. ZERO connection to the productive remote.
--
-- Execution model: `psql --set ON_ERROR_STOP=1 -f`. Every assertion uses
-- RAISE EXCEPTION on failure; the CI job propagates the non-zero exit.
--
-- Test doubles for `authenticated` sessions use Supabase's canonical
-- pattern: `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"
-- = '{"sub":"<uuid>"}'`. This is the same mechanism Supabase's PostgREST
-- uses at runtime; `auth.uid()` reads `sub` from that GUC.

\echo '=== rls_bootstrap.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- 1. Five V2 tables in spabla_v2 with ENABLE + FORCE RLS
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_missing text;
    v_bad_rls text;
BEGIN
    SELECT string_agg(t, ',' ORDER BY t)
      INTO v_missing
      FROM (VALUES
        ('tenants'),('tenant_memberships'),('conversations'),
        ('messages'),('usage_ledger')
      ) AS req(t)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'spabla_v2' AND c.relname = req.t
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: missing V2 tables: %', v_missing;
    END IF;

    SELECT string_agg(c.relname, ',' ORDER BY c.relname)
      INTO v_bad_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'spabla_v2'
       AND c.relkind = 'r'
       AND (c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE);
    IF v_bad_rls IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: RLS/FORCE not both TRUE on: %', v_bad_rls;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 2. Runtime roles (authenticated, anon) are not BYPASSRLS, not superuser
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT rolname, rolbypassrls, rolsuper
          FROM pg_roles
         WHERE rolname IN ('authenticated','anon','authenticator')
    LOOP
        IF r.rolbypassrls THEN
            RAISE EXCEPTION 'rls_boot: role % must not have BYPASSRLS', r.rolname;
        END IF;
        IF r.rolsuper THEN
            RAISE EXCEPTION 'rls_boot: role % must not be superuser', r.rolname;
        END IF;
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 3. Grants — zero `anon` in `spabla_v2` (schema, tables, functions);
--    minimum authenticated grants; service_role has full DML on all tables
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_anon_schema int;
    v_anon_tables int;
    v_anon_funcs  int;
    v_auth_missing text;
    v_forbidden_auth text;
BEGIN
    -- Zero anon USAGE on schema spabla_v2
    SELECT count(*) INTO v_anon_schema
      FROM information_schema.role_usage_grants
     WHERE object_schema = 'spabla_v2'
       AND grantee = 'anon';
    IF v_anon_schema <> 0 THEN
        RAISE EXCEPTION 'rls_boot: anon must have no grants on schema spabla_v2 (found %)', v_anon_schema;
    END IF;

    -- Zero anon table-level grants under spabla_v2
    SELECT count(*) INTO v_anon_tables
      FROM information_schema.role_table_grants
     WHERE table_schema = 'spabla_v2'
       AND grantee = 'anon';
    IF v_anon_tables <> 0 THEN
        RAISE EXCEPTION 'rls_boot: anon must have no table grants in spabla_v2 (found %)', v_anon_tables;
    END IF;

    -- Zero anon EXECUTE on spabla_v2 admin functions
    SELECT count(*) INTO v_anon_funcs
      FROM information_schema.role_routine_grants
     WHERE routine_schema = 'spabla_v2'
       AND grantee = 'anon'
       AND privilege_type = 'EXECUTE';
    IF v_anon_funcs <> 0 THEN
        RAISE EXCEPTION 'rls_boot: anon must have no EXECUTE grants in spabla_v2 (found %)', v_anon_funcs;
    END IF;

    -- authenticated must have SELECT on all five tables
    SELECT string_agg(t, ',' ORDER BY t)
      INTO v_auth_missing
      FROM (VALUES
        ('tenants'),('tenant_memberships'),('conversations'),
        ('messages'),('usage_ledger')
      ) AS req(t)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'spabla_v2'
           AND table_name = req.t
           AND grantee = 'authenticated'
           AND privilege_type = 'SELECT'
      );
    IF v_auth_missing IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: authenticated missing SELECT on: %', v_auth_missing;
    END IF;

    -- authenticated must NOT have UPDATE or DELETE on any spabla_v2 table (§7.5)
    -- authenticated must NOT have INSERT on tenants, tenant_memberships, usage_ledger
    SELECT string_agg(table_name || '/' || privilege_type, ',' ORDER BY table_name || '/' || privilege_type)
      INTO v_forbidden_auth
      FROM information_schema.role_table_grants
     WHERE table_schema = 'spabla_v2'
       AND grantee = 'authenticated'
       AND (
            privilege_type IN ('UPDATE','DELETE')
         OR (privilege_type = 'INSERT'
             AND table_name IN ('tenants','tenant_memberships','usage_ledger'))
       );
    IF v_forbidden_auth IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: forbidden authenticated grants present: %', v_forbidden_auth;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 4. Admin functions — every EXECUTE grant is exactly {service_role};
--    zero grant to PUBLIC/anon/authenticated
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_leaks text;
    v_missing text;
BEGIN
    SELECT string_agg(routine_name || '/' || grantee, ',' ORDER BY routine_name || '/' || grantee)
      INTO v_leaks
      FROM information_schema.role_routine_grants
     WHERE routine_schema = 'spabla_v2'
       AND grantee IN ('PUBLIC','anon','authenticated')
       AND privilege_type = 'EXECUTE';
    IF v_leaks IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: admin function EXECUTE leaked to: %', v_leaks;
    END IF;

    SELECT string_agg(f, ',' ORDER BY f)
      INTO v_missing
      FROM (VALUES
        ('admin_create_tenant'),
        ('admin_add_membership'),
        ('admin_deactivate_membership'),
        ('admin_append_usage'),
        ('admin_purge_usage_by_tenant')
      ) AS req(f)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.role_routine_grants
         WHERE routine_schema = 'spabla_v2'
           AND routine_name = req.f
           AND grantee = 'service_role'
           AND privilege_type = 'EXECUTE'
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'rls_boot: admin function missing service_role EXECUTE: %', v_missing;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 5. Zero spabla_v2.* table in supabase_realtime publication
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'spabla_v2';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'rls_boot: spabla_v2 tables must not be in supabase_realtime (count=%)', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 6. Bootstrap fixture: two tenants (A, B), two actors (A, B), A active
--    in tenant A, B active in tenant B. Actor X is inactive in tenant A.
--    Uses admin functions to exercise the SECURITY DEFINER path.
-- ────────────────────────────────────────────────────────────────
BEGIN;

SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_tenant_a uuid := '00000000-0000-0000-0000-00000000000a'::uuid;
    v_tenant_b uuid := '00000000-0000-0000-0000-00000000000b'::uuid;
    v_actor_a  uuid := '00000000-0000-0000-0000-0000000000aa'::uuid;
    v_actor_b  uuid := '00000000-0000-0000-0000-0000000000bb'::uuid;
    v_actor_x  uuid := '00000000-0000-0000-0000-000000000078'::uuid;
BEGIN
    -- Insert tenants with explicit ids via service_role (grant INSERT).
    INSERT INTO spabla_v2.tenants (id, name) VALUES (v_tenant_a, 'Tenant A');
    INSERT INTO spabla_v2.tenants (id, name) VALUES (v_tenant_b, 'Tenant B');

    -- Memberships via admin function
    PERFORM spabla_v2.admin_add_membership(v_tenant_a, v_actor_a, 'owner');
    PERFORM spabla_v2.admin_add_membership(v_tenant_b, v_actor_b, 'owner');
    PERFORM spabla_v2.admin_add_membership(v_tenant_a, v_actor_x, 'member');
    PERFORM spabla_v2.admin_deactivate_membership(v_tenant_a, v_actor_x);
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- 7. Isolation A vs B: active member of A reads only tenant A rows
--    (0 rows for tenant B).
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';

DO $$
DECLARE
    v_a int;
    v_b int;
    v_self_membership int;
    v_other_membership int;
BEGIN
    -- Own tenant visible
    SELECT count(*) INTO v_a FROM spabla_v2.tenants
     WHERE id = '00000000-0000-0000-0000-00000000000a'::uuid;
    IF v_a <> 1 THEN
        RAISE EXCEPTION 'rls_boot: active member cannot see own tenant (count=%)', v_a;
    END IF;

    -- Other tenant NOT visible
    SELECT count(*) INTO v_b FROM spabla_v2.tenants
     WHERE id = '00000000-0000-0000-0000-00000000000b'::uuid;
    IF v_b <> 0 THEN
        RAISE EXCEPTION 'rls_boot: active member sees foreign tenant (count=%)', v_b;
    END IF;

    -- Own active membership visible; other memberships not
    SELECT count(*) INTO v_self_membership FROM spabla_v2.tenant_memberships
     WHERE tenant_id = '00000000-0000-0000-0000-00000000000a'::uuid
       AND actor_id  = '00000000-0000-0000-0000-0000000000aa'::uuid;
    IF v_self_membership <> 1 THEN
        RAISE EXCEPTION 'rls_boot: own active membership not visible (%)', v_self_membership;
    END IF;

    SELECT count(*) INTO v_other_membership FROM spabla_v2.tenant_memberships;
    IF v_other_membership <> 1 THEN
        RAISE EXCEPTION 'rls_boot: authenticated sees other memberships (%)', v_other_membership;
    END IF;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 8. Inactive membership grants no access to tenant tables
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000078"}';

DO $$
DECLARE
    v int;
BEGIN
    SELECT count(*) INTO v FROM spabla_v2.tenants;
    IF v <> 0 THEN
        RAISE EXCEPTION 'rls_boot: inactive member reads tenants (%)', v;
    END IF;
    SELECT count(*) INTO v FROM spabla_v2.tenant_memberships;
    IF v <> 0 THEN
        RAISE EXCEPTION 'rls_boot: inactive member reads memberships (%)', v;
    END IF;
    SELECT count(*) INTO v FROM spabla_v2.conversations;
    IF v <> 0 THEN
        RAISE EXCEPTION 'rls_boot: inactive member reads conversations (%)', v;
    END IF;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 9. Cross-tenant INSERT blocked. Actor A cannot insert a conversation
--    whose tenant_id is tenant B.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';

DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        INSERT INTO spabla_v2.conversations (id, tenant_id, created_by, language)
        VALUES (gen_random_uuid(),
                '00000000-0000-0000-0000-00000000000b'::uuid,
                '00000000-0000-0000-0000-0000000000aa'::uuid,
                'en');
        RAISE EXCEPTION 'rls_boot: cross-tenant INSERT unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        NULL;  -- expected
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE '%row-level security%' OR v_msg LIKE '%new row violates%' THEN
            NULL;
        ELSE
            RAISE;
        END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 10. Composite FK enforces cross-tenant isolation on messages.
--     Setup: create conversation C in tenant A via service_role,
--     then try to insert a message referencing C but with tenant_id = B.
-- ────────────────────────────────────────────────────────────────
BEGIN;

SET LOCAL ROLE service_role;
INSERT INTO spabla_v2.conversations (id, tenant_id, created_by, language)
VALUES ('00000000-0000-0000-0000-0000000000c1'::uuid,
        '00000000-0000-0000-0000-00000000000a'::uuid,
        '00000000-0000-0000-0000-0000000000aa'::uuid,
        'en');

DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        INSERT INTO spabla_v2.messages (id, tenant_id, conversation_id, sender_id, text, language)
        VALUES (gen_random_uuid(),
                '00000000-0000-0000-0000-00000000000b'::uuid,  -- WRONG tenant
                '00000000-0000-0000-0000-0000000000c1'::uuid,
                '00000000-0000-0000-0000-0000000000bb'::uuid,
                'illegal',
                'en');
        RAISE EXCEPTION 'rls_boot: composite FK cross-tenant INSERT unexpectedly succeeded';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 11. No membership self-elevation: authenticated cannot INSERT/UPDATE/DELETE
--     on tenant_memberships. All three must fail structurally.
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';

DO $$
DECLARE
    v_msg text;
BEGIN
    -- INSERT must be denied by RLS (no INSERT policy) or by missing grant.
    BEGIN
        INSERT INTO spabla_v2.tenant_memberships (tenant_id, actor_id, role, is_active)
        VALUES ('00000000-0000-0000-0000-00000000000a'::uuid,
                '00000000-0000-0000-0000-0000000000aa'::uuid,
                'owner', TRUE);
        RAISE EXCEPTION 'rls_boot: authenticated INSERT on tenant_memberships unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%row-level security%' OR v_msg LIKE '%permission denied%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;

    -- UPDATE must be denied.
    BEGIN
        UPDATE spabla_v2.tenant_memberships SET role = 'owner'
         WHERE tenant_id = '00000000-0000-0000-0000-00000000000a'::uuid
           AND actor_id  = '00000000-0000-0000-0000-0000000000aa'::uuid;
        RAISE EXCEPTION 'rls_boot: authenticated UPDATE on tenant_memberships unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' OR v_msg LIKE '%row-level security%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;

    -- DELETE must be denied.
    BEGIN
        DELETE FROM spabla_v2.tenant_memberships
         WHERE tenant_id = '00000000-0000-0000-0000-00000000000a'::uuid
           AND actor_id  = '00000000-0000-0000-0000-0000000000aa'::uuid;
        RAISE EXCEPTION 'rls_boot: authenticated DELETE on tenant_memberships unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' OR v_msg LIKE '%row-level security%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 12. Usage ledger append-only: authenticated INSERT/UPDATE/DELETE denied
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';

DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        INSERT INTO spabla_v2.usage_ledger (
            tenant_id, source, metric_kind, quantity, unit,
            occurred_at, idempotency_key, entry_kind
        ) VALUES (
            '00000000-0000-0000-0000-00000000000a'::uuid,
            'test-source', 'turns', 1, 'turns',
            now(), gen_random_uuid(), 'normal'
        );
        RAISE EXCEPTION 'rls_boot: authenticated INSERT on usage_ledger unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' OR v_msg LIKE '%row-level security%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;

    BEGIN
        UPDATE spabla_v2.usage_ledger SET quantity = 999 WHERE TRUE;
        RAISE EXCEPTION 'rls_boot: authenticated UPDATE on usage_ledger unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' OR v_msg LIKE '%row-level security%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;

    BEGIN
        DELETE FROM spabla_v2.usage_ledger WHERE TRUE;
        RAISE EXCEPTION 'rls_boot: authenticated DELETE on usage_ledger unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE '%permission denied%' OR v_msg LIKE '%row-level security%' THEN
                NULL;
            ELSE
                RAISE;
            END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 13. admin_append_usage via service_role: valid, idempotent, coherence-checked
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_id_1   uuid;
    v_id_2   uuid;
    v_count  int;
    v_msg    text;
    v_key    uuid := gen_random_uuid();
BEGIN
    -- First insert
    v_id_1 := spabla_v2.admin_append_usage(
        '00000000-0000-0000-0000-00000000000a'::uuid,
        '00000000-0000-0000-0000-0000000000aa'::uuid,
        'harness_e2e', 'text_chars', 42, 'chars',
        v_key, NULL, 'normal', NULL, TRUE
    );
    IF v_id_1 IS NULL THEN
        RAISE EXCEPTION 'rls_boot: admin_append_usage returned NULL';
    END IF;

    -- Idempotent retry (same key + tenant + source): silent success, same id
    v_id_2 := spabla_v2.admin_append_usage(
        '00000000-0000-0000-0000-00000000000a'::uuid,
        '00000000-0000-0000-0000-0000000000aa'::uuid,
        'harness_e2e', 'text_chars', 42, 'chars',
        v_key, NULL, 'normal', NULL, TRUE
    );
    IF v_id_1 <> v_id_2 THEN
        RAISE EXCEPTION 'rls_boot: idempotent retry did not return same id';
    END IF;

    SELECT count(*) INTO v_count FROM spabla_v2.usage_ledger
     WHERE tenant_id = '00000000-0000-0000-0000-00000000000a'::uuid
       AND source = 'harness_e2e'
       AND idempotency_key = v_key;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'rls_boot: idempotency broken (count=%)', v_count;
    END IF;

    -- Coherence: metric_kind/unit mismatch must fail (CHECK)
    BEGIN
        PERFORM spabla_v2.admin_append_usage(
            '00000000-0000-0000-0000-00000000000a'::uuid,
            '00000000-0000-0000-0000-0000000000aa'::uuid,
            'harness_e2e', 'voice_seconds', 1, 'chars',   -- wrong pair
            gen_random_uuid(), NULL, 'normal', NULL, TRUE
        );
        RAISE EXCEPTION 'rls_boot: metric_kind/unit incoherence accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- Actor without active membership rejected (require_membership=TRUE)
    BEGIN
        PERFORM spabla_v2.admin_append_usage(
            '00000000-0000-0000-0000-00000000000a'::uuid,
            '00000000-0000-0000-0000-0000000000bb'::uuid,  -- not member of A
            'harness_e2e', 'text_chars', 1, 'chars',
            gen_random_uuid(), NULL, 'normal', NULL, TRUE
        );
        RAISE EXCEPTION 'rls_boot: append_usage without membership succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    -- Negative quantity for entry_kind=normal rejected
    BEGIN
        PERFORM spabla_v2.admin_append_usage(
            '00000000-0000-0000-0000-00000000000a'::uuid,
            '00000000-0000-0000-0000-0000000000aa'::uuid,
            'harness_e2e', 'text_chars', -1, 'chars',
            gen_random_uuid(), NULL, 'normal', NULL, TRUE
        );
        RAISE EXCEPTION 'rls_boot: negative quantity in normal accepted';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE '%quantity must be >= 0%'
           AND v_msg NOT LIKE '%quantity_normal_nonnegative%' THEN
            RAISE EXCEPTION 'rls_boot: unexpected error for negative quantity: %', v_msg;
        END IF;
    END;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- 14. admin_append_usage denied to authenticated (permission)
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa"}';

DO $$
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_append_usage(
            '00000000-0000-0000-0000-00000000000a'::uuid,
            '00000000-0000-0000-0000-0000000000aa'::uuid,
            'harness_e2e', 'text_chars', 1, 'chars',
            gen_random_uuid(), NULL, 'normal', NULL, TRUE
        );
        RAISE EXCEPTION 'rls_boot: authenticated executed admin_append_usage';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END $$;
ROLLBACK;

\echo '=== rls_bootstrap.test.sql · OK ==='
