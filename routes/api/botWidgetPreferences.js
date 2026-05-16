import express from 'express';
import db from '../../db.js';

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
 * GET /api/bot-widget-preferences/scrapbot
 * Get Scrapbot widget preferences for the authenticated user
 */
router.get('/scrapbot', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const { rows } = await db.query(
      `SELECT 
        swp.*,
        lt.name as lower_third_name,
        at.name as alert_name
       FROM scrapbot_widget_preferences swp
       LEFT JOIN lower_third_templates lt ON lt.id = swp.lower_third_template_id
       LEFT JOIN alert_templates at ON at.id = swp.alert_template_id
       WHERE swp.user_id = $1`,
      [userId]
    );
    
    res.json({ ok: true, preferences: rows[0] || null });
  } catch (err) {
    console.error('[botWidgetPreferences] get scrapbot error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/bot-widget-preferences/scrapbot
 * Update Scrapbot widget preferences
 * 
 * Body: { lowerThirdTemplateId?, alertTemplateId? }
 */
router.put('/scrapbot', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { lowerThirdTemplateId, alertTemplateId } = req.body;
    
    // Upsert preferences
    await db.query(
      `INSERT INTO scrapbot_widget_preferences (user_id, lower_third_template_id, alert_template_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         lower_third_template_id = COALESCE($2, scrapbot_widget_preferences.lower_third_template_id),
         alert_template_id = COALESCE($3, scrapbot_widget_preferences.alert_template_id),
         updated_at = NOW()`,
      [userId, lowerThirdTemplateId || null, alertTemplateId || null]
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[botWidgetPreferences] update scrapbot error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update preferences' });
  }
});

/**
 * GET /api/bot-widget-preferences/discord/:guildId
 * Get Discord widget preferences for a guild
 */
router.get('/discord/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    
    // Verify user owns this guild
    const { rows: guildRows } = await db.query(
      `SELECT owner_user_id FROM discord_guild_integrations WHERE guild_id = $1`,
      [guildId]
    );
    
    if (guildRows.length === 0 || guildRows[0].owner_user_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    const { rows } = await db.query(
      `SELECT 
        dwp.*,
        lt.name as lower_third_name,
        at.name as alert_name
       FROM discord_widget_preferences dwp
       LEFT JOIN lower_third_templates lt ON lt.id = dwp.lower_third_template_id
       LEFT JOIN alert_templates at ON at.id = dwp.alert_template_id
       WHERE dwp.guild_id = $1`,
      [guildId]
    );
    
    res.json({ ok: true, preferences: rows[0] || null });
  } catch (err) {
    console.error('[botWidgetPreferences] get discord error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/bot-widget-preferences/discord/:guildId
 * Update Discord widget preferences for a guild
 * 
 * Body: { lowerThirdTemplateId?, alertTemplateId? }
 */
router.put('/discord/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    const { lowerThirdTemplateId, alertTemplateId } = req.body;
    
    // Verify user owns this guild
    const { rows: guildRows } = await db.query(
      `SELECT owner_user_id FROM discord_guild_integrations WHERE guild_id = $1`,
      [guildId]
    );
    
    if (guildRows.length === 0 || guildRows[0].owner_user_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    // Upsert preferences
    await db.query(
      `INSERT INTO discord_widget_preferences (guild_id, lower_third_template_id, alert_template_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET 
         lower_third_template_id = COALESCE($2, discord_widget_preferences.lower_third_template_id),
         alert_template_id = COALESCE($3, discord_widget_preferences.alert_template_id),
         updated_at = NOW()`,
      [guildId, lowerThirdTemplateId || null, alertTemplateId || null]
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[botWidgetPreferences] update discord error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update preferences' });
  }
});

export default router;
