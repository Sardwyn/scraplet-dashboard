
-- Add unique constraint so ON CONFLICT works
ALTER TABLE marketplace_overlays DROP CONSTRAINT IF EXISTS marketplace_overlays_overlay_id_key;
ALTER TABLE marketplace_overlays ADD CONSTRAINT marketplace_overlays_overlay_id_key UNIQUE (overlay_id);
