// src/widgets/blackjack/api.js
import express from "express";
import { poll as pollRing, push as pushRing } from "../../runtime/ringBuffer.js";
import { getWidgetByPublicId } from "./service.js";
import { BLACKJACK_DEFAULTS } from "./defaults.js";
import { getBlackjackPublicState, setBlackjackPublicState } from "./ingest.js";

import { startDevRound, actDevRound } from "./server/session-manager.js";

const router = express.Router();

/**
 * OBS overlay polls for BJ events + latest state snapshot.
 * Query: ?since=<seq>
 */
router.get("/api/obs/blackjack/:publicId/poll", async (req, res) => {
  try {
    const { publicId } = req.params;
    const since = req.query.since ? parseInt(String(req.query.since), 10) : 0;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const polled = await pollRing(publicId, since);
    const state = getBlackjackPublicState(publicId);

    return res.json({
      ok: true,
      seq: polled.seq,
      events: polled.items || [],
      state,
      config: w.config_json || BLACKJACK_DEFAULTS,
    });
  } catch (e) {
    console.error("[blackjack] poll_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "poll_failed" });
  }
});

/**
 * Ingest endpoint (secured by x-ingest-key)
 * You can post:
 *  - { type: "STATE", publicView: {...} }
 *  - { type: "EVENT", event: {...} }
 */
router.post(
  "/api/obs/blackjack/:publicId/ingest",
  express.json({ limit: "256kb" }),
  async (req, res) => {
    try {
      const { publicId } = req.params;

      const w = await getWidgetByPublicId(publicId);
      if (!w) return res.status(404).json({ ok: false, error: "not_found" });

      const ingestKey = String(req.headers["x-ingest-key"] || "");
      if (!ingestKey || ingestKey !== w.ingest_key) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      const max = w?.config_json?.bufferMax || BLACKJACK_DEFAULTS.bufferMax;
      const body = req.body || {};

      if (body.type === "STATE") {
        setBlackjackPublicState(publicId, body.publicView || null);
        return res.json({ ok: true });
      }

      if (body.type === "EVENT") {
        const ev = body.event || {};
        const lean = { ts: Date.now(), ...ev };
        await pushRing(publicId, lean, max);
        return res.json({ ok: true });
      }

      // convenience: allow posting a raw event without wrapper
      if (body && body.type && body.roundId) {
        const lean = { ts: Date.now(), ...body };
        await pushRing(publicId, lean, max);
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "bad_request" });
    } catch (e) {
      console.error("[blackjack] ingest_failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "ingest_failed" });
    }
  }
);

// DEV: start a round
router.post("/api/obs/blackjack/:publicId/dev/start", express.json(), async (req, res) => {
  try {
    const { publicId } = req.params;
    const w = await getWidgetByPublicId(publicId);
    if (!w) return res.status(404).json({ ok: false });

    const ingestKey = String(req.headers["x-ingest-key"] || "");
    if (ingestKey !== w.ingest_key) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const betAmount = Number(req.body?.betAmount || 100);

    const view = await startDevRound({
      publicId,
      ownerUserId: w.owner_user_id,
      betAmount,
    });

    return res.json({ ok: true, state: view });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DEV: act (HIT / STAND / DOUBLE)
router.post("/api/obs/blackjack/:publicId/dev/act", express.json(), async (req, res) => {
  try {
    const { publicId } = req.params;
    const w = await getWidgetByPublicId(publicId);
    if (!w) return res.status(404).json({ ok: false });

    const ingestKey = String(req.headers["x-ingest-key"] || "");
    if (ingestKey !== w.ingest_key) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const action = String(req.body?.action || "").toUpperCase();

    const view = await actDevRound({
      publicId,
      ownerUserId: w.owner_user_id,
      action,
    });

    return res.json({ ok: true, state: view });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
