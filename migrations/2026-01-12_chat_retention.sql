BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                  text PRIMARY KEY,
  platform            text NOT NULL,
  channel_slug        text NOT NULL,
  broadcaster_user_id text NULL,
  channel_id          text NULL,
  chatroom_id         text NULL,

  actor_username      text NULL,
  actor_user_id       text NULL,

  ts                  timestamptz NOT NULL,
  text                text NOT NULL,

  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingest_source       text NOT NULL DEFAULT 'unknown',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_platform_channel_ts_idx
  ON public.chat_messages (platform, channel_slug, ts DESC);

CREATE INDEX IF NOT EXISTS chat_messages_platform_actor_ts_idx
  ON public.chat_messages (platform, actor_username, ts DESC);

CREATE INDEX IF NOT EXISTS chat_messages_channel_ts_idx
  ON public.chat_messages (channel_slug, ts DESC);

CREATE INDEX IF NOT EXISTS chat_messages_platform_actorid_ts_idx
  ON public.chat_messages (platform, actor_user_id, ts DESC);

-- Optional rollup table (fine to keep, but not required for YouTube integration)
CREATE TABLE IF NOT EXISTS public.chat_daily_stats (
  platform        text NOT NULL,
  channel_slug    text NOT NULL,
  day             date NOT NULL,
  messages        integer NOT NULL DEFAULT 0,
  unique_senders  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, channel_slug, day)
);

CREATE INDEX IF NOT EXISTS chat_daily_stats_channel_day_idx
  ON public.chat_daily_stats (channel_slug, day DESC);

COMMIT;

-- retention helper
CREATE OR REPLACE FUNCTION public.purge_chat_messages(retain_days integer)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.chat_messages
  WHERE ts < now() - (retain_days::text || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
