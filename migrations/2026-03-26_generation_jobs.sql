-- 2026-03-26_generation_jobs.sql
-- Media generation job queue for Disco Scrapbot spot worker pipeline

BEGIN;

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant + Discord context
  guild_id          text NOT NULL,
  channel_id        text NOT NULL,
  discord_message_id text,           -- the "generating..." holding message to edit
  requested_by      text NOT NULL,   -- discord user id
  owner_user_id     bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Job spec
  job_type          text NOT NULL CHECK (job_type IN (
                      'image_fast',
                      'image_premium',
                      'image_stylized',
                      'video_from_image',
                      'video_from_prompt'
                    )),
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- prompt, lora, dimensions etc

  -- Lifecycle
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending',
                      'processing',
                      'done',
                      'failed'
                    )),
  worker_id         text,            -- which spot instance picked it up
  last_heartbeat_at timestamptz,     -- worker keepalive
  attempts          integer NOT NULL DEFAULT 0,

  -- Result
  result_url        text,            -- served from VPS /generated/
  result_filename   text,
  error_message     text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_created
  ON public.generation_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_guild_channel
  ON public.generation_jobs (guild_id, channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_heartbeat
  ON public.generation_jobs (last_heartbeat_at)
  WHERE status = 'processing';

COMMIT;
