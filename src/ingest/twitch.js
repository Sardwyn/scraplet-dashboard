// src/ingest/twitch.js
//
// CANONICAL TWITCH INGEST BRAIN — STUB
// - normalization + persistence + side-effects for Twitch-derived events
// - transport routes stay thin and delegate here
//
// This file intentionally does almost nothing yet.
// It exists to lock the architecture and provide a landing zone for future work.

export async function twitchWebhookHandler(req, res) {
  try {
    // NOTE: Twitch EventSub includes challenge verification flows and signature checks.
    // We will implement those later. For now, acknowledge.
    return res.json({ ok: true, stub: true });
  } catch (err) {
    console.error("[twitchWebhook] handler error", err);
    return res.status(500).json({ ok: false });
  }
}

export async function twitchIngestHandler(req, res) {
  try {
    // Internal envelope ingest (Scrapbot -> Dashboard) will be implemented later.
    return res.json({ ok: true, stub: true });
  } catch (err) {
    console.error("[twitchIngest] error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
