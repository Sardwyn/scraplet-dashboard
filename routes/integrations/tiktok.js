import express from 'express';
import db from '../../db.js';
import requireAuth from '../../utils/requireAuth.js';
import { startTikTokIngest } from '../../services/tiktokChatIngest.js';

const router = express.Router();

function isProUser(sessionUser) {
  if (!sessionUser) return false;
  const plan = sessionUser.plan || sessionUser.subscription_plan || "";
  return plan === "pro" || plan === "PRO" || plan === "Premium";
}

/**
 * GET /integrations/tiktok/connect
 * Renders the beautiful custom EJS settings page for TikTok.
 */
router.get('/integrations/tiktok/connect', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const { rows } = await db.query(
      `SELECT * FROM external_accounts WHERE user_id = $1 AND platform = 'tiktok' LIMIT 1`,
      [userId]
    );

    const tiktok = rows[0] || null;

    res.render('layout', {
      tabView: 'integrations/tiktok',
      currentPage: 'dashboard',
      user: req.session.user,
      tiktok,
      isPro: isProUser(req.session.user)
    });
  } catch (err) {
    console.error('[integrations/tiktok/connect] error:', err);
    res.status(500).render('500');
  }
});

/**
 * POST /dashboard/tiktok/save
 * Creates/updates the user's TikTok public unique ID (username) and enables/disables ingest.
 */
router.post('/dashboard/tiktok/save', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const uniqueId = String(req.body.unique_id || '').replace(/^@/, '').trim();
  const enabled = req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true;

  if (!uniqueId) {
    return res.status(400).send('TikTok username (Unique ID) is required');
  }

  try {
    await db.query(
      `INSERT INTO external_accounts (platform, external_user_id, username, user_id, unique_id, enabled)
       VALUES ('tiktok', $1, $2, $3, $4, $5)
       ON CONFLICT (user_id, platform)
       DO UPDATE SET
         external_user_id = EXCLUDED.external_user_id,
         username = EXCLUDED.username,
         unique_id = EXCLUDED.unique_id,
         enabled = EXCLUDED.enabled,
         updated_at = now()`,
      [uniqueId, uniqueId, userId, uniqueId, enabled]
    );

    // Call standard ingest helper to apply background connection changes (start/stop) immediately
    await startTikTokIngest(userId);

    console.log('[integrations/tiktok] saved connection details:', { userId, uniqueId, enabled });
    res.redirect('/dashboard?tiktok=connected');
  } catch (err) {
    console.error('[integrations/tiktok/save] error:', err);
    res.status(500).render('500');
  }
});

/**
 * POST /api/integrations/tiktok/disconnect
 * Disconnects and unlinks the TikTok integration completely.
 */
router.post('/api/integrations/tiktok/disconnect', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  try {
    await db.query(
      `DELETE FROM external_accounts WHERE platform = 'tiktok' AND user_id = $1`,
      [userId]
    );

    // Stop ingest scraper instantly
    await startTikTokIngest(userId);

    console.log('[integrations/tiktok] disconnected completely:', { userId });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[integrations/tiktok/disconnect] error:', err);
    res.status(500).render('500');
  }
});

export default router;
