// routes/highlightSettingsApi.js
// API for managing per-channel highlight detection settings

import express from 'express';
import db from '../db.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

/**
 * GET /api/highlight-settings
 * Get highlight detection setting for a channel
 */
router.get('/api/highlight-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const platform = req.query.platform || 'kick';
    const channelSlug = req.query.channel_slug;

    if (!channelSlug) {
      return res.status(400).json({ ok: false, error: 'channel_slug_required' });
    }

    const { rows } = await db.query(
      `SELECT highlight_detection_enabled 
       FROM public.channel_highlight_settings
       WHERE user_id = $1 AND platform = $2 AND channel_slug = $3`,
      [userId, platform, channelSlug.toLowerCase().trim()]
    );

    // Default to enabled if no setting exists
    const enabled = rows.length > 0 ? rows[0].highlight_detection_enabled : true;

    res.json({ ok: true, enabled });
  } catch (err) {
    console.error('[highlightSettings] GET failed:', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /api/highlight-settings
 * Update highlight detection setting for a channel
 */
router.post('/api/highlight-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { platform = 'kick', channel_slug, enabled } = req.body;

    if (!channel_slug) {
      return res.status(400).json({ ok: false, error: 'channel_slug_required' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enabled_must_be_boolean' });
    }

    await db.query(
      `INSERT INTO public.channel_highlight_settings 
         (user_id, platform, channel_slug, highlight_detection_enabled, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, platform, channel_slug)
       DO UPDATE SET 
         highlight_detection_enabled = $4,
         updated_at = NOW()`,
      [userId, platform, channel_slug.toLowerCase().trim(), enabled]
    );

    console.log(`[highlightSettings] ${enabled ? 'Enabled' : 'Disabled'} for ${platform}/${channel_slug} (user ${userId})`);

    res.json({ ok: true, enabled });
  } catch (err) {
    console.error('[highlightSettings] POST failed:', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

export default router;
