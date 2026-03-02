-- Migrations: Create chat_outbox table in public schema
-- Up Migration

CREATE TABLE IF NOT EXISTS public.chat_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  payload JSONB NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_outbox_delivery ON public.chat_outbox (delivered_at, next_attempt_at);
