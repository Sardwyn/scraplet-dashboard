-- 2026-03-26_token_health.sql
-- Additive: adds refresh health tracking to external_account_tokens

BEGIN;

ALTER TABLE public.external_account_tokens
  ADD COLUMN IF NOT EXISTS refresh_error      text,
  ADD COLUMN IF NOT EXISTS refresh_failed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_ok_at      timestamptz;

COMMIT;
