// services/kickTokenRefreshWorker.js
// Background worker: proactively refreshes expiring Kick user tokens.
// SINGLE AUTHORITY: queries external_account_tokens joined to external_accounts.
// kick_tokens_user is DEPRECATED and no longer queried.

import db from "../db.js";
import { getKickUserAccessToken } from "./kickUserTokens.js";

const INTERVAL_MS = Number(process.env.KICK_TOKEN_REFRESH_INTERVAL_MS || 300_000); // 5 min
const LOOKAHEAD_MIN = 10; // refresh tokens expiring within 10 minutes

let running = false;

async function tick() {
    if (running) return;
    running = true;

    const label = "[kickTokenRefresh]";
    let refreshed = 0;
    let failed = 0;

    try {
        // Single authority: external_account_tokens joined to external_accounts for platform='kick'
        const { rows } = await db.query(`
      SELECT ea.user_id   AS dashboard_user_id,
             ea.id         AS external_account_id,
             eat.expires_at
        FROM external_accounts ea
        JOIN external_account_tokens eat ON eat.external_account_id = ea.id
       WHERE ea.platform = 'kick'
         AND eat.refresh_token IS NOT NULL
         AND (eat.expires_at IS NULL OR eat.expires_at < now() + interval '${LOOKAHEAD_MIN} minutes')
       ORDER BY eat.expires_at ASC NULLS FIRST
    `);

        if (!rows.length) return;

        console.log(`${label} ${rows.length} candidate(s) need refresh`);

        for (const row of rows) {
            try {
                await getKickUserAccessToken(row.dashboard_user_id);
                refreshed++;
                console.log(`${label} refreshed`, {
                    dashboard_user_id: row.dashboard_user_id,
                    external_account_id: row.external_account_id,
                });
            } catch (err) {
                failed++;
                console.warn(`${label} failed`, {
                    dashboard_user_id: row.dashboard_user_id,
                    external_account_id: row.external_account_id,
                    error: err?.message || String(err),
                });
            }
        }

        console.log(`${label} done`, { candidates: rows.length, refreshed, failed });
    } catch (err) {
        console.error(`${label} tick error`, err?.message || err);
    } finally {
        running = false;
    }
}

export function startKickTokenRefreshWorker() {
    console.log("[kickTokenRefresh] starting (single authority: external_account_tokens)", {
        intervalMs: INTERVAL_MS,
        lookaheadMin: LOOKAHEAD_MIN,
    });

    // First tick after short delay to let server fully boot
    setTimeout(() => tick().catch(() => { }), 5_000);
    setInterval(() => tick().catch(() => { }), INTERVAL_MS);
}
