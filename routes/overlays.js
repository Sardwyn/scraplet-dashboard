// routes/overlays.js
import express from "express";
import db from "../db.js";
import crypto from "crypto";
import requireAuth from "../utils/requireAuth.js";
import { overlayGate } from "../services/overlayGate.js";

const router = express.Router();

// Ensure scene_type column exists (idempotent migration)
(async () => {
  try {
    await db.query(`ALTER TABLE overlays ADD COLUMN IF NOT EXISTS scene_type VARCHAR(32) DEFAULT 'overlay'`);
  } catch (e) { /* ignore */ }
})();

// ── Asset type definitions ────────────────────────────────────────────────────
// Each entry defines the canvas resolution and optional safe area overlay.
// safeArea: { x, y, width, height } in canvas pixels — the region that is
// guaranteed visible on all devices/contexts for that platform.
const ASSET_TYPES = {
  overlay:         { label: 'Overlay',               width: 1920, height: 1080, safeArea: null },
  starting_soon:   { label: 'Starting Soon',          width: 1920, height: 1080, safeArea: null },
  brb:             { label: 'BRB Screen',             width: 1920, height: 1080, safeArea: null },
  stream_ending:   { label: 'Stream Ending',          width: 1920, height: 1080, safeArea: null },
  kick_panel:      { label: 'Kick Panel',             width: 320,  height: 160,  safeArea: null },
  twitch_panel:    { label: 'Twitch Panel',           width: 320,  height: 160,  safeArea: null },
  kick_offline:    { label: 'Kick Offline Banner',    width: 1920, height: 1080, safeArea: null },
  twitch_offline:  { label: 'Twitch Offline Banner',  width: 1920, height: 1080, safeArea: null },
  yt_channel_art:  { label: 'YouTube Channel Art',    width: 2560, height: 1440, safeArea: { x: 507, y: 508, width: 1546, height: 423 } },
  yt_thumbnail:    { label: 'YouTube Thumbnail',      width: 1280, height: 720,  safeArea: null },
};

// v0 default overlay config for new overlays
function createDefaultOverlayConfig(assetType = 'overlay') {
  const def = ASSET_TYPES[assetType] || ASSET_TYPES.overlay;
  const w = def.width;
  const h = def.height;
  return {
    version: 0,
    baseResolution: { width: w, height: h },
    assetType,
    safeArea: def.safeArea || null,
    elements: [
      {
        id: "title",
        type: "text",
        x: Math.round(w * 0.04),
        y: Math.round(h * 0.07),
        width: Math.round(w * 0.5),
        height: Math.round(h * 0.1),
        text: def.label,
        fontSize: Math.max(14, Math.round(h * 0.033)),
        fontWeight: "bold",
        textAlign: "left",
      },
    ],
  };
}



// GET /dashboard/overlays - list overlays for current user
router.get("/overlays", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;

    const { rows } = await db.query(
      `SELECT id, name, slug, public_id, created_at, updated_at, thumbnail_url, COALESCE(scene_type, 'overlay') as scene_type, COALESCE(asset_type, 'overlay') as asset_type
       FROM overlays
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const { rows: templates } = await db.query(
      `SELECT id, public_id, name, created_at
       FROM lower_third_templates
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const { rows: collections } = await db.query(
      `SELECT 
        c.*,
        COUNT(oci.overlay_id) as overlay_count
       FROM overlay_collections c
       LEFT JOIN overlay_collection_items oci ON oci.collection_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    res.render("layout", {
      tabView: "tabs/overlays",
    currentPage: "overlays",
    currentPage: "overlays",
      user: sessionUser,
      overlays: rows,
      templates,
      collections,
    });

  } catch (err) {
    next(err);
  }
});



// GET /dashboard/overlays/new - create default overlay and redirect to edit
router.get("/overlays/new", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;

    const assetType = req.query?.asset_type || req.body?.asset_type || req.query?.scene_type || 'overlay';
    const def = ASSET_TYPES[assetType] || ASSET_TYPES.overlay;
    const defaultConfig = createDefaultOverlayConfig(assetType);
    const slug = `overlay-${Date.now()}`;
    const publicId = crypto.randomBytes(12).toString("hex");

    // Derive scene_type for backward compat
    const sceneType = ['starting_soon','brb','stream_ending'].includes(assetType) ? assetType : 'overlay';

    const { rows } = await db.query(
      `INSERT INTO overlays (user_id, slug, name, public_id, config_json, scene_type, asset_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, slug, def.label, publicId, defaultConfig, sceneType, assetType]
    );

    res.redirect(`/dashboard/overlays/${rows[0].id}/edit`);
  } catch (err) {
    next(err);
  }
});


// GET /dashboard/overlays/:id/edit
router.get("/overlays/:id/edit", requireAuth, async (req, res, next) => {
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

    const overlay = rows[0];

    res.render("layout", {
      tabView: "tabs/overlays-edit",
    currentPage: "overlays",
    currentPage: "overlays",
      user: sessionUser,
      overlay: overlay,
      overlayJson: JSON.stringify(overlay),
    });

  } catch (err) {
    next(err);
  }
});


// GET /dashboard/components/:id/edit
router.get("/components/:id/edit", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = req.params.id;

    const { rows } = await db.query(
      `SELECT id, public_id, name, schema_version, component_json 
       FROM overlay_components 
       WHERE (id::text = $1 OR public_id = $1) AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.sendStatus(404);

    const compRow = rows[0];
    const compDef = compRow.component_json || { elements: [], propsSchema: {}, metadata: {} };

    // Construct a fake Overlay object so the editor can boot up
    const fakeOverlay = {
      id: compRow.id,
      public_id: compRow.public_id,
      name: compRow.name,
      isComponentMaster: true,
      config_json: {
        version: 0,
        baseResolution: { width: 1920, height: 1080 },
        elements: compDef.elements || []
      },
      propsSchema: compDef.propsSchema || {},
      metadata: compDef.metadata || {}
    };

    res.render("layout", {
      tabView: "tabs/overlays-edit",
    currentPage: "overlays",
    currentPage: "overlays",
      user: sessionUser,
      overlay: fakeOverlay,
      overlayJson: JSON.stringify(fakeOverlay),
      templates: [] // unused when editing components usually
    });

  } catch (err) {
    next(err);
  }
});


// POST /dashboard/overlays/:id/test-event
// Inject a test event into the overlay stream
router.post("/overlays/:id/test-event", requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;
    const id = Number(req.params.id);

    // 1. Get overlay (ensure owned by user)
    const { rows } = await db.query(
      `SELECT id, public_id, user_id
       FROM overlays
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.sendStatus(404);
    const overlay = rows[0];

    // 2. Gate is already imported statically
    // const { overlayGate } = await import("../services/overlayGate.js");

    // 3. Publish Test Event
    const uuid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

    const packet = {
      header: {
        id: uuid,
        type: req.body.type || "test.ping",
        ts: Date.now(),
        producer: "dashboard",
        platform: "internal",
        scope: {
          tenantId: overlay.user_id,
          overlayPublicId: overlay.public_id
        }
      },
      payload: {
        message: "This is a test event from the dashboard!",
        actor: { displayName: "System Admin" },
        ...(req.body || {})
      }
    };

    overlayGate.publish(overlay.user_id, overlay.public_id, packet);

    res.json({ success: true, packetId: packet.header.id });

  } catch (err) {
    console.error("[TestEvent] Unhandled error:", err);
    // Explicitly send JSON error to avoid generic HTML error page if possible, helps debugging
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      next(err);
    }
  }
});


export default router;


