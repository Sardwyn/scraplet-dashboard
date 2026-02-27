// routes/kickWebhook.js
//
// KICK TRANSPORT (HTTP)
// Responsibilities:
// - receive HTTP requests (Kick webhook + internal ingest)
// - do transport-only work (body parsing, minimal request shaping)
// - delegate ALL business logic to the canonical ingest brain at: src/ingest/kick.js
//
// Architectural rules:
// - Do not mutate widget/overlay state here.
// - Do not call casino engines or OBS bridge endpoints here.
// - Do not write to ring buffers here.
//

import express from "express";
import { kickWebhookHandler, kickIngestHandler } from "../src/ingest/kick.js";

const router = express.Router();

// Kick posts JSON. This belongs in transport, NOT the brain.
router.use(express.json({ limit: "2mb" }));

// Kick's official webhook endpoint
router.post("/api/webhook/kick", kickWebhookHandler);

// Internal ingest endpoint (e.g. Scrapbot -> Dashboard). Kept for compatibility.
// NOTE: Signature/HMAC verification is performed inside the brain handler.
router.post("/api/kick-ingest", kickIngestHandler);

export default router;
