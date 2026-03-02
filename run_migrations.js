import './bootstrap/env.js';
import fs from 'fs';
import db from './db.js';
import scrapbotDb from './scrapbotDb.js';

async function run() {
    try {
        console.log("Applying creator_platform migration...");
        const sql1 = fs.readFileSync('./migrations/007_create_stream_sessions.sql', 'utf8');
        await db.query(sql1);
        console.log("OK!");

        console.log("Applying scrapbot_clean migration...");
        const sql2 = fs.readFileSync('../scrapbot/migrations/004_add_session_to_moderation.sql', 'utf8');
        await scrapbotDb.query(sql2);
        console.log("OK!");

        console.log("Applying Shield Guard settings migration...");
        const sql3 = fs.readFileSync('../scrapbot/migrations/005_shield_guard_settings.sql', 'utf8');
        await scrapbotDb.query(sql3);
        console.log("OK!");

        console.log("Applying Room Intel snapshots migration...");
        const sql4 = fs.readFileSync('../scrapbot/migrations/006_create_roomintel_snapshots.sql', 'utf8');
        await scrapbotDb.query(sql4);
        console.log("OK!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await db.end();
        // scrapbotDb doesn't have an export end(), we can process.exit
        process.exit(0);
    }
}
run();
