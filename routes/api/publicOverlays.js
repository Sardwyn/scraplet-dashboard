import express from 'express';
import db from '../../db.js';
import { overlayGate } from '../../services/overlayGate.js';

const router = express.Router();

router.get('/:publicId', async (req, res) => {
    const publicId = req.params.publicId;
    try {
        const result = await db.query('SELECT config_json FROM overlays WHERE public_id = $1 LIMIT 1', [publicId]);
        if (result.rows.length === 0) return res.status(404).send('Overlay not found');
        res.json(result.rows[0].config_json || {});
    } catch (err) {
        console.error('[PublicOverlayConfig] Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/:publicId/state', async (req, res) => {
    res.json({ rev: 1, ts: Date.now(), tenant: { public_id: req.params.publicId }, show: { mode: 'live' }, triggers: [], signals: {} });
});

router.get('/:publicId/events/stream', async (req, res) => {
    const publicId = req.params.publicId;
    try {
        const result = await db.query('SELECT user_id FROM overlays WHERE public_id = $1 LIMIT 1', [publicId]);
        if (result.rows.length === 0) return res.status(404).send('Overlay not found');
        
        const tenantId = result.rows[0].user_id;
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();
        overlayGate.subscribe(tenantId, publicId, res, req.headers['last-event-id']);
    } catch (err) {
        console.error('[PublicOverlayEvents] Error:', err);
        if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
});

export default router;