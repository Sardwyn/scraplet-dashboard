-- Drop video job types from the constraint (additive — just tightens the check)
-- Video types will be re-added when quota allows
BEGIN;

ALTER TABLE public.generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_job_type_check;

ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_job_type_check
  CHECK (job_type IN ('image_fast', 'image_premium', 'image_stylized'));

COMMIT;
