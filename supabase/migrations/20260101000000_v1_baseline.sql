-- SPABLA V2 · Fase 8 · Hito 8.2 — V1 baseline (synthetic pre-legacy)
--
-- Purpose: reproduce byte-semantically the productive V1 schema as it existed
-- immediately BEFORE the legacy migration `20260617000000_add_message_source.sql`
-- was applied to the productive Supabase project, so that
-- `supabase db reset --local` rebuilds V1 from an empty database in
-- deterministic order: baseline → legacy → reconciliation → phase8 bootstrap.
--
-- Timestamp `20260101000000` is SYNTHETIC. It does NOT claim that V1 was
-- created on 2026-01-01; it only enforces a lexicographic ordering strictly
-- prior to `20260617000000_add_message_source.sql`.
--
-- Sources of truth for this file:
--   (i)  Read-only inventory of the productive project on 2026-07-29 (queries
--        Q1..Q16 documented in the Hito 8.2 review).
--   (ii) Exact DDL of `public.is_participant(uuid)` and
--        `public.shares_conversation(uuid)` retrieved by the Project Lead via
--        `pg_get_functiondef` on 2026-07-30.
--
-- Governance: Plan Hito 8.2 V1.2 §5. Migrations chain: ADR-008 §11.1, §11.2;
-- Plan Fase 8 §9.6.

-- ────────────────────────────────────────────────────────────────
-- §1. Extensions in the standard Supabase location (`extensions`)
-- ────────────────────────────────────────────────────────────────
-- The productive remote reports pgcrypto 1.3 and uuid-ossp 1.1 installed
-- (inventory Q16). Emit both explicitly so the baseline does not depend on
-- executor defaults.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────────
-- §2. Tables in `public.*` — owner postgres (Supabase default)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    name                text        NOT NULL,
    avatar              text        NULL,
    language_primary    text        NOT NULL DEFAULT 'es',
    language_secondary  text        NULL,
    created_at          timestamptz NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);
ALTER TABLE public.users OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.conversations (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at  timestamptz NULL DEFAULT now(),
    created_by  uuid        NULL DEFAULT auth.uid(),
    CONSTRAINT conversations_pkey PRIMARY KEY (id)
);
ALTER TABLE public.conversations OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id uuid NOT NULL,
    user_id         uuid NOT NULL,
    CONSTRAINT conversation_participants_pkey PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT conversation_participants_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES public.conversations (id),
    CONSTRAINT conversation_participants_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id)
);
ALTER TABLE public.conversation_participants OWNER TO postgres;

-- `messages` in the PRE-LEGACY state: without `source` column and without
-- `messages_source_check`. The legacy migration adds both; see §6.
CREATE TABLE IF NOT EXISTS public.messages (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    conversation_id     uuid        NULL,
    sender_id           uuid        NULL,
    original_text       text        NOT NULL,
    translated_text     text        NULL,
    original_language   text        NOT NULL,
    translated_language text        NULL,
    type                text        NULL DEFAULT 'text',
    created_at          timestamptz NULL DEFAULT now(),
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES public.conversations (id),
    CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES public.users (id)
);
ALTER TABLE public.messages OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.files (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    conversation_id uuid        NOT NULL,
    sender_id       uuid        NOT NULL,
    url             text        NOT NULL,
    name            text        NOT NULL,
    mime_type       text        NOT NULL,
    size_bytes      integer     NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT files_pkey PRIMARY KEY (id),
    CONSTRAINT files_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE
);
ALTER TABLE public.files OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.call_signals (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    conversation_id uuid        NOT NULL,
    caller_id       uuid        NOT NULL,
    status          text        NOT NULL DEFAULT 'ringing',
    call_mode       text        NOT NULL DEFAULT 'voice',
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz NULL,
    CONSTRAINT call_signals_pkey PRIMARY KEY (id),
    CONSTRAINT call_signals_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE
);
ALTER TABLE public.call_signals OWNER TO postgres;

-- ────────────────────────────────────────────────────────────────
-- §3. Non-PK indexes (inventory Q9)
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_participants_user_id
    ON public.conversation_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by
    ON public.conversations (created_by);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
    ON public.messages (conversation_id, created_at);

-- ────────────────────────────────────────────────────────────────
-- §4. Functions — byte-semantic reproduction of `pg_get_functiondef`
--     retrieved on 2026-07-30. Do NOT reinterpret or harden here;
--     Plan Hito 8.2 §5 forbids drift in the V1 baseline.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_participant(conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$function$;
ALTER FUNCTION public.is_participant(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.shares_conversation(other_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = auth.uid()
      AND cp2.user_id = other_user_id
  );
$function$;
ALTER FUNCTION public.shares_conversation(uuid) OWNER TO postgres;

-- ────────────────────────────────────────────────────────────────
-- §5. Row-Level Security — ENABLE only (V1 does NOT have FORCE RLS)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals              ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- §6. Policies — 14 pre-legacy policies (Q2 inventory). All `TO public`.
--     `participants_insert_voice_messages` is deliberately EXCLUDED here;
--     it depends on `messages.source` and lives in the reconciliation
--     migration `20260617000100_reconcile_v1_voice_policy.sql`.
-- ────────────────────────────────────────────────────────────────

-- users (3)
CREATE POLICY users_select ON public.users
    FOR SELECT TO public
    USING ((id = auth.uid()) OR public.shares_conversation(id));

CREATE POLICY users_insert_own ON public.users
    FOR INSERT TO public
    WITH CHECK (id = auth.uid());

CREATE POLICY users_update_own ON public.users
    FOR UPDATE TO public
    USING (id = auth.uid());

-- conversations (2)
CREATE POLICY conversations_select ON public.conversations
    FOR SELECT TO public
    USING ((created_by = auth.uid()) OR public.is_participant(id));

CREATE POLICY conversations_insert ON public.conversations
    FOR INSERT TO public
    WITH CHECK (auth.uid() IS NOT NULL);

-- conversation_participants (2)
CREATE POLICY participants_select ON public.conversation_participants
    FOR SELECT TO public
    USING ((user_id = auth.uid()) OR public.is_participant(conversation_id));

CREATE POLICY participants_insert ON public.conversation_participants
    FOR INSERT TO public
    WITH CHECK (user_id = auth.uid());

-- messages (2 pre-legacy)
CREATE POLICY messages_select ON public.messages
    FOR SELECT TO public
    USING (public.is_participant(conversation_id));

CREATE POLICY messages_insert ON public.messages
    FOR INSERT TO public
    WITH CHECK (public.is_participant(conversation_id) AND (sender_id = auth.uid()));

-- files (2)
CREATE POLICY files_select ON public.files
    FOR SELECT TO public
    USING (public.is_participant(conversation_id));

CREATE POLICY files_insert ON public.files
    FOR INSERT TO public
    WITH CHECK (public.is_participant(conversation_id) AND (sender_id = auth.uid()));

-- call_signals (3)
CREATE POLICY call_signals_select ON public.call_signals
    FOR SELECT TO public
    USING (public.is_participant(conversation_id));

CREATE POLICY call_signals_insert ON public.call_signals
    FOR INSERT TO public
    WITH CHECK ((auth.uid() = caller_id) AND public.is_participant(conversation_id));

CREATE POLICY call_signals_update ON public.call_signals
    FOR UPDATE TO public
    USING (public.is_participant(conversation_id));

-- ────────────────────────────────────────────────────────────────
-- §7. Explicit grants derived from remote inventory (Q11, Q12). The
--     baseline does NOT rely on executor defaults; grants are emitted
--     literally. These grants are contained by RLS above.
--
--     Advertencia no bloqueante (Plan Hito 8.2 §5): the productive
--     configuration is permissive by V1 design (SECURITY DEFINER
--     functions callable by anon/authenticated with a wide `EXECUTE`
--     grant). Reproduced here EXCLUSIVELY for fidelity to V1. NOT to be
--     copied to `spabla_v2`; V2 enforces the hardened pattern (Plan
--     Hito 8.2 §9).
-- ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.users
    TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.conversations
    TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.conversation_participants
    TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.messages
    TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.files
    TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.call_signals
    TO postgres, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_participant(uuid)
    TO PUBLIC, anon, authenticated, service_role, postgres;

GRANT EXECUTE ON FUNCTION public.shares_conversation(uuid)
    TO PUBLIC, anon, authenticated, service_role, postgres;

-- ────────────────────────────────────────────────────────────────
-- §8. Realtime publication `supabase_realtime` — deterministic final
--     membership guaranteed by `ALTER PUBLICATION ... SET TABLE`.
--     PG17 docs: "The SET clause will replace the list of tables/schemas
--     in the publication with the specified list; the existing
--     tables/schemas that were present in the publication will be
--     removed." (Plan Hito 8.2 §5, V1.2 erratum).
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime
    SET (publish = 'insert, update, delete, truncate');

ALTER PUBLICATION supabase_realtime
    SET TABLE public.messages, public.call_signals;
