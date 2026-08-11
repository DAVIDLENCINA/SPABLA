-- SPABLA V2 · Fase 9 · Hito 9.1.1 — SQL test suite for
-- spabla_v2.message_translations.
--
-- Runs against the LOCAL Supabase stack after
-- `scripts/ci/apply-migrations.sh`. Assertions use RAISE EXCEPTION so
-- the outer `psql --set ON_ERROR_STOP=1` shell exits non-zero on any
-- failure. Cleanup uses the postgres role at file-end via a savepoint
-- because RLS/FORCE-RLS restricts what other roles can delete.

\echo '=== message_translations.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- §1. Structure: table, columns, PK, RLS, FORCE RLS.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'spabla_v2' AND c.relname = 'message_translations'
    ) THEN
        RAISE EXCEPTION 'message_translations: table missing';
    END IF;

    -- ENABLE + FORCE RLS
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'spabla_v2' AND c.relname = 'message_translations'
           AND c.relrowsecurity IS TRUE AND c.relforcerowsecurity IS TRUE
    ) THEN
        RAISE EXCEPTION 'message_translations: RLS or FORCE RLS not enabled';
    END IF;
END $$;

-- PK columns and order
DO $$
DECLARE v_cols text;
BEGIN
    SELECT string_agg(a.attname, ',' ORDER BY x.n) INTO v_cols
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(colnum, n)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.colnum
    WHERE n.nspname = 'spabla_v2'
      AND t.relname = 'message_translations'
      AND c.contype = 'p';
    IF v_cols IS NULL OR v_cols <> 'tenant_id,message_id,target_language,translation_version' THEN
        RAISE EXCEPTION 'message_translations: PK columns unexpected: %', v_cols;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §2. Seed a controlled fixture as postgres/service_role.
-- Two tenants (T1, T2), two actors (A in T1, X in T2), two messages
-- (one per tenant, both in Spanish). Everything scoped to unique UUIDs
-- so parallel test runs cannot collide.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t1 uuid := gen_random_uuid();
    t2 uuid := gen_random_uuid();
    a  uuid := gen_random_uuid();
    x  uuid := gen_random_uuid();
    c1 uuid := gen_random_uuid();
    c2 uuid := gen_random_uuid();
    m1 uuid := gen_random_uuid();  -- message in T1
    m2 uuid := gen_random_uuid();  -- message in T2
    seed_json jsonb;
BEGIN
    INSERT INTO spabla_v2.tenants (id, name) VALUES
      (t1, 'mt-test T1 ' || t1),
      (t2, 'mt-test T2 ' || t2);
    PERFORM spabla_v2.admin_add_membership(t1, a, 'owner');
    PERFORM spabla_v2.admin_add_membership(t2, x, 'owner');
    INSERT INTO spabla_v2.conversations (id, tenant_id, created_by, language) VALUES
      (c1, t1, a, 'es'),
      (c2, t2, x, 'es');
    INSERT INTO spabla_v2.messages (id, tenant_id, conversation_id, sender_id, text, language) VALUES
      (m1, t1, c1, a, 'Hola m1', 'es'),
      (m2, t2, c2, x, 'Hola m2', 'es');

    -- Persist the fixture across DO blocks via a temp setting so later
    -- sections can rehydrate the ids without repeating the seed. psql
    -- level GUC works fine here since sessions are single-shot.
    PERFORM set_config('spabla_mt_test.t1', t1::text, false);
    PERFORM set_config('spabla_mt_test.t2', t2::text, false);
    PERFORM set_config('spabla_mt_test.a',  a::text, false);
    PERFORM set_config('spabla_mt_test.x',  x::text, false);
    PERFORM set_config('spabla_mt_test.m1', m1::text, false);
    PERFORM set_config('spabla_mt_test.m2', m2::text, false);
END $$;

-- ────────────────────────────────────────────────────────────────
-- §3. FK integrity: a translation for a non-existent message is
-- rejected by the composite FK (tenant_id, message_id).
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
    BEGIN
        INSERT INTO spabla_v2.message_translations
          (tenant_id, message_id, target_language, translation_version, translated_text, provider)
        VALUES
          (current_setting('spabla_mt_test.t1')::uuid,
           gen_random_uuid(),         -- unknown message
           'en', 'v1', 'ghost', 'test');
        RAISE EXCEPTION 'expected FK violation for unknown message';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §4. PK uniqueness: (tenant, message, target, version) forbids
-- duplicates.
-- ────────────────────────────────────────────────────────────────

INSERT INTO spabla_v2.message_translations
  (tenant_id, message_id, target_language, translation_version, translated_text, provider)
VALUES
  (current_setting('spabla_mt_test.t1')::uuid,
   current_setting('spabla_mt_test.m1')::uuid,
   'en', 'v1', 'Hi m1', 'test');

DO $$
BEGIN
    BEGIN
        INSERT INTO spabla_v2.message_translations
          (tenant_id, message_id, target_language, translation_version, translated_text, provider)
        VALUES
          (current_setting('spabla_mt_test.t1')::uuid,
           current_setting('spabla_mt_test.m1')::uuid,
           'en', 'v1', 'Hi m1 duplicate', 'test');
        RAISE EXCEPTION 'expected PK violation on duplicate insert';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §5. anon has zero privilege — SELECT and INSERT both denied.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
    BEGIN
        SET LOCAL ROLE anon;
        PERFORM 1 FROM spabla_v2.message_translations LIMIT 1;
        RESET ROLE;
        RAISE EXCEPTION 'anon must not be allowed to SELECT message_translations';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

DO $$
BEGIN
    BEGIN
        SET LOCAL ROLE anon;
        INSERT INTO spabla_v2.message_translations
          (tenant_id, message_id, target_language, translation_version, translated_text, provider)
        VALUES
          (current_setting('spabla_mt_test.t1')::uuid,
           current_setting('spabla_mt_test.m1')::uuid,
           'fr', 'v1', 'Bonjour', 'test');
        RESET ROLE;
        RAISE EXCEPTION 'anon must not be allowed to INSERT message_translations';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §6. authenticated: can SELECT own tenant only, cannot INSERT.
-- ────────────────────────────────────────────────────────────────

-- 6.a — actor A (member of T1) reads only T1 rows.
DO $$
DECLARE v_count_t1 int;
        v_count_t2 int;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', current_setting('spabla_mt_test.a'))::text, true);

    SELECT count(*) INTO v_count_t1
      FROM spabla_v2.message_translations
     WHERE tenant_id = current_setting('spabla_mt_test.t1')::uuid;

    SELECT count(*) INTO v_count_t2
      FROM spabla_v2.message_translations
     WHERE tenant_id = current_setting('spabla_mt_test.t2')::uuid;

    RESET ROLE;

    IF v_count_t1 = 0 THEN
        RAISE EXCEPTION 'actor A must see T1 rows via RLS';
    END IF;
    IF v_count_t2 <> 0 THEN
        RAISE EXCEPTION 'actor A must NOT see T2 rows via RLS (got %)', v_count_t2;
    END IF;
END $$;

-- 6.b — actor X (member of T2) reads only T2 rows even when asking for T1.
DO $$
DECLARE v_count_t1 int;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', current_setting('spabla_mt_test.x'))::text, true);

    SELECT count(*) INTO v_count_t1
      FROM spabla_v2.message_translations
     WHERE tenant_id = current_setting('spabla_mt_test.t1')::uuid;

    RESET ROLE;

    IF v_count_t1 <> 0 THEN
        RAISE EXCEPTION 'actor X must NOT see T1 rows via RLS (got %)', v_count_t1;
    END IF;
END $$;

-- 6.c — authenticated cannot INSERT (no policy, no grant).
DO $$
BEGIN
    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', current_setting('spabla_mt_test.a'))::text, true);
        INSERT INTO spabla_v2.message_translations
          (tenant_id, message_id, target_language, translation_version, translated_text, provider)
        VALUES
          (current_setting('spabla_mt_test.t1')::uuid,
           current_setting('spabla_mt_test.m1')::uuid,
           'de', 'v1', 'Hallo', 'test');
        RESET ROLE;
        RAISE EXCEPTION 'authenticated must not be allowed to INSERT message_translations';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

-- 6.d — authenticated cannot UPDATE (no policy, no grant).
DO $$
BEGIN
    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', current_setting('spabla_mt_test.a'))::text, true);
        UPDATE spabla_v2.message_translations
           SET translated_text = 'hijacked'
         WHERE tenant_id = current_setting('spabla_mt_test.t1')::uuid;
        RESET ROLE;
        RAISE EXCEPTION 'authenticated must not be allowed to UPDATE message_translations';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

-- 6.e — authenticated cannot DELETE (no policy, no grant).
DO $$
BEGIN
    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', current_setting('spabla_mt_test.a'))::text, true);
        DELETE FROM spabla_v2.message_translations
         WHERE tenant_id = current_setting('spabla_mt_test.t1')::uuid;
        RESET ROLE;
        RAISE EXCEPTION 'authenticated must not be allowed to DELETE message_translations';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §7. Round-trip retrieval: what was stored is what comes back.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE v_row spabla_v2.message_translations%ROWTYPE;
BEGIN
    SELECT * INTO v_row
      FROM spabla_v2.message_translations
     WHERE tenant_id = current_setting('spabla_mt_test.t1')::uuid
       AND message_id = current_setting('spabla_mt_test.m1')::uuid
       AND target_language = 'en'
       AND translation_version = 'v1';
    IF v_row.translated_text <> 'Hi m1' OR v_row.provider <> 'test' THEN
        RAISE EXCEPTION 'round-trip mismatch: (%, %)', v_row.translated_text, v_row.provider;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §8. Cleanup — delete only what we inserted, as postgres.
-- Only `message_translations` cascades on its FK to `messages`. The
-- other Fase 8 tables carry no ON DELETE cascade, so we walk the
-- dependency graph explicitly in reverse order.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_t1 uuid := current_setting('spabla_mt_test.t1')::uuid;
    v_t2 uuid := current_setting('spabla_mt_test.t2')::uuid;
BEGIN
    DELETE FROM spabla_v2.messages
     WHERE tenant_id IN (v_t1, v_t2);
    DELETE FROM spabla_v2.conversations
     WHERE tenant_id IN (v_t1, v_t2);
    DELETE FROM spabla_v2.tenant_memberships
     WHERE tenant_id IN (v_t1, v_t2);
    DELETE FROM spabla_v2.tenants
     WHERE id IN (v_t1, v_t2);
END $$;

\echo '=== message_translations.test.sql · OK ==='
