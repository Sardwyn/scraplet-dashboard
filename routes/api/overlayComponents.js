import express from 'express';
import db from '../../db.js';
import crypto from 'crypto';
import requireAuth from '../../utils/requireAuth.js';

const router = express.Router();

/**
 * POST /dashboard/api/overlay-components
 * Creates a new overlay component definition for the current user.
 */
router.post('/overlay-components', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const { name, schemaVersion, elements, propsSchema, metadata } = req.body;

    if (!name || !elements || !Array.isArray(elements)) {
        return res.status(400).json({ error: 'Missing required component fields.' });
    }

    const publicId = 'comp_' + crypto.randomBytes(6).toString('hex');

    const componentJson = {
        elements,
        propsSchema: propsSchema || {},
        metadata: metadata || {}
    };

    try {
        const result = await db.query(
            `INSERT INTO overlay_components (user_id, public_id, name, schema_version, component_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, public_id, name, schema_version, component_json, created_at, updated_at`,
            [userId, publicId, name, schemaVersion || 1, componentJson]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error saving overlay component:', err);
        res.status(500).json({
            error: 'Failed to save component.',
            details: err.message,
            code: err.code
        });
    }
});

const BUILTIN_PRESETS = [
    {
        id: 'preset_lower_third',
        public_id: 'preset_lower_third',
        user_id: null,
        name: 'Basic Lower Third',
        schema_version: 1,
        component_json: {
            elements: [
                {
                    id: 'lt_bg',
                    type: 'box',
                    x: 0, y: 0, width: 600, height: 120,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderRadius: 4,
                    bindings: { backgroundColor: 'bgColor' }
                },
                {
                    id: 'lt_accent',
                    type: 'box',
                    x: 0, y: 0, width: 8, height: 120,
                    backgroundColor: '#6366f1',
                    borderRadius: 4,
                    bindings: { backgroundColor: 'accentColor' }
                },
                {
                    id: 'lt_title',
                    type: 'text',
                    x: 30, y: 25, width: 540, height: 40,
                    text: 'Title text here',
                    fontSize: 28,
                    fontWeight: 'bold',
                    fontFamily: 'Inter',
                    color: '#ffffff',
                    bindings: { text: 'title', color: 'titleColor' }
                },
                {
                    id: 'lt_sub',
                    type: 'text',
                    x: 30, y: 70, width: 540, height: 30,
                    text: 'Subtitle text here',
                    fontSize: 18,
                    fontWeight: 'normal',
                    fontFamily: 'Inter',
                    color: '#cbd5e1',
                    bindings: { text: 'subtitle', color: 'subColor' }
                }
            ],
            propsSchema: {
                title: { type: 'text', label: 'Title', default: 'John Doe' },
                subtitle: { type: 'text', label: 'Subtitle', default: 'Streamer/Developer' },
                bgColor: { type: 'color', label: 'Background', default: 'rgba(0,0,0,0.8)' },
                accentColor: { type: 'color', label: 'Accent', default: '#6366f1' },
                titleColor: { type: 'color', label: 'Title Color', default: '#ffffff' },
                subColor: { type: 'color', label: 'Sub Color', default: '#cbd5e1' }
            },
            metadata: {
                durationMs: 8000,
                animationIn: 'slideUp',
                animationOut: 'slideDown'
            }
        }
    }
];

/**
 * GET /dashboard/api/overlay-components
 * Lists all component definitions for the current user and built-in presets (user_id IS NULL)
 */
router.get('/overlay-components', requireAuth, async (req, res) => {
    const userId = req.session.user.id;

    try {
        const result = await db.query(
            `SELECT id, user_id, public_id, name, schema_version, component_json, created_at, updated_at
       FROM overlay_components
       WHERE user_id = $1 OR user_id IS NULL
       ORDER BY created_at DESC`,
            [userId]
        );

        const allComponents = [...BUILTIN_PRESETS, ...result.rows];
        res.json(allComponents);
    } catch (err) {
        console.error('Error fetching overlay components:', err);
        res.status(500).json({
            error: 'Failed to fetch components.',
            details: err.message,
            code: err.code
        });
    }
});

/**
 * /**
 * PUT /dashboard/api/overlay-components/:id
 * Updates an existing overlay component definition.
 */
router.put('/overlay-components/:id', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const id = req.params.id;
    const { name, schemaVersion, elements, propsSchema, metadata } = req.body;

    const componentJson = {
        elements,
        propsSchema: propsSchema || {},
        metadata: metadata || {}
    };

    try {
        const result = await db.query(
            `UPDATE overlay_components 
             SET name = $1, schema_version = $2, component_json = $3, updated_at = NOW()
             WHERE (id::text = $4 OR public_id = $4) AND user_id = $5
             RETURNING id, public_id, name, schema_version, component_json, created_at, updated_at`,
            [name, schemaVersion || 1, componentJson, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Component not found or not owned by user.' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating overlay component:', err);
        res.status(500).json({
            error: 'Failed to update component.',
            details: err.message,
            code: err.code
        });
    }
});

/**
 * DELETE /dashboard/api/overlay-components/:id
 * Deletes an overlay component definition.
 */
router.delete('/overlay-components/:id', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const id = req.params.id;

    try {
        const result = await db.query(
            `DELETE FROM overlay_components 
             WHERE (id::text = $1 OR public_id = $1) AND user_id = $2
             RETURNING id, public_id, name`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Component not found or not owned by user.' });
        }

        res.json({ message: 'Component deleted successfully.', deleted: result.rows[0] });
    } catch (err) {
        console.error('Error deleting overlay component:', err);
        res.status(500).json({
            error: 'Failed to delete component.',
            details: err.message,
            code: err.code
        });
    }
});

export default router;
