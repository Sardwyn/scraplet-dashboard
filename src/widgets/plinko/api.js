// src/widgets/plinko/api.js
import express from "express";
import { poll as pollRing, push as pushRing } from "../../runtime/ringBuffer.js";
import { getWidgetByPublicId } from "./service.js";
import { PLINKO_DEFAULTS } from "./defaults.js";
import { getPlinkoPublicState, setPlinkoPublicState, markPlinkoRoundFinished } from "./ingest.js";

const router = express.Router();

router.get("/api/obs/plinko/:publicId/poll", async (req, res) => {
  try {
    const { publicId } = req.params;
    const since = req.query.since ? parseInt(String(req.query.since), 10) : 0;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).json({ ok: false, error: "not_found" });

    const polled = await pollRing(publicId, since);
    const state = getPlinkoPublicState(publicId);

    return res.json({
      ok: true,
      seq: polled.seq,
      events: polled.items || [],
      state,
      config: w.config_json || PLINKO_DEFAULTS,
    });
  } catch (e) {
    console.error("[plinko] poll_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "poll_failed" });
  }
});

// Overlay tells server “I finished animating this round”
router.post("/api/obs/plinko/:publicId/finished", express.json({ limit: "64kb" }), async (req, res) => {
  try {
    const { publicId } = req.params;
    const w = await getWidgetByPublicId(publicId);
    if (!w) return res.status(404).json({ ok: false, error: "not_found" });

    const ingestKey = String(req.headers["x-ingest-key"] || "");
    if (!ingestKey || ingestKey !== w.ingest_key) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const roundId = String(req.body?.roundId || "");
    if (!roundId) return res.status(400).json({ ok: false, error: "bad_request" });

    await markPlinkoRoundFinished(publicId, roundId);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[plinko] finished_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "finished_failed" });
  }
});

// Ingest endpoint used by your server-side game logic (secured by x-ingest-key)
router.post("/api/obs/plinko/:publicId/ingest", express.json({ limit: "256kb" }), async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w) return res.status(404).json({ ok: false, error: "not_found" });

    const ingestKey = String(req.headers["x-ingest-key"] || "");
    if (!ingestKey || ingestKey !== w.ingest_key) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const max = w?.config_json?.bufferMax || PLINKO_DEFAULTS.bufferMax;
    const body = req.body || {};

    if (body.type === "STATE") {
      setPlinkoPublicState(publicId, body.publicView || null);
      return res.json({ ok: true });
    }

    if (body.type === "EVENT") {
      const ev = body.event || {};
      const lean = { ts: Date.now(), ...ev };
      await pushRing(publicId, lean, max);
      return res.json({ ok: true });
    }

    // convenience: allow raw event
    if (body && body.type && body.roundId) {
      const lean = { ts: Date.now(), ...body };
      await pushRing(publicId, lean, max);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "bad_request" });
  } catch (e) {
    console.error("[plinko] ingest_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "ingest_failed" });
  }
});

export default router;
