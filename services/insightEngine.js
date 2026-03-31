// services/insightEngine.js
// Nightly insight engine — runs pattern detectors per tenant, generates LLM text, writes to insights table.

import cron from 'node-cron';
import db from '../db.js';
import { confidenceScore } from '../src/insights/confidenceScore.js';
import { isStale } from '../src/insights/isStale.js';
import {
  dayOfWeekDetector,
  sessionLengthSweetSpot,
  mpmDecayDetector,
  gameCategoryCorrelation,
  retentionTrendDetector,
  growthVelocityDetector,
} from '../src/insights/detectors/index.js';

const VLLM_URL = process.env.VLLM_URL || 'http://44.216.47.8:8000';
const MIN_SESSIONS = 5;
const MIN_SESSIONS_TEMPORAL = 10;
const MIN_CONFIDENCE = 0.5;

// ── LLM text generation ───────────────────────────────────────────────────────

async function generateInsightText(pattern) {
  const prompt = `You are Scrapbot, a streaming production analyst. Write a coaching insight for a streamer based on this data.

Pattern type: ${pattern.type}
Data: ${JSON.stringify(pattern.supporting_data)}
Key finding: ${JSON.stringify(pattern)}

Rules:
- Be direct and specific — include the actual numbers
- No hedging ("might", "could", "perhaps")
- Include one concrete action suggestion
- Keep it under 2 sentences
- Sound like Scrapbot: confident, slightly blunt, not corporate

Respond with JSON: {"insight_text": "...", "action_suggestion": "..."}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${VLLM_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'scrapbot',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 150,
        }),
      });
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.insight_text && /\d/.test(parsed.insight_text)) {
          return parsed;
        }
      }
    } catch { /* retry */ }
  }
  return null;
}

// ── Per-tenant processing ─────────────────────────────────────────────────────

async function processUser(userId) {
  const { rows: sessions } = await db.query(
    `SELECT ss.*,
       (SELECT game_name FROM game_context WHERE channel_slug = ss.channel_slug ORDER BY updated_at DESC LIMIT 1) AS game_name,
       (SELECT COUNT(DISTINCT actor_user_id) FROM chat_messages cm WHERE cm.channel_slug = ss.channel_slug AND cm.ts BETWEEN ss.started_at AND COALESCE(ss.ended_at, NOW())) AS chatter_count
     FROM stream_sessions ss
     LEFT JOIN channels c ON c.channel_slug = ss.channel_slug
     WHERE ss.status = 'ended'
       AND EXISTS (
         SELECT 1 FROM external_accounts ea
         JOIN channels ch ON ch.account_id = ea.id
         WHERE ea.user_id = $1 AND ch.channel_slug = ss.channel_slug
       )
     ORDER BY ss.started_at DESC
     LIMIT 90`,
    [userId]
  );

  if (sessions.length < MIN_SESSIONS) return;

  const detectors = [
    { fn: () => dayOfWeekDetector(sessions, 'messages_per_minute'), metric: 'mpm', minSessions: MIN_SESSIONS_TEMPORAL },
    { fn: () => dayOfWeekDetector(sessions, 'peak_ccv'), metric: 'ccv', minSessions: MIN_SESSIONS_TEMPORAL },
    { fn: () => sessionLengthSweetSpot(sessions), metric: 'session_length', minSessions: MIN_SESSIONS },
    { fn: () => mpmDecayDetector(sessions), metric: 'mpm', minSessions: MIN_SESSIONS },
    { fn: () => gameCategoryCorrelation(sessions), metric: 'game', minSessions: MIN_SESSIONS },
    { fn: () => retentionTrendDetector(sessions), metric: 'retention', minSessions: MIN_SESSIONS },
    { fn: () => growthVelocityDetector(sessions), metric: 'growth', minSessions: MIN_SESSIONS_TEMPORAL },
  ];

  for (const { fn, metric, minSessions } of detectors) {
    if (sessions.length < minSessions) continue;
    try {
      const pattern = fn();
      if (!pattern) continue;

      // Compute confidence from sample size and variance
      const n = sessions.length;
      const variance = pattern.pctDiff ? Math.min(1, 1 / (Math.abs(pattern.pctDiff) / 100 + 0.1)) : 0.3;
      const confidence = confidenceScore(n, variance);
      if (confidence < MIN_CONFIDENCE) continue;

      const generated = await generateInsightText(pattern);
      if (!generated) continue;

      const dateStart = sessions[sessions.length - 1].started_at;
      const dateEnd = sessions[0].started_at;

      await db.query(
        `INSERT INTO public.insights
           (user_id, metric_key, insight_text, confidence, supporting_data, date_range_start, date_range_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, metric, generated.insight_text, confidence, JSON.stringify({ ...pattern.supporting_data, action_suggestion: generated.action_suggestion }), dateStart, dateEnd]
      );
    } catch (err) {
      console.error(`[insightEngine] detector error for user ${userId}:`, err.message);
    }
  }
}

// ── Discord weekly digest ─────────────────────────────────────────────────────

async function sendWeeklyDigest(userId) {
  try {
    const { rows: insights } = await db.query(
      `SELECT insight_text, supporting_data->>'action_suggestion' AS action_suggestion, metric_key
       FROM public.insights
       WHERE user_id = $1
         AND dismissed_at IS NULL
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY confidence DESC
       LIMIT 3`,
      [userId]
    );
    if (!insights.length) return;

    const { rows: config } = await db.query(
      `SELECT discord_webhook_url FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const webhookUrl = config[0]?.discord_webhook_url;
    if (!webhookUrl) return;

    const fields = insights.map(i => ({
      name: `📊 ${i.metric_key.replace(/_/g, ' ').toUpperCase()}`,
      value: `${i.insight_text}\n*→ ${i.action_suggestion || 'Review your data.'}*`,
      inline: false,
    }));

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '📈 Weekly Coaching Insights',
          description: "Here's what your data is saying this week.",
          color: 0x6366f1,
          fields,
          footer: { text: 'Scraplet Broadcast Studio' },
        }],
      }),
    });
  } catch (err) {
    console.error(`[insightEngine] digest error for user ${userId}:`, err.message);
  }
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runInsightEngine() {
  console.log('[insightEngine] starting run...');
  try {
    const { rows: users } = await db.query(
      `SELECT DISTINCT ea.user_id
       FROM external_accounts ea
       JOIN channels c ON c.account_id = ea.id
       JOIN stream_sessions ss ON ss.channel_slug = c.channel_slug
       WHERE ss.status = 'ended'
       GROUP BY ea.user_id
       HAVING COUNT(ss.session_id) >= ${MIN_SESSIONS}`
    );

    const isMonday = new Date().getDay() === 1;

    for (const { user_id } of users) {
      try {
        await processUser(user_id);
        if (isMonday) await sendWeeklyDigest(user_id);
      } catch (err) {
        console.error(`[insightEngine] user ${user_id} failed:`, err.message);
      }
    }
    console.log(`[insightEngine] done — processed ${users.length} users`);
  } catch (err) {
    console.error('[insightEngine] fatal:', err.message);
  }
}

// Schedule: 3am UTC daily
export function scheduleInsightEngine() {
  cron.schedule('0 3 * * *', runInsightEngine, { timezone: 'UTC' });
  console.log('[insightEngine] scheduled for 3am UTC daily');
}
