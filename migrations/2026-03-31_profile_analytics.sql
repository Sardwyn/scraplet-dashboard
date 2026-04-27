-- Profile analytics tables

CREATE TABLE IF NOT EXISTS public.profile_views (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referrer    TEXT,
  country     TEXT,
  ip_hash     TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_views_user_date
  ON public.profile_views(user_id, visited_at DESC);

CREATE TABLE IF NOT EXISTS public.profile_clicks (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  element_type TEXT NOT NULL, -- 'button', 'social', 'tipjar', 'contact', 'sponsor'
  element_id   TEXT,          -- button id, social platform name, etc
  element_label TEXT,
  clicked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash      TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_clicks_user_date
  ON public.profile_clicks(user_id, clicked_at DESC);
