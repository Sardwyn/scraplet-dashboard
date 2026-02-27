import fetch from "node-fetch";
import db from "../db.js";

const ENABLED = String(process.env.CHAT_OUTBOX_ENABLED || "true").toLowerCase() === "true";
const POLL_MS = Number(process.env.CHAT_OUTBOX_POLL_MS || 1000);
const SCRAPBOT_INGEST_URL = process.env.SCRAPBOT_INGEST_URL || "http://127.0.0.1:3030/api/inbound/kick";
const SCRAPBOT_SHARED_SECRET = process.env.SCRAPBOT_SHARED_SECRET;

/**
 * Calculates next attempt time based on current attempts.
 */
function getBackoffSeconds(attempts) {
    if (attempts <= 3) return 2;
    if (attempts <= 6) return 10;
    if (attempts <= 10) return 60;
    return 300; // 5 minutes
}

async function processBatch() {
    // Safe Claim Strategy:
    // 1. UPDATE up to 25 pending rows that are ready (next_attempt_at <= now).
    // 2. Set next_attempt_at to Future (e.g. +5 mins) to "claim" them.
    // 3. RETURNING * gives us the rows to process.
    // If we crash, they become available again after 5 mins.

    const { rows } = await db.query(`
    UPDATE public.chat_outbox
    SET next_attempt_at = now() + interval '5 minutes',
        attempts = attempts + 1
    WHERE id IN (
      SELECT id
      FROM public.chat_outbox
      WHERE delivered_at IS NULL
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, event_id, payload, attempts
  `);

    if (!rows.length) return;

    const results = await Promise.allSettled(rows.map(async (row) => {
        try {
            // Current attempts count has already been incremented by the claim UPDATE.
            // So if this fails, we want to schedule retry based on `attempts`.

            const payloadToSend = { ...row.payload };
            if (payloadToSend.chat_v1 && typeof payloadToSend.chat_v1 === 'object') {
                payloadToSend.chat_v1.event_id = row.event_id;
            }

            const resp = await fetch(SCRAPBOT_INGEST_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(SCRAPBOT_SHARED_SECRET ? { "x-scrapbot-secret": SCRAPBOT_SHARED_SECRET } : {})
                },
                body: JSON.stringify(payloadToSend)
            });

            if (!resp.ok) {
                const text = await resp.text().catch(() => "");
                throw new Error(`HTTP ${resp.status}: ${text}`);
            }

            return { success: true, id: row.id };
        } catch (err) {
            return { success: false, id: row.id, attempts: row.attempts, error: err.message };
        }
    }));

    // Process results
    for (const res of results) {
        if (res.status === "fulfilled" && res.value.success) {
            // Success: Mark delivered
            await db.query(`
            UPDATE public.chat_outbox
            SET delivered_at = now(), last_error = NULL
            WHERE id = $1
        `, [res.value.id]);
        } else {
            // Failure: Schedule next real attempt based on backoff
            // The CLAIM update pushed it 5 mins out. We now pull it back to the correct backoff time.
            // attempts was already incremented.
            const r = res.status === "fulfilled" ? res.value : { id: null, attempts: 0, error: res.reason };

            if (r.id) {
                const backoff = getBackoffSeconds(r.attempts);
                await db.query(`
              UPDATE public.chat_outbox
              SET last_error = $2,
                  next_attempt_at = now() + ($3 * interval '1 second')
              WHERE id = $1
          `, [r.id, r.error, backoff]);
            }
        }
    }
}

async function loop() {
    try {
        await processBatch();
    } catch (err) {
        console.error("[chatOutboxDeliver] Worker loop error:", err);
    }
    setTimeout(loop, POLL_MS);
}

export function startChatOutboxWorker() {
    if (!ENABLED) {
        console.log("[chatOutbox] Worker DISABLED via env");
        return;
    }
    console.log(`[chatOutbox] Worker starting (poll=${POLL_MS}ms)`);
    loop();
}
