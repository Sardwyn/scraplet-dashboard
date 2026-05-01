-- Marketplace ratings and reviews
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, user_id)
);

-- Add missing columns to marketplace_overlays
ALTER TABLE marketplace_overlays
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category VARCHAR(64),
  ADD COLUMN IF NOT EXISTS platform_tags TEXT[],
  ADD COLUMN IF NOT EXISTS install_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) DEFAULT 0;

-- Auto-update avg_rating trigger
CREATE OR REPLACE FUNCTION update_listing_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_overlays
  SET avg_rating = (
    SELECT ROUND(AVG(rating)::numeric, 2)
    FROM marketplace_reviews
    WHERE listing_id = NEW.listing_id
  )
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_avg_rating ON marketplace_reviews;
CREATE TRIGGER trg_update_avg_rating
AFTER INSERT OR UPDATE ON marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION update_listing_avg_rating();

-- Curated collections
CREATE TABLE IF NOT EXISTS marketplace_collections (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_collection_items (
  collection_id INTEGER REFERENCES marketplace_collections(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, listing_id)
);
