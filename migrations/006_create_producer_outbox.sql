-- Migrations: Create producer_outbox table in public schema
-- Up Migration

CREATE TABLE IF NOT EXISTS public.producer_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  target TEXT NOT NULL,                 -- overlay_gate | studio_controller | ...
  owner_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  payload JSONB NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (event_id, target)             -- prevents double posting per destination
);

CREATE INDEX IF NOT EXISTS idx_producer_outbox_delivery
  ON public.producer_outbox (delivered_at, next_attempt_at);
