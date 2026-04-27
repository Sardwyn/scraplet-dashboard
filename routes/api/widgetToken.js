// routes/api/widgetToken.js
// GET /dashboard/api/widget-token?widgetId=chat&overlayId=xxx
// Returns a JWT token for the authenticated user + widgetId
// Used by the overlay runtime to mint tokens for widget elements

import express from 'express';
import { mintWidgetToken } from '../../utils/widgetTokens.js';
import requireAuth from '../../utils/requireAuth.js';

const router = express.Router();

router.get('/dashboard/api/widget-token', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const widgetId = String(req.query.widgetId || '').trim();

    if (!widgetId) return res.status(400).json({ ok: false, error: 'widgetId required' });

    const token = mintWidgetToken({ userId, widgetId, ttlSec: 60 * 60 * 24 * 7 }); // 7 days
    return res.json({ ok: true, token, widgetId });
  } catch (err) {
    console.error('[widgetToken] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Public endpoint for overlay runtime (uses overlay public ID to resolve user)
// Also mounted under /dashboard/api/ since nginx routes /api/ to scrapbot
router.get('/dashboard/api/widget-token/public', async (req, res) => {
  return widgetTokenPublicHandler(req, res);
});
router.get('/api/widget-token/public', async (req, res) => {
  return widgetTokenPublicHandler(req, res);
});
async function widgetTokenPublicHandler(req, res) {
  try {
    const { widgetId, overlayPublicId } = req.query;
    if (!widgetId || !overlayPublicId) return res.status(400).json({ ok: false });

    // Resolve user from overlay public ID
    const db = (await import('../../db.js')).default;
    const { rows } = await db.query(
      `SELECT user_id FROM overlays WHERE public_id = $1 LIMIT 1`,
      [overlayPublicId]
    );
    if (!rows.length) return res.status(404).json({ ok: false });

    const token = mintWidgetToken({ userId: rows[0].user_id, widgetId, ttlSec: 60 * 60 * 24 });
    return res.json({ ok: true, token, widgetId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default router;
