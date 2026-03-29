-- Migration: add_stake_session_events
-- Adds stake_session_events table for Stake Monitor widget data pipeline
-- and widget_configs table for per-overlay widget instance configuration.

CREATE TABLE IF NOT EXISTS public.stake_session_events (
  id              BIGSERIAL PRIMARY KEY,
  session_id      UUID,                          -- nullable: may arrive before session opens
  user_id         BIGINT,                        -- dashboard user who owns the overlay
  game_name       TEXT,
  current_balance NUMERIC(12, 2),
  last_win        NUMERIC(12, 2),
  bet_size        NUMERIC(12, 2),
  multiplier      NUMERIC(10, 4),
  session_pnl     NUMERIC(12, 2),               -- server-computed: current_balance - start_balance
  raw_payload     JSONB NOT NULL DEFAULT '{}',
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stake_session_events_session
  ON public.stake_session_events(session_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stake_session_events_user
  ON public.stake_session_events(user_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.widget_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overlay_id  UUID NOT NULL,
  instance_id TEXT NOT NULL,
  widget_id   TEXT NOT NULL,
  props       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(overlay_id, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_widget_configs_overlay
  ON public.widget_configs(overlay_id);
