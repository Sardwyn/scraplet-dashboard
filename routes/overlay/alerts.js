// routes/overlay/alerts.js
import express from "express";
import db from "../../db.js";
import crypto from "crypto";

const router = express.Router();

function randomPublicId() {
  return crypto.randomBytes(12).toString("hex");
}

async function getActiveAlertsPublicOverlay(publicId) {
  const pid = String(publicId || "").trim();
  if (!pid) return null;

  const { rows } = await db.query(
    `
    SELECT owner_user_id, public_id
    FROM public.alert_public_overlays
    WHERE public_id = $1
      AND revoked_at IS NULL
    LIMIT 1
    `,
    [pid]
  );

  return rows[0] || null;
}

/**
 * Production-grade one-time drain-on-connect:
 * - drops ONLY stale queued items
 * - deliverable items only (available_at <= now())
 * - capped by maxRows
 *
 * This prevents “replay backlog” when OBS reconnects.
 */
async function drainQueuedAlertsOnConnect(
  ownerUserId,
  { maxRows = 150, maxAgeSeconds = 60 } = {}
) {
  const mr = Math.max(0, Math.floor(Number(maxRows) || 0));
  const mas = Math.max(0, Math.floor(Number(maxAgeSeconds) || 0));
  if (mr <= 0 || mas <= 0) return { dropped: 0, maxRows: mr, maxAgeSeconds: mas };

  const { rowCount } = await db.query(
    `
    WITH stale AS (
      SELECT id
      FROM public.alert_queue
      WHERE owner_user_id = $1
        AND status = 'queued'
        AND available_at <= NOW()
        AND created_at < (NOW() - ($2::int || ' seconds')::interval)
      ORDER BY created_at DESC
      LIMIT $3
    )
    UPDATE public.alert_queue q
    SET status = 'dropped',
        ended_at = NOW(),
        last_error = COALESCE(q.last_error, 'stale_dropped_on_connect')
    FROM stale
    WHERE q.id = stale.id
    `,
    [ownerUserId, mas, mr]
  );

  return { dropped: rowCount || 0, maxRows: mr, maxAgeSeconds: mas };
}

/**
 * Atomic dequeue: fetch next queued alert AND mark as sent.
 * Uses SKIP LOCKED so multiple SSE clients don't double-send.
 */
async function fetchAndMarkNextPlay(ownerUserId) {
  const { rows } = await db.query(
    `
    WITH next AS (
      SELECT id, resolved_json
      FROM public.alert_queue
      WHERE owner_user_id = $1
        AND status = 'queued'
        AND available_at <= NOW()
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.alert_queue q
    SET status = 'sent',
        sent_at = NOW()
    FROM next
    WHERE q.id = next.id
    RETURNING q.id, next.resolved_json
    `,
    [ownerUserId]
  );

  return rows[0] || null;
}

async function ackPlay({ ownerUserId, playId, status, error }) {
  const st = String(status || "").trim();
  if (!["started", "ended", "error"].includes(st)) return false;

  const vals = [ownerUserId, playId];
  const sets = [];

  if (st === "started") {
    sets.push(`status = 'started'`);
    sets.push(`started_at = COALESCE(started_at, NOW())`);
  }

  if (st === "ended") {
    sets.push(`status = 'ended'`);
    sets.push(`ended_at = COALESCE(ended_at, NOW())`);
  }

  if (st === "error") {
    sets.push(`status = 'error'`);
    vals.push(String(error || "renderer_error").slice(0, 500));
    sets.push(`last_error = $3`);
  }

  const { rowCount } = await db.query(
    `
    UPDATE public.alert_queue
    SET ${sets.join(", ")}
    WHERE owner_user_id = $1
      AND id = $2
    `,
    vals
  );

  return rowCount > 0;
}

// ─────────────────────────────────────────────
// Public overlay HTML
// GET /a/:publicId
// ─────────────────────────────────────────────
router.get("/a/:publicId", async (req, res) => {
  try {
    const publicId = String(req.params.publicId || "").trim();
    const overlay = await getActiveAlertsPublicOverlay(publicId);
    if (!overlay) return res.status(404).send("Not found");

    return res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Scraplet Alerts</title>
</head>
<body style="margin:0;overflow:hidden;background:transparent;">
  <div id="alerts-root"></div>



  <script>
    // Canonical config object the renderer reads
    window.__SCRAPLET_ALERTS__ = {
      publicId: ${JSON.stringify(publicId)},
      streamUrl: "/api/alerts/public/" + ${JSON.stringify(publicId)} + "/stream",
      ackUrl: "/api/alerts/public/" + ${JSON.stringify(publicId)} + "/ack"
    };

    // Backwards-compat alias (in case anything else reads it)
    window.SCRAPLET_ALERTS = window.__SCRAPLET_ALERTS__;
  </script>

  <script src="/profile-assets/overlays/alerts-renderer.js"></script>
</body>
</html>`);
  } catch (e) {
    console.error("[alerts overlay] failed:", e?.message || e);
    return res.status(500).send("Server error");
  }
});

// ─────────────────────────────────────────────
// SSE stream
// GET /api/alerts/public/:publicId/stream
// ─────────────────────────────────────────────
router.get("/api/alerts/public/:publicId/stream", async (req, res) => {
  const publicId = String(req.params.publicId || "").trim();
  const overlay = await getActiveAlertsPublicOverlay(publicId);
  if (!overlay) return res.status(404).end();

  const ownerUserId = Number(overlay.owner_user_id);

  const ua = req.headers["user-agent"] || null;
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;

  db.query(
    `
    INSERT INTO public.alert_overlay_connections
      (owner_user_id, overlay_token, connected_at, last_seen_at, ip, user_agent)
    VALUES ($1, $2, NOW(), NOW(), $3::inet, $4)
    `,
    [ownerUserId, `public:${publicId}`, ip, ua]
  ).catch(() => {});

  // ✅ One-time drain on connect (production-grade)
  const drainResult = await drainQueuedAlertsOnConnect(ownerUserId, {
    maxAgeSeconds: 60,
    maxRows: 150,
  });

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;

  const writeEvent = (name, obj) => {
    if (closed) return;
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  writeEvent("hello", {
    v: 1,
    public_id: publicId,
    drained: drainResult.dropped,
    drain_max_rows: drainResult.maxRows,
    drain_max_age_seconds: drainResult.maxAgeSeconds,
  });

  const pingTimer = setInterval(() => {
    writeEvent("ping", { t: Date.now() });
    db.query(
      `
      UPDATE public.alert_overlay_connections
      SET last_seen_at = now()
      WHERE owner_user_id = $1
      `,
      [ownerUserId]
    ).catch(() => {});
  }, 15000);

  const pollTimer = setInterval(async () => {
    try {
      const row = await fetchAndMarkNextPlay(ownerUserId);
      if (!row) return;

      db.query(
        `
        UPDATE public.alert_overlay_connections
        SET last_event_at = now()
        WHERE owner_user_id = $1
        `,
        [ownerUserId]
      ).catch(() => {});

      writeEvent("play", {
        v: 1,
        play_id: row.id,
        ts: new Date().toISOString(),
        payload: row.resolved_json,
      });
    } catch {
      writeEvent("error", { message: "queue_poll_failed" });
    }
  }, 750);

  req.on("close", () => {
    closed = true;
    clearInterval(pingTimer);
    clearInterval(pollTimer);
    try {
      res.end();
    } catch {}
  });
});

// ─────────────────────────────────────────────
// ACK
// POST /api/alerts/public/:publicId/ack
// ─────────────────────────────────────────────
router.post(
  "/api/alerts/public/:publicId/ack",
  express.json({ limit: "200kb" }),
  async (req, res) => {
    const publicId = String(req.params.publicId || "").trim();
    const overlay = await getActiveAlertsPublicOverlay(publicId);
    if (!overlay) return res.status(404).json({ ok: false });

    const ownerUserId = Number(overlay.owner_user_id);
    const playId = req.body?.play_id;
    const status = req.body?.status;
    const error = req.body?.error || null;

    if (!playId || !status) {
      return res.status(400).json({ ok: false, reason: "missing_fields" });
    }

    try {
      const updated = await ackPlay({ ownerUserId, playId, status, error });
      if (!updated) return res.status(404).json({ ok: false, reason: "not_found" });
      return res.json({ ok: true });
    } catch {
      return res.status(400).json({ ok: false, reason: "bad_request" });
    }
  }
);

export default router;
