-- Migrations: Create stream_sessions table in public schema
-- Up Migration

CREATE TABLE IF NOT EXISTS public.stream_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  channel_slug text NOT NULL,
  external_stream_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('live','ended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Active session constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_sessions_active_unique 
  ON public.stream_sessions (platform, channel_slug) 
  WHERE ended_at IS NULL;

-- Consistency constraint
ALTER TABLE public.stream_sessions
  ADD CONSTRAINT stream_status_consistency
  CHECK (
    (status = 'live' AND ended_at IS NULL)
    OR
    (status = 'ended' AND ended_at IS NOT NULL)
  );

-- Adds session tracking to chat firehose tables
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE public.kick_events ADD COLUMN IF NOT EXISTS session_id uuid;

-- Useful index for fast bounded lookups
CREATE INDEX IF NOT EXISTS idx_kick_events_session_id ON public.kick_events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON public.events (session_id);
