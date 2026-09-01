-- SPABLA V2 · Fase 8 · Hito 8.2 — Multi-tenant persistence bootstrap (spabla_v2).
--
-- Purpose: create the productive multi-tenant persistence schema `spabla_v2`
-- with five tables (`tenants`, `tenant_memberships`, `conversations`,
-- `messages`, `usage_ledger`), RLS + FORCE RLS, tenant-scoped composite
-- foreign keys, SECURITY DEFINER admin functions, and minimal explicit grants.
--
-- Governance:
--   * Plan Hito 8.2 V1.2 §8 (schema), §9 (security & grants), §10 (no
--     Realtime / PostgREST for V2 in this hito), §11 (tests).
--   * Plan Fase 8 V1.2 §7 (policy patterns and role matrix), §9.3 (schema),
--     §9.4 (RLS applied), §9.5 (admin functions), §7.1/§7.1bis/§7.1ter.
--   * ADR-008 V1.3 §8 (multi-tenant model), §9 (isolation, roles, security),
--     §10 (usage ledger).
--
-- Zero PostgREST exposure of `spabla_v2` (config.toml keeps it off).
-- Zero Realtime publication of `spabla_v2.*` tables.
-- Zero grant to `anon` anywhere in `spabla_v2`.
-- Zero UPDATE/DELETE ordinary policies (Plan Fase 8 §7.5).

-- ────────────────────────────────────────────────────────────────
-- §1. Schema and baseline grants
-- ────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS spabla_v2 AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA spabla_v2 FROM PUBLIC;
GRANT USAGE ON SCHEMA spabla_v2 TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────
-- §2. Tables
-- ────────────────────────────────────────────────────────────────

-- 2.1 tenants — canonical identity (`id` acts as its own `tenant_id`).
CREATE TABLE IF NOT EXISTS spabla_v2.tenants (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenants_pkey PRIMARY KEY (id),
    CONSTRAINT tenants_name_not_blank CHECK (length(btrim(name)) > 0)
);
ALTER TABLE spabla_v2.tenants OWNER TO postgres;

-- 2.2 tenant_memberships — composite PK, `role` is data, `is_active` gates access.
CREATE TABLE IF NOT EXISTS spabla_v2.tenant_memberships (
    tenant_id   uuid        NOT NULL,
    actor_id    uuid        NOT NULL,
    role        text        NOT NULL,
    is_active   boolean     NOT NULL DEFAULT TRUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_memberships_pkey PRIMARY KEY (tenant_id, actor_id),
    CONSTRAINT tenant_memberships_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id),
    CONSTRAINT tenant_memberships_role_not_blank CHECK (length(btrim(role)) > 0)
);
ALTER TABLE spabla_v2.tenant_memberships OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_actor
    ON spabla_v2.tenant_memberships (actor_id)
    WHERE is_active = TRUE;

-- 2.3 conversations — tenant-scoped candidate key for composite FKs.
CREATE TABLE IF NOT EXISTS spabla_v2.conversations (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   uuid        NOT NULL,
    created_by  uuid        NOT NULL,
    language    text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id),
    CONSTRAINT conversations_language_not_blank CHECK (length(btrim(language)) > 0),
    CONSTRAINT conversations_tenant_id_id_key UNIQUE (tenant_id, id)
);
ALTER TABLE spabla_v2.conversations OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_created
    ON spabla_v2.conversations (tenant_id, created_at DESC, id);

-- 2.4 messages — composite FK enforces cross-tenant isolation structurally.
CREATE TABLE IF NOT EXISTS spabla_v2.messages (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL,
    conversation_id uuid        NOT NULL,
    sender_id       uuid        NOT NULL,
    text            text        NOT NULL,
    language        text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id),
    CONSTRAINT messages_conversation_composite_fkey
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES spabla_v2.conversations (tenant_id, id),
    CONSTRAINT messages_language_not_blank CHECK (length(btrim(language)) > 0),
    CONSTRAINT messages_tenant_id_id_key UNIQUE (tenant_id, id)
);
ALTER TABLE spabla_v2.messages OWNER TO postgres;

-- Pagination index: (tenant_id, conversation_id, created_at ASC, id ASC).
-- Matches Plan Fase 8 §10.6 total-stable order for `MessageCursor`.
CREATE INDEX IF NOT EXISTS idx_messages_tenant_conv_created_id
    ON spabla_v2.messages (tenant_id, conversation_id, created_at, id);

-- 2.5 usage_ledger — append-only, tenant-scoped idempotency, coherent
-- metric_kind ↔ unit, quantity signage by entry_kind. ADR-008 §10.1..§10.4.
CREATE TABLE IF NOT EXISTS spabla_v2.usage_ledger (
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL,
    actor_id         uuid        NULL,
    source           text        NOT NULL,
    metric_kind      text        NOT NULL,
    quantity         numeric     NOT NULL,
    unit             text        NOT NULL,
    occurred_at      timestamptz NOT NULL,
    correlation_id   uuid        NULL,
    idempotency_key  uuid        NOT NULL,
    entry_kind       text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usage_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT usage_ledger_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id),
    CONSTRAINT usage_ledger_idempotency_key
        UNIQUE (tenant_id, source, idempotency_key),
    CONSTRAINT usage_ledger_metric_kind_check
        CHECK (metric_kind IN ('turns', 'voice_seconds', 'text_chars', 'provider_call')),
    CONSTRAINT usage_ledger_entry_kind_check
        CHECK (entry_kind IN ('normal', 'compensation')),
    CONSTRAINT usage_ledger_source_not_blank
        CHECK (length(btrim(source)) > 0),
    CONSTRAINT usage_ledger_metric_unit_pairs_check
        CHECK (
            (metric_kind = 'turns'          AND unit = 'turns')
         OR (metric_kind = 'voice_seconds'  AND unit = 'seconds')
         OR (metric_kind = 'text_chars'     AND unit = 'chars')
         OR (metric_kind = 'provider_call'  AND unit = 'calls')
        ),
    CONSTRAINT usage_ledger_quantity_normal_nonnegative_check
        CHECK (entry_kind <> 'normal' OR quantity >= 0)
);
ALTER TABLE spabla_v2.usage_ledger OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_usage_ledger_tenant_occurred
    ON spabla_v2.usage_ledger (tenant_id, occurred_at DESC, id);

-- ────────────────────────────────────────────────────────────────
-- §3. RLS — ENABLE + FORCE on all five tenant-owned tables
-- ────────────────────────────────────────────────────────────────

ALTER TABLE spabla_v2.tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.tenants             FORCE  ROW LEVEL SECURITY;

ALTER TABLE spabla_v2.tenant_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.tenant_memberships  FORCE  ROW LEVEL SECURITY;

ALTER TABLE spabla_v2.conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.conversations       FORCE  ROW LEVEL SECURITY;

ALTER TABLE spabla_v2.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.messages            FORCE  ROW LEVEL SECURITY;

ALTER TABLE spabla_v2.usage_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.usage_ledger        FORCE  ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- §4. Policies
-- ────────────────────────────────────────────────────────────────

-- 4.1 tenants — read: active member of that tenant. Zero INSERT/UPDATE/DELETE
-- ordinary policy (bootstrap only via `admin_create_tenant`).
CREATE POLICY tenants_select_own ON spabla_v2.tenants
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.tenants.id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- 4.2 tenant_memberships (Plan Fase 8 §7.1bis) — only SELECT of own active row.
-- Zero INSERT/UPDATE/DELETE ordinary policy. Prevents self-elevation.
CREATE POLICY tenant_memberships_select_own ON spabla_v2.tenant_memberships
    FOR SELECT
    TO authenticated
    USING (
        actor_id  = auth.uid()
        AND is_active = TRUE
    );

-- 4.3 conversations (§7.1 pattern) — SELECT + INSERT for active members.
CREATE POLICY conversations_read ON spabla_v2.conversations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.conversations.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

CREATE POLICY conversations_insert ON spabla_v2.conversations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.conversations.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- 4.4 messages (§7.1 pattern) — SELECT + INSERT for active members.
CREATE POLICY messages_read ON spabla_v2.messages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.messages.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

CREATE POLICY messages_insert ON spabla_v2.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.messages.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- 4.5 usage_ledger (Plan Fase 8 §7.1ter) — only SELECT for active members.
-- Zero INSERT/UPDATE/DELETE ordinary policy. All writes via
-- `spabla_v2.admin_append_usage` (SECURITY DEFINER + service_role).
CREATE POLICY usage_ledger_select ON spabla_v2.usage_ledger
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.usage_ledger.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- ────────────────────────────────────────────────────────────────
-- §5. Table grants — matrix Plan Fase 8 §7.5. Zero grants to `anon`.
-- Zero UPDATE/DELETE ordinary. Membership writes locked to service_role.
-- ────────────────────────────────────────────────────────────────

-- tenants
GRANT SELECT           ON spabla_v2.tenants            TO authenticated;
GRANT SELECT, INSERT   ON spabla_v2.tenants            TO service_role;

-- tenant_memberships — authenticated only SELECT (own). No writes.
GRANT SELECT           ON spabla_v2.tenant_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
                       ON spabla_v2.tenant_memberships TO service_role;

-- conversations
GRANT SELECT, INSERT   ON spabla_v2.conversations      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
                       ON spabla_v2.conversations      TO service_role;

-- messages
GRANT SELECT, INSERT   ON spabla_v2.messages           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
                       ON spabla_v2.messages           TO service_role;

-- usage_ledger — authenticated only SELECT (§7.1ter). Zero INSERT/UPDATE/DELETE
-- ordinary. Every write goes through admin_append_usage.
GRANT SELECT           ON spabla_v2.usage_ledger       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
                       ON spabla_v2.usage_ledger       TO service_role;

-- ────────────────────────────────────────────────────────────────
-- §6. Administrative functions (SECURITY DEFINER)
--     Plan Fase 8 §9.5, Plan Hito 8.2 §9. All owner postgres, all
--     `search_path = pg_catalog, spabla_v2`, all `EXECUTE` revoked from
--     PUBLIC/anon/authenticated, `EXECUTE` granted only to service_role.
--     Objects fully qualified. Zero use of `public.*` inside these bodies.
-- ────────────────────────────────────────────────────────────────

-- 6.1 admin_create_tenant — creates a tenant row and returns its id.
CREATE OR REPLACE FUNCTION spabla_v2.admin_create_tenant(p_name text)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
DECLARE
    v_id uuid;
BEGIN
    IF p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) = 0 THEN
        RAISE EXCEPTION 'admin_create_tenant: name must be non-empty'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO spabla_v2.tenants (name)
    VALUES (pg_catalog.btrim(p_name))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;
ALTER FUNCTION spabla_v2.admin_create_tenant(text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_create_tenant(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_create_tenant(text) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_create_tenant(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_create_tenant(text) TO   service_role;

-- 6.2 admin_add_membership — inserts a new membership (active by default).
CREATE OR REPLACE FUNCTION spabla_v2.admin_add_membership(
    p_tenant_id uuid,
    p_actor_id  uuid,
    p_role      text
)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_add_membership: tenant_id and actor_id are required'
            USING ERRCODE = '22023';
    END IF;
    IF p_role IS NULL OR pg_catalog.length(pg_catalog.btrim(p_role)) = 0 THEN
        RAISE EXCEPTION 'admin_add_membership: role must be non-empty'
            USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM spabla_v2.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'admin_add_membership: tenant not found'
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO spabla_v2.tenant_memberships (tenant_id, actor_id, role, is_active)
    VALUES (p_tenant_id, p_actor_id, pg_catalog.btrim(p_role), TRUE);
END;
$function$;
ALTER FUNCTION spabla_v2.admin_add_membership(uuid, uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_add_membership(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_add_membership(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_add_membership(uuid, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_add_membership(uuid, uuid, text) TO   service_role;

-- 6.3 admin_deactivate_membership — sets is_active=false; idempotent when
-- already inactive; keeps role/tenant_id/actor_id untouched.
CREATE OR REPLACE FUNCTION spabla_v2.admin_deactivate_membership(
    p_tenant_id uuid,
    p_actor_id  uuid
)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_deactivate_membership: tenant_id and actor_id are required'
            USING ERRCODE = '22023';
    END IF;

    UPDATE spabla_v2.tenant_memberships
       SET is_active = FALSE
     WHERE tenant_id = p_tenant_id
       AND actor_id  = p_actor_id;
END;
$function$;
ALTER FUNCTION spabla_v2.admin_deactivate_membership(uuid, uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_deactivate_membership(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_deactivate_membership(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_deactivate_membership(uuid, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_deactivate_membership(uuid, uuid) TO   service_role;

-- 6.4 admin_append_usage — sole write path to `usage_ledger` (§7.1ter, §9.5).
-- Validates tenant existence, membership activity (when required), enum
-- coherence, quantity signage; idempotent by UNIQUE(tenant, source, key).
CREATE OR REPLACE FUNCTION spabla_v2.admin_append_usage(
    p_tenant_id        uuid,
    p_actor_id         uuid,
    p_source           text,
    p_metric_kind      text,
    p_quantity         numeric,
    p_unit             text,
    p_idempotency_key  uuid,
    p_correlation_id   uuid,
    p_entry_kind       text,
    p_occurred_at      timestamptz DEFAULT NULL,
    p_require_membership boolean   DEFAULT TRUE
)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
DECLARE
    v_id           uuid;
    v_occurred_at  timestamptz := COALESCE(p_occurred_at, pg_catalog.now());
    v_existing_id  uuid;
BEGIN
    -- Structural input validation (§9.5)
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'admin_append_usage: tenant_id required'
            USING ERRCODE = '22023';
    END IF;
    IF p_source IS NULL OR pg_catalog.length(pg_catalog.btrim(p_source)) = 0 THEN
        RAISE EXCEPTION 'admin_append_usage: source required'
            USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'admin_append_usage: idempotency_key required'
            USING ERRCODE = '22023';
    END IF;
    IF p_metric_kind IS NULL
       OR p_metric_kind NOT IN ('turns', 'voice_seconds', 'text_chars', 'provider_call') THEN
        RAISE EXCEPTION 'admin_append_usage: metric_kind out of closed union'
            USING ERRCODE = '22023';
    END IF;
    IF p_entry_kind IS NULL OR p_entry_kind NOT IN ('normal', 'compensation') THEN
        RAISE EXCEPTION 'admin_append_usage: entry_kind out of closed union'
            USING ERRCODE = '22023';
    END IF;
    IF p_quantity IS NULL THEN
        RAISE EXCEPTION 'admin_append_usage: quantity required'
            USING ERRCODE = '22023';
    END IF;
    IF p_entry_kind = 'normal' AND p_quantity < 0 THEN
        RAISE EXCEPTION 'admin_append_usage: quantity must be >= 0 for entry_kind=normal'
            USING ERRCODE = '22023';
    END IF;

    -- Tenant existence
    IF NOT EXISTS (SELECT 1 FROM spabla_v2.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'admin_append_usage: tenant not found'
            USING ERRCODE = '23503';
    END IF;

    -- Membership coherence (§9.5 (ii))
    IF p_require_membership THEN
        IF p_actor_id IS NULL THEN
            RAISE EXCEPTION 'admin_append_usage: actor_id required when require_membership'
                USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = p_tenant_id
              AND tm.actor_id  = p_actor_id
              AND tm.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'admin_append_usage: actor lacks active membership in tenant'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Structural idempotency (§9.5 (vii))
    SELECT id INTO v_existing_id
      FROM spabla_v2.usage_ledger
     WHERE tenant_id      = p_tenant_id
       AND source          = p_source
       AND idempotency_key = p_idempotency_key
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;  -- silent success on identical retry
    END IF;

    INSERT INTO spabla_v2.usage_ledger (
        tenant_id, actor_id, source, metric_kind, quantity, unit,
        occurred_at, correlation_id, idempotency_key, entry_kind
    ) VALUES (
        p_tenant_id, p_actor_id, p_source, p_metric_kind, p_quantity, p_unit,
        v_occurred_at, p_correlation_id, p_idempotency_key, p_entry_kind
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;
ALTER FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) TO   service_role;

-- 6.5 admin_purge_usage_by_tenant — privileged purge with mandatory reason.
-- Plan Fase 8 §9.5, ADR-008 §10.4. Returns number of rows removed.
CREATE OR REPLACE FUNCTION spabla_v2.admin_purge_usage_by_tenant(
    p_tenant_id uuid,
    p_reason    text
)
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
AS $function$
DECLARE
    v_removed bigint;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'admin_purge_usage_by_tenant: tenant_id required'
            USING ERRCODE = '22023';
    END IF;
    IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'admin_purge_usage_by_tenant: reason must be non-empty'
            USING ERRCODE = '22023';
    END IF;

    DELETE FROM spabla_v2.usage_ledger
     WHERE tenant_id = p_tenant_id;

    GET DIAGNOSTICS v_removed = ROW_COUNT;
    RETURN v_removed;
END;
$function$;
ALTER FUNCTION spabla_v2.admin_purge_usage_by_tenant(uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_purge_usage_by_tenant(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_purge_usage_by_tenant(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_purge_usage_by_tenant(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_purge_usage_by_tenant(uuid, text) TO   service_role;
