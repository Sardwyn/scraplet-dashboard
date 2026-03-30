// services/trainingCollector.js
// Harvests Scrapbot Discord exchanges for training data.
// Run nightly or after each session ends.

import db from '../db.js';

const MIN_RESPONSE_LENGTH = 25;
const BAD_PHRASES = ['i don't know', 'i cannot', 'i'm not able', 'error', 'undefined'];

function qualityScore(userMsg, botResponse) {
  let score = 0;
  // Length score
  if (botResponse.length > 50) score += 0.3;
  if (botResponse.length > 100) score += 0.2;
  // No bad phrases
  const lower = botResponse.toLowerCase();
  if (!BAD_PHRASES.some(p => lower.includes(p))) score += 0.3;
  // Has substance (not just a quip)
  if (botResponse.split(' ').length > 8) score += 0.2;
  return Math.min(score, 1.0);
}

export async function collectDiscordExchanges(hoursBack = 24) {
  try {
    // Get Scrapbot message pairs from Discord message log
    // We look for user messages followed by Scrapbot responses
    const { rows } = await db.query(`
      SELECT
        m1.content AS user_message,
        m2.content AS bot_response,
        m1.guild_id,
        m1.channel_id,
        m1.created_at
      FROM public.discord_messages m1
      JOIN public.discord_messages m2
        ON m2.channel_id = m1.channel_id
        AND m2.created_at > m1.created_at
        AND m2.created_at < m1.created_at + interval '30 seconds'
        AND m2.is_bot = true
        AND m2.author_username ILIKE '%scrapbot%'
      WHERE m1.created_at > now() - ($1 || ' hours')::interval
        AND m1.is_bot = false
        AND m1.content ILIKE '%scrapbot%'
        AND LENGTH(m2.content) > $2
      ORDER BY m1.created_at DESC
      LIMIT 500
    `, [hoursBack, MIN_RESPONSE_LENGTH]);

    if (!rows.length) {
      console.log('[trainingCollector] no exchanges found');
      return 0;
    }

    let inserted = 0;
    for (const row of rows) {
      const score = qualityScore(row.user_message, row.bot_response);
      if (score < 0.3) continue; // skip low quality

      await db.query(`
        INSERT INTO public.scrapbot_training_candidates
          (platform, guild_id, channel_id, user_message, bot_response, quality_score)
        VALUES ('discord', $1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [row.guild_id, row.channel_id, row.user_message, row.bot_response, score])
        .catch(() => {}); // ignore duplicates
      inserted++;
    }

    console.log(`[trainingCollector] collected ${inserted} candidates`);
    return inserted;
  } catch (e) {
    console.error('[trainingCollector] error:', e.message);
    return 0;
  }
}

// Also collect from Kick chat outbox
export async function collectKickExchanges(hoursBack = 24) {
  try {
    const { rows } = await db.query(`
      SELECT
        payload->'chat_v1'->'message'->>'text' AS user_message,
        bot_response.text AS bot_response,
        payload->'chat_v1'->'channel'->>'slug' AS channel_slug,
        created_at
      FROM public.chat_outbox user_msg
      JOIN LATERAL (
        SELECT payload->'chat_v1'->'message'->>'text' AS text
        FROM public.chat_outbox
        WHERE payload->'chat_v1'->'author'->>'username' = 'scrapbot'
          AND created_at > user_msg.created_at
          AND created_at < user_msg.created_at + interval '30 seconds'
        LIMIT 1
      ) bot_response ON true
      WHERE user_msg.created_at > now() - ($1 || ' hours')::interval
        AND payload::text ILIKE '%scrapbot%'
        AND payload->'chat_v1'->'author'->>'username' != 'scrapbot'
        AND LENGTH(bot_response.text) > $2
      ORDER BY user_msg.created_at DESC
      LIMIT 200
    `, [hoursBack, MIN_RESPONSE_LENGTH]);

    let inserted = 0;
    for (const row of rows) {
      if (!row.user_message || !row.bot_response) continue;
      const score = qualityScore(row.user_message, row.bot_response);
      if (score < 0.3) continue;

      await db.query(`
        INSERT INTO public.scrapbot_training_candidates
          (platform, channel_id, user_message, bot_response, quality_score)
        VALUES ('kick', $1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [row.channel_slug, row.user_message, row.bot_response, score])
        .catch(() => {});
      inserted++;
    }

    console.log(`[trainingCollector] kick: collected ${inserted} candidates`);
    return inserted;
  } catch (e) {
    console.error('[trainingCollector] kick error:', e.message);
    return 0;
  }
}
