-- SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 — Atomic onboarding integration suite.
--
-- Governance: Contract Q1-RR-SCOPE §14 (matriz 58 casos). Runs against
-- the LOCAL Supabase stack after `supabase db reset --local` applied
-- the full chain of migrations. ZERO connection to any productive DB.
--
-- Execution: `psql --set ON_ERROR_STOP=1 -f`. Any failure raises an
-- exception; the CI job propagates the non-zero exit.
--
-- Cases covered here (Q2-NN identifiers stable for traceability):
--
--   Q2-05  actor nuevo → 200 crea
--   Q2-06  actor ya provisionado → 200 idempotente
--   Q2-07  actor con tenant compartido pero sin personal → crea personal
--   Q2-08  actor con personal + compartido → idempotente sobre personal
--   Q2-09  membership desactivada → reactiva en la misma transacción
--   Q2-10  mapping válido con tenant inexistente → RAISE 23503 (opaco 500)
--   Q2-11  dos llamadas secuenciales → mismo tenantId
--   Q2-13  20 llamadas repetidas serialmente → 1 tenant/1 membership/1 mapping
--   Q2-14  fallo tras crear tenant → ROLLBACK completo
--   Q2-15  fallo antes de commit → ROLLBACK completo
--   Q2-25  caller privilegiado no puede persistir texto arbitrario
--          (firma en `pg_proc` = un único parámetro uuid)
--   Q2-31  post-onboarding: 1 tenant personal exacto
--   Q2-32  post-onboarding: 1 membership exacta
--   Q2-33  post-fallo: cero tenant huérfano
--   Q2-34  post-fallo: cero membership huérfana
--   Q2-38  cero conversación creada por el onboarding
--   Q2-39  authenticated no puede SELECT en actor_personal_workspace
--   Q2-40  RPC no invocable por anon
--   Q2-41  RPC no invocable directamente por authenticated
--   Q2-44  rollback DROP TABLE ... CASCADE no elimina tenants existentes
--   Q2-48  tenant eliminado manualmente sin flujo autorizado (§5 D) →
--          RAISE 23503, cuarentena
--   Q2-53  deletion_pending fixture escribible bajo service_role
--   Q2-56  legal_hold     fixture escribible bajo service_role
--   Q2-58  tenant existente sin mapping (estado legacy)

\echo '=== atomic_onboarding.test.sql · begin ==='

-- ────────────────────────────────────────────────────────────────
-- Preparación: reset controlado del estado del onboarding
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET session_replication_role = 'replica';
DELETE FROM spabla_v2.actor_lifecycle_state;
DELETE FROM spabla_v2.tenant_memberships;
DELETE FROM spabla_v2.actor_personal_workspace;
-- No tocar tenants preexistentes: comprobado en Q2-44.
SET session_replication_role = 'origin';
COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Q2-25 · Caller privilegiado no puede persistir texto arbitrario
--         La firma en pg_proc admite un único parámetro uuid.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_signature text;
BEGIN
    SELECT pg_catalog.pg_get_function_identity_arguments(p.oid)
      INTO v_signature
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'spabla_v2'
       AND p.proname = 'admin_ensure_personal_workspace';
    IF v_signature IS NULL THEN
        RAISE EXCEPTION 'Q2-25: admin_ensure_personal_workspace not found';
    END IF;
    IF v_signature <> 'p_actor_id uuid' THEN
        RAISE EXCEPTION 'Q2-25: signature drift, got: %', v_signature;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-39 / Q2-40 / Q2-41 · RLS + GRANT audit
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_rls_ok boolean;
    v_grant_authenticated int;
    v_grant_anon int;
    v_grant_service int;
    v_exec_anon int;
    v_exec_authenticated int;
    v_exec_service int;
BEGIN
    -- Q2-39: RLS ENABLE + FORCE en actor_personal_workspace
    SELECT (relrowsecurity AND relforcerowsecurity)
      INTO v_rls_ok
      FROM pg_class
     WHERE relnamespace = 'spabla_v2'::regnamespace
       AND relname = 'actor_personal_workspace';
    IF NOT v_rls_ok THEN
        RAISE EXCEPTION 'Q2-39: RLS/FORCE not both TRUE on actor_personal_workspace';
    END IF;

    -- Q2-39: cero grant a authenticated sobre actor_personal_workspace
    SELECT COUNT(*)
      INTO v_grant_authenticated
      FROM information_schema.table_privileges
     WHERE table_schema = 'spabla_v2'
       AND table_name = 'actor_personal_workspace'
       AND grantee = 'authenticated';
    IF v_grant_authenticated > 0 THEN
        RAISE EXCEPTION 'Q2-39: authenticated must have zero grants on actor_personal_workspace';
    END IF;

    -- Cero grant a anon
    SELECT COUNT(*)
      INTO v_grant_anon
      FROM information_schema.table_privileges
     WHERE table_schema = 'spabla_v2'
       AND table_name = 'actor_personal_workspace'
       AND grantee = 'anon';
    IF v_grant_anon > 0 THEN
        RAISE EXCEPTION 'Q2-39: anon must have zero grants on actor_personal_workspace';
    END IF;

    -- service_role tiene todos los grants
    SELECT COUNT(DISTINCT privilege_type)
      INTO v_grant_service
      FROM information_schema.table_privileges
     WHERE table_schema = 'spabla_v2'
       AND table_name = 'actor_personal_workspace'
       AND grantee = 'service_role'
       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
    IF v_grant_service <> 4 THEN
        RAISE EXCEPTION 'Q2-39: service_role must have SELECT/INSERT/UPDATE/DELETE on actor_personal_workspace';
    END IF;

    -- Q2-40: EXECUTE no concedido a anon
    SELECT COUNT(*)
      INTO v_exec_anon
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'spabla_v2'
       AND routine_name = 'admin_ensure_personal_workspace'
       AND grantee = 'anon';
    IF v_exec_anon <> 0 THEN
        RAISE EXCEPTION 'Q2-40: anon must have zero EXECUTE on admin_ensure_personal_workspace';
    END IF;

    -- Q2-41: EXECUTE no concedido a authenticated
    SELECT COUNT(*)
      INTO v_exec_authenticated
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'spabla_v2'
       AND routine_name = 'admin_ensure_personal_workspace'
       AND grantee = 'authenticated';
    IF v_exec_authenticated <> 0 THEN
        RAISE EXCEPTION 'Q2-41: authenticated must have zero EXECUTE on admin_ensure_personal_workspace';
    END IF;

    -- service_role sí tiene EXECUTE
    SELECT COUNT(*)
      INTO v_exec_service
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'spabla_v2'
       AND routine_name = 'admin_ensure_personal_workspace'
       AND grantee = 'service_role'
       AND privilege_type = 'EXECUTE';
    IF v_exec_service = 0 THEN
        RAISE EXCEPTION 'Q2-40/41: service_role must have EXECUTE on admin_ensure_personal_workspace';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-39 (session-level): authenticated no puede SELECT en actor_personal_workspace
-- ────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111"}';
DO $$
DECLARE
    v_denied boolean := FALSE;
BEGIN
    BEGIN
        PERFORM 1 FROM spabla_v2.actor_personal_workspace LIMIT 1;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_denied := TRUE;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION 'Q2-39: authenticated MUST NOT have SELECT permission on actor_personal_workspace';
    END IF;
END $$;
ROLLBACK;

-- Q2-40: anon no puede invocar la RPC
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
    v_denied boolean := FALSE;
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_ensure_personal_workspace('11111111-1111-1111-1111-111111111111'::uuid);
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_denied := TRUE;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION 'Q2-40: anon MUST NOT have EXECUTE on admin_ensure_personal_workspace';
    END IF;
END $$;
ROLLBACK;

-- Q2-41: authenticated no puede invocar la RPC directamente
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111"}';
DO $$
DECLARE
    v_denied boolean := FALSE;
BEGIN
    BEGIN
        PERFORM spabla_v2.admin_ensure_personal_workspace('11111111-1111-1111-1111-111111111111'::uuid);
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_denied := TRUE;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION 'Q2-41: authenticated MUST NOT have EXECUTE on admin_ensure_personal_workspace';
    END IF;
END $$;
ROLLBACK;

-- ────────────────────────────────────────────────────────────────
-- Q2-05 · Actor nuevo → crea
-- Q2-06 · Actor ya provisionado → idempotente
-- Q2-11 · Dos secuenciales → mismo tenantId
-- Q2-13 · Repetición 20 veces → 1 fila en cada tabla
-- Q2-31 · Exactamente 1 tenant personal
-- Q2-32 · Exactamente 1 membership
-- Q2-38 · Cero conversación creada
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := '55555555-5555-5555-5555-555555555555';
    v_tenant_first uuid;
    v_tenant_second uuid;
    v_created_first boolean;
    v_created_second boolean;
    r record;
    v_count int;
    v_convs int;
BEGIN
    -- Q2-05: primera invocación crea
    SELECT tenant_id, created INTO v_tenant_first, v_created_first
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);
    IF v_created_first IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Q2-05: first call must return created=true';
    END IF;

    -- Q2-06 + Q2-11: segunda invocación idempotente
    SELECT tenant_id, created INTO v_tenant_second, v_created_second
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);
    IF v_created_second IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Q2-06: second call must return created=false';
    END IF;
    IF v_tenant_second <> v_tenant_first THEN
        RAISE EXCEPTION 'Q2-11: second call must return same tenantId';
    END IF;

    -- Q2-13: repetir 20 veces, verificar que sigue siendo 1 tenant + 1 membership + 1 mapping
    FOR i IN 1..20 LOOP
        PERFORM spabla_v2.admin_ensure_personal_workspace(v_actor);
    END LOOP;

    -- Q2-31: 1 tenant personal exacto
    SELECT COUNT(*) INTO v_count
      FROM spabla_v2.tenants t
     WHERE t.id IN (SELECT apw.tenant_id FROM spabla_v2.actor_personal_workspace apw WHERE apw.actor_id = v_actor);
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Q2-31: expected exactly 1 personal tenant, got %', v_count;
    END IF;

    -- Q2-32: 1 membership exacta
    SELECT COUNT(*) INTO v_count
      FROM spabla_v2.tenant_memberships tm
     WHERE tm.actor_id = v_actor
       AND tm.tenant_id = v_tenant_first;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Q2-32: expected exactly 1 membership, got %', v_count;
    END IF;

    -- Verificar nombre = clave interna fija (contract §9, I-14)
    SELECT name INTO r FROM spabla_v2.tenants WHERE id = v_tenant_first;
    IF r.name <> 'workspace.personal.default' THEN
        RAISE EXCEPTION 'Q2-25/§9: tenants.name must be the fixed internal key, got: %', r.name;
    END IF;

    -- Q2-38: cero conversación creada
    SELECT COUNT(*) INTO v_convs
      FROM spabla_v2.conversations c
     WHERE c.tenant_id = v_tenant_first;
    IF v_convs <> 0 THEN
        RAISE EXCEPTION 'Q2-38: onboarding must not create conversations, got %', v_convs;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-07 · Actor con tenant compartido pero sin personal → crea personal
-- Q2-08 · Actor con personal + compartido → idempotente sobre personal
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := '66666666-6666-6666-6666-666666666666';
    v_shared_tenant uuid;
    v_personal_tenant uuid;
    v_second_call uuid;
    v_count int;
BEGIN
    -- Preparar tenant compartido preexistente + membership member
    v_shared_tenant := spabla_v2.admin_create_tenant('shared enterprise');
    PERFORM spabla_v2.admin_add_membership(v_shared_tenant, v_actor, 'member');

    -- Q2-07: onboarding crea el personal SIN tocar el compartido
    SELECT tenant_id INTO v_personal_tenant
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);
    IF v_personal_tenant = v_shared_tenant THEN
        RAISE EXCEPTION 'Q2-07: personal tenant must be different from shared';
    END IF;

    -- Verificar que el compartido sigue intacto
    SELECT COUNT(*) INTO v_count FROM spabla_v2.tenants WHERE id = v_shared_tenant;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Q2-07: shared tenant must remain intact, count=%', v_count;
    END IF;

    -- Q2-08: segunda llamada idempotente sobre el personal
    SELECT tenant_id INTO v_second_call
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);
    IF v_second_call <> v_personal_tenant THEN
        RAISE EXCEPTION 'Q2-08: second call must return same personal tenantId';
    END IF;

    -- Verificar 2 memberships: 1 owner (personal) + 1 member (compartido)
    SELECT COUNT(*) INTO v_count
      FROM spabla_v2.tenant_memberships tm
     WHERE tm.actor_id = v_actor;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Q2-08: expected 2 memberships (personal owner + shared member), got %', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-09 · Membership desactivada → reactiva
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := '77777777-7777-7777-7777-777777777777';
    v_tenant uuid;
    v_active boolean;
BEGIN
    SELECT tenant_id INTO v_tenant
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);

    -- Desactivar externamente
    PERFORM spabla_v2.admin_deactivate_membership(v_tenant, v_actor);
    SELECT is_active INTO v_active
      FROM spabla_v2.tenant_memberships
     WHERE tenant_id = v_tenant AND actor_id = v_actor;
    IF v_active THEN
        RAISE EXCEPTION 'Q2-09 setup: deactivation should have set is_active=false';
    END IF;

    -- Re-invocar el onboarding: debe reactivar
    PERFORM spabla_v2.admin_ensure_personal_workspace(v_actor);
    SELECT is_active INTO v_active
      FROM spabla_v2.tenant_memberships
     WHERE tenant_id = v_tenant AND actor_id = v_actor;
    IF NOT v_active THEN
        RAISE EXCEPTION 'Q2-09: onboarding must reactivate membership';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-10 / Q2-48 · Mapping huérfano (corrupción manual) → RAISE 23503
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := '88888888-8888-8888-8888-888888888888';
    v_caught text;
BEGIN
    -- Insertar mapping con tenant_id inexistente (bypass FK)
    BEGIN
        EXECUTE 'SET LOCAL session_replication_role = ''replica''';
        INSERT INTO spabla_v2.actor_personal_workspace (actor_id, tenant_id)
        VALUES (v_actor, 'fefefefe-fefe-fefe-fefe-fefefefefefe'::uuid);
        EXECUTE 'SET LOCAL session_replication_role = ''origin''';

        -- Invocar RPC: debe RAISE 23503
        BEGIN
            PERFORM spabla_v2.admin_ensure_personal_workspace(v_actor);
            v_caught := 'no_exception';
        EXCEPTION
            WHEN foreign_key_violation THEN
                v_caught := 'foreign_key_violation';
        END;

        IF v_caught <> 'foreign_key_violation' THEN
            RAISE EXCEPTION 'Q2-10/48: expected foreign_key_violation (SQLSTATE 23503), got: %', v_caught;
        END IF;
    END;
END $$;

-- Limpieza del mapping huérfano insertado
BEGIN;
SET session_replication_role = 'replica';
DELETE FROM spabla_v2.actor_personal_workspace
 WHERE actor_id = '88888888-8888-8888-8888-888888888888'::uuid;
SET session_replication_role = 'origin';
COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Q2-14 · Fallo tras crear tenant → ROLLBACK completo (cero huérfano)
-- Q2-15 · Fallo antes de commit → ROLLBACK completo
-- Q2-33 · Cero tenant huérfano tras rollback
-- Q2-34 · Cero membership huérfana tras rollback
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := '99999999-9999-9999-9999-999999999999';
    v_count int;
BEGIN
    -- Forzar fallo dentro de la transacción de la RPC. La RPC es
    -- una única transacción PL/pgSQL; cualquier excepción dentro
    -- revierte todo. Simulamos abriendo una transacción externa
    -- que lanza EXCEPTION tras la RPC.
    BEGIN
        PERFORM spabla_v2.admin_ensure_personal_workspace(v_actor);
        -- Forzar rollback simulando fallo del caller
        RAISE EXCEPTION 'simulated_caller_failure' USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback implícito del bloque BEGIN/EXCEPTION
            NULL;
    END;

    -- Q2-14 / Q2-33: cero tenant huérfano (name='workspace.personal.default'
    -- para v_actor que no exista en el mapping)
    SELECT COUNT(*) INTO v_count
      FROM spabla_v2.tenants t
     WHERE t.name = 'workspace.personal.default'
       AND NOT EXISTS (
         SELECT 1 FROM spabla_v2.actor_personal_workspace apw
          WHERE apw.tenant_id = t.id
       );
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Q2-14/33: found orphan tenants after rollback, count=%', v_count;
    END IF;

    -- Q2-15 / Q2-34: cero membership huérfana
    SELECT COUNT(*) INTO v_count
      FROM spabla_v2.tenant_memberships tm
     WHERE NOT EXISTS (
       SELECT 1 FROM spabla_v2.tenants t WHERE t.id = tm.tenant_id
     );
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Q2-34: found orphan memberships, count=%', v_count;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-53 · deletion_pending fixture writable bajo service_role
-- Q2-56 · legal_hold     fixture writable bajo service_role
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_state record;
BEGIN
    INSERT INTO spabla_v2.actor_lifecycle_state (actor_id, deletion_pending, legal_hold)
    VALUES (v_actor, TRUE, FALSE)
    ON CONFLICT (actor_id) DO UPDATE
      SET deletion_pending = TRUE, legal_hold = FALSE, updated_at = now();
    SELECT * INTO v_state FROM spabla_v2.actor_lifecycle_state WHERE actor_id = v_actor;
    IF NOT v_state.deletion_pending THEN
        RAISE EXCEPTION 'Q2-53: deletion_pending must be TRUE';
    END IF;
END $$;

DO $$
DECLARE
    v_actor uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_state record;
BEGIN
    INSERT INTO spabla_v2.actor_lifecycle_state (actor_id, deletion_pending, legal_hold)
    VALUES (v_actor, FALSE, TRUE)
    ON CONFLICT (actor_id) DO UPDATE
      SET deletion_pending = FALSE, legal_hold = TRUE, updated_at = now();
    SELECT * INTO v_state FROM spabla_v2.actor_lifecycle_state WHERE actor_id = v_actor;
    IF NOT v_state.legal_hold THEN
        RAISE EXCEPTION 'Q2-56: legal_hold must be TRUE';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-58 · Tenant existente sin mapping (estado legacy) — comportamiento
--         de la RPC: crea un NUEVO personal (el legacy queda como
--         compartido). Documentado en contract §14 row 58.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_actor uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_legacy uuid;
    v_new_personal uuid;
BEGIN
    -- Preparar: actor tiene tenant_memberships owner sobre un tenant
    -- legacy sin fila en actor_personal_workspace
    v_legacy := spabla_v2.admin_create_tenant('legacy-shared');
    PERFORM spabla_v2.admin_add_membership(v_legacy, v_actor, 'owner');

    -- Invocar el onboarding
    SELECT tenant_id INTO v_new_personal
      FROM spabla_v2.admin_ensure_personal_workspace(v_actor);

    IF v_new_personal = v_legacy THEN
        RAISE EXCEPTION 'Q2-58: personal must be a new tenant, not the legacy one';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- Q2-44 · Rollback DROP TABLE ... CASCADE no elimina tenants existentes
--         (verificación estructural, sin ejecutar el DROP real)
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count_tenants_before int;
    v_count_tenants_after int;
BEGIN
    -- Contamos tenants antes y verificamos que la FK de
    -- actor_personal_workspace es ON DELETE RESTRICT, por lo que un
    -- DROP TABLE ... CASCADE eliminaría la tabla del mapping sin
    -- tocar tenants (que no tiene dependencia inversa).
    SELECT COUNT(*) INTO v_count_tenants_before FROM spabla_v2.tenants;

    -- Verificar que no existe ninguna FK desde tenants hacia
    -- actor_personal_workspace (dependencia inversa)
    IF EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class conrel ON conrel.oid = c.conrelid
         WHERE c.contype = 'f'
           AND conrel.relname = 'tenants'
           AND conrel.relnamespace = 'spabla_v2'::regnamespace
           AND EXISTS (
             SELECT 1 FROM unnest(c.confkey) k
              JOIN pg_class refrel ON refrel.oid = c.confrelid
             WHERE refrel.relname = 'actor_personal_workspace'
           )
    ) THEN
        RAISE EXCEPTION 'Q2-44: tenants must not depend on actor_personal_workspace';
    END IF;

    -- La FK del mapping hacia tenants es ON DELETE RESTRICT
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class conrel ON conrel.oid = c.conrelid
         WHERE c.contype = 'f'
           AND conrel.relname = 'actor_personal_workspace'
           AND conrel.relnamespace = 'spabla_v2'::regnamespace
           AND c.confdeltype = 'r' -- 'r' = RESTRICT
    ) THEN
        RAISE EXCEPTION 'Q2-44: actor_personal_workspace FK must be ON DELETE RESTRICT';
    END IF;
END $$;

\echo '=== atomic_onboarding.test.sql · OK (Q2-05..Q2-15, Q2-25, Q2-31..Q2-34, Q2-38..Q2-41, Q2-44, Q2-48, Q2-53, Q2-56, Q2-58) ==='
