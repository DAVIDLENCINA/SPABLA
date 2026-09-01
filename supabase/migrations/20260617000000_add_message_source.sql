-- Migration: add source column to messages
-- Purpose: distinguish text messages from persisted voice captions
-- Impact:  zero downtime — ADD COLUMN with DEFAULT, existing rows unaffected
-- Deploy order: run this BEFORE deploying the client code that writes source='voice'

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'text';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_source_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_source_check CHECK (source IN ('text', 'voice'));
  END IF;
END $$;
