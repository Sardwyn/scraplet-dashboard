import './bootstrap/env.js';
import fs from 'fs';
import db from './db.js';
import scrapbotDb from './scrapbotDb.js';

async function run() {
    try {
        console.log("Applying creator_platform migration (007)...");
        const sql1 = fs.readFileSync('./migrations/007_create_stream_sessions.sql', 'utf8');
        await db.query(sql1).catch(e => console.warn("007 failed (likely permission):", e.message));
        console.log("007 Checked.");
    } catch (e) {
        console.error("Migration 007 skip: file not found or read error");
    }

    try {
        console.log("Applying scrapbot_clean migration (004)...");
        const sql2 = fs.readFileSync('../scrapbot/migrations/004_add_session_to_moderation.sql', 'utf8');
        await scrapbotDb.query(sql2).catch(e => console.warn("004 failed:", e.message));
        console.log("004 Checked.");

        console.log("Applying Shield Guard settings migration (005)...");
        const sql3 = fs.readFileSync('../scrapbot/migrations/005_shield_guard_settings.sql', 'utf8');
        await scrapbotDb.query(sql3).catch(e => console.warn("005 failed:", e.message));
        console.log("005 Checked.");

        console.log("Applying Room Intel snapshots migration (006)...");
        const sql4 = fs.readFileSync('../scrapbot/migrations/006_create_roomintel_snapshots.sql', 'utf8');
        await scrapbotDb.query(sql4);
        console.log("006 OK!");
    } catch (e) {
        console.error("Scrapbot migrations failed:", e.message);
    } finally {
        await db.end();
        process.exit(0);
    }
}
run();
