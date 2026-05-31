-- polymorphic_collections.sql
-- Step 1: Drop old NOT NULL constraint on overlay_id and drop old unique constraint
ALTER TABLE overlay_collection_items ALTER COLUMN overlay_id DROP NOT NULL;
ALTER TABLE overlay_collection_items DROP CONSTRAINT IF EXISTS overlay_collection_items_collection_id_overlay_id_key;

-- Step 2: Add polymorphic columns
ALTER TABLE overlay_collection_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'overlay';
ALTER TABLE overlay_collection_items ADD COLUMN IF NOT EXISTS component_id INT REFERENCES overlay_components(id) ON DELETE CASCADE;

-- Step 3: Populate item_type for existing records
UPDATE overlay_collection_items SET item_type = 'overlay' WHERE item_type IS NULL;

-- Step 4: Create new partial unique indexes for overlays and components
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_overlay_unique ON overlay_collection_items(collection_id, overlay_id) WHERE (item_type = 'overlay');
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_component_unique ON overlay_collection_items(collection_id, component_id) WHERE (item_type = 'component');

-- Step 5: Create marketplace_components table to support individual atom listings
CREATE TABLE IF NOT EXISTS marketplace_components (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  component_id INT NOT NULL UNIQUE REFERENCES overlay_components(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL DEFAULT 0,
  snapshot_config JSONB,
  asset_confirmed BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  install_count INT DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 0
);

-- Step 6: Add snapshot_components column to marketplace_collections
ALTER TABLE marketplace_collections ADD COLUMN IF NOT EXISTS snapshot_components JSONB NOT NULL DEFAULT '[]'::jsonb;
