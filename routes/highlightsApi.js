// routes/highlightsApi.js
// Highlight ingest (from scrapbot) + query endpoints (for dashboard/showrunner)

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();
const WORKER_SECRET = process.env.GENERATION_WORKER_SECRET || '';

function requireWorkerAuth(req, res, next) {
  if (!WORKER_SECRET) return next();
  if (req.headers['x-worker-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// ── POST /api/highlights/ingest ───────────────────────────────────────────────
// Called by scrapbot's highlightDetector (worker auth)
router.post('/api/highlights/ingest', requireWorkerAuth, async (req, res) => {
  try {
    const {
      channel_slug, scraplet_user_id, platform,
      trigger_signal, trigger, magnitude, baseline_mpm, peak_mpm, triggered_at,
    } = req.body || {};

    const signal = trigger_signal || trigger;

    if (!channel_slug || !signal) {
      return res.status(400).json({ ok: false, error: 'missing fields' });
    }

    // Find active session for this channel
    const { rows: sessionRows } = await db.query(
      `SELECT session_id FROM public.stream_sessions
       WHERE channel_slug = $1 AND status = 'live'
       ORDER BY started_at DESC LIMIT 1`,
      [channel_slug]
    );
    const session_id = sessionRows[0]?.session_id || null;

    const { rows } = await db.query(
      `INSERT INTO public.stream_highlights
         (channel_slug, scraplet_user_id, session_id, triggered_at,
          signal, magnitude, baseline_mpm, peak_mpm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, triggered_at`,
      [channel_slug, Number(scraplet_user_id), session_id,
       triggered_at || new Date().toISOString(),
       signal, magnitude, baseline_mpm || null, peak_mpm || null]
    );

    const highlight = rows[0];
    console.log('[highlights] detected:', signal, 'x' + magnitude, 'channel:', channel_slug);

    // Notify bot for proactive chat response (non-blocking)
    const BOT_PORT = process.env.BOT_INTERNAL_PORT || 3025;
    fetch(`http://127.0.0.1:${BOT_PORT}/internal/highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_slug, signal, magnitude,
        guild_id: req.body.guild_id || null }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});

    // Notify connected dashboard clients via SSE
    try {
      const { rows: userRows } = await db.query(
        `SELECT ea.user_id FROM external_accounts ea
         JOIN channels c ON c.account_id = ea.id
         WHERE c.channel_slug = $1 LIMIT 1`,
        [channel_slug]
      );
      if (userRows[0]?.user_id && global.studioEventBus) {
        global.studioEventBus.publish(userRows[0].user_id, {
          type: 'highlight.detected',
          payload: { ...highlight, signal, magnitude, channel_slug },
        });
      }
    } catch { /* non-critical */ }

    return res.json({ ok: true, id: highlight.id });
  } catch (err) {
    console.error('[highlights] ingest error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dashboard/api/highlights ────────────────────────────────────────────
// Returns recent highlights for the logged-in user's channels
router.get('/dashboard/api/highlights', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const sessionId = req.query.session_id || null;

    const { rows } = await db.query(
      `SELECT h.id, h.channel_slug, h.triggered_at, h.signal,
              h.magnitude, h.baseline_mpm, h.peak_mpm,
              h.clip_tagged, h.clip_path, h.reviewed, h.session_id
       FROM public.stream_highlights h
       JOIN public.external_accounts ea ON ea.user_id = $1
       JOIN public.channels c ON c.account_id = ea.id AND c.channel_slug = h.channel_slug
       WHERE ($2::uuid IS NULL OR h.session_id = $2)
       ORDER BY h.triggered_at DESC
       LIMIT $3`,
      [userId, sessionId, limit]
    );
    return res.json({ ok: true, highlights: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /dashboard/api/highlights/:id/tag ───────────────────────────────────
// Mark a highlight as clip-tagged (from showrunner)
router.post('/dashboard/api/highlights/:id/tag', requireAuth, express.json(), async (req, res) => {
  try {
    const { clip_path } = req.body || {};
    const { rows } = await db.query(
      `UPDATE public.stream_highlights
       SET clip_tagged = true, clip_path = $1, reviewed = true
       WHERE id = $2 RETURNING id`,
      [clip_path || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET/PUT /dashboard/api/scrapbot/settings ─────────────────────────────────
// Scrapbot guild settings (verbosity, proactive mode, debrief config)
router.get('/dashboard/api/scrapbot/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows: guildRows } = await db.query(
      `SELECT dgi.guild_id FROM public.discord_guild_integrations dgi
       WHERE dgi.owner_user_id = $1 AND dgi.status = 'active' LIMIT 1`,
      [userId]
    );
    if (!guildRows.length) return res.json({ ok: true, settings: null });

    const guildId = guildRows[0].guild_id;
    const { rows } = await db.query(
      `INSERT INTO public.scrapbot_guild_settings (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [guildId]
    );
    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/dashboard/api/scrapbot/settings', requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { verbosity, proactive_enabled, debrief_channel_id, debrief_enabled } = req.body || {};

    const { rows: guildRows } = await db.query(
      `SELECT dgi.guild_id FROM public.discord_guild_integrations dgi
       WHERE dgi.owner_user_id = $1 AND dgi.status = 'active' LIMIT 1`,
      [userId]
    );
    if (!guildRows.length) return res.status(404).json({ ok: false, error: 'no guild' });

    const guildId = guildRows[0].guild_id;
    const { rows } = await db.query(
      `INSERT INTO public.scrapbot_guild_settings
         (guild_id, verbosity, proactive_enabled, debrief_channel_id, debrief_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         verbosity = COALESCE($2, scrapbot_guild_settings.verbosity),
         proactive_enabled = COALESCE($3, scrapbot_guild_settings.proactive_enabled),
         debrief_channel_id = COALESCE($4, scrapbot_guild_settings.debrief_channel_id),
         debrief_enabled = COALESCE($5, scrapbot_guild_settings.debrief_enabled),
         updated_at = now()
       RETURNING *`,
      [guildId,
       verbosity != null ? Number(verbosity) : null,
       proactive_enabled != null ? Boolean(proactive_enabled) : null,
       debrief_channel_id || null,
       debrief_enabled != null ? Boolean(debrief_enabled) : null]
    );
    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// ── GET /api/game-context/:channelSlug ───────────────────────────────────────
// Internal: scrapbot fetches current game context for a channel
import { getGameContextBlock, seedGameCache } from '../services/gameContext.js';
seedGameCache().catch(() => {});

router.get('/api/game-context/:channelSlug', async (req, res) => {
  const context = getGameContextBlock(req.params.channelSlug);
  return res.json({ ok: true, context });
});


// ── GET /api/internal/channel-stats/:channelSlug ─────────────────────────────
// Internal endpoint for Scrapbot to fetch live session stats (no auth required,
// only accessible from localhost via the outbox worker chain)
router.get('/api/internal/channel-stats/:channelSlug', async (req, res) => {
  try {
    const { channelSlug } = req.params;

    // Get active session
    // Try live session first, fall back to most recent session started in last 24h
    const { rows: sessionRows } = await db.query(
      `SELECT session_id, started_at, peak_ccv, total_messages, unique_chatters, status,
              EXTRACT(EPOCH FROM (now() - started_at))/60 AS duration_minutes
       FROM public.stream_sessions
       WHERE channel_slug = $1
         AND (status = 'live' OR started_at > now() - interval '24 hours')
       ORDER BY started_at DESC LIMIT 1`,
      [channelSlug]
    );

    if (!sessionRows[0]) {
      return res.json({ ok: true, live: false, context: null });
    }

    const s = sessionRows[0];

    // Count MPM live from chat_messages (last 5 min) - more accurate than stale session column
    const { rows: mpmRows } = await db.query(
      `SELECT COUNT(*)::float / 5 AS mpm
       FROM public.chat_messages
       WHERE channel_slug = $1
         AND created_at > now() - interval '5 minutes'
         AND actor_username != $1`,
      [channelSlug]
    );

    // Get top chatters for this session
    const { rows: chatters } = await db.query(
      `SELECT actor_username, COUNT(*) as msg_count
       FROM public.chat_messages
       WHERE channel_slug = $1 AND created_at > $2
         AND actor_username != $1
       GROUP BY actor_username
       ORDER BY msg_count DESC LIMIT 3`,
      [channelSlug, s.started_at]
    );

    const liveMpm = parseFloat((mpmRows[0]?.mpm || 0).toFixed(1));

    const stats = {
      peak_viewers: s.peak_ccv,
      session_duration_minutes: Math.round(s.duration_minutes || 0),
      total_messages: s.total_messages,
      unique_chatters: s.unique_chatters,
      messages_per_minute: liveMpm,
      top_chatters: chatters.map(c => c.actor_username),
    };

    return res.json({ ok: true, live: true, stats });
  } catch (err) {
    console.error('[internal/channel-stats] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// ── GET /api/internal/rag-context ────────────────────────────────────────────
// Internal endpoint for Scrapbot to retrieve knowledge base context.
// Called by both Discord bot and Kick AI service before LLM calls.
router.get('/api/internal/rag-context', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query || query.length < 5) return res.json({ ok: true, context: null });

    const { rows } = await db.query(`
      SELECT title, content, domain,
             ts_rank(search_vec, plainto_tsquery('english', $1)) AS rank
      FROM public.knowledge_base
      WHERE search_vec @@ plainto_tsquery('english', $1)
         OR content ILIKE $2
      ORDER BY rank DESC
      LIMIT 3
    `, [query, '%' + query.split(' ').slice(0, 3).join('%') + '%']);

    if (!rows.length) return res.json({ ok: true, context: null });

    const context = rows.map(r =>
      '[' + r.domain.toUpperCase() + ' KNOWLEDGE: ' + r.title + ']\n' + r.content.slice(0, 500)
    ).join('\n\n---\n\n');

    return res.json({ ok: true, context: '[VERIFIED FACTS - USE THESE EXACT FIGURES]\n' + context });
  } catch (e) {
    console.error('[rag] error:', e.message);
    return res.json({ ok: true, context: null });
  }
});

export default router;
