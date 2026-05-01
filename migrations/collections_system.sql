-- Collections System Migration
-- Implements overlay collections for marketplace bundling and library organization

-- 1. User Collections (private collections for organizing overlays)
CREATE TABLE IF NOT EXISTS overlay_collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- 2. Collection Items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS overlay_collection_items (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES overlay_collections(id) ON DELETE CASCADE,
  overlay_id INTEGER NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, overlay_id)
);

-- 3. Add collection_id to overlays for quick reference (optional)
ALTER TABLE overlays 
  ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES overlay_collections(id) ON DELETE SET NULL;

-- 4. Update marketplace to work with collections instead of individual overlays
ALTER TABLE marketplace_overlays 
  ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES overlay_collections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_collection_listing BOOLEAN DEFAULT FALSE;

-- 5. Marketplace collection metadata
ALTER TABLE marketplace_overlays
  ADD COLUMN IF NOT EXISTS overlay_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preview_overlay_ids INTEGER[] DEFAULT '{}';

-- 6. Update marketplace_collection_items to reference overlay_collections instead
DROP TABLE IF EXISTS marketplace_collection_items;
CREATE TABLE IF NOT EXISTS marketplace_collection_bundles (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES overlay_collections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, collection_id)
);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_overlay_collections_user_id ON overlay_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_overlay_collection_items_collection_id ON overlay_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_overlay_collection_items_overlay_id ON overlay_collection_items(overlay_id);
CREATE INDEX IF NOT EXISTS idx_overlays_collection_id ON overlays(collection_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_overlays_collection_id ON marketplace_overlays(collection_id);

-- 8. Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_collection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_collection_updated_at ON overlay_collections;
CREATE TRIGGER trg_update_collection_updated_at
  BEFORE UPDATE ON overlay_collections
  FOR EACH ROW EXECUTE FUNCTION update_collection_updated_at();

-- 9. Function to update collection thumbnail (use first overlay's thumbnail)
CREATE OR REPLACE FUNCTION update_collection_thumbnail()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE overlay_collections 
  SET thumbnail_url = (
    SELECT o.thumbnail_url 
    FROM overlay_collection_items oci
    JOIN overlays o ON o.id = oci.overlay_id
    WHERE oci.collection_id = COALESCE(NEW.collection_id, OLD.collection_id)
      AND o.thumbnail_url IS NOT NULL
    ORDER BY oci.sort_order ASC, oci.added_at ASC
    LIMIT 1
  )
  WHERE id = COALESCE(NEW.collection_id, OLD.collection_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_collection_thumbnail ON overlay_collection_items;
CREATE TRIGGER trg_update_collection_thumbnail
  AFTER INSERT OR UPDATE OR DELETE ON overlay_collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_thumbnail();