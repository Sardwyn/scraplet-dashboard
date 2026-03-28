-- 2026-03-26_stream_session_stats.sql
-- Additive: adds per-session computed stats to stream_sessions
-- Does NOT modify existing columns or constraints

BEGIN;

ALTER TABLE public.stream_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes    numeric,
  ADD COLUMN IF NOT EXISTS total_messages      integer,
  ADD COLUMN IF NOT EXISTS unique_chatters     integer,
  ADD COLUMN IF NOT EXISTS messages_per_minute numeric,
  ADD COLUMN IF NOT EXISTS peak_ccv            integer,
  ADD COLUMN IF NOT EXISTS stats_computed_at   timestamptz;

-- Index for fast stats queries per user (via channel join)
CREATE INDEX IF NOT EXISTS idx_stream_sessions_channel_started
  ON public.stream_sessions (channel_slug, started_at DESC);

COMMIT;
