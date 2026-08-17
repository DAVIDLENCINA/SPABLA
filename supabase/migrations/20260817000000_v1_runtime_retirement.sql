-- SPABLA V2 · Fase 9 · Hito 9.2.6 — V1-ERADICATION · SQL runtime retirement.
--
-- Purpose: retire from the FINAL state of the local Supabase database the
-- entire V1 runtime surface that lived in schema `public`. The chain of
-- historical migrations (`20260101000000_v1_baseline.sql`,
-- `20260617000000_add_message_source.sql`,
-- `20260617000100_reconcile_v1_voice_policy.sql`) is preserved on purpose so
-- that `supabase db reset --local` still rebuilds the exact V1 baseline BEFORE
-- this migration removes it — the audit trail of what V1 was remains readable
-- from history and passes review.
--
-- Scope (drops from the FINAL state):
--   · Realtime publication membership: `public.messages`, `public.call_signals`
--     removed from `supabase_realtime` (publication itself is preserved as an
--     empty publication so a future V2 realtime feature can `ALTER PUBLICATION
--     ... ADD TABLE` without a schema shape change).
--   · Policies (15): the 14 baseline policies plus
--     `participants_insert_voice_messages` from the reconciliation migration.
--   · Tables (6): `users`, `conversations`, `conversation_participants`,
--     `messages`, `files`, `call_signals`. Their indexes, FK constraints,
--     CHECK constraints (`messages_source_check`), primary keys and RLS
--     configuration are removed by the `CASCADE` cascade of DROP TABLE.
--   · Functions (2): `public.is_participant(uuid)`, `public.shares_conversation(uuid)`.
--
-- Deliberately OUT OF SCOPE (unchanged):
--   · `spabla_v2.*` — the V2 productive schema, its tables, policies, admin
--     functions, ownership and RLS configuration. Zero touch.
--   · `auth.*`, `storage.*` — Supabase-managed schemas.
--   · Extensions (`pgcrypto`, `uuid-ossp`) — `pgcrypto.gen_random_uuid()` is
--     used by the V2 phase-8 bootstrap; retiring it would break V2.
--   · The `supabase_realtime` publication itself — kept as empty so future
--     V2 realtime adds require no publication (re)creation.
--   · Historical migrations — preserved verbatim on disk (Plan Hito 9.2.6 §6:
--     "No borrar ni editar migraciones históricas existentes").
--
-- Idempotency: every DROP uses `IF EXISTS`; the publication membership drop
-- is guarded by an `IF EXISTS` check on `pg_publication_rel` so a second
-- application (or a fresh cluster where V1 was never applied) is a no-op.
--
-- Governance: Plan Hito 9.2.6 (V1-ERADICATION) §6 · Commit 3.
-- Timestamp `20260817000000` sits strictly AFTER
-- `20260812000000_fase9_1_1_message_translations.sql` and is the current
-- runtime-retirement checkpoint. Forward-only: this migration does NOT
-- restore V1 state under any codepath.

-- ────────────────────────────────────────────────────────────────
-- §1. Realtime publication — remove V1 membership.
-- ────────────────────────────────────────────────────────────────
-- The `ALTER PUBLICATION ... DROP TABLE` form removes ONLY the listed tables
-- and preserves the publication itself. Guarded by `pg_publication` so the
-- statement is a no-op on clusters that never had the publication.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        IF EXISTS (
            SELECT 1
              FROM pg_publication_rel pr
              JOIN pg_publication p    ON p.oid = pr.prpubid
              JOIN pg_class      c     ON c.oid = pr.prrelid
              JOIN pg_namespace  n     ON n.oid = c.relnamespace
             WHERE p.pubname = 'supabase_realtime'
               AND n.nspname = 'public'
               AND c.relname = 'messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
        END IF;

        IF EXISTS (
            SELECT 1
              FROM pg_publication_rel pr
              JOIN pg_publication p    ON p.oid = pr.prpubid
              JOIN pg_class      c     ON c.oid = pr.prrelid
              JOIN pg_namespace  n     ON n.oid = c.relnamespace
             WHERE p.pubname = 'supabase_realtime'
               AND n.nspname = 'public'
               AND c.relname = 'call_signals'
        ) THEN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.call_signals;
        END IF;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- §2. Policies — drop the 15 V1 policies explicitly.
-- ────────────────────────────────────────────────────────────────
-- `DROP POLICY IF EXISTS` is idempotent. Explicit drops (rather than relying
-- on `DROP TABLE ... CASCADE` alone) make the retirement inventory readable
-- from the migration file without needing to inspect the cascade log.

DROP POLICY IF EXISTS users_select                        ON public.users;
DROP POLICY IF EXISTS users_insert_own                    ON public.users;
DROP POLICY IF EXISTS users_update_own                    ON public.users;

DROP POLICY IF EXISTS conversations_select                ON public.conversations;
DROP POLICY IF EXISTS conversations_insert                ON public.conversations;

DROP POLICY IF EXISTS participants_select                 ON public.conversation_participants;
DROP POLICY IF EXISTS participants_insert                 ON public.conversation_participants;

DROP POLICY IF EXISTS messages_select                     ON public.messages;
DROP POLICY IF EXISTS messages_insert                     ON public.messages;
DROP POLICY IF EXISTS participants_insert_voice_messages  ON public.messages;

DROP POLICY IF EXISTS files_select                        ON public.files;
DROP POLICY IF EXISTS files_insert                        ON public.files;

DROP POLICY IF EXISTS call_signals_select                 ON public.call_signals;
DROP POLICY IF EXISTS call_signals_insert                 ON public.call_signals;
DROP POLICY IF EXISTS call_signals_update                 ON public.call_signals;

-- ────────────────────────────────────────────────────────────────
-- §3. Tables — drop in reverse-FK-topological order with CASCADE.
-- ────────────────────────────────────────────────────────────────
-- CASCADE handles: foreign-key constraints, primary keys, non-PK indexes
-- (`idx_participants_user_id`, `idx_conversations_created_by`,
-- `idx_messages_conv_created`), the `messages_source_check` CHECK constraint,
-- and any residual RLS configuration. Reverse dependency order minimises
-- the cascade surface at each step.

DROP TABLE IF EXISTS public.call_signals              CASCADE;
DROP TABLE IF EXISTS public.files                     CASCADE;
DROP TABLE IF EXISTS public.messages                  CASCADE;
DROP TABLE IF EXISTS public.conversation_participants CASCADE;
DROP TABLE IF EXISTS public.conversations             CASCADE;
DROP TABLE IF EXISTS public.users                     CASCADE;

-- ────────────────────────────────────────────────────────────────
-- §4. Functions — retire the two SECURITY DEFINER helpers.
-- ────────────────────────────────────────────────────────────────
-- Signature is fully qualified so a future collision with a same-named V2
-- helper (if ever introduced) does not match this drop.

DROP FUNCTION IF EXISTS public.is_participant(uuid);
DROP FUNCTION IF EXISTS public.shares_conversation(uuid);
