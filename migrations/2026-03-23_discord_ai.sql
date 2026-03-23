-- 2026-03-23_discord_ai.sql
-- Scrapbot AI: per-guild toggle, conversation context store, AI role permissions

BEGIN;

-- Toggle AI on/off per guild
ALTER TABLE public.discord_guild_integrations
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;

-- Allow roles to use AI chat
ALTER TABLE public.discord_role_rules
  ADD COLUMN IF NOT EXISTS can_use_ai boolean NOT NULL DEFAULT false;

-- Conversation threads (one per channel, reset-able)
CREATE TABLE IF NOT EXISTS public.discord_ai_conversations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id        text NOT NULL REFERENCES public.discord_guild_integrations(guild_id) ON DELETE CASCADE,
  channel_id      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_ai_conversations_guild_channel
  ON public.discord_ai_conversations(guild_id, channel_id);

-- Message history per conversation (context window source)
CREATE TABLE IF NOT EXISTS public.discord_ai_messages (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     uuid NOT NULL REFERENCES public.discord_ai_conversations(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content             text NOT NULL,
  author_discord_id   text,
  author_name         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_ai_messages_conversation_id
  ON public.discord_ai_messages(conversation_id, created_at DESC);

COMMIT;
