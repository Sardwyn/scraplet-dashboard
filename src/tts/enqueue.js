// /root/scrapletdashboard/src/tts/enqueue.js
import db from "../../db.js";

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
  entitlementId = null // only for paid
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
    t
  ]);

  return rows[0];
}
