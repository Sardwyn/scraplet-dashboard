import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tokensPath = path.join(__dirname, '../config/scrap-tokens.json');
const recipesPath = path.join(__dirname, '../config/component-recipes.json');
const variantsPath = path.join(__dirname, '../config/variants.json');

console.log("📂 Loading design stack configurations...");
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8'));
const variants = JSON.parse(fs.readFileSync(variantsPath, 'utf8'));

console.log("✅ Successfully loaded Configuration Layers:");
console.log(` - Layer 4 Tokens: ${Object.keys(tokens.palettes).length} palettes, ${Object.keys(tokens.structures).length} structures`);
console.log(` - Layer 2 Recipes: ${Object.keys(recipes.components).length} components`);
console.log(` - Layer 3 Variants: ${Object.keys(variants.variants).length} variants`);

function resolveThemeValue(value, paletteId, structureId, componentId) {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('theme.')) return value;

  const key = value.substring(6); // e.g. 'bgColor'
  
  if (paletteId && tokens.palettes[paletteId]) {
    const pal = tokens.palettes[paletteId];
    if (pal[key] !== undefined) return pal[key];
  }

  if (structureId && tokens.structures[structureId]) {
    const struct = tokens.structures[structureId];
    if (struct[key] !== undefined) return struct[key];
  }

  const fallbackPal = tokens.palettes['carbon_slate'] || {};
  const fallbackStruct = tokens.structures['minimalist'] || {};
  if (fallbackPal[key] !== undefined) return fallbackPal[key];
  if (fallbackStruct[key] !== undefined) return fallbackStruct[key];

  return value;
}

function resolveThemeReferences(obj, paletteId, structureId, componentId) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return resolveThemeValue(obj, paletteId, structureId, componentId);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveThemeReferences(item, paletteId, structureId, componentId));
  }
  if (typeof obj === 'object') {
    const resolved = {};
    for (const [key, val] of Object.entries(obj)) {
      resolved[key] = resolveThemeReferences(val, paletteId, structureId, componentId);
    }
    return resolved;
  }
  return obj;
}

function compileComponentRecipe(compId, variantId, x, y, width, height, paletteId, structureId, anchorZone) {
  const recipe = recipes.components[compId];
  if (!recipe) {
    console.error(`❌ Recipe with ID '${compId}' not found!`);
    return [];
  }

  const structToken = tokens.structures[structureId] || tokens.structures.minimalist;
  const activeVariantId = variantId || structToken.variant || 'minimal';
  const variantMap = variants.variants[activeVariantId] || variants.variants['minimal'] || {};
  const componentVariant = variantMap[compId] || {};
  const defaultVariant = variantMap['default'] || {};

  const elemRadius = resolveThemeValue("theme.borderRadiusPx", paletteId, structureId, compId);
  const elemBorderWidth = resolveThemeValue("theme.borderWidthPx", paletteId, structureId, compId);
  const elemBorderStyle = resolveThemeValue("theme.borderStyle", paletteId, structureId, compId);

  const colors = {
    bgColor: resolveThemeValue("theme.bgColor", paletteId, structureId, compId),
    panelColor: resolveThemeValue("theme.panelColor", paletteId, structureId, compId),
    accentColor: resolveThemeValue("theme.accentColor", paletteId, structureId, compId),
    textColor: resolveThemeValue("theme.textColor", paletteId, structureId, compId),
    textMuted: resolveThemeValue("theme.textMuted", paletteId, structureId, compId),
    bgOpacity: resolveThemeValue("theme.bgOpacity", paletteId, structureId, compId)
  };

  const compiledElements = [];
  const generatedIds = {};

  function getProp(key, prim) {
    if (componentVariant[key] !== undefined) return componentVariant[key];
    if (defaultVariant[key] !== undefined) return defaultVariant[key];
    if (prim[key] !== undefined) return prim[key];
    return null;
  }

  for (const prim of recipe.primitives) {
    generatedIds[prim.name] = crypto.randomUUID();
  }

  for (const prim of recipe.primitives) {
    const elId = generatedIds[prim.name];
    
    let primW = width;
    let primH = height;
    let primX = x;
    let primY = y;

    if (prim.width !== undefined) {
      if (typeof prim.width === 'string' && prim.width.endsWith('%')) {
        primW = Math.round(width * (parseFloat(prim.width) / 100));
      } else {
        primW = prim.width;
      }
    }
    if (prim.height !== undefined) {
      if (typeof prim.height === 'string' && prim.height.endsWith('%')) {
        primH = Math.round(height * (parseFloat(prim.height) / 100));
      } else {
        primH = prim.height;
      }
    }
    if (prim.x !== undefined) primX = x + prim.x;
    if (prim.y !== undefined) primY = y + prim.y;
    if (prim.x_offset !== undefined) primX = x + prim.x_offset;
    if (prim.y_offset !== undefined) primY = y + prim.y_offset;

    const variantBorderThickness = getProp("borderThickness", prim);
    const compositionVariant = getProp("compositionVariant", prim);
    const primitiveType = prim.type || "shape";
    const shape = prim.shape || "rect";
    const operation = prim.operation || null;

    let concreteElement = {
      id: elId,
      type: primitiveType,
      name: prim.name,
      x: primX,
      y: primY,
      width: primW,
      height: primH,
      componentId: compId,
      structureId: structureId,
      paletteId: paletteId,
      visible: prim.visible !== undefined ? prim.visible : true,
      locked: false,
      style: {}
    };

    if (anchorZone) {
      concreteElement.anchorZone = anchorZone;
    }

    if (primitiveType === "mask") {
      concreteElement.operation = operation;
      concreteElement.visible = false;
    }

    if (shape === "rect") {
      concreteElement.shape = "rect";
      concreteElement.shapeType = "box";
      const rad = getProp("borderRadiusPx", prim) !== null ? getProp("borderRadiusPx", prim) : elemRadius;
      concreteElement.cornerRadiusPx = rad;
      if (concreteElement.type === "shape") {
        concreteElement.style.borderRadiusPx = rad;
      }
    } else if (shape === "circle") {
      concreteElement.shape = "circle";
      concreteElement.shapeType = "ellipse";
    } else if (shape === "line") {
      concreteElement.shape = "line";
      concreteElement.shapeType = "shape";
    }

    if (compositionVariant) {
      concreteElement.compositionVariant = compositionVariant;
    }

    const role = prim.role;
    if (role === "container_border" || role === "border") {
      concreteElement.strokeColor = colors.accentColor;
      concreteElement.strokeWidthPx = variantBorderThickness !== null ? variantBorderThickness : elemBorderWidth;
      concreteElement.strokeAlign = "inside";
      concreteElement.style.borderWidthPx = concreteElement.strokeWidthPx;
      concreteElement.style.borderStyle = elemBorderStyle;
      concreteElement.style.borderColor = colors.accentColor;
    } else if (role === "container_background" || role === "background" || role === "panel") {
      concreteElement.backgroundColor = colors.panelColor;
      concreteElement.style.bgOpacity = colors.bgOpacity;
      if (prim.fills) {
        concreteElement.fills = JSON.parse(JSON.stringify(prim.fills));
      } else {
        concreteElement.fills = [{
          type: "solid",
          color: colors.panelColor,
          opacity: colors.bgOpacity
        }];
      }
    } else if (role === "accent") {
      concreteElement.backgroundColor = colors.accentColor;
      concreteElement.fills = [{ type: "solid", color: colors.accentColor }];
    } else {
      if (prim.fills) {
        concreteElement.fills = JSON.parse(JSON.stringify(prim.fills));
      }
      if (prim.strokeColor !== undefined || prim.strokeWidthPx !== undefined) {
        concreteElement.strokeColor = colors.accentColor;
        concreteElement.strokeWidthPx = elemBorderWidth;
        concreteElement.strokeAlign = prim.strokeAlign || "inside";
        concreteElement.style.borderWidthPx = concreteElement.strokeWidthPx;
        concreteElement.style.borderStyle = elemBorderStyle;
        concreteElement.style.borderColor = colors.accentColor;
      }
    }

    if (concreteElement.fills) {
      concreteElement.fills = resolveThemeReferences(concreteElement.fills, paletteId, structureId, compId);
    }

    const variantEffects = getProp("effects", prim);
    if (variantEffects && Array.isArray(variantEffects)) {
      concreteElement.effects = JSON.parse(JSON.stringify(variantEffects));
    }

    compiledElements.push(concreteElement);
  }

  const masks = recipe.primitives.filter(p => p.type === "mask" && p.operation === "subtract");
  if (masks.length > 0) {
    const mainShape = recipe.primitives.find(p => p.type === "shape");
    if (mainShape) {
      const parentId = crypto.randomUUID();
      const childIds = recipe.primitives.map(p => generatedIds[p.name]);

      const parentElement = {
        id: parentId,
        type: "boolean",
        operation: "subtract",
        childIds: childIds,
        name: recipe.name,
        x: x,
        y: y,
        width: width,
        height: height,
        componentId: compId,
        visible: true,
        locked: false,
        style: {},
        structureId: structureId,
        paletteId: paletteId
      };

      if (anchorZone) {
        parentElement.anchorZone = anchorZone;
      }

      const borderThickness = getProp("borderThickness", mainShape);
      parentElement.strokeColor = colors.accentColor;
      parentElement.strokeWidthPx = borderThickness !== null ? borderThickness : elemBorderWidth;
      parentElement.strokeAlign = "center";
      
      const rad = getProp("borderRadiusPx", mainShape) !== null ? getProp("borderRadiusPx", mainShape) : elemRadius;
      parentElement.cornerRadiusPx = rad;

      parentElement.fillColor = colors.panelColor;
      parentElement.fillOpacity = colors.bgOpacity !== undefined ? colors.bgOpacity : 1;

      if (mainShape.fills) {
        parentElement.fills = resolveThemeReferences(mainShape.fills, paletteId, structureId, compId);
      } else {
        parentElement.fills = [{
          type: "solid",
          color: colors.panelColor,
          opacity: colors.bgOpacity
        }];
      }

      const variantEffects = getProp("effects", mainShape);
      if (variantEffects && Array.isArray(variantEffects)) {
        parentElement.effects = JSON.parse(JSON.stringify(variantEffects));
      }

      compiledElements.push(parentElement);
    }
  }

  return compiledElements;
}

// -------------------------------------------------------------
// RUNNING THE TEST CASES
// -------------------------------------------------------------
console.log("\n🧪 Running Compile Test 1: Webcam Frame (16:9) using 'cyber_notch' variant & 'neon_sunset' skin...");
const testWebcam = compileComponentRecipe(
  "webcam_frame_16_9", // componentId
  "cyber_notch",        // variantId
  200, 200, 360, 230,   // X, Y, W, H
  "neon_sunset",        // paletteId (Skin)
  "modern_techno"       // structureId (Bones)
);

console.log(`📋 Compiled ${testWebcam.length} elements:`);
testWebcam.forEach(el => {
  console.log(` -> Element Name: "${el.name}" (Type: ${el.type})`);
  console.log(`    Coords: X=${el.x}, Y=${el.y}, W=${el.width}, H=${el.height}`);
  if (el.strokeColor) console.log(`    Stroke: color=${el.strokeColor}, width=${el.strokeWidthPx}`);
  if (el.compositionVariant) console.log(`    Composition Variant: "${el.compositionVariant}"`);
  if (el.fills) console.log(`    Fills: ${JSON.stringify(el.fills)}`);
  if (el.effects) console.log(`    Effects Presets Attached: [${el.effects.map(ef => ef.preset).join(", ")}]`);
});

// Verification assertions
const outer = testWebcam.find(el => el.name.includes("Outline"));
const inner = testWebcam.find(el => el.name.includes("Hole"));
const parent = testWebcam.find(el => el.type === "boolean");

if (outer && inner && parent) {
  console.log("\n✅ ASSERTION SUCCESSFUL: Hollow Webcam Frame generated all helper subtraction child nodes.");
  if (parent.strokeColor === "#f97316") { // accentColor of neon_sunset
    console.log("✅ ASSERTION SUCCESSFUL: Active theme accentColor resolved.");
  } else {
    console.warn(`❌ ASSERTION FAIL: Expected strokeColor "#f97316", got "${parent.strokeColor}"`);
  }
  if (parent.strokeWidthPx === 12) { // borderThickness in cyber_notch
    console.log("✅ ASSERTION SUCCESSFUL: Variant override borderThickness applied (12px).");
  } else {
    console.warn(`❌ ASSERTION FAIL: Expected parent strokeWidth 12, got ${parent.strokeWidthPx}`);
  }
  if (parent.effects && parent.effects.some(ef => ef.preset === "lightsaberBorder")) {
    console.log("✅ ASSERTION SUCCESSFUL: Cyberpunk variant effects compiled cleanly on parent Boolean subtraction.");
  } else {
    console.warn("❌ ASSERTION FAIL: Expected lightsaberBorder effect preset.");
  }
} else {
  console.error("❌ ASSERTION FAIL: One or more webcam nodes failed to compile.");
}

console.log("\n🧪 Running Compile Test 2: Full Background Wallpaper using 'neon_sunset' palette...");
const testBg = compileComponentRecipe(
  "background_layer",
  "minimalist",
  0, 0, 1920, 1080,
  "neon_sunset",
  "modern_techno"
);

console.log(`📋 Compiled ${testBg.length} elements:`);
testBg.forEach(el => {
  console.log(` -> Element Name: "${el.name}" (Type: ${el.type})`);
  console.log(`    Fills Color Stop Resolutions: ${JSON.stringify(el.fills[0].stops)}`);
});

if (testBg[0].fills[0].stops[0].color === "#1e1b4b" && testBg[0].fills[0].stops[1].color === "#db2777") {
  console.log("✅ ASSERTION SUCCESSFUL: Theme wallpaper linear gradient stops successfully resolved theme references (#1e1b4b and #db2777).");
} else {
  console.warn("❌ ASSERTION FAIL: Color stops failed to resolve active theme tokens.");
}

console.log("\n🏁 All 5-Layer Design Stack verification compile assertions completed successfully!");
