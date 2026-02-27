#!/usr/bin/env node
// scripts/listKickSubscriptions.js
// One-shot: lists Kick EventSub subscriptions for a dashboard user.
// Usage: node scripts/listKickSubscriptions.js <dashboard_user_id> [broadcaster_user_id]

import KickClient from "../services/kick/kickClient.js";

const args = process.argv.slice(2);
const dashboardUserId = Number(args[0]);
const broadcasterUserId = args[1] ? Number(args[1]) : null;

if (!dashboardUserId) {
    console.error("Usage: node scripts/listKickSubscriptions.js <dashboard_user_id> [broadcaster_user_id]");
    process.exit(1);
}

async function main() {
    console.log(`Fetching subscriptions for dashboard_user_id=${dashboardUserId}...`);

    const kick = await KickClient.forUser(dashboardUserId);

    const qp = broadcasterUserId
        ? `?broadcaster_user_id=${broadcasterUserId}`
        : "";

    const result = await kick.api(`/public/v1/events/subscriptions${qp}`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    const data = Array.isArray(result?.data) ? result.data : [];

    console.log(`\n=== Kick EventSub Subscriptions ===\n`);
    console.log(`Total: ${data.length}`);
    if (broadcasterUserId) {
        console.log(`Filter: broadcaster_user_id=${broadcasterUserId}`);
    }
    console.log(``);

    if (!data.length) {
        console.log("No subscriptions found.");
        process.exit(0);
    }

    for (const sub of data) {
        console.log(`  id:                   ${sub.id}`);
        console.log(`  event:                ${sub.event}`);
        console.log(`  version:              ${sub.version}`);
        console.log(`  broadcaster_user_id:  ${sub.broadcaster_user_id}`);
        console.log(`  method:               ${sub.method}`);
        console.log(`  created_at:           ${sub.created_at}`);
        console.log(``);
    }

    // Import db to close pool
    const db = (await import("../db.js")).default;
    await db.end();
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
