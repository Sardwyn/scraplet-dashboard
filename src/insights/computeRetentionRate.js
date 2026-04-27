// src/insights/computeRetentionRate.js
// Computes returning_viewer_rate for a session pair.
// returning_viewer_rate = |chatters(N) ∩ chatters(N-1)| / |chatters(N-1)|

import db from '../../db.js';

/**
 * Compute and store returning_viewer_rate for a session.
 * Looks up the previous session for the same channel and computes overlap.
 * @param {string} sessionId - current session UUID
 * @returns {Promise<number|null>} rate [0,1] or null if no prior session
 */
export async function computeRetentionRate(sessionId) {
  try {
    // Get current session
    const { rows: [session] } = await db.query(
      `SELECT session_id, channel_slug, started_at FROM stream_sessions WHERE session_id = $1`,
      [sessionId]
    );
    if (!session) return null;

    // Get previous session for same channel
    const { rows: [prev] } = await db.query(
      `SELECT session_id, started_at, ended_at FROM stream_sessions
       WHERE channel_slug = $1 AND status = 'ended' AND started_at < $2
       ORDER BY started_at DESC LIMIT 1`,
      [session.channel_slug, session.started_at]
    );
    if (!prev) return null;

    // Get chatters for both sessions
    const { rows: currentChatters } = await db.query(
      `SELECT DISTINCT actor_user_id FROM chat_messages
       WHERE channel_slug = $1 AND ts >= $2 AND ts <= COALESCE($3, NOW())`,
      [session.channel_slug, session.started_at, null]
    );
    const { rows: prevChatters } = await db.query(
      `SELECT DISTINCT actor_user_id FROM chat_messages
       WHERE channel_slug = $1 AND ts >= $2 AND ts <= $3`,
      [session.channel_slug, prev.started_at, prev.ended_at || session.started_at]
    );

    if (prevChatters.length === 0) return null;

    const currentSet = new Set(currentChatters.map(r => r.actor_user_id));
    const returning = prevChatters.filter(r => currentSet.has(r.actor_user_id)).length;
    const rate = returning / prevChatters.length;

    // Store on session
    await db.query(
      `UPDATE stream_sessions SET returning_viewer_rate = $1 WHERE session_id = $2`,
      [rate, sessionId]
    );

    return rate;
  } catch (err) {
    console.error('[computeRetentionRate] error:', err.message);
    return null;
  }
}
