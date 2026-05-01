// routes/obsWidgetConfig.js
// OBS-accessible widget config panel — no session required, token auth only
import express from 'express';
import db from '../db.js';
import { overlayGate } from '../services/overlayGate.js';
import crypto from 'crypto';

const router = express.Router();

// GET /obs/widget-config/:overlayPublicId/:widgetInstanceId
router.get('/widget-config/:overlayPublicId/:widgetInstanceId', async (req, res, next) => {
  try {
    const { overlayPublicId, widgetInstanceId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(401).send('Token required');

    // Validate token against widget_configs
    const { rows } = await db.query(
      `SELECT wc.*, o.user_id, o.id as overlay_id
       FROM widget_configs wc
       JOIN overlays o ON o.public_id = $1
       WHERE wc.overlay_id = o.id AND wc.instance_id = $2 AND wc.token = $3`,
      [overlayPublicId, widgetInstanceId, token]
    );
    if (!rows.length) return res.status(403).send('Invalid token');

    const wc = rows[0];
    const config = wc.config_json || {};
    const schema = wc.config_schema || [];

    res.render('obs-widget-config', {
      overlayPublicId,
      widgetInstanceId,
      token,
      widgetName: wc.widget_id || 'Widget',
      config,
      schema,
    });
  } catch (err) { next(err); }
});

// POST /obs/widget-config/:overlayPublicId/:widgetInstanceId
router.post('/widget-config/:overlayPublicId/:widgetInstanceId', express.json(), async (req, res, next) => {
  try {
    const { overlayPublicId, widgetInstanceId } = req.params;
    const token = req.query.token || req.body.token;
    if (!token) return res.status(401).json({ error: 'Token required' });

    const { rows } = await db.query(
      `SELECT wc.*, o.user_id, o.id as overlay_id
       FROM widget_configs wc
       JOIN overlays o ON o.public_id = $1
       WHERE wc.overlay_id = o.id AND wc.instance_id = $2 AND wc.token = $3`,
      [overlayPublicId, widgetInstanceId, token]
    );
    if (!rows.length) return res.status(403).json({ error: 'Invalid token' });

    const wc = rows[0];
    const newConfig = req.body.config || {};

    await db.query(
      'UPDATE widget_configs SET config_json = $1, updated_at = NOW() WHERE id = $2',
      [newConfig, wc.id]
    );

    // Emit SSE event to the overlay runtime
    const packet = {
      header: {
        id: crypto.randomUUID(),
        type: 'widget.config.update',
        ts: Date.now(),
        producer: 'obs-config-panel',
        platform: 'internal',
        scope: { tenantId: String(wc.user_id), overlayPublicId }
      },
      payload: { widgetInstanceId, config: newConfig }
    };
    await overlayGate.publish(String(wc.user_id), overlayPublicId, packet);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
