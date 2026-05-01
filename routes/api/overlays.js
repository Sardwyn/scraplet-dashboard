// routes/api/overlays.js
import express from "express";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";
import { overlayGate } from '../../services/overlayGate.js';
import { generateOverlayThumbnail } from '../../services/overlayScreenshotter.js';
import crypto from 'crypto';

const router = express.Router();


// GET /dashboard/api/overlays/:id
router.get("/overlays/:id", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);

    const { rows } = await db.query(
      `SELECT id, name, slug, public_id, config_json
       FROM overlays
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.sendStatus(404);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});


// PUT /dashboard/api/overlays/:id
router.put("/overlays/:id", requireAuth, express.json(), async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);
    const { name, slug, config_json } = req.body;

    const { rowCount, rows } = await db.query(
      `UPDATE overlays
       SET name = $1,
           slug = $2,
           config_json = $3,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, name, slug, public_id, config_json`,
      [name, slug, config_json, id, userId]
    );

    if (!rowCount) return res.sendStatus(404);

    // Respond immediately — thumbnail generation is fire-and-forget
    res.json(rows[0]);

    // Queue thumbnail screenshot in background (non-blocking)
    generateOverlayThumbnail(id, rows[0].public_id);
  } catch (err) {
    next(err);
  }
});


// ===== Overlay Versioning =====

// GET /dashboard/api/overlays/:id/versions
router.get("/overlays/:id/versions", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    const { rows: owned } = await db.query('SELECT id FROM overlays WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!owned.length) return res.sendStatus(404);
    const { rows } = await db.query(
      'SELECT id, version_name, created_at FROM overlay_versions WHERE overlay_id = $1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /dashboard/api/overlays/:id/versions
router.post("/overlays/:id/versions", requireAuth, express.json(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    const { version_name } = req.body;
    if (!version_name?.trim()) return res.status(400).json({ error: 'version_name required' });
    const { rows: owned } = await db.query('SELECT config_json FROM overlays WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!owned.length) return res.sendStatus(404);
    const { rows } = await db.query(
      'INSERT INTO overlay_versions (overlay_id, version_name, config_json) VALUES ($1, $2, $3) RETURNING id, version_name, created_at',
      [id, version_name.trim(), owned[0].config_json]
    );
    // Enforce 20-version cap — delete oldest beyond limit
    await db.query(
      `DELETE FROM overlay_versions WHERE overlay_id = $1 AND id NOT IN (
        SELECT id FROM overlay_versions WHERE overlay_id = $1 ORDER BY created_at DESC LIMIT 20
      )`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /dashboard/api/overlays/:id/versions/:versionId/restore
router.post("/overlays/:id/versions/:versionId/restore", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    const { rows: owned } = await db.query('SELECT config_json FROM overlays WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!owned.length) return res.sendStatus(404);
    const { rows: ver } = await db.query('SELECT config_json FROM overlay_versions WHERE id = $1 AND overlay_id = $2', [versionId, id]);
    if (!ver.length) return res.sendStatus(404);
    // Save current state as a pre-rollback snapshot
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await db.query(
      'INSERT INTO overlay_versions (overlay_id, version_name, config_json) VALUES ($1, $2, $3)',
      [id, `Before rollback ${ts}`, owned[0].config_json]
    );
    // Restore
    await db.query('UPDATE overlays SET config_json = $1, updated_at = NOW() WHERE id = $2', [ver[0].config_json, id]);
    // Enforce cap
    await db.query(
      `DELETE FROM overlay_versions WHERE overlay_id = $1 AND id NOT IN (
        SELECT id FROM overlay_versions WHERE overlay_id = $1 ORDER BY created_at DESC LIMIT 20
      )`,
      [id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /dashboard/api/overlays/:id/snapshot — returns PNG of the overlay
router.get("/overlays/:id/snapshot", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    const { rows } = await db.query(
      'SELECT public_id, name FROM overlays WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!rows.length) return res.sendStatus(404);
    const { public_id: publicId, name } = rows[0];

    // Use puppeteer to screenshot the overlay at full resolution
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    const baseUrl = process.env.DASHBOARD_BASE_URL || 'http://localhost:3000';
    await page.goto(`${baseUrl}/o/${publicId}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000)); // let widgets settle
    const buffer = await page.screenshot({ type: 'png' });
    await browser.close();

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename="${name.replace(/[^a-z0-9]/gi, '_')}.png"`);
    res.send(buffer);
  } catch (err) { next(err); }
});


// POST /dashboard/api/overlays/:id/duplicate
router.post("/overlays/:id/duplicate", requireAuth, express.json(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const sourceId = Number(req.params.id);
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

    // Verify ownership and get source config
    const { rows: sourceRows } = await db.query(
      `SELECT id, config_json, asset_type, scene_type FROM overlays WHERE id = $1 AND user_id = $2`,
      [sourceId, userId]
    );
    if (!sourceRows.length) return res.sendStatus(404);
    const source = sourceRows[0];

    // Generate unique public_id and slug
    const newPublicId = crypto.randomBytes(8).toString('hex');
    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Ensure slug uniqueness by appending a suffix if needed
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const { rows: existing } = await db.query(
        `SELECT id FROM overlays WHERE slug = $1 AND user_id = $2`,
        [slug, userId]
      );
      if (!existing.length) break;
      slug = `${baseSlug}-${++suffix}`;
    }

    const { rows: newRows } = await db.query(
      `INSERT INTO overlays (user_id, name, slug, public_id, config_json, asset_type, scene_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, name.trim(), slug, newPublicId, source.config_json, source.asset_type, source.scene_type]
    );

    res.json({ ok: true, id: newRows[0].id, slug });
  } catch (err) {
    next(err);
  }
});


// POST /dashboard/api/overlays/:id/test-event
router.post("/overlays/:id/test-event", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);

    // 1. Verify ownership & get publicId
    const { rows } = await db.query(
      `SELECT public_id, user_id
       FROM overlays
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.sendStatus(404);
    const { public_id: publicId, user_id: tenantId } = rows[0];

    // 2. Construct Canonical Header Test Packet
    const packet = {
      header: {
        id: crypto.randomUUID(),
        type: "test.ping",
        ts: Date.now(),
        producer: "dashboard",
        platform: "internal",
        scope: {
          tenantId: String(tenantId),
          overlayPublicId: publicId
        }
      },
      payload: {
        message: "Test Event",
        random: Math.floor(Math.random() * 1000)
      }
    };

    // 3. Publish to Gate
    await overlayGate.publish(String(tenantId), publicId, packet);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// POST /dashboard/api/overlays/:id/test-lower-third/show
router.post("/overlays/:id/test-lower-third/show", requireAuth, express.json(), async (req, res, next) => {
  try {
    console.log("[TestLowerThird] Show request received for id:", req.params.id);
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);
    const { title, subtitle, text, duration_ms } = req.body;


    const { rows } = await db.query(
      `SELECT public_id, user_id 
       FROM overlays
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) {
      console.log("[TestLowerThird] Overlay not found or not owned by user");
      return res.sendStatus(404);
    }
    const { public_id: publicId, user_id: tenantId } = rows[0];

    // Standard Envelope
    const packet = {
      header: {
        id: crypto.randomUUID(),
        type: "overlay.lower_third.show",
        ts: Date.now(),
        producer: "dashboard",
        platform: "internal",
        scope: {
          tenantId: String(tenantId),
          overlayPublicId: publicId
        }
      },
      payload: {
        title,
        subtitle,
        text,
        duration_ms: duration_ms || 5000
      }
    };

    console.log("[TestLowerThird] Publishing packet:", JSON.stringify(packet, null, 2));
    await overlayGate.publish(String(tenantId), publicId, packet);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TestLowerThird] ERROR:", err);
    next(err);
  }
});

// POST /dashboard/api/overlays/:id/test-lower-third/hide
router.post("/overlays/:id/test-lower-third/hide", requireAuth, express.json(), async (req, res, next) => {
  try {
    console.log("[TestLowerThird] Hide request received");
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);

    const { rows } = await db.query(
      `SELECT public_id, user_id
       FROM overlays
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.sendStatus(404);
    const { public_id: publicId, user_id: tenantId } = rows[0];

    const packet = {
      header: {
        id: crypto.randomUUID(),
        type: "overlay.lower_third.hide",
        ts: Date.now(),
        producer: "dashboard",
        platform: "internal",
        scope: {
          tenantId: String(tenantId),
          overlayPublicId: publicId
        }
      },
      payload: {}
    };

    console.log("[TestLowerThird] Publishing Hide");
    await overlayGate.publish(String(tenantId), publicId, packet);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TestLowerThird] ERROR:", err);
    next(err);
  }
});

export default router;
