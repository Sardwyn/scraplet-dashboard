// routes/api/marketplace.js
// Overlay marketplace — publish, browse, purchase

import express from 'express';
import requireAuth from '../../utils/requireAuth.js';
import db from '../../db.js';
import { portOverlayAssets } from '../../src/marketplace/assetPortability.js';

const router = express.Router();

// ── GET /dashboard/api/marketplace/my-listings ───────────────────────────────
router.get('/dashboard/api/marketplace/my-listings', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { rows } = await db.query(`
    SELECT m.*, o.name as overlay_name, o.public_id as overlay_public_id
    FROM marketplace_overlays m
    JOIN overlays o ON o.id = m.overlay_id
    WHERE m.user_id = $1
    ORDER BY m.created_at DESC
  `, [userId]).catch(() => ({ rows: [] }));
  res.json({ ok: true, listings: rows });
});

// ── POST /dashboard/api/marketplace/publish ──────────────────────────────────
// Step 1: Scan assets and return list for user confirmation
router.post('/dashboard/api/marketplace/publish', requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { overlayId, title, description, priceCents = 0 } = req.body || {};

    if (!overlayId || !title) return res.status(400).json({ ok: false, error: 'overlayId and title required' });

    // Fetch overlay
    const { rows: [overlay] } = await db.query(
      `SELECT id, config_json, name FROM overlays WHERE id = $1 AND user_id = $2`,
      [overlayId, userId]
    );
    if (!overlay) return res.status(404).json({ ok: false, error: 'Overlay not found' });

    // Scan for user assets
    const { findUserAssetPaths } = await import('../../src/marketplace/assetPortability.js');
    const assetPaths = Array.from(findUserAssetPaths(overlay.config_json));

    // Return asset list for confirmation — don't port yet
    res.json({
      ok: true,
      overlayId,
      title,
      description,
      priceCents,
      assetPaths,
      requiresConfirmation: assetPaths.length > 0,
    });
  } catch (err) {
    console.error('[marketplace] publish scan error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /dashboard/api/marketplace/publish/confirm ──────────────────────────
// Step 2: User confirmed asset rights — port assets and create listing
router.post('/dashboard/api/marketplace/publish/confirm', requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { overlayId, title, description, priceCents = 0 } = req.body || {};

    if (!overlayId || !title) return res.status(400).json({ ok: false, error: 'overlayId and title required' });

    const { rows: [overlay] } = await db.query(
      `SELECT id, config_json FROM overlays WHERE id = $1 AND user_id = $2`,
      [overlayId, userId]
    );
    if (!overlay) return res.status(404).json({ ok: false, error: 'Overlay not found' });

    // Port assets
    const { portedConfig, missing } = await portOverlayAssets(overlay.config_json, userId);

    if (missing.length > 0) {
      console.warn('[marketplace] missing assets during publish:', missing);
    }

    // Create or update listing
    const { rows: [listing] } = await db.query(`
      INSERT INTO marketplace_overlays (user_id, overlay_id, title, description, price_cents, snapshot_config, asset_confirmed, status, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, 'published', NOW())
      ON CONFLICT (overlay_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        price_cents = EXCLUDED.price_cents,
        snapshot_config = EXCLUDED.snapshot_config,
        asset_confirmed = true,
        status = 'published',
        published_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `, [userId, overlayId, title, description || null, priceCents, JSON.stringify(portedConfig)]);

    res.json({ ok: true, listingId: listing.id });
  } catch (err) {
    console.error('[marketplace] publish confirm error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/marketplace ─────────────────────────────────────────────────────
// Public browse
router.get('/api/marketplace', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.id, m.title, m.description, m.price_cents, m.published_at,
             u.username as creator_username,
             o.public_id as overlay_public_id
      FROM marketplace_overlays m
      JOIN users u ON u.id = m.user_id
      JOIN overlays o ON o.id = m.overlay_id
      WHERE m.status = 'published'
      ORDER BY m.published_at DESC
      LIMIT 50
    `);
    res.json({ ok: true, listings: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
