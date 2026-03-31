// routes/profileAnalyticsApi.js
// POST /api/profile/track/view  — record a profile page view
// POST /api/profile/track/click — record a button/link click

import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + process.env.SESSION_SECRET || 'salt').digest('hex').slice(0, 16);
}

async function resolveUserId(username) {
  const { rows } = await db.query(
    'SELECT id FROM users WHERE username = $1 LIMIT 1',
    [username]
  );
  return rows[0]?.id || null;
}

// POST /api/profile/track/view
router.post('/api/profile/track/view', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const { username, referrer } = req.body || {};
    if (!username) return res.status(400).json({ ok: false });

    const userId = await resolveUserId(username);
    if (!userId) return res.status(404).json({ ok: false });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const ipHash = hashIp(ip);

    await db.query(
      `INSERT INTO public.profile_views (user_id, referrer, ip_hash)
       VALUES ($1, $2, $3)`,
      [userId, referrer?.slice(0, 500) || null, ipHash]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileAnalytics] view error:', err.message);
    return res.status(500).json({ ok: false });
  }
});

// POST /api/profile/track/click
router.post('/api/profile/track/click', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const { username, elementType, elementId, elementLabel } = req.body || {};
    if (!username || !elementType) return res.status(400).json({ ok: false });

    const userId = await resolveUserId(username);
    if (!userId) return res.status(404).json({ ok: false });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const ipHash = hashIp(ip);

    await db.query(
      `INSERT INTO public.profile_clicks (user_id, element_type, element_id, element_label, ip_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, elementType, elementId || null, elementLabel?.slice(0, 100) || null, ipHash]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[profileAnalytics] click error:', err.message);
    return res.status(500).json({ ok: false });
  }
});

export default router;
