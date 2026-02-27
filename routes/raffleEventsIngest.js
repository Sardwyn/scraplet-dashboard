// /routes/raffleEventsIngest.js
//
// Receives raffle events (POST) and inserts into public.events
// so /w/:token/stream can relay them to OBS widgets.
//
// Also provides a Scrapbot-only pull endpoint (GET) so Scrapbot can
// react to raffle events (e.g. congratulate winner + auto reset).

import express from "express";
import crypto from "crypto";
import { query } from "../db.js"; // ROOT db helper

const router = express.Router();

function makeId() {
  return "ev_" + Date.now().toString(36) + "_" + crypto.randomBytes(6).toString("hex");
}

function toBigintOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTextOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function isScrapbotAuthorized(req) {
  const token = String(req.get("X-Scrapbot-Token") || "").trim();
  const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || "").trim();
  if (!expected) return false; // fail closed if not configured
  return token && token === expected;
}

/**
 * POST /dashboard/api/raffle/events
 * Body:
 *  {
 *    user_id: number,
 *    source: string,
 *    channel_slug: string,
 *    kind: string,
 *    payload: any,
 *    actor_id?: string,
 *    actor_username?: string,
 *    channel_id?: number,
 *    chatroom_id?: number
 *  }
 */
router.post("/events", express.json({ limit: "256kb" }), async (req, res) => {
  try {
    const {
      user_id,
      source,
      channel_slug,
      kind,
      payload,
      actor_id,
      actor_username,
      channel_id,
      chatroom_id,
    } = req.body || {};

    const uid = Number(user_id);
    if (!Number.isFinite(uid)) {
      return res.status(400).json({ ok: false, error: "user_id required (number)" });
    }
    if (!source || !channel_slug || !kind) {
      return res.status(400).json({ ok: false, error: "source, channel_slug, kind required" });
    }
    if (payload === undefined) {
      return res.status(400).json({ ok: false, error: "payload required" });
    }

    await query(
      `
      INSERT INTO public.events
        (id, v, source, kind, ts, channel_slug, chatroom_id, channel_id,
         actor_id, actor_username, payload, user_id)
      VALUES
        ($1, 1, $2, $3, now(), $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      [
        makeId(),
        String(source),
        String(kind),
        String(channel_slug),
        toBigintOrNull(chatroom_id),
        toBigintOrNull(channel_id),
        toTextOrNull(actor_id),
        toTextOrNull(actor_username),
        JSON.stringify(payload),
        uid,
      ]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("[raffleEventsIngest] POST /events error", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * GET /dashboard/api/raffle/pull?owner_user_id=4&since=2026-01-03T08:00:00.000Z&limit=50&kind=raffle.winner
 *
 * Scrapbot-only pull endpoint to fetch recent raffle events for an owner.
 * Auth via X-Scrapbot-Token (matches SCRAPBOT_EVENT_TOKEN).
 */
router.get("/pull", async (req, res) => {
  try {
    if (!isScrapbotAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const ownerUserId = Number(req.query.owner_user_id);
    if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ ok: false, error: "owner_user_id required (number)" });
    }

    const kind = String(req.query.kind || "raffle.winner").trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));

    // Default: last 5 minutes
    const sinceRaw = req.query.since ? String(req.query.since) : null;
    let since = null;
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!isNaN(d.getTime())) since = d;
    }
    if (!since) since = new Date(Date.now() - 5 * 60 * 1000);

    const { rows } = await query(
      `
      SELECT id, kind, source, ts, channel_slug, actor_id, actor_username, payload
      FROM public.events
      WHERE user_id = $1
        AND kind = $2
        AND ts > $3
      ORDER BY ts ASC
      LIMIT $4
      `,
      [ownerUserId, kind, since.toISOString(), limit]
    );

    return res.json({
      ok: true,
      owner_user_id: ownerUserId,
      kind,
      since: since.toISOString(),
      count: rows.length,
      events: rows,
    });
  } catch (e) {
    console.error("[raffleEventsIngest] GET /pull error", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

export default router;
