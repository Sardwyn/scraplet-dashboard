import db from '../db.js';
import crypto from 'crypto';
import { searchIcons, getIconSvgAsPaths } from './vectorLibrary.js';

function estimateTextDimensions(text, fontSizePx = 48) {
  const avgCharRatio = 0.55; // average width/height ratio for modern sans-serif/serif fonts
  let cleanText = String(text || "").replace(/\{\{[^}]+\}\}/g, "SardwynStreamer"); // Estimate dynamic vars as 15 chars
  const lines = cleanText.split('\n');
  const maxLineLength = Math.max(...lines.map(l => l.length), 1);
  const width = Math.ceil(maxLineLength * fontSizePx * avgCharRatio) + 40; // add padding
  const height = Math.ceil(lines.length * fontSizePx * 1.35) + 20;
  return { width, height };
}

/**
 * Handles the execution of a Gemini tool call.
 */
export async function executeCanvasTool(guildId, userId, toolName, args) {
  try {
    switch (toolName) {
      case 'create_overlay': {
        const { name } = args;
        const newPublicId = crypto.randomUUID();
        const initialJson = { elements: [], timeline: { durationMs: 5000, tracks: [] }, settings: { width: 1920, height: 1080 } };
        
        const { rows } = await db.query(
          `INSERT INTO public.overlays (user_id, public_id, name, config_json)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [Number(userId), newPublicId, name, initialJson]
        );
        const newId = rows[0].id;
        return { success: true, overlayId: String(newId), message: `Created overlay '${name}'` };
      }

      case 'find_overlay_by_name': {
        const { name } = args;
        const { rows } = await db.query(
          `SELECT id, name FROM public.overlays 
           WHERE user_id = $1 AND name ILIKE $2
           LIMIT 1`,
          [Number(userId), `%${name}%`]
        );
        if (rows.length === 0) return { error: `No overlay found matching '${name}'` };
        return { success: true, overlayId: String(rows[0].id), name: rows[0].name };
      }

      case 'search_vector_library': {
        const { query } = args;
        const icons = await searchIcons(query, 5);
        if (!icons || icons.length === 0) return { error: `No icons found for '${query}'. Try a different keyword.` };
        return { success: true, icons };
      }

      case 'add_vector_to_overlay': {
        const { overlayId, iconId, fillColor, x, y, width } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        // Fetch and parse the SVG
        const svgData = await getIconSvgAsPaths(iconId);
        if (!svgData || svgData.paths.length === 0) return { error: `Failed to parse SVG for '${iconId}'` };

        const w = width || 100;
        const scale = w / svgData.viewBox.width;
        const h = svgData.viewBox.height * scale;

        // Create Path Elements for each parsed path
        for (const p of svgData.paths) {
          const elId = crypto.randomUUID();
          overlay.json.elements.push({
            id: elId,
            type: 'path',
            path: p,
            x: x || 0,
            y: y || 0,
            width: w,
            height: h,
            fillColor: fillColor || '#ffffff',
            fillOpacity: 1,
            locked: false,
            visible: true
          });
        }

        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Added vector ${iconId}` };
      }

      case 'add_text_to_overlay': {
        const { overlayId, text, fontFamily, color, fontSizePx, x, y } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const fSize = fontSizePx || 48;
        const { width: estimatedW, height: estimatedH } = estimateTextDimensions(text, fSize);

        const elId = crypto.randomUUID();
        overlay.json.elements.push({
          id: elId,
          type: 'text',
          text: text,
          fontFamily: fontFamily || 'Inter',
          color: color || '#ffffff',
          fontSizePx: fSize,
          x: x !== undefined ? x : 100,
          y: y !== undefined ? y : 100,
          width: estimatedW,
          height: estimatedH,
          locked: false,
          visible: true
        });

        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Added text: ${text}` };
      }

      case 'add_shape_to_overlay': {
        const { overlayId, shapeType, shape, backgroundColor, x, y, width, height } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const elId = crypto.randomUUID();
        const baseProps = {
          id: elId,
          type: shapeType,
          x, y, width, height,
          locked: false,
          visible: true
        };

        if (shapeType === 'box') {
          baseProps.backgroundColor = backgroundColor || '#ff0000';
          baseProps.borderRadiusPx = 8;
        } else if (shapeType === 'shape') {
          baseProps.shape = shape || 'rect';
          baseProps.fillColor = backgroundColor || '#ff0000';
          baseProps.fillOpacity = 1;
        }

        overlay.json.elements.push(baseProps);
        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Added ${shapeType}` };
      }

      case 'apply_theme_to_canvas': {
        const { overlayId, primaryColor, secondaryColor, accentColor } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const secCol = secondaryColor || '#000000';
        const accCol = accentColor || primaryColor || '#ff0055';

        for (const el of overlay.json.elements) {
          if (el.type === 'text') {
            el.color = primaryColor || el.color;
            if (el.strokeColor) el.strokeColor = accCol;
          } else if (el.type === 'box') {
            el.backgroundColor = secCol;
            if (el.strokeColor) el.strokeColor = accCol;
          } else if (el.type === 'shape') {
            el.fillColor = secCol;
            if (el.strokeColor) el.strokeColor = accCol;
          } else if (el.type === 'path') {
            el.fillColor = accCol;
            if (el.strokeColor) el.strokeColor = primaryColor || el.strokeColor;
          } else if (el.type === 'progressBar') {
            el.fillColor = accCol;
            el.backgroundColor = secCol;
          } else if (el.type === 'progressRing') {
            el.fillColor = accCol;
            el.backgroundColor = secCol;
          } else if (el.type === 'lower_third') {
            if (!el.style) el.style = {};
            el.style.bgColor = secCol;
            el.style.accentColor = accCol;
            el.style.titleColor = primaryColor || '#ffffff';
            el.style.subtitleColor = accCol;
            if (el.ticker) {
              el.ticker.bgColor = accCol;
              el.ticker.color = secCol;
            }
          }
        }

        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Theme applied successfully` };
      }

      case 'update_elements_layout': {
        const { overlayId, updates } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        for (const up of updates) {
          const el = overlay.json.elements.find(e => e.id === up.elementId);
          if (el) {
            if (up.x !== undefined) el.x = up.x;
            if (up.y !== undefined) el.y = up.y;
            if (up.width !== undefined) el.width = up.width;
            if (up.height !== undefined) el.height = up.height;
          }
        }

        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Layout updated for ${updates.length} elements` };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[geminiTools] error executing ${toolName}:`, err);
    return { error: `Execution failed: ${err.message}` };
  }
}

async function getUserIdFromGuild(guildId) {
  const { rows } = await db.query(
    `SELECT owner_user_id FROM public.discord_guild_integrations
     WHERE guild_id = $1 AND status = 'active'
     LIMIT 1`,
    [String(guildId)]
  );
  return rows[0] ? Number(rows[0].owner_user_id) : null;
}

async function getOverlay(overlayId, guildId) {
  const userId = await getUserIdFromGuild(guildId);
  if (!userId) return null;

  const { rows } = await db.query(
    `SELECT id, config_json FROM public.overlays 
     WHERE id = $1 AND user_id = $2`,
    [Number(overlayId), userId]
  );
  if (rows.length === 0) return null;
  return { id: rows[0].id, json: rows[0].config_json };
}

async function updateOverlay(overlayId, guildId, newJson) {
  const userId = await getUserIdFromGuild(guildId);
  if (!userId) return;

  const result = await db.query(
    `UPDATE public.overlays 
     SET config_json = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING user_id`,
    [newJson, Number(overlayId), userId]
  );

  if (result.rows.length > 0) {
    const ownerUserId = result.rows[0].user_id;
    // Broadcast via Postgres NOTIFY to the dashboard server
    const payload = JSON.stringify({
      type: 'canvas_updated',
      overlayId: Number(overlayId),
      ownerUserId
    });
    await db.query(`NOTIFY canvas_updated, '${payload}'`);
  }
}
