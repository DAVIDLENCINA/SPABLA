-- SPABLA V2 · Fase 8 · Hito 8.4 correction — atomic conflict detection in
-- `spabla_v2.admin_append_usage`.
--
-- Problem: the version installed by `20260730160000_phase8_bootstrap.sql`
-- looked up the row by `(tenant_id, source, idempotency_key)` and returned
-- silently whenever a row existed, WITHOUT comparing the remaining normative
-- fields (`actor_id, metric_kind, quantity, unit, occurred_at,
-- correlation_id, entry_kind`). This violates Plan Fase 8 V1.3 §9.5, §9.8
-- and §11.4, which require:
--   * identical retry (same normative payload) → silent success;
--   * conflicting retry (same key, divergent payload) → `unique_violation`
--     translated by `SupabasePersistence.translatePostgrestError` to
--     `PersistenceError({code: "conflict", retryable: false})`.
--
-- Fix: replace the function body with an atomic `INSERT ... ON CONFLICT
-- DO NOTHING RETURNING` followed by a single lookup that compares the
-- normative fields inside the same SQL statement / transaction. The
-- `UNIQUE(tenant_id, source, idempotency_key)` constraint is the atomic
-- barrier; divergence between existing row and requested payload raises
-- `SQLSTATE 23505` (`unique_violation`) explicitly.
--
-- Governance / non-destructive:
--   * Forward-only migration; does NOT rewrite `20260730160000_phase8_bootstrap.sql`.
--   * Preserves the public signature of `admin_append_usage` (same parameter
--     order, defaults, return type).
--   * Preserves owner (`postgres`), `SECURITY DEFINER`, `search_path`, and
--     grants issued by the bootstrap; PostgreSQL keeps them across
--     `CREATE OR REPLACE FUNCTION` of the same identity.
--   * All structural input validation blocks copied verbatim from the
--     bootstrap so downstream tests remain covered.

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
    v_existing_id            uuid;
    v_existing_actor         uuid;
    v_existing_metric        text;
    v_existing_quantity      numeric;
    v_existing_unit          text;
    v_existing_occurred_at   timestamptz;
    v_existing_correlation   uuid;
    v_existing_entry_kind    text;
BEGIN
    -- Structural input validation (Plan §9.5).
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

    -- Tenant existence.
    IF NOT EXISTS (SELECT 1 FROM spabla_v2.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'admin_append_usage: tenant not found'
            USING ERRCODE = '23503';
    END IF;

    -- Membership coherence (Plan §9.5 (ii)).
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

    -- Atomic upsert: rely on UNIQUE(tenant_id, source, idempotency_key).
    -- If we win the race, RETURNING gives us the new id.
    INSERT INTO spabla_v2.usage_ledger (
        tenant_id, actor_id, source, metric_kind, quantity, unit,
        occurred_at, correlation_id, idempotency_key, entry_kind
    ) VALUES (
        p_tenant_id, p_actor_id, p_source, p_metric_kind, p_quantity, p_unit,
        v_occurred_at, p_correlation_id, p_idempotency_key, p_entry_kind
    )
    ON CONFLICT (tenant_id, source, idempotency_key) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Conflict path: fetch the surviving row and compare normative fields.
    SELECT id, actor_id, metric_kind, quantity, unit, occurred_at,
           correlation_id, entry_kind
      INTO v_existing_id,
           v_existing_actor,
           v_existing_metric,
           v_existing_quantity,
           v_existing_unit,
           v_existing_occurred_at,
           v_existing_correlation,
           v_existing_entry_kind
      FROM spabla_v2.usage_ledger
     WHERE tenant_id      = p_tenant_id
       AND source          = p_source
       AND idempotency_key = p_idempotency_key
     LIMIT 1;

    IF v_existing_id IS NULL THEN
        -- Extremely unlikely race (row deleted between the failed insert
        -- and this read). Surface unique_violation so the caller retries.
        RAISE EXCEPTION 'admin_append_usage: idempotency key conflict'
            USING ERRCODE = '23505';
    END IF;

    -- Compare normative fields. `occurred_at` is compared only when the
    -- caller supplied an explicit value; NULL means "reuse existing".
    IF v_existing_actor       IS DISTINCT FROM p_actor_id
       OR v_existing_metric      IS DISTINCT FROM p_metric_kind
       OR v_existing_quantity    IS DISTINCT FROM p_quantity
       OR v_existing_unit        IS DISTINCT FROM p_unit
       OR v_existing_correlation IS DISTINCT FROM p_correlation_id
       OR v_existing_entry_kind  IS DISTINCT FROM p_entry_kind
       OR (p_occurred_at IS NOT NULL
           AND v_existing_occurred_at IS DISTINCT FROM p_occurred_at)
    THEN
        -- Opaque message: do NOT echo existing/attempted payload.
        RAISE EXCEPTION 'admin_append_usage: idempotency key conflict'
            USING ERRCODE = '23505';
    END IF;

    -- Identical retry: silent success returning the surviving id.
    RETURN v_existing_id;
END;
$function$;

-- Preserve the ownership and privilege posture the bootstrap installed
-- (`CREATE OR REPLACE FUNCTION` does not alter these; restated for defence
-- in depth). Grants remain: `service_role` EXECUTE only.
ALTER FUNCTION spabla_v2.admin_append_usage(
    uuid, uuid, text, text, numeric, text, uuid, uuid, text, timestamptz, boolean
) OWNER TO postgres;
