-- SPABLA V2 · Fase 9 · Hito 9.1.1 — spabla_v2.message_translations.
--
-- Purpose: persist server-side translations of `spabla_v2.messages` so
-- polling stops re-invoking the translation provider for combinations
-- that have already been resolved. Storage is keyed by
-- `(tenant_id, message_id, target_language, translation_version)` so the
-- same message can carry multiple translations (one per audience
-- language) and the operator can invalidate an old set by minting a new
-- `translation_version` without dropping historical rows.
--
-- Governance and disciplinary boundaries:
--   * Reuses the Fase 8 · Hito 8.2 pattern verbatim: schema-owned
--     tables, ENABLE + FORCE RLS, tenant-scoped composite FK, zero anon
--     grants, zero UPDATE/DELETE ordinary policy, minimal explicit
--     grants (Plan Fase 8 V1.2 §7, §9). The productive `PersistencePort`
--     contract is NOT touched by this migration; the new table is
--     served by a separate internal port (`TranslationStore`) added in
--     the same hito (engine/src/adapters/translation-store/**).
--   * `authenticated` gets SELECT under RLS. Zero INSERT / UPDATE /
--     DELETE for `authenticated` (ordinary policy AND grant): every
--     write flows through the server-side composition that holds
--     `service_role` (Plan Hito 9.1.1 §7).
--   * `anon` receives zero privileges (Plan Fase 8 V1.2 §7.5).
--   * `service_role` receives the write matrix so the trusted server
--     composition can persist ad-hoc translations discovered on GET.
--
-- Zero PostgREST exposure of the new table beyond the existing
-- `spabla_v2` schema (already exposed for authenticated reads in Hito
-- 8.3). Zero Realtime publication.

-- ────────────────────────────────────────────────────────────────
-- §1. Table
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spabla_v2.message_translations (
    tenant_id           uuid        NOT NULL,
    message_id          uuid        NOT NULL,
    target_language     text        NOT NULL,
    translation_version text        NOT NULL,
    translated_text     text        NOT NULL,
    provider            text        NOT NULL,
    model               text        NULL,
    provider_ref        text        NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT message_translations_pkey
        PRIMARY KEY (tenant_id, message_id, target_language, translation_version),
    -- Composite FK to spabla_v2.messages(tenant_id, id) enforces
    -- cross-tenant isolation structurally: a translation cannot be
    -- attributed to a message that belongs to a different tenant.
    CONSTRAINT message_translations_message_composite_fkey
        FOREIGN KEY (tenant_id, message_id)
        REFERENCES spabla_v2.messages (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT message_translations_target_language_not_blank
        CHECK (length(btrim(target_language)) > 0),
    CONSTRAINT message_translations_translation_version_not_blank
        CHECK (length(btrim(translation_version)) > 0),
    CONSTRAINT message_translations_translated_text_not_blank
        CHECK (length(btrim(translated_text)) > 0),
    CONSTRAINT message_translations_provider_not_blank
        CHECK (length(btrim(provider)) > 0)
);
ALTER TABLE spabla_v2.message_translations OWNER TO postgres;

-- Read-path index: lookup by (tenant_id, message_id) is the hot path
-- (join a page of messages against all their translations). The PK
-- already covers (tenant_id, message_id, target_language, ...) prefix
-- lookups, so this secondary index only exists to keep options open
-- for future audit queries by tenant.
CREATE INDEX IF NOT EXISTS idx_message_translations_tenant_created
    ON spabla_v2.message_translations (tenant_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- §2. RLS — ENABLE + FORCE
-- ────────────────────────────────────────────────────────────────

ALTER TABLE spabla_v2.message_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.message_translations FORCE  ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- §3. Policies — SELECT only for active members. Zero INSERT /
-- UPDATE / DELETE ordinary policy (all writes go through service_role
-- from the server-side composition; Plan Hito 9.1.1 §7).
-- ────────────────────────────────────────────────────────────────

CREATE POLICY message_translations_read ON spabla_v2.message_translations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM spabla_v2.tenant_memberships tm
            WHERE tm.tenant_id = spabla_v2.message_translations.tenant_id
              AND tm.actor_id  = auth.uid()
              AND tm.is_active = TRUE
        )
    );

-- ────────────────────────────────────────────────────────────────
-- §4. Grants — matrix Plan Fase 8 V1.2 §7.5. Zero grants to anon.
-- Zero write grants to authenticated.
-- ────────────────────────────────────────────────────────────────

GRANT SELECT
                     ON spabla_v2.message_translations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
                     ON spabla_v2.message_translations TO service_role;
