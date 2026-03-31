-- Migration: add_insights
-- Adds insights table for longitudinal coaching feature
-- and returning_viewer_rate column to stream_sessions

CREATE TABLE IF NOT EXISTS public.insights (
  insight_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           BIGINT NOT NULL,
  metric_key        TEXT NOT NULL,
  insight_text      TEXT NOT NULL,
  confidence        FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  supporting_data   JSONB NOT NULL DEFAULT '{}',
  date_range_start  TIMESTAMPTZ NOT NULL,
  date_range_end    TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_insights_user_metric_created
  ON public.insights(user_id, metric_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insights_user_created
  ON public.insights(user_id, created_at DESC);

ALTER TABLE public.stream_sessions
  ADD COLUMN IF NOT EXISTS returning_viewer_rate FLOAT;
