// routes/api/overlays.js
import express from "express";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";
import { overlayGate } from '../../services/overlayGate.js';
import crypto from 'crypto';
import { BUILTIN_PRESETS } from "./overlayComponents.js";
import {
  OVERLAY_RUNTIME_PACKET_V1,
  assertOverlayRuntimePacketV1,
} from "@scraplet/contracts/overlayRuntime";

const router = express.Router();

function buildOverlayComponentMap(rows) {
  const all = [...BUILTIN_PRESETS, ...rows];
  const map = new Map();
  for (const row of all) {
    const componentJson = row.component_json || {};
    const normalized = {
      id: row.public_id || String(row.id),
      public_id: row.public_id || String(row.id),
      name: row.name,
      schema_version: row.schema_version || componentJson.schemaVersion || 1,
      component_json: {
        elements: componentJson.elements || [],
        propsSchema: componentJson.propsSchema || {},
        metadata: componentJson.metadata || {},
      },
    };
    map.set(normalized.public_id, normalized);
    map.set(String(row.id), normalized);
  }
  return map;
}

function resolveComponentInstancePayload(instance, def) {
  const propsSchema = def?.component_json?.propsSchema || {};
  const metadata = def?.component_json?.metadata || {};
  const overrides = instance?.propOverrides || {};
  const propValues = {};

  for (const [key, schema] of Object.entries(propsSchema)) {
    propValues[key] = overrides[key] !== undefined ? overrides[key] : schema?.default;
  }

  return {
    instanceId: instance.id,
    componentId: instance.componentId,
    label: metadata?.controller?.label || def?.name || instance.name || "Component",
    bounds: {
      x: Number(instance.x || 0),
      y: Number(instance.y || 0),
      width: Number(instance.width || 0),
      height: Number(instance.height || 0),
    },
    editableProps: Array.isArray(metadata?.controller?.editableProps) ? metadata.controller.editableProps : [],
    quickActions: Array.isArray(metadata?.controller?.quickActions) ? metadata.controller.quickActions : [],
    zones: Array.isArray(metadata?.controller?.zones) ? metadata.controller.zones : [],
    propValues,
    propsSchema,
    metadata,
  };
}

router.get("/controller/overlays", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await db.query(
      `SELECT id, name, slug, public_id, config_json
       FROM overlays
       WHERE user_id = $1
       ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
      [userId]
    );

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      tenantId: String(userId),
      publicId: row.public_id,
      previewUrl: `/o/${encodeURIComponent(row.slug || row.public_id)}`,
      baseResolution: row.config_json?.baseResolution || { width: 1920, height: 1080 },
    }));

    res.json({ overlays: items });
  } catch (err) {
    next(err);
  }
});

router.get("/controller/overlays/:id/components", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const overlayKey = String(req.params.id || "").trim();

    const overlayResult = await db.query(
      `SELECT id, name, slug, public_id, config_json
       FROM overlays
       WHERE user_id = $1 AND (id::text = $2 OR public_id = $2 OR slug = $2)
       LIMIT 1`,
      [userId, overlayKey]
    );

    if (!overlayResult.rows.length) {
      return res.sendStatus(404);
    }

    const overlay = overlayResult.rows[0];
    const config = overlay.config_json || {};
    const elements = Array.isArray(config.elements) ? config.elements : [];
    const instances = elements.filter((element) => element?.type === "componentInstance");

    const componentRows = await db.query(
      `SELECT id, public_id, name, schema_version, component_json
       FROM overlay_components
       WHERE user_id = $1`,
      [userId]
    );
    const componentMap = buildOverlayComponentMap(componentRows.rows);

    const components = instances
      .map((instance) => {
        const def = componentMap.get(String(instance.componentId || ""));
        if (!def) return null;
        if (def.component_json?.metadata?.controller?.enabled !== true) return null;
        return resolveComponentInstancePayload(instance, def);
      })
      .filter(Boolean);

    res.json({
      overlay: {
        id: overlay.id,
        name: overlay.name,
        slug: overlay.slug,
        tenantId: String(userId),
        publicId: overlay.public_id,
        previewUrl: `/o/${encodeURIComponent(overlay.slug || overlay.public_id)}`,
        baseResolution: config.baseResolution || { width: 1920, height: 1080 },
      },
      components,
    });
  } catch (err) {
    next(err);
  }
});


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
        version: OVERLAY_RUNTIME_PACKET_V1,
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
        version: OVERLAY_RUNTIME_PACKET_V1,
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
        version: OVERLAY_RUNTIME_PACKET_V1,
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

// POST /dashboard/api/runtime/packets
// Publishes a versioned overlay runtime packet for an overlay the user owns.
router.post("/runtime/packets", requireAuth, express.json(), async (req, res, next) => {
  try {
    const sessionUser = req.session.user;
    const userId = String(sessionUser.id);
    const packet = req.body;

    assertOverlayRuntimePacketV1(packet, { allowLegacy: false });

    const scope = packet?.header?.scope;
    const overlayPublicId = String(scope?.overlayPublicId || "").trim();
    const tenantId = String(scope?.tenantId || "").trim();

    if (!overlayPublicId) {
      return res.status(400).json({ error: "overlayPublicId required" });
    }

    if (tenantId !== userId) {
      return res.status(403).json({ error: "tenant scope mismatch" });
    }

    const { rows } = await db.query(
      `SELECT public_id, user_id
       FROM overlays
       WHERE public_id = $1 AND user_id = $2
       LIMIT 1`,
      [overlayPublicId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "overlay not found for runtime packet target" });
    }

    await overlayGate.publish(userId, overlayPublicId, packet);
    return res.json({ ok: true, packetId: packet.header.id });
  } catch (err) {
    next(err);
  }
});

export default router;
