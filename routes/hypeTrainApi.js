// routes/hypeTrainApi.js
// Hype Train — session management, contribution ingestion, SSE push

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

function getUserId(req) { return req?.session?.user?.id ?? null; }

// ── Difficulty thresholds ──────────────────────────────────────────────────
// Points needed to reach each level from the previous one.
// Level N requires THRESHOLD * N points (cumulative scaling).
const DIFFICULTY_BASE = { easy: 3, alright: 5, hard: 8, insane: 12 };

function pointsToNextLevel(level, difficulty) {
  const base = DIFFICULTY_BASE[difficulty] || 3;
  // Each level requires base * level points (gets harder as you go up)
  return base * level;
}

// ── Platform point values ──────────────────────────────────────────────────
function getEventPoints(kind, payload, tipPtsPerUnit) {
  // Kick subs
  if (kind === 'channel.subscription.new' || kind === 'channel.subscription.renewal') {
    return 1;
  }
  // Twitch tier subs
  if (kind === 'channel.subscription.new' || kind === 'subscribe') {
    const tier = payload?.tier || 1;
    return tier === 3 ? 6 : tier === 2 ? 2 : 1;
  }
  // Gift subs
  if (kind === 'channel.subscription.gifts') {
    const count = payload?.count || payload?.gift_count || 1;
    const tier = payload?.tier || 1;
    const tierPts = tier === 3 ? 6 : tier === 2 ? 2 : 1;
    return count * tierPts;
  }
  // Kicks (Kick's currency)
  if (kind === 'kicks.gifted') {
    const kicks = parseFloat(payload?.kicks || payload?.amount || 0);
    const unit = parseFloat(tipPtsPerUnit) || 5;
    return Math.max(1, Math.floor(kicks / unit));
  }
  // Tips / donations
  if (kind === 'tip' || kind === 'donation') {
    const amount = parseFloat(payload?.amount || 0);
    const unit = parseFloat(tipPtsPerUnit) || 5;
    return Math.max(1, Math.floor(amount / unit));
  }
  // YouTube membership
  if (kind === 'channel.followed' && payload?.platform === 'youtube') {
    return 1;
  }
  return 0;
}

// ── Push SSE update ────────────────────────────────────────────────────────
async function pushHypeUpdate(userId, session) {
  await db.query(
    `INSERT INTO public.events (id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload, user_id)
     VALUES ($1, 1, 'system', 'hype.update', now(), 'system', null, null, $2::jsonb, $3)`,
    [
      'hype_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      JSON.stringify({ session }),
      userId
    ]
  );
}

// ── Helper: get hype train widget config from user's overlays ─────────────
async function getHypeTrainWidgetConfig(userId) {
  try {
    const r = await db.query(
      `SELECT config_json FROM public.overlays
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    for (const row of r.rows) {
      const elements = row.config_json?.elements || [];
      for (const el of elements) {
        if (el.type === 'widget' && el.widgetId === 'hype-train') {
          return el.propOverrides || {};
        }
      }
    }
  } catch (e) {
    console.warn('[hype-train] getWidgetConfig failed:', e.message);
  }
  return null; // widget not on any overlay
}

// ── Helper: auto-start session from widget config ─────────────────────────
async function autoStartSession(userId) {
  const cfg = await getHypeTrainWidgetConfig(userId);
  if (cfg === null) return null; // widget not placed — don't auto-start

  const diff = ['easy','alright','hard','insane'].includes(cfg.difficulty) ? cfg.difficulty : 'easy';
  const timeSec = Math.max(10, Math.min(300, Number(cfg.time_per_contrib_sec) || 30));
  const tipUnit = Math.max(1, Number(cfg.tip_pts_per_unit) || 5);
  const shouldNarrate = cfg.narrate !== false && cfg.narrate !== 'false';
  const ptn = pointsToNextLevel(1, diff);
  const expiresAt = new Date(Date.now() + timeSec * 1000);

  const r = await db.query(
    `INSERT INTO public.hype_train_sessions
       (user_id, difficulty, time_per_contrib_sec, tip_pts_per_unit, points_to_next, expires_at, narrate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, diff, timeSec, tipUnit, ptn, expiresAt, shouldNarrate]
  );
  console.log(`[hype-train] auto-started session for user ${userId} (${diff}, ${timeSec}s)`);
  return r.rows[0];
}

// ── GET /dashboard/api/hype-train/events — Scrapbot pulls qualifying events ─
router.get('/events', async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const ownerUserId = Number(req.query.owner_user_id);
    if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ ok: false, error: 'owner_user_id required' });
    }

    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30_000);

    const QUALIFYING_KINDS = [
      'channel.subscription.new', 'channel.subscription.renewal',
      'channel.subscription.gifts', 'kicks.gifted', 'tip', 'donation',
    ];

    const r = await db.query(
      `SELECT id, kind, source, ts, actor_username, payload
       FROM public.events
       WHERE user_id = $1
         AND kind = ANY($2)
         AND ts > $3
       ORDER BY ts ASC
       LIMIT 100`,
      [ownerUserId, QUALIFYING_KINDS, since.toISOString()]
    );

    res.json({ ok: true, events: r.rows });
  } catch (e) {
    console.error('[hype-train] events pull error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── GET /dashboard/api/hype-train — current session (dashboard user) ──────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await db.query(
      `SELECT * FROM public.hype_train_sessions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );
    res.json({ ok: true, session: r.rows[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── GET /dashboard/api/hype-train/session — current session (Scrapbot) ────
router.get('/session', async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const ownerUserId = Number(req.query.owner_user_id);
    if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ ok: false, error: 'owner_user_id required' });
    }

    const r = await db.query(
      `SELECT * FROM public.hype_train_sessions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [ownerUserId]
    );
    res.json({ ok: true, session: r.rows[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/hype-train/tick-bot — timer expiry check (Scrapbot)
router.post('/tick-bot', async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const ownerUserId = Number(req.body?.owner_user_id);
    if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ ok: false, error: 'owner_user_id required' });
    }

    const r = await db.query(
      `UPDATE public.hype_train_sessions SET status = 'ended', ended_at = now()
       WHERE user_id = $1 AND status = 'active' AND expires_at < now()
       RETURNING *`,
      [ownerUserId]
    );
    if (r.rows[0]) {
      await pushHypeUpdate(ownerUserId, { ...r.rows[0], status: 'ended' });
      return res.json({ ok: true, ended: true, session: r.rows[0] });
    }
    res.json({ ok: true, ended: false });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/hype-train/start — start a new hype train ─────────
router.post('/start', requireAuth, express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { difficulty, time_per_contrib_sec, tip_pts_per_unit, narrate } = req.body || {};

    // End any active session
    await db.query(
      `UPDATE public.hype_train_sessions SET status = 'ended', ended_at = now() WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    const diff = ['easy','alright','hard','insane'].includes(difficulty) ? difficulty : 'easy';
    const timeSec = Math.max(10, Math.min(300, Number(time_per_contrib_sec) || 30));
    const tipUnit = Math.max(1, Number(tip_pts_per_unit) || 5);
    const shouldNarrate = narrate !== false && narrate !== 'false';
    const ptn = pointsToNextLevel(1, diff);
    const expiresAt = new Date(Date.now() + timeSec * 1000);

    const r = await db.query(
      `INSERT INTO public.hype_train_sessions
         (user_id, difficulty, time_per_contrib_sec, tip_pts_per_unit, points_to_next, expires_at, narrate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, diff, timeSec, tipUnit, ptn, expiresAt, shouldNarrate]
    );

    const session = r.rows[0];
    await pushHypeUpdate(userId, session);
    res.json({ ok: true, session });
  } catch (e) {
    console.error('[hype-train] start error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/hype-train/end — end current session ──────────────
router.post('/end', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await db.query(
      `UPDATE public.hype_train_sessions SET status = 'ended', ended_at = now()
       WHERE user_id = $1 AND status = 'active' RETURNING *`,
      [userId]
    );
    if (r.rows[0]) await pushHypeUpdate(userId, { ...r.rows[0], status: 'ended' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/hype-train/ingest — Scrapbot contribution ─────────
router.post('/ingest', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { user_id, kind, payload, actor_username, actor_avatar, platform } = req.body || {};
    const userId = Number(user_id);
    if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, error: 'invalid_user_id' });

    // Find active session — auto-start if widget is on an overlay but no session exists
    const sr = await db.query(
      `SELECT * FROM public.hype_train_sessions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );

    let session = sr.rows[0];
    if (!session) {
      session = await autoStartSession(userId);
      if (!session) return res.json({ ok: false, error: 'no_active_session' });
      // Push initial state so widget shows up
      await pushHypeUpdate(userId, session);
    }
    const pts = getEventPoints(kind, payload, session.tip_pts_per_unit);
    if (pts <= 0) return res.json({ ok: false, error: 'no_points' });

    // Set conductor if first contributor
    const isConductor = !session.conductor_username;
    const newExpiresAt = new Date(Date.now() + session.time_per_contrib_sec * 1000);

    // Update contributors list
    const contributors = Array.isArray(session.contributors) ? session.contributors : [];
    const existingIdx = contributors.findIndex(c => c.username === actor_username && c.platform === platform);
    if (existingIdx >= 0) {
      contributors[existingIdx].points += pts;
    } else {
      contributors.push({ username: actor_username, platform: platform || 'kick', points: pts, avatar: actor_avatar || null });
    }

    // Calculate new level
    let newPoints = session.points + pts;
    let newLevel = session.level;
    let newPtn = session.points_to_next;
    let leveledUp = false;

    while (newPoints >= newPtn) {
      newPoints -= newPtn;
      newLevel++;
      newPtn = pointsToNextLevel(newLevel, session.difficulty);
      leveledUp = true;
    }

    const updatedR = await db.query(
      `UPDATE public.hype_train_sessions SET
         points = $1, level = $2, points_to_next = $3,
         total_points = total_points + $4,
         peak_level = GREATEST(peak_level, $2),
         last_contrib_at = now(), expires_at = $5,
         conductor_username = COALESCE(conductor_username, $6),
         conductor_avatar = COALESCE(conductor_avatar, $7),
         conductor_platform = COALESCE(conductor_platform, $8),
         contributors = $9::jsonb
       WHERE id = $10
       RETURNING *`,
      [newPoints, newLevel, newPtn, pts, newExpiresAt,
       actor_username, actor_avatar || null, platform || 'kick',
       JSON.stringify(contributors), session.id]
    );

    const updated = updatedR.rows[0];
    await pushHypeUpdate(userId, { ...updated, leveledUp, pts_added: pts });

    res.json({
      ok: true,
      pts_added: pts,
      level: newLevel,
      leveledUp,
      message: leveledUp
        ? `🚂 LEVEL UP! Hype Train is now Level ${newLevel}!`
        : `🚂 +${pts} hype! Level ${newLevel} (${newPoints}/${newPtn})`
    });
  } catch (e) {
    console.error('[hype-train] ingest error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/hype-train/tick — called by server to expire timer ─
// This is called by the SSE polling loop to check if the timer has expired
router.post('/tick', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await db.query(
      `UPDATE public.hype_train_sessions SET status = 'ended', ended_at = now()
       WHERE user_id = $1 AND status = 'active' AND expires_at < now()
       RETURNING *`,
      [userId]
    );
    if (r.rows[0]) {
      await pushHypeUpdate(userId, { ...r.rows[0], status: 'ended' });
      return res.json({ ok: true, ended: true });
    }
    res.json({ ok: true, ended: false });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
