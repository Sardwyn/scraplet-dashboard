-- Migration: Widget Library System
-- Creates alert templates and bot widget preferences tables
-- Extends lower_third_templates with source tracking

BEGIN;

-- Add source_overlay_id to existing lower_third_templates
ALTER TABLE lower_third_templates 
ADD COLUMN IF NOT EXISTS source_overlay_id bigint REFERENCES overlays(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lower_third_templates_source_overlay 
ON lower_third_templates(source_overlay_id);

-- Create alert_templates (mirrors lower_third_templates)
CREATE TABLE IF NOT EXISTS alert_templates (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id text NOT NULL,
  name text NOT NULL,
  template_json jsonb NOT NULL DEFAULT '{}',
  source_overlay_id bigint REFERENCES overlays(id) ON DELETE SET NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, public_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_templates_user_id 
ON alert_templates(user_id);

CREATE INDEX IF NOT EXISTS idx_alert_templates_source_overlay 
ON alert_templates(source_overlay_id);

-- Ensure only one default alert per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_alert_per_user 
ON alert_templates(user_id) WHERE is_default = true;

-- Scrapbot widget preferences (per user)
CREATE TABLE IF NOT EXISTS scrapbot_widget_preferences (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lower_third_template_id integer REFERENCES lower_third_templates(id) ON DELETE SET NULL,
  alert_template_id integer REFERENCES alert_templates(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrapbot_widget_prefs_lt 
ON scrapbot_widget_preferences(lower_third_template_id);

CREATE INDEX IF NOT EXISTS idx_scrapbot_widget_prefs_alert 
ON scrapbot_widget_preferences(alert_template_id);

-- Discord widget preferences (per guild)
CREATE TABLE IF NOT EXISTS discord_widget_preferences (
  guild_id text PRIMARY KEY REFERENCES discord_guild_integrations(guild_id) ON DELETE CASCADE,
  lower_third_template_id integer REFERENCES lower_third_templates(id) ON DELETE SET NULL,
  alert_template_id integer REFERENCES alert_templates(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_widget_prefs_lt 
ON discord_widget_preferences(lower_third_template_id);

CREATE INDEX IF NOT EXISTS idx_discord_widget_prefs_alert 
ON discord_widget_preferences(alert_template_id);

COMMIT;
