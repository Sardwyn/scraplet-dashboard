import express from 'express';
import db from '../db.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Middleware: Require authentication
 */
function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  next();
}

/**
 * GET /api/widget-library/lower-thirds
 * List all lower third templates for the authenticated user
 */
router.get('/lower-thirds', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT lt.*, o.name as source_overlay_name
       FROM lower_third_templates lt
       LEFT JOIN overlays o ON o.id = lt.source_overlay_id
       WHERE lt.user_id = $1
       ORDER BY lt.is_default DESC, lt.created_at DESC`,
      [req.session.user.id]
    );
    
    res.json({ ok: true, templates: rows });
  } catch (err) {
    console.error('[widgetLibrary] list lower-thirds error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch lower third templates' });
  }
});

/**
 * GET /api/widget-library/alerts
 * List all alert templates for the authenticated user
 */
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT at.*, o.name as source_overlay_name
       FROM alert_templates at
       LEFT JOIN overlays o ON o.id = at.source_overlay_id
       WHERE at.user_id = $1
       ORDER BY at.is_default DESC, at.created_at DESC`,
      [req.session.user.id]
    );
    
    res.json({ ok: true, templates: rows });
  } catch (err) {
    console.error('[widgetLibrary] list alerts error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch alert templates' });
  }
});

/**
 * POST /api/widget-library/lower-thirds
 * Save a lower third template from an overlay
 * 
 * Body: { name, overlayId, widgetConfig }
 */
router.post('/lower-thirds', requireAuth, async (req, res) => {
  try {
    const { name, overlayId, widgetConfig } = req.body;
    
    if (!name || !widgetConfig) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: name, widgetConfig' });
    }
    
    // Verify overlay belongs to user
    if (overlayId) {
      const { rows } = await db.query(
        'SELECT id FROM overlays WHERE id = $1 AND user_id = $2',
        [overlayId, req.session.user.id]
      );
      
      if (rows.length === 0) {
        return res.status(403).json({ ok: false, error: 'Overlay not found or access denied' });
      }
    }
    
    // Generate public_id
    const publicId = crypto.randomBytes(8).toString('hex');
    
    // Insert template
    const { rows: [template] } = await db.query(
      `INSERT INTO lower_third_templates 
       (user_id, public_id, name, template_json, source_overlay_id, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.session.user.id, publicId, name, widgetConfig, overlayId || null, false]
    );
    
    res.json({ ok: true, template });
  } catch (err) {
    console.error('[widgetLibrary] create lower-third error:', err);
    
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ ok: false, error: 'A template with this name already exists' });
    }
    
    res.status(500).json({ ok: false, error: 'Failed to create lower third template' });
  }
});

/**
 * POST /api/widget-library/alerts
 * Save an alert template from an overlay
 * 
 * Body: { name, overlayId, widgetConfig }
 */
router.post('/alerts', requireAuth, async (req, res) => {
  try {
    const { name, overlayId, widgetConfig } = req.body;
    
    if (!name || !widgetConfig) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: name, widgetConfig' });
    }
    
    // Verify overlay belongs to user
    if (overlayId) {
      const { rows } = await db.query(
        'SELECT id FROM overlays WHERE id = $1 AND user_id = $2',
        [overlayId, req.session.user.id]
      );
      
      if (rows.length === 0) {
        return res.status(403).json({ ok: false, error: 'Overlay not found or access denied' });
      }
    }
    
    // Generate public_id
    const publicId = crypto.randomBytes(8).toString('hex');
    
    // Insert template
    const { rows: [template] } = await db.query(
      `INSERT INTO alert_templates 
       (user_id, public_id, name, template_json, source_overlay_id, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.session.user.id, publicId, name, widgetConfig, overlayId || null, false]
    );
    
    res.json({ ok: true, template });
  } catch (err) {
    console.error('[widgetLibrary] create alert error:', err);
    
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ ok: false, error: 'A template with this name already exists' });
    }
    
    res.status(500).json({ ok: false, error: 'Failed to create alert template' });
  }
});

/**
 * PUT /api/widget-library/lower-thirds/:id
 * Update a lower third template
 * 
 * Body: { name?, template_json? }
 */
router.put('/lower-thirds/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, template_json } = req.body;
    
    // Verify ownership
    const { rows } = await db.query(
      'SELECT id FROM lower_third_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    
    if (template_json !== undefined) {
      updates.push(`template_json = $${paramCount++}`);
      values.push(template_json);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const { rows: [template] } = await db.query(
      `UPDATE lower_third_templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    res.json({ ok: true, template });
  } catch (err) {
    console.error('[widgetLibrary] update lower-third error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update template' });
  }
});

/**
 * PUT /api/widget-library/alerts/:id
 * Update an alert template
 */
router.put('/alerts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, template_json } = req.body;
    
    // Verify ownership
    const { rows } = await db.query(
      'SELECT id FROM alert_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    
    if (template_json !== undefined) {
      updates.push(`template_json = $${paramCount++}`);
      values.push(template_json);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const { rows: [template] } = await db.query(
      `UPDATE alert_templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    res.json({ ok: true, template });
  } catch (err) {
    console.error('[widgetLibrary] update alert error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/widget-library/lower-thirds/:id
 * Delete a lower third template
 */
router.delete('/lower-thirds/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rowCount } = await db.query(
      'DELETE FROM lower_third_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[widgetLibrary] delete lower-third error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete template' });
  }
});

/**
 * DELETE /api/widget-library/alerts/:id
 * Delete an alert template
 */
router.delete('/alerts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rowCount } = await db.query(
      'DELETE FROM alert_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[widgetLibrary] delete alert error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete template' });
  }
});

/**
 * POST /api/widget-library/lower-thirds/:id/set-default
 * Set a lower third template as default
 */
router.post('/lower-thirds/:id/set-default', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const { rows } = await db.query(
      'SELECT id FROM lower_third_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    // Clear existing default
    await db.query(
      'UPDATE lower_third_templates SET is_default = false WHERE user_id = $1',
      [req.session.user.id]
    );
    
    // Set new default
    await db.query(
      'UPDATE lower_third_templates SET is_default = true WHERE id = $1',
      [id]
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[widgetLibrary] set-default lower-third error:', err);
    res.status(500).json({ ok: false, error: 'Failed to set default template' });
  }
});

/**
 * POST /api/widget-library/alerts/:id/set-default
 * Set an alert template as default
 */
router.post('/alerts/:id/set-default', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const { rows } = await db.query(
      'SELECT id FROM alert_templates WHERE id = $1 AND user_id = $2',
      [id, req.session.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    // Clear existing default
    await db.query(
      'UPDATE alert_templates SET is_default = false WHERE user_id = $1',
      [req.session.user.id]
    );
    
    // Set new default
    await db.query(
      'UPDATE alert_templates SET is_default = true WHERE id = $1',
      [id]
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[widgetLibrary] set-default alert error:', err);
    res.status(500).json({ ok: false, error: 'Failed to set default template' });
  }
});

/**
 * GET /api/widget-library/extract/:overlayId
 * Extract widgets from an overlay's config_json
 * Returns { lowerThirds: [], alerts: [] }
 */
router.get('/extract/:overlayId', requireAuth, async (req, res) => {
  try {
    const { overlayId } = req.params;
    
    // Fetch overlay
    const { rows } = await db.query(
      'SELECT id, name, config_json FROM overlays WHERE id = $1 AND user_id = $2',
      [overlayId, req.session.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Overlay not found' });
    }
    
    const overlay = rows[0];
    const config = overlay.config_json || {};
    const elements = config.elements || [];
    
    // Extract widgets
    const lowerThirds = [];
    const alerts = [];
    
    for (const el of elements) {
      if (el.type === 'widget') {
        const widgetId = el.widgetId || el.widget_id;
        
        if (widgetId === 'lower-third' || widgetId === 'lower_third') {
          lowerThirds.push({
            id: el.id,
            config: el.propOverrides || el.props || {}
          });
        } else if (widgetId === 'alert' || widgetId === 'alert-box') {
          alerts.push({
            id: el.id,
            config: el.propOverrides || el.props || {}
          });
        }
      }
    }
    
    res.json({
      ok: true,
      overlayId: overlay.id,
      overlayName: overlay.name,
      lowerThirds,
      alerts
    });
  } catch (err) {
    console.error('[widgetLibrary] extract error:', err);
    res.status(500).json({ ok: false, error: 'Failed to extract widgets' });
  }
});

export default router;
