import db from '../db.js';
import crypto from 'crypto';
import { searchIcons, getIconSvgAsPaths } from './vectorLibrary.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tokensPath = path.join(__dirname, '../config/scrap-tokens.json');
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));

const archetypesPath = path.join(__dirname, '../config/scene-archetypes.json');
const archetypesData = JSON.parse(fs.readFileSync(archetypesPath, 'utf8'));


const ZONE_COORDINATES = {
  TOP_LEFT: { x: 50, y: 50, width: 400, height: 100 },
  TOP_CENTER: { x: 760, y: 50, width: 400, height: 100 },
  TOP_RIGHT: { x: 1470, y: 50, width: 400, height: 100 },
  MIDDLE_LEFT: { x: 50, y: 440, width: 400, height: 100 },
  CENTER_HUD: { x: 760, y: 440, width: 400, height: 100 },
  MIDDLE_RIGHT: { x: 1470, y: 440, width: 400, height: 100 },
  BOTTOM_LEFT: { x: 50, y: 900, width: 400, height: 100 },
  BOTTOM_CENTER: { x: 760, y: 900, width: 400, height: 100 },
  BOTTOM_RIGHT: { x: 1470, y: 900, width: 400, height: 100 }
};

function resolveAnchorPlacement(elements, zone, width, height, elementId = null, baseW = 1920, baseH = 1080) {
  const defaultZone = ZONE_COORDINATES[zone] || ZONE_COORDINATES.BOTTOM_LEFT;
  let w = width !== undefined ? width : defaultZone.width;
  let h = height !== undefined ? height : defaultZone.height;

  // Determine alignment based on zone name
  const isLeft = zone.endsWith('_LEFT');
  const isRight = zone.endsWith('_RIGHT');
  const isCenter = zone.endsWith('_CENTER') || zone === 'CENTER_HUD';

  const isTop = zone.startsWith('TOP_');
  const isBottom = zone.startsWith('BOTTOM_');
  const isMiddle = zone.startsWith('MIDDLE_') || zone === 'CENTER_HUD';

  // Calculate dynamic baseline X
  let x = 50;
  if (isCenter) {
    x = Math.round((baseW - w) / 2);
  } else if (isRight) {
    x = Math.round(baseW - w - 50);
  }

  // Clamp X within safe boundary
  x = Math.max(50, Math.min(baseW - w - 50, x));

  // Calculate dynamic baseline Y (before stacking)
  let baselineY = 50;
  if (isMiddle) {
    baselineY = Math.round((baseH - h) / 2);
  } else if (isBottom) {
    baselineY = Math.round(baseH - h - 50);
  }

  // Filter existing elements in this same anchor zone. Ignore full-bleed background elements for stacking.
  const zoneElements = (elements || []).filter(el => 
    el.anchorZone === zone && 
    el.id !== elementId && 
    !(el.width >= baseW - 100 && el.height >= baseH - 100)
  );

  let y = baselineY;

  if (zoneElements.length > 0) {
    // Stack them vertically. Find the bottom-most boundary in this zone
    let maxY = baselineY;
    for (const el of zoneElements) {
      const bottomY = (el.y || 0) + (el.height || 0);
      if (bottomY > maxY) {
        maxY = bottomY;
      }
    }
    // Add a clean 20px gap
    y = maxY + 20;
  }

  // Cross-Zone Overlap Prevention
  const allOtherElements = (elements || []).filter(el => 
    el.id !== elementId && 
    !(el.width >= baseW - 100 && el.height >= baseH - 100) &&
    el.anchorZone !== zone
  );

  for (const el of allOtherElements) {
    const elX = el.x || 0;
    const elW = el.width || 0;
    const elRight = elX + elW;
    const right = x + w;

    const elY = el.y || 0;
    const elH = el.height || 0;
    const elBottom = elY + elH;
    const bottom = y + h;

    const yOverlap = (y < elBottom && bottom > elY);
    const xOverlap = (x < elRight && right > elX);

    if (xOverlap && yOverlap) {
      if (isLeft && (el.anchorZone || '').endsWith('_RIGHT')) {
        // We are on the left, el is on the right. Shrink width.
        const maxW = elX - x - 20;
        if (maxW > 100) {
          w = maxW;
        }
      } else if (isRight && (el.anchorZone || '').endsWith('_LEFT')) {
        // We are on the right, el is on the left.
        // Push our X rightward and shrink width.
        const newX = elRight + 20;
        const maxW = baseW - newX - 50;
        if (maxW > 100) {
          x = newX;
          w = maxW;
        }
      }
    }
  }

  // Handle canvas boundaries
  if (y + h > baseH) {
    y = Math.max(50, baseH - h - 50);
  }

  return { x, y, width: w, height: h };
}

function estimateTextDimensions(text, fontSizePx = 48) {
  const avgCharRatio = 0.55; // average width/height ratio for modern sans-serif/serif fonts
  let cleanText = String(text || "").replace(/\{\{[^}]+\}\}/g, "SardwynStreamer"); // Estimate dynamic vars as 15 chars
  const lines = cleanText.split('\n');
  const maxLineLength = Math.max(...lines.map(l => l.length), 1);
  const width = Math.ceil(maxLineLength * fontSizePx * avgCharRatio) + 40; // add padding
  const height = Math.ceil(lines.length * fontSizePx * 1.35) + 20;
  return { width, height };
}

function getDominantTheme(elements) {
  const theme = {
    fontFamily: 'Inter',
    bgColor: '#111111',
    accentColor: '#4f46e5',
    textColor: '#ffffff',
    borderRadiusPx: 12,
    variant: 'accent-bar'
  };

  if (!elements || elements.length === 0) return theme;

  const fonts = {};
  const bgColors = {};
  const accentColors = {};
  const textColors = {};
  const radii = {};
  const variants = {};

  for (const el of elements) {
    // Fonts
    if (el.fontFamily) fonts[el.fontFamily] = (fonts[el.fontFamily] || 0) + 1;
    if (el.style?.fontFamily) fonts[el.style.fontFamily] = (fonts[el.style.fontFamily] || 0) + 1;

    // Backgrounds / Fills
    if (el.backgroundColor) bgColors[el.backgroundColor] = (bgColors[el.backgroundColor] || 0) + 1;
    if (el.style?.bgColor) bgColors[el.style.bgColor] = (bgColors[el.style.bgColor] || 0) + 1;

    // Accents / Strokes
    if (el.strokeColor) accentColors[el.strokeColor] = (accentColors[el.strokeColor] || 0) + 1;
    if (el.style?.accentColor) accentColors[el.style.accentColor] = (accentColors[el.style.accentColor] || 0) + 1;
    if (el.fillColor && el.type !== 'text') accentColors[el.fillColor] = (accentColors[el.fillColor] || 0) + 1;

    // Text Colors
    if (el.color) textColors[el.color] = (textColors[el.color] || 0) + 1;
    if (el.style?.titleColor) textColors[el.style.titleColor] = (textColors[el.style.titleColor] || 0) + 1;

    // Border Radius
    if (el.borderRadiusPx !== undefined) radii[el.borderRadiusPx] = (radii[el.borderRadiusPx] || 0) + 1;
    if (el.cornerRadiusPx !== undefined) radii[el.cornerRadiusPx] = (radii[el.cornerRadiusPx] || 0) + 1;
    if (el.style?.cornerRadiusPx !== undefined) radii[el.style.cornerRadiusPx] = (radii[el.style.cornerRadiusPx] || 0) + 1;

    // Variants
    if (el.style?.variant) variants[el.style.variant] = (variants[el.style.variant] || 0) + 1;
  }

  const getMostFrequent = (map) => {
    let max = 0;
    let result = null;
    for (const key in map) {
      if (map[key] > max) {
        max = map[key];
        result = key;
      }
    }
    return result;
  };

  const f = getMostFrequent(fonts);
  if (f) theme.fontFamily = f;

  const bg = getMostFrequent(bgColors);
  if (bg) theme.bgColor = bg;

  const acc = getMostFrequent(accentColors);
  if (acc) theme.accentColor = acc;

  const txt = getMostFrequent(textColors);
  if (txt) theme.textColor = txt;

  const r = getMostFrequent(radii);
  if (r !== null) theme.borderRadiusPx = Number(r);

  const v = getMostFrequent(variants);
  if (v) theme.variant = v;

  return theme;
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
        const initialJson = { elements: [], timeline: { durationMs: 5000, tracks: [] }, baseResolution: { width: 1920, height: 1080 }, settings: { width: 1920, height: 1080 } };
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + crypto.randomBytes(3).toString('hex');
        
        const { rows } = await db.query(
          `INSERT INTO public.overlays (user_id, public_id, name, config_json, slug)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [Number(userId), newPublicId, name, initialJson, slug]
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
        const { overlayId, primaryColor, secondaryColor, accentColor, structureId, paletteId } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const theme = getDominantTheme(overlay.json.elements);

        // 1. Resolve Palette / Skin
        let resBgColor = secondaryColor;
        let resPanelColor = secondaryColor;
        let resAccentColor = accentColor || primaryColor;
        let resTextColor = primaryColor;
        let resTextMuted = primaryColor;
        let resBgOpacity = undefined;

        if (paletteId && tokens.palettes[paletteId]) {
          const pal = tokens.palettes[paletteId];
          resBgColor = pal.bgColor;
          resPanelColor = pal.panelColor || pal.bgColor;
          resAccentColor = pal.accentColor;
          resTextColor = pal.textColor;
          resTextMuted = pal.textMuted || pal.textColor;
          resBgOpacity = pal.bgOpacity;
        } else {
          if (!resBgColor) resBgColor = theme.bgColor || "#111111";
          if (!resPanelColor) resPanelColor = theme.bgColor || "#111111";
          if (!resAccentColor) resAccentColor = theme.accentColor || "#4f46e5";
          if (!resTextColor) resTextColor = theme.textColor || "#ffffff";
          if (!resTextMuted) resTextMuted = theme.accentColor || "rgba(255,255,255,0.85)";
        }

        // 2. Resolve Structure / Bones
        let resFontFamily = undefined;
        let resBorderRadius = undefined;
        let resVariant = undefined;

        if (structureId && tokens.structures[structureId]) {
          const struct = tokens.structures[structureId];
          resFontFamily = struct.fontFamily;
          resBorderRadius = struct.borderRadiusPx;
          resVariant = struct.variant;
        }

        for (const el of overlay.json.elements) {
          if (el.type === 'text') {
            if (resTextColor) el.color = resTextColor;
            if (resFontFamily) el.fontFamily = resFontFamily;
            if (resAccentColor && el.strokeColor) el.strokeColor = resAccentColor;
          } else if (el.type === 'box') {
            if (resPanelColor) el.backgroundColor = resPanelColor;
            if (resAccentColor && el.strokeColor) el.strokeColor = resAccentColor;
            if (resBorderRadius !== undefined) el.borderRadiusPx = resBorderRadius;
          } else if (el.type === 'shape') {
            if (resPanelColor) el.fillColor = resPanelColor;
            if (resAccentColor && el.strokeColor) el.strokeColor = resAccentColor;
          } else if (el.type === 'path') {
            if (resAccentColor) el.fillColor = resAccentColor;
            if (resTextColor && el.strokeColor) el.strokeColor = resTextColor;
          } else if (el.type === 'progressBar') {
            if (resAccentColor) el.fillColor = resAccentColor;
            if (resBgColor) el.backgroundColor = resBgColor;
            if (resBorderRadius !== undefined) el.borderRadiusPx = resBorderRadius;
            if (structureId) el.structureId = structureId;
            if (paletteId) el.paletteId = paletteId;
          } else if (el.type === 'progressRing') {
            if (resAccentColor) el.fillColor = resAccentColor;
            if (resBgColor) el.backgroundColor = resBgColor;
            if (structureId) el.structureId = structureId;
            if (paletteId) el.paletteId = paletteId;
          } else if (el.type === 'lower_third') {
            if (!el.style) el.style = {};
            if (resPanelColor) el.style.bgColor = resPanelColor;
            if (resBgOpacity !== undefined) el.style.bgOpacity = resBgOpacity;
            if (resAccentColor) el.style.accentColor = resAccentColor;
            if (resTextColor) el.style.titleColor = resTextColor;
            if (resTextMuted) el.style.subtitleColor = resTextMuted;
            if (resFontFamily) el.style.fontFamily = resFontFamily;
            if (resBorderRadius !== undefined) el.style.cornerRadiusPx = resBorderRadius;
            if (resVariant) el.style.variant = resVariant;
            if (el.ticker) {
              if (resAccentColor) el.ticker.bgColor = resAccentColor;
              if (resPanelColor) el.ticker.color = resPanelColor;
            }
            if (structureId) el.structureId = structureId;
            if (paletteId) el.paletteId = paletteId;
          }
        }

        if (structureId) overlay.json.structureId = structureId;
        if (paletteId) overlay.json.paletteId = paletteId;

        await updateOverlay(overlayId, guildId, overlay.json);
        let msg = `Theme applied successfully`;
        if (structureId && paletteId) {
          msg = `Applied tokens theme (Bones: '${structureId}', Skin: '${paletteId}') to overlay elements.`;
        } else if (paletteId) {
          msg = `Applied colors from skin '${paletteId}' to overlay elements.`;
        } else if (structureId) {
          msg = `Applied layout/typography from bones '${structureId}' to overlay elements.`;
        }
        return { success: true, message: msg };
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

      case 'add_progress_bar_to_overlay': {
        const {
          overlayId, name,
          bindingSourceId, bindingFieldId, bindingFallback,
          x, y, width, height,
          backgroundColor, fillColor, borderRadiusPx, direction,
          customVariableName, customVariableDefaultValue,
          structureId, paletteId, anchorZone
        } = args;

        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const theme = getDominantTheme(overlay.json.elements);

        let resolvedSourceId = bindingSourceId;
        let resolvedFieldId = bindingFieldId;

        if (customVariableName) {
          if (!overlay.json.variables) {
            overlay.json.variables = [];
          }
          let existingVar = overlay.json.variables.find(v => v.name.toLowerCase() === customVariableName.toLowerCase());
          if (!existingVar) {
            existingVar = {
              id: crypto.randomUUID(),
              name: customVariableName,
              type: "number",
              value: customVariableDefaultValue !== undefined ? customVariableDefaultValue : 0,
              defaultValue: customVariableDefaultValue !== undefined ? customVariableDefaultValue : 0
            };
            overlay.json.variables.push(existingVar);
          }
          resolvedSourceId = "custom_variables";
          resolvedFieldId = existingVar.name;
        }

        let finalWidth = width !== undefined ? width : 400;
        let finalHeight = height !== undefined ? height : 30;
        let finalX = x;
        let finalY = y;

        if (x === undefined || y === undefined) {
          if (anchorZone) {
            const placement = resolveAnchorPlacement(overlay.json.elements, anchorZone, finalWidth, finalHeight);
            if (x === undefined) finalX = placement.x;
            if (y === undefined) finalY = placement.y;
            finalWidth = placement.width;
            finalHeight = placement.height;
          } else {
            if (x === undefined) finalX = 760;
            if (y === undefined) finalY = 500;
          }
        }

        let resBgColor = backgroundColor;
        let resFillColor = fillColor;
        let resBorderRadius = borderRadiusPx;

        if (paletteId && tokens.palettes[paletteId]) {
          const pal = tokens.palettes[paletteId];
          if (!resBgColor) resBgColor = pal.bgColor;
          if (!resFillColor) resFillColor = pal.accentColor;
        } else {
          if (!resBgColor) resBgColor = theme.bgColor || "#111111";
          if (!resFillColor) resFillColor = theme.accentColor || "#4f46e5";
        }

        if (structureId && tokens.structures[structureId]) {
          const struct = tokens.structures[structureId];
          if (resBorderRadius === undefined) resBorderRadius = struct.borderRadiusPx;
        } else {
          if (resBorderRadius === undefined) resBorderRadius = theme.borderRadiusPx !== undefined ? theme.borderRadiusPx : 8;
        }

        const elId = crypto.randomUUID();
        const element = {
          id: elId,
          type: "progressBar",
          name: name || `Progress Bar ${overlay.json.elements.length + 1}`,
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          direction: direction || "ltr",
          backgroundColor: resBgColor,
          fillColor: resFillColor,
          borderRadiusPx: resBorderRadius,
          visible: true,
          locked: false
        };

        if (resolvedSourceId && resolvedFieldId) {
          element.bindings = {
            value: {
              mode: "dynamic",
              sourceId: resolvedSourceId,
              fieldId: resolvedFieldId,
              fallback: bindingFallback !== undefined ? bindingFallback : 0
            }
          };
        }

        if (structureId) element.structureId = structureId;
        if (paletteId) element.paletteId = paletteId;
        if (anchorZone) element.anchorZone = anchorZone;

        overlay.json.elements.push(element);
        await updateOverlay(overlayId, guildId, overlay.json);
        return {
          success: true,
          message: `Added progress bar bound to ${resolvedSourceId || "static"}.${resolvedFieldId || "value"}${customVariableName ? ` (Registered custom variable '${customVariableName}')` : ""}`
        };
      }

      case 'add_progress_ring_to_overlay': {
        const {
          overlayId, name,
          bindingSourceId, bindingFieldId, bindingFallback,
          x, y, width, height, strokeWidthPx,
          backgroundColor, fillColor, startAngleDeg,
          customVariableName, customVariableDefaultValue,
          structureId, paletteId, anchorZone
        } = args;

        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const theme = getDominantTheme(overlay.json.elements);

        let resolvedSourceId = bindingSourceId;
        let resolvedFieldId = bindingFieldId;

        if (customVariableName) {
          if (!overlay.json.variables) {
            overlay.json.variables = [];
          }
          let existingVar = overlay.json.variables.find(v => v.name.toLowerCase() === customVariableName.toLowerCase());
          if (!existingVar) {
            existingVar = {
              id: crypto.randomUUID(),
              name: customVariableName,
              type: "number",
              value: customVariableDefaultValue !== undefined ? customVariableDefaultValue : 0,
              defaultValue: customVariableDefaultValue !== undefined ? customVariableDefaultValue : 0
            };
            overlay.json.variables.push(existingVar);
          }
          resolvedSourceId = "custom_variables";
          resolvedFieldId = existingVar.name;
        }

        let finalWidth = width !== undefined ? width : 200;
        let finalHeight = height !== undefined ? height : 200;
        let finalX = x;
        let finalY = y;

        if (x === undefined || y === undefined) {
          if (anchorZone) {
            const placement = resolveAnchorPlacement(overlay.json.elements, anchorZone, finalWidth, finalHeight);
            if (x === undefined) finalX = placement.x;
            if (y === undefined) finalY = placement.y;
            finalWidth = placement.width;
            finalHeight = placement.height;
          } else {
            if (x === undefined) finalX = 860;
            if (y === undefined) finalY = 440;
          }
        }

        let resBgColor = backgroundColor;
        let resFillColor = fillColor;

        if (paletteId && tokens.palettes[paletteId]) {
          const pal = tokens.palettes[paletteId];
          if (!resBgColor) resBgColor = pal.bgColor;
          if (!resFillColor) resFillColor = pal.accentColor;
        } else {
          if (!resBgColor) resBgColor = theme.bgColor || "#111111";
          if (!resFillColor) resFillColor = theme.accentColor || "#4f46e5";
        }

        const elId = crypto.randomUUID();
        const element = {
          id: elId,
          type: "progressRing",
          name: name || `Progress Ring ${overlay.json.elements.length + 1}`,
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          strokeWidthPx: strokeWidthPx !== undefined ? strokeWidthPx : 16,
          backgroundColor: resBgColor,
          fillColor: resFillColor,
          startAngleDeg: startAngleDeg !== undefined ? startAngleDeg : -90,
          visible: true,
          locked: false
        };

        if (resolvedSourceId && resolvedFieldId) {
          element.bindings = {
            value: {
              mode: "dynamic",
              sourceId: resolvedSourceId,
              fieldId: resolvedFieldId,
              fallback: bindingFallback !== undefined ? bindingFallback : 0
            }
          };
        }

        if (structureId) element.structureId = structureId;
        if (paletteId) element.paletteId = paletteId;
        if (anchorZone) element.anchorZone = anchorZone;

        overlay.json.elements.push(element);
        await updateOverlay(overlayId, guildId, overlay.json);
        return {
          success: true,
          message: `Added progress ring bound to ${resolvedSourceId || "static"}.${resolvedFieldId || "value"}${customVariableName ? ` (Registered custom variable '${customVariableName}')` : ""}`
        };
      }

      case 'add_lower_third_to_overlay': {
        const {
          overlayId, name,
          title, subtitle, alwaysOn,
          layoutMode, variant,
          bindingTitleKey, bindingSubtitleKey, bindingActiveKey,
          x, y, width, height,
          fontFamily, bgColor, bgOpacity, accentColor,
          structureId, paletteId, anchorZone
        } = args;

        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const theme = getDominantTheme(overlay.json.elements);

        let finalWidth = width !== undefined ? width : 800;
        let finalHeight = height !== undefined ? height : 120;
        let finalX = x;
        let finalY = y;

        if (x === undefined || y === undefined) {
          if (anchorZone) {
            const placement = resolveAnchorPlacement(overlay.json.elements, anchorZone, finalWidth, finalHeight);
            if (x === undefined) finalX = placement.x;
            if (y === undefined) finalY = placement.y;
            finalWidth = placement.width;
            finalHeight = placement.height;
          } else {
            if (x === undefined) finalX = 560;
            if (y === undefined) finalY = 900;
          }
        }

        let resBgColor = bgColor;
        let resBgOpacity = bgOpacity;
        let resAccentColor = accentColor;
        let resTitleColor = undefined;
        let resSubtitleColor = undefined;

        if (paletteId && tokens.palettes[paletteId]) {
          const pal = tokens.palettes[paletteId];
          if (!resBgColor) resBgColor = pal.panelColor || pal.bgColor;
          if (resBgOpacity === undefined) resBgOpacity = pal.bgOpacity !== undefined ? pal.bgOpacity : 0.75;
          if (!resAccentColor) resAccentColor = pal.accentColor;
          resTitleColor = pal.textColor;
          resSubtitleColor = pal.textMuted || pal.textColor;
        } else {
          if (!resBgColor) resBgColor = theme.bgColor || "#111111";
          if (resBgOpacity === undefined) resBgOpacity = 0.75;
          if (!resAccentColor) resAccentColor = theme.accentColor || "#4f46e5";
          resTitleColor = theme.textColor || "#ffffff";
          resSubtitleColor = accentColor || theme.accentColor || "rgba(255,255,255,0.85)";
        }

        let resFontFamily = fontFamily;
        let resCornerRadius = undefined;
        let resVariant = variant;
        let resPadding = 20;

        if (structureId && tokens.structures[structureId]) {
          const struct = tokens.structures[structureId];
          if (!resFontFamily) resFontFamily = struct.fontFamily;
          resCornerRadius = struct.borderRadiusPx;
          if (!resVariant) resVariant = struct.variant || "accent-bar";
          resPadding = struct.paddingPx !== undefined ? struct.paddingPx : 20;
        } else {
          if (!resFontFamily) resFontFamily = theme.fontFamily || "Inter";
          resCornerRadius = theme.borderRadiusPx !== undefined ? theme.borderRadiusPx : 18;
          if (!resVariant) resVariant = theme.variant || "accent-bar";
        }

        const elId = crypto.randomUUID();
        const element = {
          id: elId,
          type: "lower_third",
          name: name || `Lower Third ${overlay.json.elements.length + 1}`,
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          alwaysOn: alwaysOn !== undefined ? alwaysOn : true,
          layout: {
            mode: layoutMode || "stacked",
            splitRatio: 0.6
          },
          style: {
            variant: resVariant,
            paddingPx: resPadding,
            cornerRadiusPx: resCornerRadius,
            bgColor: resBgColor,
            bgOpacity: resBgOpacity,
            accentColor: resAccentColor,
            fontFamily: resFontFamily,
            titleColor: resTitleColor,
            subtitleColor: resSubtitleColor,
            titleSizePx: 36,
            subtitleSizePx: 22,
            titleWeight: "bold"
          },
          visible: true,
          locked: false
        };

        if (title !== undefined) element.title = title;
        if (subtitle !== undefined) element.subtitle = subtitle;

        if (bindingTitleKey || bindingSubtitleKey || bindingActiveKey) {
          element.bind = {
            titleKey: bindingTitleKey || "lower_third.title",
            subtitleKey: bindingSubtitleKey || "lower_third.subtitle",
            activeKey: bindingActiveKey || "lower_third.active"
          };
        }

        if (structureId) element.structureId = structureId;
        if (paletteId) element.paletteId = paletteId;
        if (anchorZone) element.anchorZone = anchorZone;

        overlay.json.elements.push(element);
        await updateOverlay(overlayId, guildId, overlay.json);
        return { success: true, message: `Added lower third banner with title '${title || ""}'` };
      }

      case 'apply_scene_template': {
        const { overlayId, archetypeId, variantId, structureId, paletteId, sceneIntent } = args;
        const overlay = await getOverlay(overlayId, guildId);
        if (!overlay) return { error: `Overlay not found` };

        const arch = archetypesData.archetypes[archetypeId];
        if (!arch) return { error: `Invalid archetypeId: '${archetypeId}'` };

        const variant = arch.variants[variantId];
        if (!variant) return { error: `Invalid variantId: '${variantId}' for archetype '${archetypeId}'` };

        // 1. Reset canvas elements for the new template blueprint
        overlay.json.elements = [];

        // 2. Resolve default/neutral structural and palette tokens
        const sId = structureId || 'minimalist';
        const pId = paletteId || 'carbon_slate';

        const structToken = tokens.structures[sId] || tokens.structures.minimalist;
        const paletteToken = tokens.palettes[pId] || tokens.palettes.carbon_slate;

        const baseW = overlay.json.baseResolution?.width || 1920;
        const baseH = overlay.json.baseResolution?.height || 1080;

        // 3. Process Scene Intent Multipliers
        let spacingMultiplier = 1.0;
        let webcamScale = 1.0;
        let chatScale = 1.0;
        let gameScale = 1.0;
        let globalRadiusOverride = null;
        let borderWidthOverride = null;
        let transitionStyle = null;
        let pulsingGlow = false;

        if (sceneIntent) {
          const { energy, focus, density, tone } = sceneIntent;

          // Energy Level Animation settings
          if (energy === 'high') {
            transitionStyle = '0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            pulsingGlow = true;
          } else if (energy === 'calm') {
            transitionStyle = '0.8s ease-in-out';
          }

          // Focus scale multipliers
          if (focus === 'creator') {
            webcamScale = 1.2;
            chatScale = 0.8;
            gameScale = 0.8;
          } else if (focus === 'chat') {
            chatScale = 1.25;
            webcamScale = 0.8;
          } else if (focus === 'gameplay') {
            gameScale = 1.15;
            webcamScale = 0.85;
            chatScale = 0.85;
          }

          // Density Spacing
          if (density === 'minimal') {
            spacingMultiplier = 1.5;
          } else if (density === 'packed') {
            spacingMultiplier = 0.7;
          }

          // Visual Tone Style overrides
          if (tone === 'competitive') {
            globalRadiusOverride = 0;
            borderWidthOverride = 3;
          } else if (tone === 'cozy') {
            globalRadiusOverride = 24;
            borderWidthOverride = 1;
          }
        }

        // 4. Synthesize styles from design tokens with intent overrides
        const finalFont = structToken.fontFamily;
        const finalRadius = globalRadiusOverride !== null ? globalRadiusOverride : structToken.borderRadiusPx;
        const finalBorderWidth = borderWidthOverride !== null ? borderWidthOverride : structToken.borderWidthPx;
        const finalBorderStyle = structToken.borderStyle;
        const finalPadding = Math.round(structToken.paddingPx * spacingMultiplier);

        const activeColors = {
          bgColor: paletteToken.bgColor,
          panelColor: paletteToken.panelColor,
          accentColor: paletteToken.accentColor,
          textColor: paletteToken.textColor,
          textMuted: paletteToken.textMuted,
          bgOpacity: paletteToken.bgOpacity
        };

        // 5. Generate and composite blueprint elements
        for (const bp of variant.elements) {
          const bpNameLower = bp.name.toLowerCase();

          // If density is minimalist, filter out minor auxiliary widgets
          if (sceneIntent && sceneIntent.density === 'minimal') {
            if (bpNameLower.includes('goal') || bpNameLower.includes('tracker') || bpNameLower.includes('social') || bpNameLower.includes('label')) {
              continue; // Skip optional items for minimal density
            }
          }

          // Calculate raw pixel dimensions from percentages
          let w = Math.round(baseW * (bp.widthPct / 100));
          let h = Math.round(baseH * (bp.heightPct / 100));
          let finalX, finalY;

          if (bp.widthPct === 100 && bp.heightPct === 100) {
            // Full bleed elements (e.g. wallpapers, background camera backdrops)
            // bypass scaling, boundary clamps, and grid stacking, positioning perfectly at X=0, Y=0
            w = baseW;
            h = baseH;
            finalX = 0;
            finalY = 0;
          } else {
            // Apply Focus Multipliers
            if (bpNameLower.includes('cam') || bpNameLower.includes('facecam') || bpNameLower.includes('webcam')) {
              w = Math.round(w * webcamScale);
              h = Math.round(h * webcamScale);
            } else if (bpNameLower.includes('chat')) {
              w = Math.round(w * chatScale);
              h = Math.round(h * chatScale);
            } else if (bpNameLower.includes('game') || bpNameLower.includes('gameplay')) {
              w = Math.round(w * gameScale);
              h = Math.round(h * gameScale);
            }

            // Safety limits to clamp within standard frame boundaries
            w = Math.min(baseW - 100, Math.max(100, w));
            h = Math.min(baseH - 100, Math.max(50, h));

            // Calculate safe non-overlapping coordinates inside anchor zone
            const placement = resolveAnchorPlacement(
              overlay.json.elements,
              bp.anchorZone,
              w,
              h,
              null,
              baseW,
              baseH
            );
            finalX = placement.x;
            finalY = placement.y;
          }


          // Resolve visual keys (map keys to token values if dynamic)
          const resolvedStyles = { ...bp.style };
          for (const key of Object.keys(bp.style || {})) {
            if (key.endsWith('Key')) {
              const targetProp = key.slice(0, -3); // e.g. "backgroundColor"
              const tokenColorKey = bp.style[key]; // e.g. "bgColor"
              resolvedStyles[targetProp] = activeColors[tokenColorKey] || tokenColorKey;
              delete resolvedStyles[key]; // remove the Key suffix property
            }
          }

          // Construct the concrete canvas element
          const elId = crypto.randomUUID();
          let targetType = bp.type;
          if (bp.type === 'progress_bar') targetType = 'progressBar';
          if (bp.type === 'progress_ring') targetType = 'progressRing';
          const element = {
            id: elId,
            type: targetType,
            name: bp.name,
            x: finalX,
            y: finalY,
            width: w,
            height: h,
            visible: true,
            locked: false
          };

          // Apply specific widget structures
          if (bp.type === 'shape') {
            element.shapeType = resolvedStyles.shapeType || 'box';
            element.shape = resolvedStyles.shape || 'rect';
            element.backgroundColor = resolvedStyles.backgroundColor || activeColors.panelColor;
            element.style = {
              borderRadiusPx: finalRadius,
              borderWidthPx: finalBorderWidth,
              borderStyle: finalBorderStyle,
              borderColor: resolvedStyles.borderColor || activeColors.accentColor,
              bgOpacity: activeColors.bgOpacity
            };
          } else if (bp.type === 'text') {
            element.text = resolvedStyles.text || bp.name;
            element.fontFamily = finalFont;
            element.color = resolvedStyles.color || activeColors.textColor;
            element.fontSizePx = resolvedStyles.fontSizePx || 32;
          } else if (bp.type === 'widget') {
            element.widgetId = bp.widgetId;
            element.liveDataSource = { sseEventType: null };
            element.propOverrides = {};
          } else if (bp.type === 'progress_bar') {
            element.bindingSourceId = resolvedStyles.bindingSourceId || 'custom_variables';
            element.bindingFieldId = resolvedStyles.bindingFieldId || 'progress';
            element.bindingFallback = resolvedStyles.bindingFallback !== undefined ? resolvedStyles.bindingFallback : 0.5;
            element.direction = resolvedStyles.direction || 'ltr';
            element.style = {
              borderRadiusPx: finalRadius,
              backgroundColor: resolvedStyles.backgroundColor || activeColors.panelColor,
              fillColor: resolvedStyles.fillColor || activeColors.accentColor
            };
          } else if (bp.type === 'progress_ring') {
            element.bindingSourceId = resolvedStyles.bindingSourceId || 'custom_variables';
            element.bindingFieldId = resolvedStyles.bindingFieldId || 'progress';
            element.bindingFallback = resolvedStyles.bindingFallback !== undefined ? resolvedStyles.bindingFallback : 0.5;
            element.strokeWidthPx = resolvedStyles.strokeWidthPx || 12;
            element.startAngleDeg = resolvedStyles.startAngleDeg !== undefined ? resolvedStyles.startAngleDeg : -90;
            element.style = {
              backgroundColor: resolvedStyles.backgroundColor || activeColors.panelColor,
              fillColor: resolvedStyles.fillColor || activeColors.accentColor
            };
          } else if (bp.type === 'lower_third') {
            element.title = resolvedStyles.title || bp.name;
            element.subtitle = resolvedStyles.subtitle || '';
            element.alwaysOn = resolvedStyles.alwaysOn !== undefined ? resolvedStyles.alwaysOn : true;
            element.layout = {
              mode: resolvedStyles.layoutMode || 'stacked',
              splitRatio: 0.6
            };
            element.style = {
              variant: resolvedStyles.variant || 'solid',
              paddingPx: finalPadding,
              cornerRadiusPx: finalRadius,
              bgColor: resolvedStyles.bgColor || activeColors.panelColor,
              bgOpacity: resolvedStyles.bgOpacity !== undefined ? resolvedStyles.bgOpacity : activeColors.bgOpacity,
              accentColor: resolvedStyles.accentColor || activeColors.accentColor,
              fontFamily: finalFont,
              titleColor: activeColors.textColor,
              subtitleColor: activeColors.textMuted,
              titleSizePx: 36,
              subtitleSizePx: 22,
              titleWeight: 'bold'
            };
          }

          // Inject Scene Intent style modifiers (transitions, glow effects)
          if (element.style) {
            if (transitionStyle) {
              element.style.transition = transitionStyle;
            }
            if (pulsingGlow) {
              element.style.boxShadow = `0 0 15px ${activeColors.accentColor}`;
              element.style.animation = 'pulse 2s infinite ease-in-out';
            }
          }

          // Persist token references in elements for live token refreshes
          element.structureId = sId;
          element.paletteId = pId;
          element.anchorZone = bp.anchorZone;

          overlay.json.elements.push(element);
        }

        await updateOverlay(overlayId, guildId, overlay.json);
        return {
          success: true,
          overlayId,
          message: `Successfully applied scene archetype '${arch.displayName}' (${variant.displayName}) to overlay with ${sId} structures and ${pId} colors.`
        };
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
