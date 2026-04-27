// /root/scrapletdashboard/src/tts/routes.js
import express from "express";
import db from "../../db.js";
import { enqueueTTSJob } from "./enqueue.js";

const router = express.Router();

/**
 * Optional overlay key gate
 */
function requireOptionalKey(req, res) {
  const configured = (process.env.TTS_OVERLAY_KEY || "").trim();
  if (!configured) return true;

  const provided = (req.query.key || "").toString().trim();
  if (provided && provided === configured) return true;

  res.status(403).json({ error: "forbidden" });
  return false;
}

function noStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

/**
 * POST /api/tts/free
 *
 * Enqueue FREE TTS into tts_jobs (priority 0).
 *
 * Body:
 * {
 *   "scrapletUserId": 4,
 *   "platform": "kick",
 *   "channelSlug": "scraplet",
 *   "text": "Hello chat",
 *   "voiceId": "en_GB-alba-medium"
 * }
 */
router.post("/free", express.json({ limit: "32kb" }), async (req, res) => {
  try {
    const scrapletUserId = Number(req.body?.scrapletUserId);
    const platform = (req.body?.platform || "kick").toString().trim();
    const channelSlug = (req.body?.channelSlug || "").toString().trim();
    const text = (req.body?.text || "").toString();
    const voiceId = (req.body?.voiceId || "en_GB-alba-medium").toString().trim();
    const requestedByUsername = (req.body?.requestedByUsername || "").toString().trim() || null;

    const job = await enqueueTTSJob({
      scrapletUserId,
      platform,
      channelSlug,
      text,
      voiceId,
      source: "free_tts",
      priority: 0,
      entitlementId: null,
      senderUsername: requestedByUsername,
    });

    noStore(res);
    return res.json({ ok: true, ttsJobId: job.id });
  } catch (err) {
    console.error("[tts] free enqueue error:", err);
    const msg = err?.message || String(err);
    const status = /required|too long/i.test(msg) ? 400 : 500;
    return res.status(status).json({ error: msg });
  }
});

/**
 * POST /api/tts/claim?platform=kick&channel=scraplet&consumer=overlay:tts
 *
 * Atomically claims the NEXT playable TTS job.
 * IMPORTANT: Only WAV jobs are eligible.
 */
router.post("/claim", async (req, res) => {
  if (!requireOptionalKey(req, res)) return;

  const platform = (req.query.platform || "kick").toString().trim();
  const channel  = (req.query.channel || "").toString().trim();
  const consumer = (req.query.consumer || "overlay:tts").toString().trim();

  if (!channel) {
    return res.status(400).json({ error: "missing channel" });
  }

  try {
    const sql = `
      UPDATE tts_jobs
      SET
        played_at = NOW(),
        played_by = $3
      WHERE id = (
        SELECT id
        FROM tts_jobs
        WHERE
          platform = $1
          AND channel_slug = $2
          AND status = 'done'
          AND played_at IS NULL
          AND audio_url IS NOT NULL
          AND (
            audio_mime = 'audio/wav'
            OR audio_url LIKE '%.wav'
          )
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        created_at,
        status,
        platform,
        channel_slug,
        source,
        engine,
        voice_id,
        text_sanitized,
        char_count,
        audio_url,
        audio_mime,
        audio_hash,
        played_at,
        played_by
    `;

    const result = await db.query(sql, [platform, channel, consumer]);

    if (!result.rows.length) {
      return res.status(204).end();
    }

    noStore(res);
    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error("[tts] claim error:", err);
    return res.status(500).json({ error: "tts_claim_failed" });
  }
});

/**
 * GET /api/tts/stream?platform=kick&channel=scraplet
 *
 * Server-Sent Events stream.
 * Emits rows from tts_channel_events.
 */
router.get("/stream", async (req, res) => {
  if (!requireOptionalKey(req, res)) return;

  const platform = (req.query.platform || "kick").toString().trim();
  const channel  = (req.query.channel || "").toString().trim();

  if (!channel) {
    return res.status(400).send("Missing channel");
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.flushHeaders?.();

  let closed = false;
  req.on("close", () => { closed = true; });

  const keepalive = setInterval(() => {
    if (!closed) {
      res.write(`: hb ${Date.now()}\n\n`);
    }
  }, 15000);

  let lastId = Number(req.headers["last-event-id"] || 0) || 0;

  async function poll() {
    if (closed) return;

    try {
      const { rows } = await db.query(
        `
        SELECT id, event_type, payload
        FROM tts_channel_events
        WHERE platform = $1
          AND channel_slug = $2
          AND id > $3
        ORDER BY id ASC
        LIMIT 50
        `,
        [platform, channel, lastId]
      );

      for (const ev of rows) {
        lastId = Number(ev.id);
        res.write(`id: ${ev.id}\n`);
        res.write(`event: ${ev.event_type || "tts_ready"}\n`);
        res.write(`data: ${JSON.stringify(ev.payload || {})}\n\n`);
      }
    } catch (err) {
      console.warn("[tts] sse poll error:", err?.message || err);
    }

    setTimeout(poll, 1000);
  }

  poll();

  req.on("close", () => {
    clearInterval(keepalive);
  });
});

/**
 * GET /overlays/tts?platform=kick&channel=scraplet
 *
 * OBS browser source HTML.
 */
router.get("/overlays/tts", (req, res) => {
  const platform = (req.query.platform || "kick").toString().trim();
  const channel  = (req.query.channel || "").toString().trim();
  const consumer = (req.query.consumer || "overlay:tts").toString().trim();
  const key      = (req.query.key || "").toString().trim();

  const configured = (process.env.TTS_OVERLAY_KEY || "").trim();
  if (configured && key !== configured) {
    return res.status(403).send("Forbidden");
  }

  if (!channel) {
    return res.status(400).send("Missing channel");
  }

  noStore(res);

  return res.render("overlays/tts-player", {
    platform,
    channel,
    consumer,
    key: key || null,
  });
});

export default router;
