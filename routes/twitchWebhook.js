// routes/twitchWebhook.js
//
// TWITCH TRANSPORT (HTTP) — STUB
// Responsibilities:
// - receive HTTP requests (Twitch webhook/eventsub + internal ingest)
// - do transport-only work (body parsing, minimal request shaping)
// - delegate ALL business logic to the canonical ingest brain at: src/ingest/twitch.js
//
// Architectural rules:
// - Do not mutate widget/overlay state here.
// - Do not call casino engines or OBS bridge endpoints here.
// - Do not write to ring buffers here.
//

import express from "express";
import { twitchWebhookHandler, twitchIngestHandler } from "../src/ingest/twitch.js";

const router = express.Router();

// Twitch sends JSON. Keep parsing in transport, NOT brain.
router.use(express.json({ limit: "2mb" }));

// Placeholder endpoint for Twitch EventSub (or similar)
router.post("/api/webhook/twitch", twitchWebhookHandler);

// Internal ingest endpoint (e.g. Scrapbot -> Dashboard). Kept for compatibility.
router.post("/api/twitch-ingest", twitchIngestHandler);

export default router;
