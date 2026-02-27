// routes/youtubeWebhook.js
//
// YOUTUBE TRANSPORT (HTTP) — STUB
// Responsibilities:
// - receive HTTP requests (YouTube PubSub/webhooks + internal ingest)
// - do transport-only work (body parsing, minimal request shaping)
// - delegate ALL business logic to the canonical ingest brain at: src/ingest/youtube.js
//
// Architectural rules:
// - Do not mutate widget/overlay state here.
// - Do not call casino engines or OBS bridge endpoints here.
// - Do not write to ring buffers here.
//

import express from "express";
import { youtubeWebhookHandler, youtubeIngestHandler } from "../src/ingest/youtube.js";

const router = express.Router();

router.use(express.json({ limit: "2mb" }));

router.post("/api/webhook/youtube", youtubeWebhookHandler);
router.post("/api/youtube-ingest", youtubeIngestHandler);

export default router;
