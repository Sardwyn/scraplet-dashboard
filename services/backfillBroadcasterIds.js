// services/backfillBroadcasterIds.js
// Background worker: resolves missing broadcaster_user_id for Kick channels.
//
// Mirrors the identity+channel resolution logic from routes/kickAuth.js callback:
// 1. GET KICK_API_USERS_URL → data[0].user_id
// 2. GET KICK_API_CHANNELS_URL → data[0].broadcaster_user_id, data[0].slug
// 3. Upsert external_accounts.external_user_id
// 4. Upsert channels.external_user_id

import fetch from "node-fetch";
import db from "../db.js";
import { getKickUserAccessToken } from "./kickUserTokens.js";

const KICK_API_USERS_URL =
    process.env.KICK_API_USERS_URL || "https://api.kick.com/public/v1/users";
const KICK_API_CHANNELS_URL =
    process.env.KICK_API_CHANNELS_URL || "https://api.kick.com/public/v1/channels";

// Scrapbot internal endpoint for instant propagation (optional)
const SCRAPBOT_INTERNAL_URL =
    process.env.SCRAPBOT_INTERNAL_URL || "";
const SCRAPBOT_SHARED_SECRET = process.env.SCRAPBOT_SHARED_SECRET || "";

const INTERVAL_MS = Number(process.env.BROADCASTER_BACKFILL_INTERVAL_MS || 1_800_000); // 30 min

let running = false;

/**
 * Resolve broadcaster_user_id for a single user.
 * Mirrors routes/kickAuth.js steps 3-4.
 */
async function resolveKickIdentity(accessToken) {
    // Step 1: GET /public/v1/users → identity.user_id
    let kickUserId = null;
    try {
        const meResp = await fetch(KICK_API_USERS_URL, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (meResp.ok) {
            const json = await meResp.json();
            const identity = Array.isArray(json?.data) ? json.data[0] : null;
            if (identity?.user_id) kickUserId = String(identity.user_id);
        }
    } catch (err) {
        console.warn("[backfillBroadcaster] identity fetch error:", err?.message || err);
    }

    if (!kickUserId) return null;

    // Step 2: GET /public/v1/channels → channel.broadcaster_user_id, channel.slug
    let broadcasterUserId = kickUserId; // fallback: same as user_id
    let channelSlug = null;
    try {
        const chResp = await fetch(KICK_API_CHANNELS_URL, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (chResp.ok) {
            const chJson = await chResp.json();
            const ch = Array.isArray(chJson?.data) ? chJson.data[0] : null;
            if (ch) {
                broadcasterUserId = String(ch.broadcaster_user_id || kickUserId);
                channelSlug = (ch.slug || "").toLowerCase() || null;
            }
        }
    } catch (err) {
        console.warn("[backfillBroadcaster] channel fetch error:", err?.message || err);
    }

    return { kickUserId, broadcasterUserId, channelSlug };
}

/**
 * Push resolved broadcaster_user_id to Scrapbot if configured.
 */
async function pushToScrapbot(channelSlug, broadcasterUserId) {
    if (!SCRAPBOT_INTERNAL_URL || !SCRAPBOT_SHARED_SECRET) {
        console.log("[backfillBroadcaster] scrapbot push skipped (SCRAPBOT_INTERNAL_URL or SCRAPBOT_SHARED_SECRET not set)", { channelSlug });
        return;
    }
    try {
        const resp = await fetch(`${SCRAPBOT_INTERNAL_URL}/set-broadcaster-id`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-secret": SCRAPBOT_SHARED_SECRET,
            },
            body: JSON.stringify({ channelSlug, broadcasterUserId: Number(broadcasterUserId) }),
        });
        const data = await resp.json().catch(() => ({}));
        console.log("[backfillBroadcaster] scrapbot push", {
            channelSlug, ok: data?.ok, updated: data?.updated,
        });
    } catch (err) {
        console.warn("[backfillBroadcaster] scrapbot push failed:", channelSlug, err?.message || err);
    }
}

async function tick() {
    if (running) return;
    running = true;

    const label = "[backfillBroadcaster]";
    let fixed = 0;
    let failed = 0;

    try {
        // Find Kick channels missing external_user_id that have a linked dashboard user
        const { rows } = await db.query(`
      SELECT c.channel_slug, c.account_id, ea.user_id AS dashboard_user_id
      FROM channels c
      JOIN external_accounts ea ON ea.id = c.account_id
      WHERE c.platform = 'kick'
        AND (c.external_user_id IS NULL OR c.external_user_id = '')
        AND ea.user_id IS NOT NULL
      ORDER BY c.channel_slug ASC
    `);

        if (!rows.length) return;

        console.log(`${label} ${rows.length} channel(s) missing external_user_id`);

        for (const row of rows) {
            try {
                const accessToken = await getKickUserAccessToken(row.dashboard_user_id);
                if (!accessToken) {
                    console.warn(`${label} no valid token for user ${row.dashboard_user_id} (${row.channel_slug})`);
                    failed++;
                    continue;
                }

                const resolved = await resolveKickIdentity(accessToken);
                if (!resolved?.broadcasterUserId) {
                    console.warn(`${label} could not resolve broadcaster for ${row.channel_slug}`);
                    failed++;
                    continue;
                }

                // Mirror kickAuth.js step 5: update external_accounts.external_user_id
                if (row.account_id) {
                    await db.query(
                        `UPDATE external_accounts SET external_user_id = $2, updated_at = now()
             WHERE id = $1 AND (external_user_id IS NULL OR external_user_id != $2)`,
                        [row.account_id, resolved.broadcasterUserId]
                    );
                }

                // Mirror kickAuth.js step 6: update channels.external_user_id
                await db.query(
                    `UPDATE channels SET external_user_id = $2, updated_at = now()
           WHERE platform = 'kick' AND channel_slug = $1
             AND (external_user_id IS NULL OR external_user_id = '')`,
                    [row.channel_slug, resolved.broadcasterUserId]
                );

                // Instant propagation to Scrapbot
                await pushToScrapbot(row.channel_slug, resolved.broadcasterUserId);

                fixed++;
                console.log(`${label} fixed ${row.channel_slug} → broadcaster_user_id=${resolved.broadcasterUserId}`);
            } catch (err) {
                failed++;
                console.warn(`${label} error for ${row.channel_slug}:`, err?.message || err);
            }
        }

        console.log(`${label} done`, { candidates: rows.length, fixed, failed });
    } catch (err) {
        console.error(`${label} tick error`, err?.message || err);
    } finally {
        running = false;
    }
}

export function startBroadcasterBackfillWorker() {
    console.log("[backfillBroadcaster] starting", { intervalMs: INTERVAL_MS });

    // First tick after short delay
    setTimeout(() => tick().catch(() => { }), 10_000);
    setInterval(() => tick().catch(() => { }), INTERVAL_MS);
}
