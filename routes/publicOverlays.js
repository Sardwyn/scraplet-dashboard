import express from 'express';
import db from '../db.js';
import { overlayGate } from '../../services/overlayGate.js';

const router = express.Router();

// GET /api/overlays/public/:publicId - Initial Config
router.get('/:publicId', async (req, res) => {
    const publicId = req.params.publicId;
    try {
        const result = await db.query(
            `SELECT o.config_json, o.user_id FROM overlays o WHERE o.public_id = $1 LIMIT 1`,
            [publicId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Overlay not found');
        }

        const { config_json, user_id } = result.rows[0];

        // Also fetch overlay components for this user so componentInstances render correctly
        const compResult = await db.query(
            `SELECT public_id as id, name, component_json FROM overlay_components WHERE user_id = $1`,
            [user_id]
        );
        const components = compResult.rows.map(r => ({
            id: r.id,
            name: r.name,
            ...(r.component_json || {}),
        }));

        res.json({ ...(config_json || {}), components });
    } catch (err) {
        console.error('[PublicOverlayConfig] Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/overlays/public/:publicId/state - Dynamic State (Polling)
router.get('/:publicId/state', async (req, res) => {
    // Phase 11 V0: Return empty stub state
    res.json({
        rev: 1,
        ts: Date.now(),
        tenant: { public_id: req.params.publicId },
        show: { mode: 'live' },
        triggers: [],
        signals: {}
    });
});

// GET /api/overlays/public/:publicId/events/stream
router.get('/:publicId/events/stream', async (req, res) => {
    const publicId = req.params.publicId;

    try {
        // 1. Validate Overlay & Get Scope (Tenant ID)
        // We only need the user_id (tenantId) to construct the scope key.
        const result = await db.query(
            `SELECT user_id FROM overlays WHERE public_id = $1 LIMIT 1`,
            [publicId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Overlay not found');
        }

        const tenantId = result.rows[0].user_id;

        // 2. Prepare SSE Headers
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Nginx specific
        });
        res.flushHeaders();

        // 3. Subscribe via Gate
        const lastEventId = req.headers['last-event-id'];
        overlayGate.subscribe(tenantId, publicId, res, lastEventId);

    } catch (err) {
        console.error('[PublicOverlayEvents] Error:', err);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
        }
    }
});

export default router;
