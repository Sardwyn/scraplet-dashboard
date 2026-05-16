import express from 'express';
import db from '../../db.js';
import { overlayGate } from '../../services/overlayGate.js';

const router = express.Router();

/**
 * Helper: Emit bot layer event to overlay runtime via overlayGate
 */
async function emitBotLayerEvent(overlayPublicId, tenantId, eventType, payload) {
  const packet = {
    header: {
      id: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: eventType,
      ts: Date.now(),
      producer: 'bot-layer-api',
      platform: 'internal',
      scope: {
        tenantId: tenantId,
        overlayPublicId: overlayPublicId
      }
    },
    payload
  };
  
  await overlayGate.publish(tenantId, overlayPublicId, packet);
}

/**
 * Middleware: Verify internal bot request
 * Checks for x-scraplet-internal-key header
 */
function requireBotAuth(req, res, next) {
  const internalKey = req.headers['x-scraplet-internal-key'];
  
  if (!internalKey || internalKey !== process.env.SCRAPLET_SHARED_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized bot access' });
  }
  
  next();
}

/**
 * Helper: Get active overlay for channel
 * Returns the most recently updated overlay for the channel
 */
async function getActiveOverlay(channelId) {
  const { rows } = await db.query(
    `SELECT id, public_id, user_id 
     FROM overlays 
     WHERE user_id = $1 
     ORDER BY updated_at DESC 
     LIMIT 1`,
    [channelId]
  );
  
  return rows[0] || null;
}

/**
 * Helper: Check bot layer permissions
 */
async function checkBotPermissions(channelId, userRole) {
  const { rows } = await db.query(
    `SELECT allow_mods, allow_broadcaster, allow_everyone, enabled
     FROM scrapbot_bot_layer_permissions
     WHERE channel_id = $1`,
    [channelId]
  );
  
  // Default permissions if not configured
  const perms = rows[0] || {
    allow_mods: true,
    allow_broadcaster: true,
    allow_everyone: false,
    enabled: true
  };
  
  if (!perms.enabled) {
    return { allowed: false, reason: 'Bot layer disabled for this channel' };
  }
  
  if (userRole === 'broadcaster' && perms.allow_broadcaster) {
    return { allowed: true };
  }
  
  if (userRole === 'moderator' && perms.allow_mods) {
    return { allowed: true };
  }
  
  if (perms.allow_everyone) {
    return { allowed: true };
  }
  
  return { allowed: false, reason: 'Insufficient permissions' };
}

/**
 * Helper: Get default lower third template for user
 */
async function getDefaultLowerThirdTemplate(userId) {
  const { rows } = await db.query(
    `SELECT template_json 
     FROM lower_third_templates 
     WHERE user_id = $1 AND is_default = true 
     LIMIT 1`,
    [userId]
  );
  
  if (rows[0]) {
    return rows[0].template_json;
  }
  
  // Fallback to first template
  const { rows: fallback } = await db.query(
    `SELECT template_json 
     FROM lower_third_templates 
     WHERE user_id = $1 
     ORDER BY created_at ASC 
     LIMIT 1`,
    [userId]
  );
  
  return fallback[0]?.template_json || null;
}

/**
 * POST /api/bot/spawn-widget
 * Spawns a widget on the bot layer
 * 
 * Body:
 * {
 *   "channelId": 123,
 *   "overlayId": 456,        // Optional, defaults to active overlay
 *   "zone": "LT",            // TL, TR, C, BL, BR, LT
 *   "type": "lower-third",   // lower-third, alert, card, custom
 *   "config": {...},         // Widget-specific config
 *   "duration": 10000,       // ms, null = persistent
 *   "requestedBy": "discord:user#1234",
 *   "userRole": "moderator"  // broadcaster, moderator, viewer
 * }
 */
router.post('/bot/spawn-widget', requireBotAuth, async (req, res) => {
  try {
    const {
      channelId,
      overlayId,
      zone,
      type,
      config,
      duration,
      requestedBy,
      userRole = 'viewer'
    } = req.body;
    
    // Validate required fields
    if (!channelId || !zone || !type || !config || !requestedBy) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: channelId, zone, type, config, requestedBy'
      });
    }
    
    // Validate zone
    const validZones = ['TL', 'TR', 'C', 'BL', 'BR', 'LT'];
    if (!validZones.includes(zone)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid zone. Must be one of: ${validZones.join(', ')}`
      });
    }
    
    // Check permissions
    const permCheck = await checkBotPermissions(channelId, userRole);
    if (!permCheck.allowed) {
      return res.status(403).json({
        ok: false,
        error: permCheck.reason
      });
    }
    
    // Get ALL overlays for this user (not just one)
    let targetOverlays;
    if (overlayId) {
      const { rows } = await db.query(
        `SELECT id, public_id, user_id FROM overlays WHERE id = $1`,
        [overlayId]
      );
      targetOverlays = rows;
    } else {
      // Get all overlays for the user
      const { rows } = await db.query(
        `SELECT id, public_id, user_id FROM overlays WHERE user_id = $1`,
        [channelId]
      );
      targetOverlays = rows;
    }
    
    if (!targetOverlays || targetOverlays.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No overlays found for channel'
      });
    }
    
    const widgets = [];
    
    // Spawn widget on ALL overlays
    for (const targetOverlay of targetOverlays) {
    
      // For lower-third type, merge with default template
      let finalConfig = config;
      if (type === 'lower-third') {
        const template = await getDefaultLowerThirdTemplate(targetOverlay.user_id);
        if (template) {
          finalConfig = {
            ...template,
            ...config,
            // Merge bind keys if present
            bind: {
              ...template.bind,
              ...config.bind
            }
          };
        }
      }
      
      // Calculate expiration
      const expiresAt = duration ? new Date(Date.now() + duration) : null;
      
      // Clear existing widget in same zone (dynamic replacement)
      await db.query(
        `DELETE FROM bot_layer_widgets 
         WHERE overlay_id = $1 AND zone_key = $2`,
        [targetOverlay.id, zone]
      );
      
      // Insert new widget
      const { rows } = await db.query(
        `INSERT INTO bot_layer_widgets 
         (overlay_id, zone_key, widget_type, config, duration_ms, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, overlay_id, zone_key, widget_type, config, expires_at, created_at`,
        [targetOverlay.id, zone, type, finalConfig, duration, expiresAt, requestedBy]
      );
      
      const widget = rows[0];
      widgets.push(widget);
      
      // Emit SSE event to overlay runtime
      try {
        await emitBotLayerEvent(
          targetOverlay.public_id,
          targetOverlay.user_id,
          'bot:widget:spawn',
          {
            id: widget.id,
            zone: widget.zone_key,
            type: widget.widget_type,
            config: widget.config,
            expiresAt: widget.expires_at,
            createdAt: widget.created_at
          }
        );
        console.log('[botLayer] Emitted bot:widget:spawn event for overlay:', targetOverlay.public_id);
      } catch (emitErr) {
        console.error('[botLayer] Failed to emit SSE event:', emitErr);
        // Don't fail the request if SSE emission fails
      }
    }
    
    res.json({
      ok: true,
      widgets: widgets.map(widget => ({
        id: widget.id,
        overlayId: widget.overlay_id,
        zone: widget.zone_key,
        type: widget.widget_type,
        config: widget.config,
        expiresAt: widget.expires_at,
        createdAt: widget.created_at
      })),
      overlaysUpdated: targetOverlays.length
    });
    
  } catch (err) {
    console.error('[botLayer] spawn-widget error:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to spawn widget',
      details: err.message
    });
  }
});

/**
 * DELETE /api/bot/clear-zone
 * Clears all widgets from a specific zone
 * 
 * Body:
 * {
 *   "channelId": 123,
 *   "overlayId": 456,        // Optional
 *   "zone": "LT",
 *   "requestedBy": "discord:user#1234",
 *   "userRole": "moderator"
 * }
 */
router.delete('/bot/clear-zone', requireBotAuth, async (req, res) => {
  try {
    const {
      channelId,
      overlayId,
      zone,
      requestedBy,
      userRole = 'viewer'
    } = req.body;
    
    if (!channelId || !zone || !requestedBy) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: channelId, zone, requestedBy'
      });
    }
    
    // Check permissions
    const permCheck = await checkBotPermissions(channelId, userRole);
    if (!permCheck.allowed) {
      return res.status(403).json({
        ok: false,
        error: permCheck.reason
      });
    }
    
    // Get ALL overlays for this user
    let targetOverlays;
    if (overlayId) {
      const { rows } = await db.query(
        `SELECT id, public_id FROM overlays WHERE id = $1`,
        [overlayId]
      );
      targetOverlays = rows;
    } else {
      const { rows } = await db.query(
        `SELECT id, public_id, user_id FROM overlays WHERE user_id = $1`,
        [channelId]
      );
      targetOverlays = rows;
    }
    
    if (!targetOverlays || targetOverlays.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No overlays found'
      });
    }
    
    let totalCleared = 0;
    
    // Clear zone on ALL overlays
    for (const targetOverlay of targetOverlays) {
      // Clear zone
      const { rowCount } = await db.query(
        `DELETE FROM bot_layer_widgets 
         WHERE overlay_id = $1 AND zone_key = $2`,
        [targetOverlay.id, zone]
      );
      
      totalCleared += rowCount;
      
      // Emit SSE event to overlay runtime
      try {
        await emitBotLayerEvent(
          targetOverlay.public_id,
          targetOverlay.user_id,
          'bot:widget:clear',
          { zone }
        );
        console.log('[botLayer] Emitted bot:widget:clear event for overlay:', targetOverlay.public_id);
      } catch (emitErr) {
        console.error('[botLayer] Failed to emit SSE event:', emitErr);
        // Don't fail the request if SSE emission fails
      }
    }
    
    res.json({
      ok: true,
      cleared: totalCleared,
      zone,
      overlaysUpdated: targetOverlays.length
    });
    
  } catch (err) {
    console.error('[botLayer] clear-zone error:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to clear zone',
      details: err.message
    });
  }
});

/**
 * GET /api/bot/active-widgets/:channelId
 * Get all active widgets for a channel's active overlay
 */
router.get('/bot/active-widgets/:channelId', requireBotAuth, async (req, res) => {
  try {
    const { channelId } = req.params;
    
    const overlay = await getActiveOverlay(channelId);
    if (!overlay) {
      return res.json({ ok: true, widgets: [] });
    }
    
    const { rows } = await db.query(
      `SELECT id, zone_key, widget_type, config, expires_at, created_by, created_at
       FROM bot_layer_widgets
       WHERE overlay_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [overlay.id]
    );
    
    res.json({
      ok: true,
      overlayId: overlay.id,
      overlayPublicId: overlay.public_id,
      widgets: rows
    });
    
  } catch (err) {
    console.error('[botLayer] active-widgets error:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch active widgets',
      details: err.message
    });
  }
});

export default router;
