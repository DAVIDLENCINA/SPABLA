-- SPABLA V2 · Fase 8 · Hito 8.2 — V1 reconciliation: voice-messages policy.
--
-- Purpose: reproduce in the repo a policy that was applied MANUALLY to the
-- productive remote AFTER `20260617000000_add_message_source.sql` and that the
-- legacy migration itself does NOT create. The read-only inventory of
-- 2026-07-29 (query Q2) confirmed the policy exists in `public.messages` with
-- exactly the definition transcribed below.
--
-- Timestamp `20260617000100` is chosen to sit strictly AFTER the legacy
-- migration `20260617000000_add_message_source.sql` and BEFORE the phase 8
-- bootstrap. This is a repo↔remote reconciliation migration, NOT a historical
-- rewrite. It is NOT applied to the productive remote in Hito 8.2; that will
-- require separate authorisation (Plan Hito 8.2 §14).
--
-- Governance: Plan Hito 8.2 V1.2 §7. Idempotency pattern: ADR-008 §11.2 —
-- `CREATE POLICY IF NOT EXISTS` is NOT valid PostgreSQL syntax, so we use a
-- `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_policies ...) $$` guard.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'messages'
          AND policyname = 'participants_insert_voice_messages'
    ) THEN
        CREATE POLICY participants_insert_voice_messages
            ON public.messages
            FOR INSERT
            TO public
            WITH CHECK (
                (source = 'voice'::text)
                AND public.is_participant(conversation_id)
                AND (sender_id IN (
                    SELECT conversation_participants.user_id
                    FROM public.conversation_participants
                    WHERE (conversation_participants.conversation_id = messages.conversation_id)
                ))
            );
    END IF;
END $$;
