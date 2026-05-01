import db from '../db.js';

export async function applyStartupMigrations() {
    console.log('Checking for overlay_components table...');
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS overlay_components (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                public_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1,
                component_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_overlay_components_user_id ON overlay_components(user_id);
        `);

        console.log('✅ overlay_components table checked/created.');
    } catch (err) {
        console.error('❌ Failed to apply startup migrations:', err);
    }

    console.log('Checking for collections system tables...');
    try {
        // 1. User Collections (private collections for organizing overlays)
        await db.query(`
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
        `);

        // 2. Collection Items (many-to-many relationship)
        await db.query(`
            CREATE TABLE IF NOT EXISTS overlay_collection_items (
                id SERIAL PRIMARY KEY,
                collection_id INTEGER NOT NULL REFERENCES overlay_collections(id) ON DELETE CASCADE,
                overlay_id INTEGER NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
                sort_order INTEGER DEFAULT 0,
                added_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(collection_id, overlay_id)
            );
        `);

        // 3. Add collection_id to overlays for quick reference (optional)
        await db.query(`
            ALTER TABLE overlays 
            ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES overlay_collections(id) ON DELETE SET NULL;
        `);

        // 4. Update marketplace to work with collections instead of individual overlays
        await db.query(`
            ALTER TABLE marketplace_overlays 
            ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES overlay_collections(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS is_collection_listing BOOLEAN DEFAULT FALSE;
        `);

        // 5. Marketplace collection metadata
        await db.query(`
            ALTER TABLE marketplace_overlays
            ADD COLUMN IF NOT EXISTS overlay_count INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS preview_overlay_ids INTEGER[] DEFAULT '{}';
        `);

        // 6. Indexes for performance
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_overlay_collections_user_id ON overlay_collections(user_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_overlay_collection_items_collection_id ON overlay_collection_items(collection_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_overlay_collection_items_overlay_id ON overlay_collection_items(overlay_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_overlays_collection_id ON overlays(collection_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_marketplace_overlays_collection_id ON marketplace_overlays(collection_id);
        `);

        // 7. Update trigger for updated_at
        await db.query(`
            CREATE OR REPLACE FUNCTION update_collection_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await db.query(`
            DROP TRIGGER IF EXISTS trg_update_collection_updated_at ON overlay_collections;
        `);
        await db.query(`
            CREATE TRIGGER trg_update_collection_updated_at
                BEFORE UPDATE ON overlay_collections
                FOR EACH ROW EXECUTE FUNCTION update_collection_updated_at();
        `);

        // 8. Function to update collection thumbnail (use first overlay's thumbnail)
        await db.query(`
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
        `);

        await db.query(`
            DROP TRIGGER IF EXISTS trg_update_collection_thumbnail ON overlay_collection_items;
        `);
        await db.query(`
            CREATE TRIGGER trg_update_collection_thumbnail
                AFTER INSERT OR UPDATE OR DELETE ON overlay_collection_items
                FOR EACH ROW EXECUTE FUNCTION update_collection_thumbnail();
        `);

        console.log('✅ Collections system tables checked/created.');
    } catch (err) {
        console.error('❌ Failed to apply collections migrations:', err);
    }

    console.log('Checking for marketplace collections table...');
    try {
        // Drop existing table if it exists (in case of partial migration)
        await db.query(`
            DROP TABLE IF EXISTS marketplace_collections CASCADE;
        `);

        // Marketplace Collections (published collections for sale/download)
        await db.query(`
            CREATE TABLE IF NOT EXISTS marketplace_collections (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                collection_id INTEGER NOT NULL REFERENCES overlay_collections(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price_cents INTEGER NOT NULL DEFAULT 0,
                snapshot_overlays JSONB NOT NULL DEFAULT '[]'::jsonb,
                status VARCHAR(32) NOT NULL DEFAULT 'draft',
                published_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(collection_id)
            );
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_marketplace_collections_user_id ON marketplace_collections(user_id);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_marketplace_collections_status ON marketplace_collections(status);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_marketplace_collections_published_at ON marketplace_collections(published_at);
        `);

        console.log('✅ Marketplace collections table checked/created.');
    } catch (err) {
        console.error('❌ Failed to apply marketplace collections migrations:', err);
    }
}
