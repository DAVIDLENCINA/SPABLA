-- SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2-R2 — Auth existence check in RPC.
--
-- Purpose: close a contractual gap detected in Q2-R.
--
-- `verifyJwt` (lib/v2/server/composition.ts) validates the JWT
-- locally with signature + `exp` only (patrón Q3-R FASE 4). An
-- access token issued before `admin.auth.admin.deleteUser(subA)` is
-- still cryptographically valid until its `exp` naturally expires;
-- SPABLA productive flow would accept it and re-invoke the onboarding
-- for a `sub` that no longer exists in `auth.users`. Contract
-- §17-ter H mandates:
--
--     eliminado (Auth ya borrado) → 401 unauthorized opaco.
--
-- Q2-R2 closes the gap inside PostgreSQL, without adding an HTTP
-- round-trip to Supabase Auth per request (which would break the
-- session continuity guarantees of hito 9.3.1-Q3-R FASE 4 that
-- explicitly avoid a spurious 401 on transient auth-service 429/5xx):
-- the RPC `spabla_v2.admin_ensure_personal_workspace(uuid)` now
-- verifies that `p_actor_id` still exists in `auth.users` before any
-- write. The check runs LOCALLY inside the same PL/pgSQL
-- transaction, under the SECURITY DEFINER owned by `postgres` (which
-- retains `SELECT` on `auth.users` in the Supabase local and
-- productive clusters). If the actor no longer exists, the RPC
-- `RAISE EXCEPTION USING ERRCODE = 'P0002'` (`no_data_found`); the
-- adapter maps that to `OnboardingAuthActorDeletedError`; the
-- handler responds `401 unauthorized` opaque. No PII, no `sub`, no
-- SQLSTATE reaches the public body (contract §10, §16, §17-ter H).
--
-- This migration is ADDITIVE. It uses `CREATE OR REPLACE FUNCTION`
-- to update the existing definition of
-- `spabla_v2.admin_ensure_personal_workspace(uuid)` while preserving:
--   · the public signature (single `p_actor_id uuid` parameter);
--   · the return type `TABLE (tenant_id uuid, role text, created boolean)`;
--   · `SECURITY DEFINER` with owner `postgres`;
--   · fixed `search_path` (extended to include `auth` for the
--     `auth.users` reference; still avoids `public.*`);
--   · advisory lock (pg_advisory_xact_lock);
--   · idempotency, membership reactivation, orphan mapping
--     detection (SQLSTATE `23503`);
--   · revoked EXECUTE for `PUBLIC`, `anon`, `authenticated`;
--   · granted EXECUTE only for `service_role`.
--
-- Lock ordering documented (contract §5, §17-ter H): (1) actor
-- advisory lock, (2) auth.users existence check, (3) mapping /
-- tenant / membership operations. This ordering ensures that a
-- deletion racing with an onboarding either:
--   · commits the deletion before step (2) — onboarding aborts with
--     `P0002`, zero writes to `spabla_v2`;
--   · or the onboarding wins the race, completes step (3) and
--     commits; the subsequent deletion leaves the mapping in the
--     `orphan` state that §17-ter G quarantines. Zero silent
--     recreation, zero cross-actor reassignment.
--
-- Governance:
--   · Contract Q1-RR-SCOPE §9 (RPC atomic transactional design),
--     §14 rows 10 + 47/48 (orphan) + 53/54 (deletion-pending + Auth
--     eliminated), §17-ter H (opaque 401 for Auth-eliminated actor).
--   · Q2-R2 order.

CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id uuid
)
    RETURNS TABLE (tenant_id uuid, role text, created boolean)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2, auth
AS $function$
DECLARE
    -- Fixed internal key owned by the server. Not a localised text.
    -- The label presenter in the HTTP handler resolves this key to a
    -- presentation string against the closed 13-language catalog; the
    -- catalog never touches persistence (contract §17-bis 8-10).
    c_workspace_key   constant text := 'workspace.personal.default';
    v_existing_tenant uuid;
    v_new_tenant      uuid;
BEGIN
    -- (1) Structural validation: actor_id cannot be NULL.
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_ensure_personal_workspace: actor_id required'
            USING ERRCODE = '22023';
    END IF;

    -- (2) Belt-and-braces serialization per actor (contract §3.5 E2).
    -- Redundant with the PK of actor_personal_workspace but avoids
    -- row-level lock races on the first-insert path.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_actor_id::text, 9321)
    );

    -- (3) Q2-R2 · Auth-actor existence check (contract §17-ter H).
    -- If the actor was deleted from `auth.users` — for example via
    -- `admin.auth.admin.deleteUser` — reject the operation opaquely.
    -- The check runs inside the SECURITY DEFINER transaction (owner
    -- `postgres` retains SELECT on auth.users). No HTTP round-trip
    -- to Supabase Auth per request; local database check only.
    --
    -- The exception is caught by the adapter and mapped to
    -- `OnboardingAuthActorDeletedError`; the handler responds
    -- `401 unauthorized` opaque. No PII, no `sub`, no SQLSTATE
    -- reaches the public body.
    PERFORM 1 FROM auth.users u WHERE u.id = p_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'admin_ensure_personal_workspace: auth actor not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- (4) Idempotent lookup: if a mapping exists, return without writing.
    SELECT apw.tenant_id INTO v_existing_tenant
      FROM spabla_v2.actor_personal_workspace apw
     WHERE apw.actor_id = p_actor_id;

    IF v_existing_tenant IS NOT NULL THEN
        -- (4.a) Orphan detection (contract §5 B/D, matrix rows 10 + 48).
        -- The mapped tenant must still exist. If it does not, DO NOT
        -- silently recreate. DO NOT reassign. RAISE with contractual
        -- SQLSTATE '23503' so the adapter maps to `500 internal` opaque.
        PERFORM 1 FROM spabla_v2.tenants t WHERE t.id = v_existing_tenant;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'admin_ensure_personal_workspace: orphan mapping'
                USING ERRCODE = '23503';
        END IF;

        -- (4.b) Membership coherence: if an external flow deactivated
        -- the membership, reactivate it inside the same transaction
        -- (contract §4 question 6, matrix row 9, §17-ter B). Column
        -- references are qualified with the `tm` alias because the
        -- RETURNS TABLE clause introduces PL/pgSQL identifiers
        -- (`tenant_id`, `role`, `created`) that would otherwise
        -- shadow the columns of `tenant_memberships` and raise
        -- `column reference is ambiguous`.
        UPDATE spabla_v2.tenant_memberships tm
           SET is_active = TRUE
         WHERE tm.tenant_id = v_existing_tenant
           AND tm.actor_id  = p_actor_id;

        RETURN QUERY SELECT v_existing_tenant, 'owner'::text, FALSE;
        RETURN;
    END IF;

    -- (5) Atomic creation inside the same transaction. `admin_create_tenant`
    -- receives only the fixed internal key. No external caller can
    -- substitute this text (contract I-14, threat S21).
    v_new_tenant := spabla_v2.admin_create_tenant(c_workspace_key);
    INSERT INTO spabla_v2.actor_personal_workspace (actor_id, tenant_id)
    VALUES (p_actor_id, v_new_tenant);
    PERFORM spabla_v2.admin_add_membership(v_new_tenant, p_actor_id, 'owner');

    RETURN QUERY SELECT v_new_tenant, 'owner'::text, TRUE;
END;
$function$;

-- Preserve owner and ACLs. `CREATE OR REPLACE` keeps existing owner
-- and permissions, but reasserting them explicitly documents the
-- invariants and guards against any future replace that might drop
-- them silently.
ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) TO   service_role;

-- Note: cero grant is added to `anon` / `authenticated` on `auth.users`.
-- Nothing in this migration changes the visibility of `auth.users`
-- outside the SECURITY DEFINER context of the RPC.
