// routes/contentPacksApi.js
// GET /dashboard/api/content-packs — list content packs for auth user
// GET /dashboard/api/content-packs/:id — get single pack

import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

router.get('/dashboard/api/content-packs', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await db.query(
      `SELECT pack_id, session_id, status, created_at, approved_at,
              posted_twitter_url, youtube_draft_id,
              discord_recap
       FROM content_packs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    return res.json({ ok: true, packs: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard/api/content-packs/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await db.query(
      `SELECT * FROM content_packs WHERE pack_id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false });
    const pack = rows[0];
    pack.twitter_thread = JSON.parse(pack.twitter_thread || '[]');
    pack.shorts_script = JSON.parse(pack.shorts_script || '{}');
    return res.json({ ok: true, pack });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
