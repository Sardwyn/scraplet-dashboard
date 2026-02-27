// src/ingest/youtube.js
//
// CANONICAL YOUTUBE INGEST BRAIN — STUB
// - normalization + persistence + side-effects for YouTube-derived events
// - transport routes stay thin and delegate here
//
// This file intentionally does almost nothing yet.
// It exists to lock the architecture and provide a landing zone for future work.

export async function youtubeWebhookHandler(req, res) {
  try {
    // YouTube has different webhook patterns depending on feature (PubSubHubbub, etc).
    // We will implement verification/normalization later.
    return res.json({ ok: true, stub: true });
  } catch (err) {
    console.error("[youtubeWebhook] handler error", err);
    return res.status(500).json({ ok: false });
  }
}

export async function youtubeIngestHandler(req, res) {
  try {
    // Internal envelope ingest (Scrapbot -> Dashboard) will be implemented later.
    return res.json({ ok: true, stub: true });
  } catch (err) {
    console.error("[youtubeIngest] error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
