-- 2026-02-09_discord_integrations.sql
-- Discord multi-tenant integration tables (guild claim fence + channel/role/reaction rules)
-- Tenancy boundary: owner_user_id (public.users.id)
-- Hard fence: guild_id is unique/primary so it cannot be claimed by multiple tenants.

BEGIN;

CREATE TABLE IF NOT EXISTS public.discord_guild_integrations (
  guild_id                text PRIMARY KEY,
  owner_user_id           bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  installed_by_user_id    bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'active',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_guild_integrations_owner_user_id
  ON public.discord_guild_integrations(owner_user_id);

-- Per-guild channel allowlist + mode defaults (Mode B = live)
CREATE TABLE IF NOT EXISTS public.discord_channel_rules (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id                text NOT NULL REFERENCES public.discord_guild_integrations(guild_id) ON DELETE CASCADE,
  channel_id              text NOT NULL,
  enabled                 boolean NOT NULL DEFAULT true,
  mode                    text NOT NULL DEFAULT 'live',
  show_ttl_seconds        integer NOT NULL DEFAULT 12,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_channel_rules_guild_id
  ON public.discord_channel_rules(guild_id);

-- Per-guild role permissions (who can react / who can slash-control later)
CREATE TABLE IF NOT EXISTS public.discord_role_rules (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id                text NOT NULL REFERENCES public.discord_guild_integrations(guild_id) ON DELETE CASCADE,
  role_id                 text NOT NULL,
  can_react_show           boolean NOT NULL DEFAULT false,
  can_slash_control        boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_role_rules_guild_id
  ON public.discord_role_rules(guild_id);

-- Emoji → action mapping per guild
-- action enum (enforced in app layer): show_now | save_only | remove | force_text | force_media
CREATE TABLE IF NOT EXISTS public.discord_reaction_map (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id                text NOT NULL REFERENCES public.discord_guild_integrations(guild_id) ON DELETE CASCADE,
  emoji                   text NOT NULL,
  action                  text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_discord_reaction_map_guild_id
  ON public.discord_reaction_map(guild_id);

COMMIT;
