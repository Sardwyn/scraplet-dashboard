import fs from 'fs';
import pg from 'pg';

const migrationFile = 'migrations/2026-02-12_lower_third_templates.sql';

(async () => {
    try {
        const sql = fs.readFileSync(migrationFile, 'utf8');
        console.log(`Running migration: ${migrationFile}`);

        // Config object - NO URL parsing issues
        const mPool = new pg.Pool({
            host: '127.0.0.1',
            port: 5432,
            database: 'creator_platform',
            user: 'scrapapp',
            password: 'Outrun1279!',
            ssl: false
        });

        await mPool.query(sql);
        console.log('Migration completed successfully.');
        await mPool.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
})();
