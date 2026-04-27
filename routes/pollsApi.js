// routes/pollsApi.js
// Poll/Vote system — REST API + Kick native poll sync + SSE push

import express from 'express';
import fetch from 'node-fetch';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import { getKickUserAccessToken } from '../services/kickUserTokens.js';

const router = express.Router();
const KICK_BASE = 'https://kick.com';

function getUserId(req) { return req?.session?.user?.id ?? null; }

// ── Helpers ────────────────────────────────────────────────────────────────

async function pushPollUpdate(userId, poll) {
  await db.query(
    `INSERT INTO public.events (id, v, source, kind, ts, channel_slug, actor_id, actor_username, payload, user_id)
     VALUES ($1, 1, 'system', 'poll.update', now(), 'system', null, null, $2::jsonb, $3)`,
    [
      'poll_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      JSON.stringify({ poll }),
      userId
    ]
  );
}

async function getChannelSlug(userId) {
  const r = await db.query(
    `SELECT c.channel_slug FROM public.channels c
     JOIN public.external_accounts ea ON ea.id = c.account_id
     WHERE ea.user_id = $1 AND c.platform = 'kick' LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.channel_slug || null;
}

async function syncToKick(userId, channelSlug, title, options, durationSec) {
  try {
    const token = await getKickUserAccessToken(userId);
    if (!token) return null;

    const body = {
      title,
      options: options.map(o => ({ label: o.text })),
      duration: durationSec
    };

    const res = await fetch(`${KICK_BASE}/api/v2/channels/${channelSlug}/polls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[polls] Kick poll created:', data?.id);
      return data?.id || null;
    } else {
      const txt = await res.text();
      console.warn('[polls] Kick poll create failed:', res.status, txt.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.warn('[polls] Kick sync error:', e.message);
    return null;
  }
}

async function endKickPoll(userId, channelSlug) {
  try {
    const token = await getKickUserAccessToken(userId);
    if (!token) return;
    await fetch(`${KICK_BASE}/api/v2/channels/${channelSlug}/polls`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
  } catch (e) {
    console.warn('[polls] Kick end poll error:', e.message);
  }
}

// ── GET /dashboard/api/polls — get active/recent polls ────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await db.query(
      `SELECT id, title, options, status, duration_sec, platforms, started_at, ends_at, ended_at, winner_id
       FROM public.polls WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    res.json({ ok: true, polls: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/polls — create poll ────────────────────────────────
router.post('/', requireAuth, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, options, duration_sec, platforms, sync_kick } = req.body || {};

    if (!title?.trim()) return res.status(400).json({ ok: false, error: 'title_required' });
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ ok: false, error: 'min_2_options' });
    }
    if (options.length > 8) return res.status(400).json({ ok: false, error: 'max_8_options' });

    const dur = Math.max(10, Math.min(600, Number(duration_sec) || 60));
    const endsAt = new Date(Date.now() + dur * 1000);

    // End any active poll first
    await db.query(
      `UPDATE public.polls SET status = 'ended', ended_at = now() WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    const opts = options.map((o, i) => ({
      id: i + 1,
      text: String(o.text || o).trim().slice(0, 80),
      votes: 0
    }));

    const r = await db.query(
      `INSERT INTO public.polls (user_id, title, options, duration_sec, platforms, ends_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING id, title, options, status, duration_sec, platforms, started_at, ends_at`,
      [userId, title.trim(), JSON.stringify(opts), dur,
       platforms || ['kick','youtube','twitch'], endsAt]
    );

    const poll = r.rows[0];

    // Sync to Kick native poll if requested
    if (sync_kick !== false) {
      const channelSlug = await getChannelSlug(userId);
      if (channelSlug) {
        const kickId = await syncToKick(userId, channelSlug, title, opts, dur);
        if (kickId) {
          await db.query(`UPDATE public.polls SET kick_poll_id = $1 WHERE id = $2`, [kickId, poll.id]);
          poll.kick_poll_id = kickId;
        }
      }
    }

    await pushPollUpdate(userId, poll);

    // Auto-end after duration
    setTimeout(async () => {
      try {
        const pr = await db.query(
          `UPDATE public.polls SET status = 'ended', ended_at = now()
           WHERE id = $1 AND status = 'active' RETURNING *`,
          [poll.id]
        );
        if (pr.rows[0]) {
          const ended = pr.rows[0];
          // Find winner
          const opts = ended.options || [];
          const winner = opts.reduce((a, b) => (b.votes > a.votes ? b : a), opts[0]);
          if (winner) {
            await db.query(`UPDATE public.polls SET winner_id = $1 WHERE id = $2`, [winner.id, poll.id]);
            ended.winner_id = winner.id;
          }
          await pushPollUpdate(userId, { ...ended, status: 'ended' });
          // End Kick poll too
          const slug = await getChannelSlug(userId);
          if (slug) await endKickPoll(userId, slug);
        }
      } catch (e) {
        console.warn('[polls] auto-end error:', e.message);
      }
    }, dur * 1000 + 500);

    res.json({ ok: true, poll });
  } catch (e) {
    console.error('[polls] POST error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── DELETE /dashboard/api/polls/:id — end poll ────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const r = await db.query(
      `UPDATE public.polls SET status = 'ended', ended_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    if (r.rows[0]) {
      await pushPollUpdate(userId, r.rows[0]);
      const slug = await getChannelSlug(userId);
      if (slug) await endKickPoll(userId, slug);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/polls/:id/vote — cast vote (chat/dashboard) ───────
router.post('/:id/vote', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { voter, platform, option_id } = req.body || {};
    if (!voter || !option_id) return res.status(400).json({ ok: false, error: 'voter_and_option_required' });

    // Check poll is active
    const pr = await db.query(
      `SELECT id, user_id, options, status FROM public.polls WHERE id = $1`, [id]
    );
    if (!pr.rows[0] || pr.rows[0].status !== 'active') {
      return res.json({ ok: false, error: 'poll_not_active' });
    }

    const poll = pr.rows[0];

    // Upsert vote (dedup — one vote per viewer, can change)
    await db.query(
      `INSERT INTO public.poll_votes (poll_id, voter, platform, option_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (poll_id, voter, platform) DO UPDATE SET option_id = $4, voted_at = now()`,
      [id, voter, platform || 'kick', option_id]
    );

    // Recount all votes from poll_votes table
    const vcR = await db.query(
      `SELECT option_id, COUNT(*) as cnt FROM public.poll_votes WHERE poll_id = $1 GROUP BY option_id`,
      [id]
    );
    const counts = {};
    vcR.rows.forEach(r => { counts[r.option_id] = parseInt(r.cnt); });

    const updatedOptions = (poll.options || []).map(o => ({
      ...o,
      votes: counts[o.id] || 0
    }));

    await db.query(
      `UPDATE public.polls SET options = $1::jsonb WHERE id = $2`,
      [JSON.stringify(updatedOptions), id]
    );

    await pushPollUpdate(poll.user_id, { ...poll, options: updatedOptions });
    res.json({ ok: true });
  } catch (e) {
    console.error('[polls] vote error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── POST /dashboard/api/polls/ingest — Scrapbot chat vote ─────────────────
router.post('/ingest', express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const botToken = String(req.get('X-Scrapbot-Token') || '').trim();
    const expected = String(process.env.SCRAPBOT_EVENT_TOKEN || '').trim();
    if (!expected || botToken !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { user_id, voter, platform, option_id, option_text } = req.body || {};
    const userId = Number(user_id);
    if (!Number.isFinite(userId) || !voter) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }

    // Find active poll for this user
    const pr = await db.query(
      `SELECT id, options FROM public.polls WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (!pr.rows[0]) return res.json({ ok: false, error: 'no_active_poll' });

    const poll = pr.rows[0];
    let optId = parseInt(option_id);

    // Allow voting by text match if option_id not provided
    if (!optId && option_text) {
      const match = (poll.options || []).find(o =>
        o.text.toLowerCase().startsWith(option_text.toLowerCase().trim())
      );
      if (match) optId = match.id;
    }

    if (!optId) return res.json({ ok: false, error: 'invalid_option' });

    // Delegate to vote handler
    req.params = { id: poll.id };
    req.body = { voter, platform: platform || 'kick', option_id: optId };

    // Inline vote logic
    await db.query(
      `INSERT INTO public.poll_votes (poll_id, voter, platform, option_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (poll_id, voter, platform) DO UPDATE SET option_id = $4, voted_at = now()`,
      [poll.id, voter, platform || 'kick', optId]
    );

    const vcR = await db.query(
      `SELECT option_id, COUNT(*) as cnt FROM public.poll_votes WHERE poll_id = $1 GROUP BY option_id`,
      [poll.id]
    );
    const counts = {};
    vcR.rows.forEach(r => { counts[r.option_id] = parseInt(r.cnt); });
    const updatedOptions = (poll.options || []).map(o => ({ ...o, votes: counts[o.id] || 0 }));
    await db.query(`UPDATE public.polls SET options = $1::jsonb WHERE id = $2`, [JSON.stringify(updatedOptions), poll.id]);
    await pushPollUpdate(userId, { ...poll, options: updatedOptions });

    const option = updatedOptions.find(o => o.id === optId);
    res.json({ ok: true, message: `Vote recorded for "${option?.text}"!` });
  } catch (e) {
    console.error('[polls] ingest error', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default router;
