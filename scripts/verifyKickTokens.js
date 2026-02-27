#!/usr/bin/env node
// scripts/verifyKickTokens.js
// One-shot: prints all Kick user token rows from external_account_tokens
// Usage: node scripts/verifyKickTokens.js

import db from "../db.js";

async function main() {
    const { rows } = await db.query(`
    SELECT
      ea.id                AS external_account_id,
      ea.user_id           AS dashboard_user_id,
      ea.external_user_id  AS kick_broadcaster_id,
      ea.username           AS kick_username,
      eat.access_token IS NOT NULL AS has_access_token,
      eat.refresh_token IS NOT NULL AS has_refresh_token,
      eat.expires_at,
      eat.updated_at,
      eat.token_type,
      CASE
        WHEN eat.expires_at IS NULL THEN 'UNKNOWN'
        WHEN eat.expires_at > now() THEN 'VALID'
        ELSE 'EXPIRED'
      END AS status,
      CASE
        WHEN eat.expires_at IS NOT NULL THEN
          EXTRACT(EPOCH FROM (eat.expires_at - now()))::int
        ELSE NULL
      END AS seconds_remaining
    FROM external_accounts ea
    LEFT JOIN external_account_tokens eat ON eat.external_account_id = ea.id
    WHERE ea.platform = 'kick'
    ORDER BY ea.user_id
  `);

    if (!rows.length) {
        console.log("No Kick users found in external_accounts.");
        process.exit(0);
    }

    console.log(`\n=== Kick User Tokens (source: external_account_tokens) ===\n`);
    console.log(`Found ${rows.length} Kick user(s):\n`);

    for (const r of rows) {
        const hasToken = r.has_access_token ? "YES" : "NO";
        const hasRefresh = r.has_refresh_token ? "YES" : "NO";
        const secRemaining = r.seconds_remaining != null
            ? `${Math.floor(r.seconds_remaining / 60)}m ${r.seconds_remaining % 60}s`
            : "N/A";

        console.log(`  dashboard_user_id:    ${r.dashboard_user_id}`);
        console.log(`  external_account_id:  ${r.external_account_id}`);
        console.log(`  kick_broadcaster_id:  ${r.kick_broadcaster_id}`);
        console.log(`  kick_username:        ${r.kick_username}`);
        console.log(`  has_access_token:     ${hasToken}`);
        console.log(`  has_refresh_token:    ${hasRefresh}`);
        console.log(`  expires_at:           ${r.expires_at || "NULL"}`);
        console.log(`  updated_at:           ${r.updated_at || "NULL"}`);
        console.log(`  status:               ${r.status}`);
        console.log(`  time_remaining:       ${secRemaining}`);
        console.log(``);
    }

    await db.end();
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
