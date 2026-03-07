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
}
