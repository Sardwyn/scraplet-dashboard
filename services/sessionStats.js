import { computeRetentionRate } from '../src/insights/computeRetentionRate.js';
// services/sessionStats.js
// Computes per-session stats from chat_messages and writes to stream_sessions.
// Additive only — never modifies existing columns.

import db from '../db.js';

/**
 * Compute and persist stats for a single session.
 * Safe to call multiple times — idempotent via stats_computed_at update.
 */
export async function computeSessionStats(sessionId) {
  // Load the session
  const { rows: sessions } = await db.query(
    `SELECT session_id, channel_slug, started_at, ended_at, status
     FROM public.stream_sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (!sessions.length) throw new Error(`Session not found: ${sessionId}`);
  const session = sessions[0];

  const windowEnd = session.ended_at || new Date();

  // Aggregate from chat_messages within the session window
  const { rows: agg } = await db.query(
    `SELECT
       COUNT(*)                          AS total_messages,
       COUNT(DISTINCT actor_user_id)     AS unique_chatters
     FROM public.chat_messages
     WHERE channel_slug = $1
       AND ts >= $2
       AND ts <= $3`,
    [session.channel_slug, session.started_at, windowEnd]
  );

  const totalMessages  = parseInt(agg[0]?.total_messages  || 0, 10);
  const uniqueChatters = parseInt(agg[0]?.unique_chatters || 0, 10);

  // Duration in minutes
  const durationMs = new Date(windowEnd) - new Date(session.started_at);
  const durationMinutes = Math.round((durationMs / 60000) * 10) / 10;

  // Messages per minute (avoid div/0)
  const messagesPerMinute = durationMinutes > 0
    ? Math.round((totalMessages / durationMinutes) * 10) / 10
    : 0;

  await db.query(
    `UPDATE public.stream_sessions SET
       total_messages      = $1,
       unique_chatters     = $2,
       duration_minutes    = $3,
       messages_per_minute = $4,
       stats_computed_at   = now()
     WHERE session_id = $5`,
    [totalMessages, uniqueChatters, durationMinutes, messagesPerMinute, sessionId]
  );

    // Compute returning viewer rate (non-blocking)
  const returningViewerRate = await computeRetentionRate(sessionId).catch(() => null);

  return { sessionId, totalMessages, uniqueChatters, durationMinutes, messagesPerMinute, returningViewerRate };
}

/**
 * Backfill all ended sessions that haven't had stats computed yet.
 */
export async function backfillSessionStats() {
  const { rows } = await db.query(
    `SELECT session_id FROM public.stream_sessions
     WHERE status = 'ended' AND stats_computed_at IS NULL
     ORDER BY started_at ASC`
  );

  console.log(`[sessionStats] backfilling ${rows.length} sessions`);

  const results = [];
  for (const { session_id } of rows) {
    try {
      const r = await computeSessionStats(session_id);
      results.push({ ok: true, ...r });
      console.log(`[sessionStats] computed session ${session_id}:`, r);
    } catch (err) {
      results.push({ ok: false, sessionId: session_id, error: err.message });
      console.error(`[sessionStats] failed session ${session_id}:`, err.message);
    }
  }

  return results;
}
