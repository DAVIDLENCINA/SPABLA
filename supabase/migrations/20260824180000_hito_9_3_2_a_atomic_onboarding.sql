-- SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 — Atomic personal workspace onboarding.
--
-- Purpose: implement the productive minimal onboarding of a personal
-- workspace for every authenticated actor. Additive, idempotent, safe
-- under concurrency, and server-authoritative. Aligned strictly to the
-- official contract:
--   docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md
--   (version Q1-RR-SCOPE)
--
-- Governance:
--   * Contract §5   — mapping huérfano semantics (A/B/C/D)
--   * Contract §6   — invariants I-1..I-15
--   * Contract §9   — RPC transaccional final (single uuid parameter)
--   * Contract §12  — RLS, grants, service_role
--   * Contract §14  — matrix Q2-01..Q2-58 (rows 10, 48 for orphan;
--                     53, 56 for lifecycle blockers)
--   * Contract §15  — migration & rollback
--   * Contract §17-bis — server-owned label catalog (workspace.personal.default)
--   * Contract §17-ter — lifecycle states (deletion_pending, legal_hold)
--
-- Zero client parameter for text. Zero p_workspace_label. Zero p_locale.
-- Zero p_label_key. The internal key `workspace.personal.default` is
-- codified inside the function body. Any privileged caller invoking the
-- RPC will persist the same fixed key by construction (I-14, S21).

-- ────────────────────────────────────────────────────────────────
-- §1. actor_personal_workspace — canonical mapping actor → personal tenant
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spabla_v2.actor_personal_workspace (
    actor_id    uuid        NOT NULL,
    tenant_id   uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT actor_personal_workspace_pkey PRIMARY KEY (actor_id),
    CONSTRAINT actor_personal_workspace_tenant_id_key UNIQUE (tenant_id),
    CONSTRAINT actor_personal_workspace_tenant_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE spabla_v2.actor_personal_workspace OWNER TO postgres;

ALTER TABLE spabla_v2.actor_personal_workspace ENABLE  ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.actor_personal_workspace FORCE   ROW LEVEL SECURITY;

-- Grants: only service_role. Zero grant to anon. Zero grant to
-- authenticated (contract §12). No ordinary policy for authenticated
-- because the caller never reads this table directly — bootstrap
-- returns memberships instead.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON spabla_v2.actor_personal_workspace TO service_role;

-- ────────────────────────────────────────────────────────────────
-- §2. actor_lifecycle_state — minimal server-side flags (Q1-RR-SCOPE §17-ter I)
-- ────────────────────────────────────────────────────────────────
--
-- Q2 minimal scope: table with the two blocking flags
-- (`deletion_pending`, `legal_hold`) so the onboarding can honour the
-- observable behaviour of Q2-53 and Q2-56 through controlled fixtures.
-- The workflows that PRODUCE these flags (real deletion request, real
-- legal-hold application) are deferred to 9.3.2-A-Q4-bis per §17-ter I.
CREATE TABLE IF NOT EXISTS spabla_v2.actor_lifecycle_state (
    actor_id           uuid        NOT NULL,
    deletion_pending   boolean     NOT NULL DEFAULT FALSE,
    legal_hold         boolean     NOT NULL DEFAULT FALSE,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT actor_lifecycle_state_pkey PRIMARY KEY (actor_id)
);
ALTER TABLE spabla_v2.actor_lifecycle_state OWNER TO postgres;

ALTER TABLE spabla_v2.actor_lifecycle_state ENABLE  ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.actor_lifecycle_state FORCE   ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON spabla_v2.actor_lifecycle_state TO service_role;

-- ────────────────────────────────────────────────────────────────
-- §3. admin_ensure_personal_workspace(uuid) — final signature
-- ────────────────────────────────────────────────────────────────
--
-- Contract §9. Single parameter `p_actor_id uuid`. The internal fixed
-- key `workspace.personal.default` is codified here and passed to
-- `admin_create_tenant`. NO caller (handler, job, script) can persist
-- an alternative text through this entry point because the function
-- accepts no text parameter (I-14, threat S21 constructively closed).
--
-- Idempotency: step (3) returns the existing mapping without writing.
-- Concurrency: pg_advisory_xact_lock hashed by actor + PK on
-- actor_personal_workspace.actor_id + UNIQUE on tenant_id.
-- Rollback: single PL/pgSQL transaction; any RAISE reverts everything.
-- Orphan detection: step (3.a) checks that the mapped tenant still
-- exists; if not, RAISE with SQLSTATE '23503' so the adapter maps to
-- a `500 internal` opaque HTTP response (contract §5 B/D, §10, §14
-- rows 10 and 48).

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

    -- (3) Idempotent lookup: if a mapping exists, return without writing.
    SELECT apw.tenant_id INTO v_existing_tenant
      FROM spabla_v2.actor_personal_workspace apw
     WHERE apw.actor_id = p_actor_id;

    IF v_existing_tenant IS NOT NULL THEN
        -- (3.a) Orphan detection (contract §5 B/D, matrix rows 10 + 48).
        -- The mapped tenant must still exist. If it does not, DO NOT
        -- silently recreate. DO NOT reassign. RAISE with contractual
        -- SQLSTATE '23503' so the adapter maps to `500 internal` opaque.
        PERFORM 1 FROM spabla_v2.tenants t WHERE t.id = v_existing_tenant;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'admin_ensure_personal_workspace: orphan mapping'
                USING ERRCODE = '23503';
        END IF;

        -- (3.b) Membership coherence: if an external flow deactivated
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

    -- (4) Atomic creation inside the same transaction. `admin_create_tenant`
    -- receives only the fixed internal key. No external caller can
    -- substitute this text (contract I-14, threat S21).
    v_new_tenant := spabla_v2.admin_create_tenant(c_workspace_key);
    INSERT INTO spabla_v2.actor_personal_workspace (actor_id, tenant_id)
    VALUES (p_actor_id, v_new_tenant);
    PERFORM spabla_v2.admin_add_membership(v_new_tenant, p_actor_id, 'owner');

    RETURN QUERY SELECT v_new_tenant, 'owner'::text, TRUE;
END;
$function$;

ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) TO   service_role;

-- ────────────────────────────────────────────────────────────────
-- §4. Notes for auditors
-- ────────────────────────────────────────────────────────────────
--
-- Additive migration. Zero modification of pre-existing tables,
-- functions or policies. `restore drill` (Job C) applies this
-- migration on the empty target database exactly as on the source.
--
-- Rollback in a disposable environment:
--   DROP FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid);
--   DROP TABLE    spabla_v2.actor_lifecycle_state;
--   DROP TABLE    spabla_v2.actor_personal_workspace CASCADE;
-- In production: NO schema rollback if legitimate rows exist. Prefer
-- a feature flag that hides the endpoint invocation (contract §15.2).
