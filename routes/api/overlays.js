// routes/api/overlays.js
import express from "express";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";
import { overlayGate } from '../../services/overlayGate.js';
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

    res.json(rows[0]);
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
