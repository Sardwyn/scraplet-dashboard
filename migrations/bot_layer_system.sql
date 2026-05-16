-- ============================================================================
-- Bot Layer System Migration
-- ============================================================================
-- Creates infrastructure for bots (Scrapbot/Disco Scrapbot) to spawn widgets
-- dynamically on overlays. Includes default zones, permissions, and lower
-- third template defaults.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Bot Layer Configuration Table
-- ============================================================================
-- Stores zone definitions for each overlay. Auto-created with defaults.

CREATE TABLE IF NOT EXISTS overlay_bot_layers (
  overlay_id INTEGER PRIMARY KEY REFERENCES overlays(id) ON DELETE CASCADE,
  zones JSONB NOT NULL DEFAULT '{
    "TL": {"x": 50, "y": 50, "width": 400, "height": 200, "zIndex": 9999},
    "TR": {"x": 1470, "y": 50, "width": 400, "height": 200, "zIndex": 9999},
    "C": {"x": 760, "y": 440, "width": 400, "height": 200, "zIndex": 9999},
    "BL": {"x": 50, "y": 830, "width": 400, "height": 200, "zIndex": 9999},
    "BR": {"x": 1470, "y": 830, "width": 400, "height": 200, "zIndex": 9999},
    "LT": {"x": 0, "y": 930, "width": 1920, "height": 150, "zIndex": 10000}
  }'::jsonb,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE overlay_bot_layers IS 'Bot-controlled overlay zones for dynamic widget spawning';
COMMENT ON COLUMN overlay_bot_layers.zones IS 'Zone definitions: TL, TR, C, BL, BR, LT with position and z-index';

-- ============================================================================
-- 2. Bot Layer Widgets Table (Ephemeral)
-- ============================================================================
-- Stores active bot-spawned widgets. Auto-expires based on duration_ms.

CREATE TABLE IF NOT EXISTS bot_layer_widgets (
  id SERIAL PRIMARY KEY,
  overlay_id INTEGER NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  zone_key TEXT NOT NULL,                    -- 'TL', 'TR', 'C', 'BL', 'BR', 'LT'
  widget_type TEXT NOT NULL,                 -- 'lower-third', 'alert', 'card', 'custom'
  config JSONB NOT NULL,                     -- Widget-specific configuration
  duration_ms INTEGER,                       -- NULL = persistent until cleared
  expires_at TIMESTAMPTZ,                    -- Auto-calculated from duration_ms
  created_by TEXT NOT NULL,                  -- 'discord:user#1234' or 'chat:username'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_zone_key CHECK (zone_key IN ('TL', 'TR', 'C', 'BL', 'BR', 'LT')),
  CONSTRAINT valid_widget_type CHECK (widget_type IN ('lower-third', 'alert', 'card', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_bot_widgets_overlay_zone ON bot_layer_widgets(overlay_id, zone_key);
CREATE INDEX IF NOT EXISTS idx_bot_widgets_expires ON bot_layer_widgets(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE bot_layer_widgets IS 'Active bot-spawned widgets (ephemeral, auto-expire)';
COMMENT ON COLUMN bot_layer_widgets.zone_key IS 'Target zone: TL=Top Left, TR=Top Right, C=Center, BL=Bottom Left, BR=Bottom Right, LT=Lower Third';
COMMENT ON COLUMN bot_layer_widgets.duration_ms IS 'Widget lifetime in milliseconds. NULL = persistent until manually cleared';
COMMENT ON COLUMN bot_layer_widgets.created_by IS 'Bot and user identifier (e.g., discord:username#1234 or chat:username)';

-- ============================================================================
-- 3. Bot Layer Permissions Table
-- ============================================================================
-- Controls who can spawn widgets via bots (per channel).

CREATE TABLE IF NOT EXISTS scrapbot_bot_layer_permissions (
  channel_id INTEGER PRIMARY KEY,
  allow_mods BOOLEAN DEFAULT true,
  allow_broadcaster BOOLEAN DEFAULT true,
  allow_everyone BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE scrapbot_bot_layer_permissions IS 'Bot layer spawn permissions per channel';
COMMENT ON COLUMN scrapbot_bot_layer_permissions.allow_mods IS 'Allow moderators to spawn widgets';
COMMENT ON COLUMN scrapbot_bot_layer_permissions.allow_broadcaster IS 'Allow broadcaster to spawn widgets';
COMMENT ON COLUMN scrapbot_bot_layer_permissions.allow_everyone IS 'Allow all users to spawn widgets (not recommended)';

-- ============================================================================
-- 4. Lower Third Template Defaults
-- ============================================================================
-- Add default flag to lower_third_templates (one default per user).

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lower_third_templates' 
    AND column_name = 'is_default'
  ) THEN
    ALTER TABLE lower_third_templates 
    ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Ensure only one default per user
DROP INDEX IF EXISTS idx_one_default_per_user;
CREATE UNIQUE INDEX idx_one_default_per_user 
ON lower_third_templates(user_id) 
WHERE is_default = true;

COMMENT ON COLUMN lower_third_templates.is_default IS 'Default template for bot commands (one per user)';

-- ============================================================================
-- 5. Populate Bot Layers for Existing Overlays
-- ============================================================================
-- Create bot layer entries for all existing overlays with default zones.

INSERT INTO overlay_bot_layers (overlay_id)
SELECT id FROM overlays
ON CONFLICT (overlay_id) DO NOTHING;

-- ============================================================================
-- 6. Helper Function: Auto-Expire Bot Widgets
-- ============================================================================
-- Cleanup function to remove expired widgets (run via cron or worker).

CREATE OR REPLACE FUNCTION cleanup_expired_bot_widgets()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM bot_layer_widgets
  WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_bot_widgets IS 'Removes expired bot widgets. Run periodically via cron/worker.';

-- ============================================================================
-- 7. Trigger: Auto-Create Bot Layer on Overlay Insert
-- ============================================================================
-- Automatically create bot layer when new overlay is created.

CREATE OR REPLACE FUNCTION create_bot_layer_for_overlay()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO overlay_bot_layers (overlay_id)
  VALUES (NEW.id)
  ON CONFLICT (overlay_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_bot_layer ON overlays;
CREATE TRIGGER trigger_create_bot_layer
  AFTER INSERT ON overlays
  FOR EACH ROW
  EXECUTE FUNCTION create_bot_layer_for_overlay();

COMMENT ON FUNCTION create_bot_layer_for_overlay IS 'Auto-creates bot layer when overlay is created';

-- ============================================================================
-- 8. Grant Permissions
-- ============================================================================
-- Ensure application user has access to new tables.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scrapapp') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON overlay_bot_layers TO scrapapp;
    GRANT SELECT, INSERT, UPDATE, DELETE ON bot_layer_widgets TO scrapapp;
    GRANT SELECT, INSERT, UPDATE, DELETE ON scrapbot_bot_layer_permissions TO scrapapp;
    GRANT USAGE, SELECT ON SEQUENCE bot_layer_widgets_id_seq TO scrapapp;
  END IF;
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMIT;

-- Verification queries (run manually to verify):
-- SELECT COUNT(*) FROM overlay_bot_layers;
-- SELECT COUNT(*) FROM overlays;
-- SELECT * FROM bot_layer_widgets LIMIT 5;
-- SELECT cleanup_expired_bot_widgets();
