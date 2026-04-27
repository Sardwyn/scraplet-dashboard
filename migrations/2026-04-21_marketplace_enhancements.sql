-- Marketplace Enhancements Migration
-- Adds: reviews, ratings, favorites, acquisition tracking, reports, categories

-- 1. Marketplace acquisitions (track who got what, when)
CREATE TABLE IF NOT EXISTS public.marketplace_acquisitions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  overlay_id INTEGER REFERENCES overlays(id) ON DELETE SET NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price_paid_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_acquisitions_user ON public.marketplace_acquisitions(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_acquisitions_listing ON public.marketplace_acquisitions(listing_id);

-- 2. Marketplace reviews & ratings
CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON public.marketplace_reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_user ON public.marketplace_reviews(user_id);

-- 3. Marketplace favorites/wishlist
CREATE TABLE IF NOT EXISTS public.marketplace_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_user ON public.marketplace_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_listing ON public.marketplace_favorites(listing_id);

-- 4. Marketplace reports (flag inappropriate content)
CREATE TABLE IF NOT EXISTS public.marketplace_reports (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES marketplace_overlays(id) ON DELETE CASCADE,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_marketplace_reports_listing ON public.marketplace_reports(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reports_status ON public.marketplace_reports(status);

-- 5. Add category column to marketplace_overlays if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='marketplace_overlays' AND column_name='category') THEN
    ALTER TABLE public.marketplace_overlays ADD COLUMN category VARCHAR(100);
  END IF;
END $$;

-- 6. Add view_count and acquisition_count columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='marketplace_overlays' AND column_name='view_count') THEN
    ALTER TABLE public.marketplace_overlays ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='marketplace_overlays' AND column_name='acquisition_count') THEN
    ALTER TABLE public.marketplace_overlays ADD COLUMN acquisition_count INTEGER NOT NULL DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='marketplace_overlays' AND column_name='average_rating') THEN
    ALTER TABLE public.marketplace_overlays ADD COLUMN average_rating DECIMAL(3,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='marketplace_overlays' AND column_name='review_count') THEN
    ALTER TABLE public.marketplace_overlays ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_overlays_category ON public.marketplace_overlays(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_overlays_acquisition_count ON public.marketplace_overlays(acquisition_count DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_overlays_average_rating ON public.marketplace_overlays(average_rating DESC);

-- 8. Function to update rating stats when review is added/updated
CREATE OR REPLACE FUNCTION update_marketplace_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.marketplace_overlays
  SET 
    average_rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM public.marketplace_reviews WHERE listing_id = NEW.listing_id),
    review_count = (SELECT COUNT(*) FROM public.marketplace_reviews WHERE listing_id = NEW.listing_id)
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rating_stats ON public.marketplace_reviews;
CREATE TRIGGER trigger_update_rating_stats
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION update_marketplace_rating_stats();

-- 9. Function to increment acquisition count
CREATE OR REPLACE FUNCTION increment_acquisition_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.marketplace_overlays
  SET acquisition_count = acquisition_count + 1
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_increment_acquisition ON public.marketplace_acquisitions;
CREATE TRIGGER trigger_increment_acquisition
AFTER INSERT ON public.marketplace_acquisitions
FOR EACH ROW EXECUTE FUNCTION increment_acquisition_count();

COMMENT ON TABLE public.marketplace_acquisitions IS 'Tracks user acquisitions of marketplace overlays';
COMMENT ON TABLE public.marketplace_reviews IS 'User reviews and ratings for marketplace listings';
COMMENT ON TABLE public.marketplace_favorites IS 'User favorites/wishlist for marketplace';
COMMENT ON TABLE public.marketplace_reports IS 'User reports of inappropriate marketplace content';
