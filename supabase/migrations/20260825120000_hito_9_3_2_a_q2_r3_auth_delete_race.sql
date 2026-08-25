-- SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2-R3 — Serialize auth deletion vs onboarding.
--
-- Purpose: close the last transactional race left by Q2-R2. Q2-R2
-- added `PERFORM 1 FROM auth.users WHERE id = p_actor_id` inside the
-- RPC transaction, but that read did NOT acquire a row lock. The
-- sequence:
--
--   1. Onboarding acquires the advisory lock.
--   2. Onboarding reads `auth.users` (no row lock).
--   3. External `admin.auth.admin.deleteUser` deletes the row.
--   4. Onboarding proceeds to create mapping / tenant / membership
--      for an actor Auth that no longer exists.
--
-- The advisory lock does not synchronize with `deleteUser` because
-- Supabase Auth's HTTP admin never acquires that lock. The fix is
-- a row-level lock on `auth.users` that is **incompatible with
-- DELETE** while compatible with normal SELECTs:
--
--     SELECT id FROM auth.users WHERE id = p_actor_id FOR KEY SHARE;
--
-- PostgreSQL semantics (documented):
--
--   · `FOR KEY SHARE` acquires the weakest row-level lock. It is
--     compatible with plain SELECT, `FOR NO KEY UPDATE`, other
--     `FOR KEY SHARE`. It is incompatible with `FOR UPDATE` and
--     with DELETE (which needs a `TupleLockExclusive` equivalent).
--   · When the onboarding transaction holds `FOR KEY SHARE` on the
--     actor's row, any concurrent DELETE of that same row blocks
--     until the onboarding commits or rolls back.
--   · If the DELETE commits first, the onboarding sees `NOT FOUND`
--     and raises `P0002` — mapped to 401 unauthorized by the
--     adapter.
--   · If the onboarding commits first, the DELETE proceeds
--     immediately after; any subsequent onboarding with the same
--     JWT will find the actor missing and return 401 (Q2-R2 flow).
--   · Zero deadlock possible with Supabase Auth's own DELETE
--     because both operations acquire locks in the same order:
--     Auth deletion touches `auth.users` first (its own root row);
--     onboarding also touches `auth.users` first (via FOR KEY
--     SHARE) before touching any `spabla_v2` object. No inverse
--     dependency exists.
--
-- Migration Q2-R3 also restores the minimum search_path. Q2-R2 had
-- added `auth` to the search_path because the migration was written
-- as `PERFORM 1 FROM u WHERE u.id = ...` with alias — the query
-- was already schema-qualified via alias inference. Q2-R3 keeps the
-- explicit `auth.users` qualification and drops `auth` from the
-- search_path so the resolution surface stays minimal:
--
--     SET search_path = pg_catalog, spabla_v2
--
-- All auth references inside the function body are schema-qualified.
--
-- Governance:
--   · Contract Q1-RR-SCOPE §9 (RPC atomic transactional design),
--     §14 rows 10 + 47/48 + 53/54, §17-ter H.
--   · Q2-R3 order (this hito).

CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id uuid
)
    RETURNS TABLE (tenant_id uuid, role text, created boolean)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
DECLARE
    -- Fixed internal key owned by the server. Not a localised text.
    -- The label presenter in the HTTP handler resolves this key to a
    -- presentation string against the closed 13-language catalog; the
    -- catalog never touches persistence (contract §17-bis 8-10).
    c_workspace_key   constant text := 'workspace.personal.default';
    v_existing_tenant uuid;
    v_new_tenant      uuid;
    v_auth_locked     uuid;
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

    -- (3) Q2-R3 · Row-lock on auth.users to serialize with
    -- `admin.auth.admin.deleteUser`. `FOR KEY SHARE` is the minimum
    -- lock mode that (a) is compatible with normal reads by other
    -- transactions, (b) is incompatible with DELETE of the same
    -- row. Semantic outcomes:
    --
    --   · Deletion wins the race: this SELECT returns 0 rows;
    --     we RAISE `P0002`; the adapter maps to 401 unauthorized
    --     opaque.
    --   · Onboarding wins the race: this SELECT holds the lock;
    --     any concurrent DELETE waits until we commit or rollback.
    --     The rest of the transaction proceeds safely knowing the
    --     actor exists at commit time.
    --
    -- Schema-qualified reference to `auth.users`; `auth` is NOT in
    -- the search_path (Q2-R3 restores the minimum).
    SELECT u.id
      INTO v_auth_locked
      FROM auth.users u
     WHERE u.id = p_actor_id
       FOR KEY SHARE;
    IF v_auth_locked IS NULL THEN
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
-- and permissions, but reasserting them documents the invariants
-- and guards against any future replace that drops them silently.
ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) TO   service_role;

-- Note: cero grant is added to `anon` / `authenticated` on `auth.users`.
-- Nothing in this migration changes the visibility of `auth.users`
-- outside the SECURITY DEFINER context of the RPC.
