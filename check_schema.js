import './bootstrap/env.js';
import db from './scrapbotDb.js';

async function main() {
    try {
        const res = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scrapbot_moderation_settings'");
        console.log(res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
