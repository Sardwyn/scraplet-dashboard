// routes/mediaRequestsApi.js
// Media Request Queue — REST API + SSE push

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

function getUserId(req) { return req?.session?.user?.id ?? null; }

// ── Helpers ────────────────────────────────────────────────────────────────

async function getSettings(userId) {
  const r = await db.query(
    `SELECT * FROM public.media_request_settings WHERE user_id = $1`, [userId]
  );
  return r.rows[0] || {
    user_id: userId, enabled: true, command: '!sr', max_per_user: 3,
    allow_duplicates: false, require_follow: false,
    allow_types: ['song','video','custom'], max_queue_size: 50, cooldown_sec: 30
  };
}

async function pushQueueUpdate(userId) {
  // Push a queue.update event into public.events so SSE picks it up
  const queue = await getQueue(userId);
  await db.query(
    `INSERT INTO public.events (id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload, user_id)
     VALUES ($1, 1, 'system', 'queue.update', now(), 'system', null, null, $2::jsonb, $3)`,
    [
      'qup_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      JSON.stringify({ queue }),
      userId
    ]
  );
}

async function getQueue(userId) {
  const r = await db.query(
    `SELECT id, requester, platform, request_type, title, artist, url, status, votes, position, notes, requested_at
     FROM public.media_requests
     WHERE user_id = $1 AND status IN ('pending','playing')
     ORDER BY CASE WHEN status = 'playing' THEN 0 ELSE 1 END, position ASC NULLS LAST, votes DESC, requested_at ASC
     LIMIT 50`,
    [userId]
  );
  return r.rows;
}

// ── GET /dashboard/api/media-requests ─────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const status = req.query.status || 'active'; // 'active' | 'history' | 'all'
    
    let statusFilter = `status IN ('pending','playing')`;
    if (status === 'history') statusFilter = `status IN ('played','skipped','rejected')`;
    if (status === 'all') statusFilter = `status != 'deleted'`;

    const r = await db.query(
      `SELECT id, requester, platform, request_type, title, artist, url, status, votes, position, notes, requested_at, played_at
       FROM public.media_requests
       WHERE user_id = $1 AND ${statusFilter}
       ORDER BY CASE WHEN status = 'playing' THEN 0 ELSE 1 END, position ASC NULLS LAST, votes DESC, requested_at ASC
       LIMIT 100`,
      [userId]
    );
    const settings = await getSettings(userId);
    res.json({ ok: true, queue: r.rows, settings });
  } catch (e) {
    console.error('[media-requests] GET error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/media-requests — add to queue (dashboard or bot) ──
router.post('/', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { requester, platform, request_type, title, artist, url, notes } = req.body || {};

    if (!title?.trim()) return res.status(400).json({ ok: false, error: 'title_required' });

    const settings = await getSettings(userId);
    if (!settings.enabled) return res.status(403).json({ ok: false, error: 'queue_disabled' });

    // Check queue size
    const countR = await db.query(
      `SELECT COUNT(*) FROM public.media_requests WHERE user_id = $1 AND status IN ('pending','playing')`,
      [userId]
    );
    if (parseInt(countR.rows[0].count) >= settings.max_queue_size) {
      return res.status(429).json({ ok: false, error: 'queue_full' });
    }

    // Check per-user limit
    if (requester) {
      const userCountR = await db.query(
        `SELECT COUNT(*) FROM public.media_requests WHERE user_id = $1 AND requester = $2 AND status = 'pending'`,
        [userId, requester]
      );
      if (parseInt(userCountR.rows[0].count) >= settings.max_per_user) {
        return res.status(429).json({ ok: false, error: 'user_limit_reached' });
      }
    }

    // Check duplicates
    if (!settings.allow_duplicates && title) {
      const dupR = await db.query(
        `SELECT id FROM public.media_requests WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND status IN ('pending','playing')`,
        [userId, title]
      );
      if (dupR.rows.length > 0) {
        return res.status(409).json({ ok: false, error: 'duplicate_request' });
      }
    }

    // Get next position
    const posR = await db.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM public.media_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    const position = posR.rows[0].next_pos;

    const r = await db.query(
      `INSERT INTO public.media_requests (user_id, requester, platform, request_type, title, artist, url, notes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, requester, position`,
      [userId, requester || 'Dashboard', platform || 'kick', request_type || 'song',
       title.trim(), artist?.trim() || null, url?.trim() || null, notes?.trim() || null, position]
    );

    await pushQueueUpdate(userId);
    res.json({ ok: true, request: r.rows[0] });
  } catch (e) {
    console.error('[media-requests] POST error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── PATCH /dashboard/api/media-requests/:id — update status/position ──────
router.patch('/:id', requireAuth, express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const { status, position, notes } = req.body || {};

    const allowed = ['pending','playing','played','rejected','skipped'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ ok: false, error: 'invalid_status' });
    }

    const updates = [];
    const vals = [id, userId];
    if (status) {
      updates.push(`status = $${vals.length + 1}`);
      vals.push(status);
      if (status === 'played' || status === 'skipped') {
        updates.push(`played_at = now()`);
      }
      if (status === 'playing') {
        // Mark any currently playing as played
        await db.query(
          `UPDATE public.media_requests SET status = 'played', played_at = now() WHERE user_id = $1 AND status = 'playing'`,
          [userId]
        );
      }
    }
    if (position !== undefined) {
      updates.push(`position = $${vals.length + 1}`);
      vals.push(position);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${vals.length + 1}`);
      vals.push(notes);
    }

    if (!updates.length) return res.status(400).json({ ok: false, error: 'nothing_to_update' });

    await db.query(
      `UPDATE public.media_requests SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2`,
      vals
    );

    await pushQueueUpdate(userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[media-requests] PATCH error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── DELETE /dashboard/api/media-requests/:id ──────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    await db.query(
      `DELETE FROM public.media_requests WHERE id = $1 AND user_id = $2`, [id, userId]
    );
    await pushQueueUpdate(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── DELETE /dashboard/api/media-requests — clear queue ────────────────────
router.delete('/', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status } = req.query;
    const filter = status === 'all' ? '' : `AND status IN ('pending','playing')`;
    await db.query(
      `DELETE FROM public.media_requests WHERE user_id = $1 ${filter}`, [userId]
    );
    await pushQueueUpdate(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/media-requests/:id/vote ───────────────────────────
router.post('/:id/vote', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { voter, platform } = req.body || {};
    if (!voter) return res.status(400).json({ ok: false, error: 'voter_required' });

    // Upsert vote (dedup)
    await db.query(
      `INSERT INTO public.media_request_votes (request_id, voter, platform) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [id, voter, platform || 'kick']
    );

    // Update vote count
    const r = await db.query(
      `UPDATE public.media_requests SET votes = (SELECT COUNT(*) FROM public.media_request_votes WHERE request_id = $1) WHERE id = $1 RETURNING user_id, votes`,
      [id]
    );
    if (r.rows[0]) await pushQueueUpdate(r.rows[0].user_id);
    res.json({ ok: true, votes: r.rows[0]?.votes || 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── GET/PUT /dashboard/api/media-requests/settings ────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    res.json({ ok: true, settings: await getSettings(userId) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.put('/settings', requireAuth, express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { enabled, command, max_per_user, allow_duplicates, require_follow, allow_types, max_queue_size, cooldown_sec } = req.body || {};
    await db.query(
      `INSERT INTO public.media_request_settings (user_id, enabled, command, max_per_user, allow_duplicates, require_follow, allow_types, max_queue_size, cooldown_sec, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, command = EXCLUDED.command,
         max_per_user = EXCLUDED.max_per_user, allow_duplicates = EXCLUDED.allow_duplicates,
         require_follow = EXCLUDED.require_follow, allow_types = EXCLUDED.allow_types,
         max_queue_size = EXCLUDED.max_queue_size, cooldown_sec = EXCLUDED.cooldown_sec,
         updated_at = now()`,
      [userId, enabled ?? true, command || '!sr', max_per_user ?? 3,
       allow_duplicates ?? false, require_follow ?? false,
       allow_types || ['song','video','custom'], max_queue_size ?? 50, cooldown_sec ?? 30]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Scrapbot ingest endpoint (no auth — uses bot token) ───────────────────
router.post('/ingest', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { user_id, requester, platform, request_type, title, artist, url } = req.body || {};
    const userId = Number(user_id);
    if (!Number.isFinite(userId) || !title?.trim()) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }

    const settings = await getSettings(userId);
    if (!settings.enabled) return res.json({ ok: false, error: 'queue_disabled' });

    // Per-user cooldown check
    const cooldownR = await db.query(
      `SELECT requested_at FROM public.media_requests
       WHERE user_id = $1 AND requester = $2 AND requested_at > now() - ($3 || ' seconds')::interval
       ORDER BY requested_at DESC LIMIT 1`,
      [userId, requester, settings.cooldown_sec]
    );
    if (cooldownR.rows.length > 0) {
      return res.json({ ok: false, error: 'cooldown', message: `Please wait before requesting again.` });
    }

    // Per-user limit
    const userCountR = await db.query(
      `SELECT COUNT(*) FROM public.media_requests WHERE user_id = $1 AND requester = $2 AND status = 'pending'`,
      [userId, requester]
    );
    if (parseInt(userCountR.rows[0].count) >= settings.max_per_user) {
      return res.json({ ok: false, error: 'user_limit_reached', message: `You already have ${settings.max_per_user} requests in the queue.` });
    }

    // Queue size
    const countR = await db.query(
      `SELECT COUNT(*) FROM public.media_requests WHERE user_id = $1 AND status IN ('pending','playing')`,
      [userId]
    );
    if (parseInt(countR.rows[0].count) >= settings.max_queue_size) {
      return res.json({ ok: false, error: 'queue_full', message: 'The queue is full right now.' });
    }

    // Duplicate check
    if (!settings.allow_duplicates) {
      const dupR = await db.query(
        `SELECT id FROM public.media_requests WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND status IN ('pending','playing')`,
        [userId, title]
      );
      if (dupR.rows.length > 0) {
        return res.json({ ok: false, error: 'duplicate_request', message: 'That song is already in the queue.' });
      }
    }

    const posR = await db.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM public.media_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    await db.query(
      `INSERT INTO public.media_requests (user_id, requester, platform, request_type, title, artist, url, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, requester, platform || 'kick', request_type || 'song',
       title.trim(), artist?.trim() || null, url?.trim() || null, posR.rows[0].next_pos]
    );

    await pushQueueUpdate(userId);
    res.json({ ok: true, message: `Added "${title}" to the queue at position ${posR.rows[0].next_pos}!` });
  } catch (e) {
    console.error('[media-requests] ingest error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
