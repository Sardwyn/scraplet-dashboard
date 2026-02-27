// src/widgets/roulette/api.js
import express from "express";
import { poll as pollRing, push as pushRing } from "../../runtime/ringBuffer.js";
import { getWidgetByPublicId, getRoulettePublicStateFromDb } from "./service.js";
import { ROULETTE_DEFAULTS } from "./defaults.js";

const router = express.Router();

router.get("/api/obs/roulette/:publicId/poll", async (req, res) => {
  try {
    const { publicId } = req.params;
    const since = req.query.since ? parseInt(String(req.query.since), 10) : 0;

    const w = await getWidgetByPublicId(publicId);
    if (!w || !w.is_enabled) return res.status(404).json({ ok: false, error: "not_found" });

    const polled = await pollRing(publicId, since);

    // DB-truth state (authoritative)
    const state = await getRoulettePublicStateFromDb(publicId);

    return res.json({
      ok: true,
      seq: polled.seq,
      events: polled.items || [],
      state,
      config: w.config_json || ROULETTE_DEFAULTS,
    });
  } catch (e) {
    console.error("[roulette] poll_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "poll_failed" });
  }
});

router.post("/api/obs/roulette/:publicId/ingest", express.json({ limit: "256kb" }), async (req, res) => {
  try {
    const { publicId } = req.params;

    const w = await getWidgetByPublicId(publicId);
    if (!w) return res.status(404).json({ ok: false, error: "not_found" });

    const ingestKey = String(req.headers["x-ingest-key"] || "");
    if (!ingestKey || ingestKey !== w.ingest_key) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const max = w?.config_json?.bufferMax || ROULETTE_DEFAULTS.bufferMax;
    const body = req.body || {};

    // DB is truth now; we ignore STATE payloads but keep endpoint compatibility.
    if (body.type === "STATE") {
      return res.json({ ok: true, ignored: "state_is_db_truth" });
    }

    if (body.type === "EVENT") {
      const ev = body.event || {};
      await pushRing(publicId, { ts: Date.now(), ...ev }, max);
      return res.json({ ok: true });
    }

    if (body && body.type && body.roundId) {
      await pushRing(publicId, { ts: Date.now(), ...body }, max);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "bad_request" });
  } catch (e) {
    console.error("[roulette] ingest_failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "ingest_failed" });
  }
});

export default router;
