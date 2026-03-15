import express from 'express';
import db from '../../db.js';
import { overlayGate } from '../../services/overlayGate.js';
import { BUILTIN_PRESETS } from './overlayComponents.js';

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

router.get('/:publicId', async (req, res) => {
    const publicId = req.params.publicId;
    try {
        const result = await db.query('SELECT user_id, config_json FROM overlays WHERE public_id = $1 LIMIT 1', [publicId]);
        if (result.rows.length === 0) return res.status(404).send('Overlay not found');
        const overlay = result.rows[0];
        const config = overlay.config_json || {};
        const elements = Array.isArray(config.elements) ? config.elements : [];
        const componentIds = Array.from(
            new Set(
                elements
                    .filter((element) => element?.type === 'componentInstance' && element?.componentId)
                    .map((element) => String(element.componentId))
            )
        );

        let overlayComponents = [];
        if (componentIds.length > 0) {
            const componentResult = await db.query(
                `SELECT id, public_id, name, schema_version, component_json
                   FROM overlay_components
                  WHERE user_id = $1`,
                [overlay.user_id]
            );
            const componentMap = buildOverlayComponentMap(componentResult.rows);
            overlayComponents = componentIds
                .map((id) => componentMap.get(id))
                .filter(Boolean)
                .map((row) => ({
                    id: row.public_id,
                    name: row.name,
                    schemaVersion: row.schema_version,
                    elements: row.component_json?.elements || [],
                    propsSchema: row.component_json?.propsSchema || {},
                    metadata: row.component_json?.metadata || {},
                }));
        }

        res.json({
            ...config,
            overlayComponents,
        });
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
