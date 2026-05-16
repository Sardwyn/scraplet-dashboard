import db from '../db.js';

/**
 * Ensures a bot layer exists for an overlay
 * This is a safety net - the database trigger should handle this automatically
 * 
 * @param {number} overlayId - The overlay ID
 * @returns {Promise<boolean>} - True if created, false if already existed
 */
export async function ensureBotLayer(overlayId) {
  try {
    const { rows } = await db.query(
      `INSERT INTO overlay_bot_layers (overlay_id)
       VALUES ($1)
       ON CONFLICT (overlay_id) DO NOTHING
       RETURNING overlay_id`,
      [overlayId]
    );
    
    return rows.length > 0; // True if inserted, false if already existed
  } catch (err) {
    console.error('[ensureBotLayer] Error:', err);
    throw err;
  }
}

/**
 * Ensures bot layers exist for multiple overlays
 * 
 * @param {number[]} overlayIds - Array of overlay IDs
 * @returns {Promise<number>} - Number of bot layers created
 */
export async function ensureBotLayersForOverlays(overlayIds) {
  if (!overlayIds || overlayIds.length === 0) return 0;
  
  try {
    const { rows } = await db.query(
      `INSERT INTO overlay_bot_layers (overlay_id)
       SELECT unnest($1::int[])
       ON CONFLICT (overlay_id) DO NOTHING
       RETURNING overlay_id`,
      [overlayIds]
    );
    
    return rows.length;
  } catch (err) {
    console.error('[ensureBotLayersForOverlays] Error:', err);
    throw err;
  }
}

/**
 * Gets bot layer configuration for an overlay
 * 
 * @param {number} overlayId - The overlay ID
 * @returns {Promise<object|null>} - Bot layer config or null
 */
export async function getBotLayer(overlayId) {
  try {
    const { rows } = await db.query(
      `SELECT overlay_id, zones, enabled, created_at
       FROM overlay_bot_layers
       WHERE overlay_id = $1`,
      [overlayId]
    );
    
    return rows[0] || null;
  } catch (err) {
    console.error('[getBotLayer] Error:', err);
    throw err;
  }
}

/**
 * Gets active bot widgets for an overlay
 * 
 * @param {number} overlayId - The overlay ID
 * @returns {Promise<array>} - Array of active widgets
 */
export async function getActiveBotWidgets(overlayId) {
  try {
    const { rows } = await db.query(
      `SELECT id, zone_key, widget_type, config, expires_at, created_by, created_at
       FROM bot_layer_widgets
       WHERE overlay_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [overlayId]
    );
    
    return rows;
  } catch (err) {
    console.error('[getActiveBotWidgets] Error:', err);
    throw err;
  }
}

export default {
  ensureBotLayer,
  ensureBotLayersForOverlays,
  getBotLayer,
  getActiveBotWidgets
};
