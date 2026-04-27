// routes/streamerContext.js
// GET /api/streamer/context
// Returns a tenant-scoped stats summary for use by Disco Scrapbot and the dashboard.
// All queries are scoped to the authenticated user — no cross-tenant leakage.
// Internal callers (discord-bot-worker) may pass _internal_user_id if request
// originates from localhost and DISCORD_BOT_INTERNAL_SECRET matches.

import express from 'express';
import db from '../db.js';

const router = express.Router();

const INTERNAL_SECRET = process.env.DISCORD_BOT_INTERNAL_SECRET || '';

function resolveUserId(req) {
  // Internal call from discord-bot-worker (localhost only)
  if (req.query._internal_user_id) {
    const fromLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    const secretOk = INTERNAL_SECRET
      ? req.headers['x-internal-secret'] === INTERNAL_SECRET
      : true; // if no secret configured, allow localhost-only
    if (fromLocalhost && secretOk) {
      return Number(req.query._internal_user_id);
    }
  }
  // Normal dashboard session
  if (req.session?.user) return Number(req.session.user.id);
  return null;
}

function requireResolved(req, res, next) {
  if (!resolveUserId(req)) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  next();
}

router.get('/api/streamer/context', requireResolved, async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);

    // ── 1. Platform stats ────────────────────────────────────────────────────
    const { rows: statsRows } = await db.query(
      `SELECT followers, ccv, engagement, marketability, last_updated
       FROM public.user_stats WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const statsRow = statsRows[0] || {};
    const platformStats = [];
    const followers  = statsRow.followers  || {};
    const ccv        = statsRow.ccv        || {};
    const engagement = statsRow.engagement || {};
    for (const platform of new Set([...Object.keys(followers), ...Object.keys(ccv), ...Object.keys(engagement)])) {
      platformStats.push({
        platform,
        followers:  Number(followers[platform]  ?? 0),
        ccv:        Number(ccv[platform]        ?? 0),
        engagement: Number(engagement[platform] ?? 0),
      });
    }

    // ── 2. Recent stream sessions ────────────────────────────────────────────
    const { rows: sessions } = await db.query(
      `SELECT
         ss.session_id,
         ss.platform,
         ss.channel_slug,
         ss.started_at,
         ss.ended_at,
         ss.duration_minutes,
         ss.total_messages,
         ss.unique_chatters,
         ss.messages_per_minute,
         ss.peak_ccv
       FROM public.stream_sessions ss
       JOIN public.channels c ON c.channel_slug = ss.channel_slug AND c.platform = ss.platform
       JOIN public.external_accounts ea ON ea.id = c.account_id
       WHERE ea.user_id = $1
         AND ss.status = 'ended'
         AND ss.started_at >= now() - ($2 || ' days')::interval
       ORDER BY ss.started_at DESC
       LIMIT 20`,
      [userId, days]
    );

    // ── 3. Chat activity summary ─────────────────────────────────────────────
    const { rows: chatRows } = await db.query(
      `SELECT
         COUNT(*)                      AS total_messages,
         COUNT(DISTINCT actor_user_id) AS unique_chatters,
         COUNT(DISTINCT DATE(ts))      AS active_days
       FROM public.chat_messages cm
       JOIN public.channels c ON c.channel_slug = cm.channel_slug
       JOIN public.external_accounts ea ON ea.id = c.account_id
       WHERE ea.user_id = $1
         AND cm.ts >= now() - ($2 || ' days')::interval`,
      [userId, days]
    );
    const chatSummary = {
      total_messages:  parseInt(chatRows[0]?.total_messages  || 0, 10),
      unique_chatters: parseInt(chatRows[0]?.unique_chatters || 0, 10),
      active_days:     parseInt(chatRows[0]?.active_days     || 0, 10),
    };

    // ── 4. Top chatters ──────────────────────────────────────────────────────
    const { rows: topChatters } = await db.query(
      `SELECT
         cm.actor_username,
         COUNT(*) AS message_count
       FROM public.chat_messages cm
       JOIN public.channels c ON c.channel_slug = cm.channel_slug
       JOIN public.external_accounts ea ON ea.id = c.account_id
       WHERE ea.user_id = $1
         AND cm.ts >= now() - ($2 || ' days')::interval
         AND cm.actor_username IS NOT NULL
       GROUP BY cm.actor_username
       ORDER BY message_count DESC
       LIMIT 10`,
      [userId, days]
    );

    // ── 5. Session averages ──────────────────────────────────────────────────
    const sessionAverages = sessions.length ? {
      avg_duration_minutes:    Math.round(sessions.reduce((s, r) => s + Number(r.duration_minutes || 0), 0) / sessions.length * 10) / 10,
      avg_messages_per_stream: Math.round(sessions.reduce((s, r) => s + Number(r.total_messages   || 0), 0) / sessions.length),
      avg_unique_chatters:     Math.round(sessions.reduce((s, r) => s + Number(r.unique_chatters  || 0), 0) / sessions.length),
      avg_messages_per_minute: Math.round(sessions.reduce((s, r) => s + Number(r.messages_per_minute || 0), 0) / sessions.length * 10) / 10,
      total_streams:           sessions.length,
    } : null;

    return res.json({
      ok: true,
      user_id: userId,
      days,
      platform_stats:   platformStats,
      session_averages: sessionAverages,
      recent_sessions:  sessions,
      chat_summary:     chatSummary,
      top_chatters:     topChatters,
      generated_at:     new Date().toISOString(),
    });

  } catch (err) {
    console.error('[streamerContext] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
