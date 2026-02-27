import express from 'express';
import db from '../../db.js';
import requireAuth from '../../utils/requireAuth.js';
import crypto from 'crypto';

const router = express.Router();

// Helper to validate template JSON
function validateTemplateJson(json) {
    if (!json || typeof json !== 'object') return false;

    // Whitelist basic keys to keep it lightweight but safe
    const allowedKeys = ['width', 'height', 'layout', 'style', 'animation', 'defaultDurationMs', 'bind'];
    const keys = Object.keys(json);

    // We allow extra keys if they are harmless, but for now let's just check valid type
    // The user asked to "Only accept/keep top-level keys"

    const cleaned = {};
    for (const key of allowedKeys) {
        if (json[key] !== undefined) {
            cleaned[key] = json[key];
        }
    }

    return cleaned;
}

// GET /dashboard/api/lower-third-templates
router.get('/lower-third-templates', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { rows } = await db.query(
            `SELECT id, public_id, name, template_json, created_at, updated_at
       FROM lower_third_templates
       WHERE user_id = $1
       ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ ok: true, templates: rows });
    } catch (err) {
        console.error('[LowerThirdTemplates] List failed:', err);
        res.status(500).json({ ok: false, error: 'Internal server error' });
    }
});

// POST /dashboard/api/lower-third-templates
router.post('/lower-third-templates', requireAuth, express.json(), async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name, template_json } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ ok: false, error: 'Name is required' });
        }

        const cleanedJson = validateTemplateJson(template_json);
        if (!cleanedJson) {
            return res.status(400).json({ ok: false, error: 'Invalid template JSON' });
        }

        const publicId = crypto.randomUUID();

        const { rows } = await db.query(
            `INSERT INTO lower_third_templates (user_id, public_id, name, template_json)
       VALUES ($1, $2, $3, $4)
       RETURNING id, public_id, name, template_json, created_at`,
            [userId, publicId, name.trim(), cleanedJson]
        );

        res.json({ ok: true, template: rows[0] });
    } catch (err) {
        console.error('[LowerThirdTemplates] Create failed:', err);
        res.status(500).json({ ok: false, error: 'Internal server error' });
    }
});

// PUT /dashboard/api/lower-third-templates/:publicId
router.put('/lower-third-templates/:publicId', requireAuth, express.json(), async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { publicId } = req.params;
        const { name, template_json } = req.body;

        // Check ownership
        const { rows: existing } = await db.query(
            `SELECT id FROM lower_third_templates WHERE user_id = $1 AND public_id = $2`,
            [userId, publicId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ ok: false, error: 'Template not found' });
        }

        // Build update
        const updates = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) {
            updates.push(`name = $${idx++}`);
            values.push(name.trim());
        }

        if (template_json !== undefined) {
            const cleaned = validateTemplateJson(template_json);
            if (!cleaned) return res.status(400).json({ ok: false, error: 'Invalid JSON' });
            updates.push(`template_json = $${idx++}`);
            values.push(cleaned);
        }

        if (updates.length === 0) {
            return res.json({ ok: true }); // No op
        }

        updates.push(`updated_at = NOW()`);

        // Where clause
        values.push(userId);
        values.push(publicId);

        const { rows } = await db.query(
            `UPDATE lower_third_templates
       SET ${updates.join(', ')}
       WHERE user_id = $${idx++} AND public_id = $${idx++}
       RETURNING id, public_id, name, template_json, updated_at`,
            values
        );

        res.json({ ok: true, template: rows[0] });
    } catch (err) {
        console.error('[LowerThirdTemplates] Update failed:', err);
        res.status(500).json({ ok: false, error: 'Internal server error' });
    }
});

// DELETE /dashboard/api/lower-third-templates/:publicId
router.delete('/lower-third-templates/:publicId', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { publicId } = req.params;

        const { rowCount } = await db.query(
            `DELETE FROM lower_third_templates
       WHERE user_id = $1 AND public_id = $2`,
            [userId, publicId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ ok: false, error: 'Template not found' });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[LowerThirdTemplates] Delete failed:', err);
        res.status(500).json({ ok: false, error: 'Internal server error' });
    }
});

export default router;
