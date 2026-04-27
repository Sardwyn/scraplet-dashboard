// routes/marketplace.js
import express from 'express';
import crypto from 'crypto';
import requireAuth from '../utils/requireAuth.js';
import db from '../db.js';

const router = express.Router();

// GET /marketplace — public browse page
router.get('/dashboard/marketplace', async (req, res, next) => {
  try {
    const { rows: listings } = await db.query(`
      SELECT m.id, m.title, m.description, m.price_cents, m.published_at,
             u.username as creator_username,
             o.public_id as overlay_public_id
      FROM marketplace_overlays m
      JOIN users u ON u.id = m.user_id
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.status = 'published'
      ORDER BY m.published_at DESC
      LIMIT 100
    `).catch(() => ({ rows: [] }));

    res.render('layout', {
      tabView: 'marketplace',
    currentPage: "marketplace",
    currentPage: "marketplace",
      user: req.session?.user || null,
      listings,
    });
  } catch (err) { next(err); }
});

// POST /dashboard/api/marketplace/acquire/:listingId
// Clone a free overlay into the buyer's account
router.post('/dashboard/api/marketplace/acquire/:listingId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const listingId = Number(req.params.listingId);

    const { rows: [listing] } = await db.query(`
      SELECT m.*, o.name as overlay_name
      FROM marketplace_overlays m
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.id = $1 AND m.status = 'published'
    `, [listingId]);

    if (!listing) return res.status(404).json({ ok: false, error: 'Listing not found' });
    if (listing.price_cents > 0) return res.status(402).json({ ok: false, error: 'Paid overlays require checkout' });

    // Clone overlay into buyer's account
    const publicId = crypto.randomBytes(12).toString('hex');
    const slug = 'marketplace-' + listing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
    const name = listing.title + ' (from marketplace)';
    const config = listing.snapshot_config || {};

    const { rows: [newOverlay] } = await db.query(`
      INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type)
      VALUES ($1, $2, $3, $4, $5, 'overlay')
      RETURNING id, public_id
    `, [userId, slug, name, publicId, JSON.stringify(config)]);

    res.json({ ok: true, overlayId: newOverlay.id, publicId: newOverlay.public_id, editUrl: '/dashboard/overlays/' + newOverlay.id + '/edit' });
  } catch (err) {
    console.error('[marketplace] acquire error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
