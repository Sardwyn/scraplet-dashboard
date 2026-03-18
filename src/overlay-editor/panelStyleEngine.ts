import type {
  OverlayElement,
  OverlayBoxElement,
  OverlayShapeElement,
  OverlayTextElement,
  OverlayLowerThirdElement,
} from "../shared/overlayTypes";

export type PanelStyle = {
  width: number;
  shape: ShapeVariant;
  fill: FillVariant;
  border: BorderVariant;
  highlight: HighlightVariant;
  accent: AccentVariant;
  designLayer: DesignLayerVariant;
  typography: TypographyVariant;
  icon: IconVariant;
  spacing: SpacingVariant;
  colors: {
    background: string;
    primary: string;
    secondary: string;
  };
};

export type Panel = {
  id: string;
  label: string;
  style: PanelStyle;
};

export type StyleProfile = {
  baseColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: string;
  baseRadius: number;
};

export type ShapeVariant =
  | { type: "rectangle"; radius: number }
  | { type: "rounded"; radius: number }
  | { type: "pill" }
  | { type: "cut"; cutSize: number }
  | { type: "tab"; tabHeight: number };

export type FillVariant =
  | { type: "solid" }
  | { type: "gradient"; angle: number; intensity: number };

export type BorderVariant =
  | { type: "none" }
  | { type: "thin"; width: number }
  | { type: "thick"; width: number }
  | { type: "inset" };

export type HighlightVariant =
  | { type: "none" }
  | { type: "top"; thickness: number }
  | { type: "side"; thickness: number }
  | { type: "outline" }
  | { type: "glow"; intensity: number };

export type AccentVariant =
  | { type: "none" }
  | { type: "bar"; position: "left" | "right" | "top" }
  | { type: "corner" }
  | { type: "chip" };

export type DesignLayerVariant =
  | { type: "none" }
  | { type: "diagonal"; opacity: number }
  | { type: "split"; ratio: number }
  | { type: "pattern"; density: number }
  | { type: "shapeOverlay"; scale: number };

export type TypographyVariant =
  | { type: "bold" }
  | { type: "outline" }
  | { type: "condensed" }
  | { type: "plain" };

export type IconVariant =
  | { type: "none" }
  | { type: "left" }
  | { type: "top" }
  | { type: "badge" };

export type SpacingVariant =
  | { type: "tight" }
  | { type: "normal" }
  | { type: "wide" };

export type PanelAxisKey =
  | "shape"
  | "fill"
  | "border"
  | "highlight"
  | "accent"
  | "designLayer"
  | "typography"
  | "icon"
  | "spacing";

export type PanelAxisSelections = Record<PanelAxisKey, number>;

export const PANEL_AXIS_ORDER: PanelAxisKey[] = [
  "shape",
  "fill",
  "border",
  "highlight",
  "accent",
  "designLayer",
  "typography",
  "icon",
  "spacing",
];

export const PANEL_AXIS_LABELS: Record<PanelAxisKey, string> = {
  shape: "Shape",
  fill: "Fill",
  border: "Border",
  highlight: "Highlight",
  accent: "Accent",
  designLayer: "Design Layer",
  typography: "Typography",
  icon: "Icon",
  spacing: "Spacing",
};

const RANGE = {
  radius: [4, 16] as const,
  thickness: [4, 12] as const,
  opacity: [0.1, 0.5] as const,
  gradientIntensity: [0.1, 0.4] as const,
};

const SHAPE_SPECS = [
  { type: "rectangle" as const, radiusRange: RANGE.radius },
  { type: "rounded" as const, radiusRange: RANGE.radius },
  { type: "pill" as const },
  { type: "cut" as const, cutRange: RANGE.radius },
  { type: "tab" as const, tabRange: RANGE.radius },
];

const FILL_SPECS = [
  { type: "solid" as const },
  { type: "gradient" as const, intensityRange: RANGE.gradientIntensity },
];

const BORDER_SPECS = [
  { type: "none" as const },
  { type: "thin" as const, widthRange: [4, 8] as const },
  { type: "thick" as const, widthRange: [8, 12] as const },
  { type: "inset" as const },
];

const HIGHLIGHT_SPECS = [
  { type: "none" as const },
  { type: "top" as const, thicknessRange: RANGE.thickness },
  { type: "side" as const, thicknessRange: RANGE.thickness },
  { type: "outline" as const },
  { type: "glow" as const, intensityRange: RANGE.opacity },
];

const ACCENT_SPECS = [
  { type: "none" as const },
  { type: "bar" as const, position: "left" as const },
  { type: "bar" as const, position: "right" as const },
  { type: "bar" as const, position: "top" as const },
  { type: "corner" as const },
  { type: "chip" as const },
];

const DESIGN_LAYER_SPECS = [
  { type: "none" as const },
  { type: "diagonal" as const, opacityRange: RANGE.opacity },
  { type: "split" as const, ratioRange: [0.35, 0.65] as const },
  { type: "pattern" as const, densityRange: [0.1, 0.5] as const },
  { type: "shapeOverlay" as const, scaleRange: [0.6, 1.2] as const },
];

const TYPOGRAPHY_SPECS = [
  { type: "bold" as const },
  { type: "outline" as const },
  { type: "condensed" as const },
  { type: "plain" as const },
];

const ICON_SPECS = [
  { type: "none" as const },
  { type: "left" as const },
  { type: "top" as const },
  { type: "badge" as const },
];

const SPACING_SPECS = [
  { type: "tight" as const },
  { type: "normal" as const },
  { type: "wide" as const },
];

export const PANEL_AXIS_VARIANTS: Record<PanelAxisKey, string[]> = {
  shape: SHAPE_SPECS.map((spec) => spec.type),
  fill: FILL_SPECS.map((spec) => spec.type),
  border: BORDER_SPECS.map((spec) => spec.type),
  highlight: HIGHLIGHT_SPECS.map((spec) => spec.type),
  accent: ACCENT_SPECS.map((spec) => (spec.type === "bar" ? `bar-${spec.position}` : spec.type)),
  designLayer: DESIGN_LAYER_SPECS.map((spec) => spec.type),
  typography: TYPOGRAPHY_SPECS.map((spec) => spec.type),
  icon: ICON_SPECS.map((spec) => spec.type),
  spacing: SPACING_SPECS.map((spec) => spec.type),
};

export function getAxisVariantCount(axis: PanelAxisKey) {
  return PANEL_AXIS_VARIANTS[axis].length;
}

export function getSeededAxisSelections(seed: string): PanelAxisSelections {
  return PANEL_AXIS_ORDER.reduce((acc, axis) => {
    const count = getAxisVariantCount(axis);
    const rng = seededRandom(`${seed}:${axis}:select`);
    acc[axis] = Math.floor(rng() * count);
    return acc;
  }, {} as PanelAxisSelections);
}

export function resolvePanelStyle(
  seed: string,
  profile: StyleProfile,
  selections?: PanelAxisSelections
): PanelStyle {
  const axisSelections = selections ?? getSeededAxisSelections(seed);

  const shapeSpec = SHAPE_SPECS[axisSelections.shape] ?? SHAPE_SPECS[0];
  const fillSpec = FILL_SPECS[axisSelections.fill] ?? FILL_SPECS[0];
  const borderSpec = BORDER_SPECS[axisSelections.border] ?? BORDER_SPECS[0];
  const highlightSpec = HIGHLIGHT_SPECS[axisSelections.highlight] ?? HIGHLIGHT_SPECS[0];
  const accentSpec = ACCENT_SPECS[axisSelections.accent] ?? ACCENT_SPECS[0];
  const designSpec = DESIGN_LAYER_SPECS[axisSelections.designLayer] ?? DESIGN_LAYER_SPECS[0];
  const typographySpec = TYPOGRAPHY_SPECS[axisSelections.typography] ?? TYPOGRAPHY_SPECS[0];
  const iconSpec = ICON_SPECS[axisSelections.icon] ?? ICON_SPECS[0];
  const spacingSpec = SPACING_SPECS[axisSelections.spacing] ?? SPACING_SPECS[0];

  const shapeRng = seededRandom(`${seed}:shape:${shapeSpec.type}`);
  const fillRng = seededRandom(`${seed}:fill:${fillSpec.type}`);
  const borderRng = seededRandom(`${seed}:border:${borderSpec.type}`);
  const highlightRng = seededRandom(`${seed}:highlight:${highlightSpec.type}`);
  const designRng = seededRandom(`${seed}:design:${designSpec.type}`);

  const shape: ShapeVariant = (() => {
    if (shapeSpec.type === "pill") return { type: "pill" };
    if (shapeSpec.type === "cut") {
      const sample = randBetween(shapeRng, ...shapeSpec.cutRange);
      return { type: "cut", cutSize: biasRadius(sample, profile.baseRadius, RANGE.radius) };
    }
    if (shapeSpec.type === "tab") {
      const sample = randBetween(shapeRng, ...shapeSpec.tabRange);
      return { type: "tab", tabHeight: biasRadius(sample, profile.baseRadius, RANGE.radius) };
    }
    const sample = randBetween(shapeRng, ...shapeSpec.radiusRange!);
    return { type: shapeSpec.type, radius: biasRadius(sample, profile.baseRadius, RANGE.radius) };
  })();

  const fill: FillVariant = (() => {
    if (fillSpec.type === "gradient") {
      return {
        type: "gradient",
        angle: Math.round(randBetween(fillRng, 0, 360)),
        intensity: roundTo(randBetween(fillRng, ...fillSpec.intensityRange), 2),
      };
    }
    return { type: "solid" };
  })();

  const border: BorderVariant = (() => {
    if (borderSpec.type === "thin" || borderSpec.type === "thick") {
      return {
        type: borderSpec.type,
        width: roundTo(randBetween(borderRng, ...borderSpec.widthRange), 1),
      };
    }
    return { type: borderSpec.type };
  })();

  const highlight: HighlightVariant = (() => {
    if (highlightSpec.type === "top" || highlightSpec.type === "side") {
      return {
        type: highlightSpec.type,
        thickness: roundTo(randBetween(highlightRng, ...highlightSpec.thicknessRange), 1),
      };
    }
    if (highlightSpec.type === "glow") {
      return {
        type: "glow",
        intensity: roundTo(randBetween(highlightRng, ...highlightSpec.intensityRange), 2),
      };
    }
    return { type: highlightSpec.type };
  })();

  const accent: AccentVariant = (() => {
    if (accentSpec.type === "bar") {
      return { type: "bar", position: accentSpec.position };
    }
    return { type: accentSpec.type };
  })();

  const designLayer: DesignLayerVariant = (() => {
    if (designSpec.type === "diagonal") {
      return { type: "diagonal", opacity: roundTo(randBetween(designRng, ...designSpec.opacityRange), 2) };
    }
    if (designSpec.type === "split") {
      return { type: "split", ratio: roundTo(randBetween(designRng, ...designSpec.ratioRange), 2) };
    }
    if (designSpec.type === "pattern") {
      return { type: "pattern", density: roundTo(randBetween(designRng, ...designSpec.densityRange), 2) };
    }
    if (designSpec.type === "shapeOverlay") {
      return { type: "shapeOverlay", scale: roundTo(randBetween(designRng, ...designSpec.scaleRange), 2) };
    }
    return { type: "none" };
  })();

  const typography: TypographyVariant = { type: typographySpec.type };
  const icon: IconVariant = { type: iconSpec.type };
  const spacing: SpacingVariant = { type: spacingSpec.type };

  const colors = {
    background: varyColor(profile.baseColor, `${seed}:color:bg`),
    primary: varyColor(profile.textColor, `${seed}:color:primary`),
    secondary: varyColor(profile.accentColor, `${seed}:color:secondary`),
  };

  return {
    width: 320,
    shape,
    fill,
    border,
    highlight,
    accent,
    designLayer,
    typography,
    icon,
    spacing,
    colors,
  };
}

export function buildPanel(
  seed: string,
  label: string,
  profile: StyleProfile,
  selections?: PanelAxisSelections
): Panel {
  const selectionKey = selections
    ? PANEL_AXIS_ORDER.map((axis) => selections[axis]).join("|")
    : "auto";
  return {
    id: `panel_${hashSeed(`${seed}:${selectionKey}`)}`,
    label,
    style: resolvePanelStyle(seed, profile, selections),
  };
}

export function deriveStyleProfile(metadata: any, elements: OverlayElement[]): StyleProfile {
  const fromMeta = metadata?.styleProfile || metadata?.panelStyleProfile || {};

  const baseColor =
    normalizeColor(fromMeta.baseColor) ||
    findFirstFillColor(elements) ||
    "#111111";

  const accentColor =
    normalizeColor(fromMeta.accentColor) ||
    findLowerThirdAccent(elements) ||
    "#4f46e5";

  const textColor =
    normalizeColor(fromMeta.textColor) ||
    findFirstTextColor(elements) ||
    "#f8fafc";

  const fontFamily =
    fromMeta.fontFamily ||
    findFirstFontFamily(elements) ||
    "Inter";

  const baseRadius =
    typeof fromMeta.baseRadius === "number"
      ? fromMeta.baseRadius
      : findFirstRadius(elements) ?? 12;

  return {
    baseColor,
    accentColor,
    textColor,
    fontFamily,
    baseRadius: clamp(baseRadius, 4, 32),
  };
}

function findLowerThirdAccent(elements: OverlayElement[]): string | null {
  const lt = elements.find((el) => el.type === "lower_third") as OverlayLowerThirdElement | undefined;
  const accent = lt?.style?.accentColor;
  return normalizeColor(accent) || null;
}

function findFirstTextColor(elements: OverlayElement[]): string | null {
  for (const el of elements) {
    if (el.type === "text") {
      const color = (el as OverlayTextElement).color;
      const normalized = normalizeColor(color);
      if (normalized) return normalized;
    }
  }
  return null;
}

function findFirstFontFamily(elements: OverlayElement[]): string | null {
  for (const el of elements) {
    if (el.type === "text") {
      const font = (el as OverlayTextElement).fontFamily;
      if (font) return font;
    }
  }
  return null;
}

function findFirstRadius(elements: OverlayElement[]): number | null {
  for (const el of elements) {
    if (el.type === "box") {
      const radius = (el as OverlayBoxElement).borderRadiusPx;
      if (typeof radius === "number") return radius;
      const corners = (el as OverlayBoxElement).cornerRadii;
      const corner = corners?.topLeft ?? corners?.topRight ?? corners?.bottomLeft ?? corners?.bottomRight;
      if (typeof corner === "number") return corner;
    }
    if (el.type === "shape") {
      const radius = (el as OverlayShapeElement).cornerRadiusPx;
      if (typeof radius === "number") return radius;
      const corners = (el as OverlayShapeElement).cornerRadii;
      const corner = corners?.topLeft ?? corners?.topRight ?? corners?.bottomLeft ?? corners?.bottomRight;
      if (typeof corner === "number") return corner;
    }
  }
  return null;
}

function findFirstFillColor(elements: OverlayElement[]): string | null {
  for (const el of elements) {
    if (el.type === "box" || el.type === "shape") {
      const color = resolveFillColor(el as OverlayBoxElement | OverlayShapeElement);
      const normalized = normalizeColor(color);
      if (normalized) return normalized;
    }
  }
  return null;
}

function resolveFillColor(el: OverlayBoxElement | OverlayShapeElement): string | null {
  if (Array.isArray((el as any).fills) && (el as any).fills.length) {
    const fill = (el as any).fills[0];
    if (fill?.type === "solid" && typeof fill.color === "string") return fill.color;
    if ((fill?.type === "linear" || fill?.type === "radial" || fill?.type === "conic") && fill.stops?.length) {
      return fill.stops[0]?.color || null;
    }
  }
  if ((el as OverlayBoxElement).backgroundColor) return (el as OverlayBoxElement).backgroundColor!;
  if ((el as OverlayShapeElement).fillColor) return (el as OverlayShapeElement).fillColor!;
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number) {
  const pow = Math.pow(10, digits);
  return Math.round(value * pow) / pow;
}

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

function seededRandom(seed: string) {
  const base = hashSeed(seed);
  let t = parseInt(base.slice(0, 8), 16) || 0x12345678;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function biasRadius(sample: number, base: number, range: readonly [number, number]) {
  const blended = sample * 0.45 + base * 0.55;
  return roundTo(clamp(blended, range[0], range[1]), 1);
}

function varyColor(color: string, seed: string) {
  const rng = seededRandom(seed);
  const delta = randBetween(rng, -0.1, 0.1);
  return nudgeColor(color, delta);
}

function nudgeColor(color: string, delta: number) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const mix = delta >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const amt = Math.abs(delta);
  const blended = {
    r: Math.round(rgb.r + (mix.r - rgb.r) * amt),
    g: Math.round(rgb.g + (mix.g - rgb.g) * amt),
    b: Math.round(rgb.b + (mix.b - rgb.b) * amt),
  };
  return rgbToHex(blended);
}

function normalizeColor(color?: string | null) {
  if (!color) return null;
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) return trimmed;
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace("#", "").trim();
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(clamp(Math.round(rgb.r), 0, 255))}${toHex(clamp(Math.round(rgb.g), 0, 255))}${toHex(clamp(Math.round(rgb.b), 0, 255))}`;
}
