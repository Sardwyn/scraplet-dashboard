// /root/scrapletdashboard/src/tts/enqueue.js
import db from "../../db.js";

const BOT_INTERNAL_PORT = process.env.BOT_INTERNAL_PORT || 3025;

/**
 * Send a Scrapbot notification in Kick chat when TTS is queued.
 * Non-blocking — failure is silently ignored.
 */
async function notifyScrapbot(channelSlug, senderUsername, scrapbotNotify) {
  if (!scrapbotNotify || !senderUsername || senderUsername === 'anonymous') return;
  try {
    const message = `@${senderUsername} your TTS message is queued and will play shortly 🎙️`;
    await fetch(`http://127.0.0.1:${BOT_INTERNAL_PORT}/internal/send-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelSlug, message }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* non-blocking */ }
}

export function normalizeText(s) {
  return (s || "").toString().trim();
}

/**
 * Enqueue a TTS job into tts_jobs.
 * This is the ONLY place that should know required columns/defaults.
 */
export async function enqueueTTSJob({
  scrapletUserId,
  platform = "kick",
  channelSlug,
  text,
  voiceId = "en_GB-alba-medium",
  source,              // e.g. 'paid_tts' | 'free_tts' (enum)
  priority = 0,
  entitlementId = null, // only for paid
  senderUsername = null, // for Scrapbot notification
  scrapbotNotify = true, // whether to notify sender in chat
}) {
  const uid = Number(scrapletUserId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("scrapletUserId required");

  const ch = (channelSlug || "").toString().trim();
  if (!ch) throw new Error("channelSlug required");

  const p = (platform || "kick").toString().trim() || "kick";
  const v = (voiceId || "en_GB-alba-medium").toString().trim() || "en_GB-alba-medium";
  const t = normalizeText(text);

  if (!t) throw new Error("text required");
  if (t.length > 500) throw new Error("text too long (max 500)");

  if (!source) throw new Error("source required");

  const engine = "local";
  const pr = Number(priority);
  const prio = Number.isFinite(pr) ? Math.floor(pr) : 0;

  const sql = `
    INSERT INTO tts_jobs (
      entitlement_id,
      status,
      priority,
      scraplet_user_id,
      platform,
      channel_slug,
      source,
      engine,
      voice_id,
      text,
      text_sanitized,
      requested_by_username,
      attempts
    )
    VALUES (
      $1,
      'queued',
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      0
    )
    RETURNING id, priority, source, created_at
  `;

  const { rows } = await db.query(sql, [
    entitlementId,
    prio,
    uid,
    p,
    ch,
    source,
    engine,
    v,
    t,
    t,
    senderUsername || null
  ]);

  // Notify sender via Scrapbot (non-blocking)
  if (scrapbotNotify && senderUsername) {
    notifyScrapbot(ch, senderUsername, scrapbotNotify).catch(() => {});
  }

  return rows[0];
}
