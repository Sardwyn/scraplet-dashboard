-- 2026-02-18_tiktok_support.sql
-- Add support for TikTok integration (manual username entry)

ALTER TABLE external_accounts 
ADD COLUMN IF NOT EXISTS unique_id TEXT,
ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

-- Drop existing constraint if strictly enforcing enum (optional, depending on your setup)
-- ALTER TABLE external_accounts DROP CONSTRAINT IF EXISTS external_accounts_platform_check;
-- ALTER TABLE external_accounts ADD CONSTRAINT external_accounts_platform_check CHECK (platform IN ('kick', 'youtube', 'twitch', 'discord', 'tiktok'));
