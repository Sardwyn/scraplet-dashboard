// routes/widgets-loader.js
// Public widget loader + SSE stream (OBS-safe, schema-correct)

import express from "express";
import db from "../db.js";
import { verifyWidgetToken } from "../utils/widgetTokens.js";

const router = express.Router();

/**
 * Best-effort: load widget config from obs_widgets if present.
 * (Some widgets are DB-backed, others aren't — so this must be optional.)
 */
async function loadWidgetConfig(userId, widgetId) {
  try {
    const r = await db.query(
      `SELECT config_json
       FROM obs_widgets
       WHERE owner_user_id = $1 AND type = $2
       ORDER BY id DESC
       LIMIT 1`,
      [userId, widgetId]
    );
    return r.rows?.[0]?.config_json || {};
  } catch (e) {
    return {};
  }
}

/**
 * Public OBS loader: /w/:token
 * Renders /views/widgets/:widgetId.ejs
 */
router.get("/w/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const payload = verifyWidgetToken(token);

    if (!payload) {
      console.warn("[widget] invalid token (page)");
      return res.status(401).send("Invalid or expired widget link.");
    }

    const userId = String(payload.sub);
    const widgetId = String(payload.wid);

    console.log(`🎛️ Widget '${widgetId}' loaded for user ${userId}`);

    const cfg = await loadWidgetConfig(userId, widgetId);

    return res.render(`widgets/${widgetId}`, {
      token,
      userId,
      widgetId,
      config: cfg || {},
    });
  } catch (err) {
    console.error("[widget] load failed:", err);
    return res.status(401).send("Invalid or expired widget link.");
  }
});

/**
 * SSE stream: /w/:token/stream
 * Streams events for this user only.
 */
router.get("/w/:token/stream", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const payload = verifyWidgetToken(token);

    if (!payload) {
      console.warn("[widget] invalid token (stream)");
      return res.status(401).send("Invalid or expired widget token.");
    }

    const userId = String(payload.sub);
    const widgetId = String(payload.wid);

    // SSE headers (important for nginx + OBS)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send("hello", { ok: true, userId, widgetId, ts: Date.now() });

    // Keepalive so proxies never stall
    const keepalive = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
      } catch {}
    }, 15000);

    let closed = false;

    // Track last timestamp seen (TIMESTAMPTZ, not ms)
    let lastTs = new Date(Date.now() - 2000);

    /**
     * Replay small recent window so widget loads warm
     */
    try {
      const recent = await db.query(
        `SELECT id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload
         FROM public.events
         WHERE user_id = $1
           AND kind != 'chat.message.sent'
         ORDER BY ts DESC
         LIMIT 50`,
        [userId]
      );

      for (const row of (recent.rows || []).reverse()) {
        send(row.kind, row);
        if (row.ts && row.ts > lastTs) lastTs = row.ts;
      }
    } catch (e) {
      console.warn("[widget] replay failed:", e?.message || e);
    }

    // Get the user's chat overlay public_id from obs_widgets for ring buffer polling
    let chatOverlayPublicId = null;
    let lastRingSeq = 0;
    try {
      const obsRow = await db.query(
        `SELECT public_id FROM obs_widgets WHERE owner_user_id = $1 AND type = 'chat_overlay' LIMIT 1`,
        [userId]
      );
      if (obsRow.rows.length) {
        chatOverlayPublicId = obsRow.rows[0].public_id;
        // Start from current seq so we only deliver NEW messages (not history)
        const seqRow = await db.query(
          `SELECT last_seq FROM widget_event_seq WHERE public_id = $1`,
          [chatOverlayPublicId]
        );
        if (seqRow.rows.length) lastRingSeq = Number(seqRow.rows[0].last_seq);
      }
    } catch (e) {
      console.warn("[widget] ring buffer init failed:", e?.message || e);
    }

    /**
     * Poll loop (schema-correct, indexed, fast)
     */
    const interval = setInterval(async () => {
      if (closed) return;

      try {
        // Poll public.events for non-chat events (subs, follows, etc.)
        const r = await db.query(
          `SELECT id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload
           FROM public.events
           WHERE user_id = $1
             AND ts > $2
             AND kind != 'chat.message.sent'
           ORDER BY ts ASC
           LIMIT 200`,
          [userId, lastTs]
        );

        for (const row of r.rows || []) {
          send(row.kind, row);
          if (row.ts && row.ts > lastTs) lastTs = row.ts;
        }

        // Poll widget_event_log (ring buffer) for chat messages
        if (chatOverlayPublicId) {
          const ring = await db.query(
            `SELECT seq, payload FROM widget_event_log
             WHERE public_id = $1 AND seq > $2
             ORDER BY seq ASC LIMIT 100`,
            [chatOverlayPublicId, lastRingSeq]
          );
          for (const row of ring.rows || []) {
            const msg = row.payload?.msg || row.payload || {};
            send('chat.message.sent', {
              kind: 'chat.message.sent',
              source: msg.platform || 'kick',
              actor_username: msg.username || msg.display_name,
              payload: {
                platform: msg.platform || 'kick',
                message: {
                  text: msg.text || '',
                  raw: {
                    sender: {
                      username: msg.username || msg.display_name,
                      profile_picture: msg.avatar_url || '',
                      identity: { username_color: '' },
                    },
                    content: msg.text || '',
                    emotes: msg.emotes || [],
                  },
                  sender_username: msg.username || msg.display_name,
                },
              },
            });
            if (row.seq > lastRingSeq) lastRingSeq = row.seq;
          }
        }
      } catch (e) {
        console.warn("[widget] poll error:", e?.message || e);
      }
    }, 250);

    req.on("close", () => {
      closed = true;
      clearInterval(interval);
      clearInterval(keepalive);
      try { res.end(); } catch {}
    });
  } catch (err) {
    console.error("[widget] stream failed:", err);
    return res.status(500).end();
  }
});

export default router;
