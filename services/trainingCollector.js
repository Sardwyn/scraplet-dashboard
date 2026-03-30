// services/trainingCollector.js
// Harvests Scrapbot Kick chat exchanges for training data.

import db from '../db.js';

const MIN_RESPONSE_LENGTH = 25;
const BAD_PHRASES = ["i don't know", "i cannot", "i'm not able", "error", "undefined"];

function qualityScore(userMsg, botResponse) {
  let score = 0;
  if (botResponse.length > 50) score += 0.3;
  if (botResponse.length > 100) score += 0.2;
  const lower = botResponse.toLowerCase();
  if (!BAD_PHRASES.some(p => lower.includes(p))) score += 0.3;
  if (botResponse.split(' ').length > 8) score += 0.2;
  return Math.min(score, 1.0);
}

export async function collectKickExchanges(hoursBack) {
  const hours = parseInt(hoursBack || 24);
  try {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { rows } = await db.query(
      `SELECT
         u.payload->'chat_v1'->'message'->>'text' AS user_message,
         b.payload->'chat_v1'->'message'->>'text' AS bot_response,
         u.payload->'chat_v1'->'channel'->>'slug' AS channel_slug,
         u.created_at
       FROM public.chat_outbox u
       JOIN public.chat_outbox b
         ON b.payload->'chat_v1'->'channel'->>'slug' = u.payload->'chat_v1'->'channel'->>'slug'
         AND b.created_at > u.created_at
         AND b.created_at < u.created_at + interval '30 seconds'
         AND b.payload->'chat_v1'->'author'->>'username' = 'scrapbot'
       WHERE u.created_at > $1
         AND u.payload::text ILIKE '%scrapbot%'
         AND u.payload->'chat_v1'->'author'->>'username' != 'scrapbot'
       ORDER BY u.created_at DESC
       LIMIT 200`,
      [cutoff]
    );

    let inserted = 0;
    for (const row of rows) {
      if (!row.user_message || !row.bot_response) continue;
      if (row.bot_response.length < MIN_RESPONSE_LENGTH) continue;
      const score = qualityScore(row.user_message, row.bot_response);
      if (score < 0.3) continue;
      try {
        await db.query(
          `INSERT INTO public.scrapbot_training_candidates
             (platform, channel_id, user_message, bot_response, quality_score)
           VALUES ('kick', $1, $2, $3, $4)`,
          [row.channel_slug, row.user_message, row.bot_response, score]
        );
        inserted++;
      } catch (_) {}
    }
    console.log('[trainingCollector] kick: collected', inserted, 'candidates');
    return inserted;
  } catch (e) {
    console.error('[trainingCollector] error:', e.message);
    return 0;
  }
}
