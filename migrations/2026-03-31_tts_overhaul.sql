-- TTS System Overhaul migration
-- Adds tts_voices, streamer_tts_config tables
-- Adds payment columns to tts_jobs

CREATE TABLE IF NOT EXISTS public.tts_voices (
  voice_id          TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tier              TEXT NOT NULL CHECK (tier IN ('free', 'paid_basic', 'paid_premium')),
  elevenlabs_voice_id TEXT,
  price_cents       INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.streamer_tts_config (
  user_id           BIGINT PRIMARY KEY,
  enabled_voice_ids TEXT[] NOT NULL DEFAULT '{}',
  revenue_share_pct INTEGER NOT NULL DEFAULT 70,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add payment/payout columns to tts_jobs
ALTER TABLE public.tts_jobs
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_cents      INTEGER,
  ADD COLUMN IF NOT EXISTS payout_cents       INTEGER,
  ADD COLUMN IF NOT EXISTS refunded_at        TIMESTAMPTZ;

-- Seed voice library
INSERT INTO public.tts_voices (voice_id, name, tier, elevenlabs_voice_id, price_cents) VALUES
  ('kokoro_default',    'Scrapbot (Default)',  'free',          NULL,           0),
  ('el_rachel',         'Rachel',              'paid_basic',    'Rachel',       150),
  ('el_adam',           'Adam',                'paid_basic',    'Adam',         150),
  ('el_bella',          'Bella',               'paid_basic',    'Bella',        150),
  ('el_elli',           'Elli',                'paid_basic',    'Elli',         150),
  ('el_arnold',         'Arnold',              'paid_premium',  'Arnold',       300)
ON CONFLICT (voice_id) DO NOTHING;
