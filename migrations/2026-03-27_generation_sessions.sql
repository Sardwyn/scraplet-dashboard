-- Generation session history for recursive image editing
BEGIN;

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS session_id        uuid,
  ADD COLUMN IF NOT EXISTS parent_job_id     uuid REFERENCES public.generation_jobs(id),
  ADD COLUMN IF NOT EXISTS edit_instruction  text,
  ADD COLUMN IF NOT EXISTS step              integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.generation_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id        text NOT NULL,
  channel_id      text NOT NULL,
  owner_user_id   bigint NOT NULL,
  requested_by    text NOT NULL,
  latest_job_id   uuid REFERENCES public.generation_jobs(id),
  latest_result_url text,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_sessions_channel_user
  ON public.generation_sessions (guild_id, channel_id, requested_by, expires_at DESC);

COMMIT;
