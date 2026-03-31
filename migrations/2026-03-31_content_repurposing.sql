-- Content Repurposing migration

CREATE TABLE IF NOT EXISTS public.content_packs (
  pack_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             BIGINT NOT NULL,
  session_id          TEXT NOT NULL UNIQUE,
  twitter_thread      JSONB,
  shorts_script       JSONB,
  discord_recap       TEXT,
  status              TEXT NOT NULL DEFAULT 'generated'
                        CHECK (status IN ('generated','approved','edited','discarded')),
  discord_message_id  TEXT,
  designated_channel_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ,
  posted_twitter_url  TEXT,
  youtube_draft_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_packs_user
  ON public.content_packs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         BIGINT NOT NULL,
  platform        TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);
