import type {
  OverlayBoxElement,
  OverlayElement,
  OverlayFrameElement,
  OverlayGroupElement,
  OverlayShapeElement,
  OverlayTextElement,
} from "../shared/overlayTypes";

export type PanelTemplateType = "about" | "social" | "donate" | "rules";

export type PanelTemplate = {
  type: PanelTemplateType;
  layoutVariants: string[];
  slots: string[];
};

export type StyleProfile = {
  colors: {
    background: string;
    primary: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
  };
  typography: {
    fontFamily: string;
    h1: number;
    h2: number;
    body: number;
    headingWeight: number | "normal" | "bold";
    bodyWeight: number | "normal" | "bold";
  };
  spacing: {
    base: number;
    scale: number[];
    density: "compact" | "comfortable" | "spacious";
  };
  shape: {
    cornerRadius: number;
    border: boolean;
  };
  effects: {
    shadow: boolean;
    glow: boolean;
  };
  layout: {
    alignment: "left" | "center" | "right";
  };
  iconStyle: "outline" | "filled" | "image" | "mixed";
};

export type Panel = {
  id: string;
  type: PanelTemplateType;
  title: string;
  layout: string;
  content: {
    text?: string;
    items?: { icon?: string; label: string }[];
  };
  styleOverrides?: Partial<StyleProfile>;
};

export type PanelPack = {
  styleProfile: StyleProfile;
  panels: Panel[];
  warnings: string[];
};

export type PanelGenerationConfig = {
  panelTypes: PanelTemplateType[];
  layoutVariants?: Partial<Record<PanelTemplateType, string>>;
};

export const PANEL_TEMPLATES: PanelTemplate[] = [
  { type: "about", layoutVariants: ["stacked", "split"], slots: ["title", "text"] },
  { type: "social", layoutVariants: ["list", "grid"], slots: ["title", "items"] },
  { type: "donate", layoutVariants: ["stacked", "banner"], slots: ["title", "text"] },
  { type: "rules", layoutVariants: ["list", "stacked"], slots: ["title", "items"] },
];

type NodeLike = {
  id: string;
  type: "group" | "text" | "image" | "shape" | "box";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  children?: NodeLike[];
  style?: {
    fill?: string;
    stroke?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    textAlign?: "left" | "center" | "right";
    borderRadius?: number;
  };
  content?: string;
  src?: string;
  raw?: OverlayElement;
};

const DEFAULT_PROFILE: StyleProfile = {
  colors: {
    background: "#0b0b0c",
    primary: "#ffffff",
    accent: "#38bdf8",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5f5",
  },
  typography: {
    fontFamily: "Inter",
    h1: 28,
    h2: 20,
    body: 14,
    headingWeight: "bold",
    bodyWeight: "normal",
  },
  spacing: {
    base: 12,
    scale: [6, 12, 18, 24],
    density: "comfortable",
  },
  shape: {
    cornerRadius: 12,
    border: false,
  },
  effects: {
    shadow: false,
    glow: false,
  },
  layout: {
    alignment: "left",
  },
  iconStyle: "mixed",
};

function toNodeLike(el: OverlayElement, elementsById: Record<string, OverlayElement>): NodeLike | null {
  if (el.visible === false) return null;
  if (el.type === "group" || el.type === "frame" || el.type === "mask" || el.type === "boolean") {
    const childIds = (el as OverlayGroupElement | OverlayFrameElement | any).childIds || [];
    const children = childIds
      .map((id: string) => elementsById[id])
      .filter(Boolean)
      .map((child) => toNodeLike(child, elementsById))
      .filter(Boolean) as NodeLike[];
    return {
      id: el.id,
      type: "group",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotationDeg,
      visible: el.visible,
      opacity: el.opacity,
      children,
      raw: el,
    };
  }
  if (el.type === "text") {
    const textEl = el as OverlayTextElement;
    return {
      id: el.id,
      type: "text",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotationDeg,
      visible: el.visible,
      opacity: el.opacity,
      content: textEl.text,
      style: {
        fill: textEl.color,
        fontSize: textEl.fontSizePx || (textEl as any).fontSize,
        fontFamily: textEl.fontFamily,
        fontWeight: textEl.fontWeight === "bold" ? 700 : 400,
        textAlign: textEl.textAlign,
      },
      raw: el,
    };
  }
  if (el.type === "box") {
    const box = el as OverlayBoxElement;
    return {
      id: el.id,
      type: "box",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotationDeg,
      visible: el.visible,
      opacity: el.opacity,
      style: {
        fill: box.backgroundColor,
        stroke: box.strokeColor,
        borderRadius: box.borderRadiusPx || (box as any).borderRadius,
      },
      raw: el,
    };
  }
  if (el.type === "shape") {
    const shape = el as OverlayShapeElement;
    return {
      id: el.id,
      type: "shape",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotationDeg,
      visible: el.visible,
      opacity: el.opacity,
      style: {
        fill: shape.fillColor,
        stroke: shape.strokeColor,
        borderRadius: shape.cornerRadiusPx,
      },
      raw: el,
    };
  }
  if (el.type === "image") {
    return {
      id: el.id,
      type: "image",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotationDeg,
      visible: el.visible,
      opacity: el.opacity,
      src: (el as any).src,
      raw: el,
    };
  }
  return null;
}

function flattenNodes(node: NodeLike): NodeLike[] {
  const output: NodeLike[] = [];
  const queue: NodeLike[] = [node];
  while (queue.length) {
    const current = queue.shift()!;
    output.push(current);
    if (current.children?.length) {
      queue.push(...current.children);
    }
  }
  return output;
}

function parseColor(input?: string): { r: number; g: number; b: number; a: number } | null {
  if (!input) return null;
  const value = input.trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
  }
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b, a] = [parts[0], parts[1], parts[2], parts[3] ?? 1];
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  }
  return null;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === nr) h = ((ng - nb) / delta) % 6;
    else if (max === ng) h = (nb - nr) / delta + 2;
    else h = (nr - ng) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function colorBucket(color: { r: number; g: number; b: number }) {
  const hsl = rgbToHsl(color);
  const h = Math.round(hsl.h / 12) * 12;
  const s = Math.round(hsl.s * 10) / 10;
  const l = Math.round(hsl.l * 10) / 10;
  return `${h}-${s}-${l}`;
}

function colorToHex(color: { r: number; g: number; b: number }) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function weightedColorPick(entries: Array<{ color: string; weight: number }>) {
  if (!entries.length) return DEFAULT_PROFILE.colors.background;
  return entries.sort((a, b) => b.weight - a.weight)[0].color;
}

function extractStyleProfile(nodes: NodeLike[]): StyleProfile {
  const fillWeights: Record<string, { color: string; weight: number; hsl: { h: number; s: number; l: number } }> = {};
  const textWeights: Record<string, { color: string; weight: number }> = {};
  const fontFamilies: Record<string, number> = {};
  const fontSizes: number[] = [];
  const fontWeights: Record<string, number> = {};
  const gaps: number[] = [];
  const radii: number[] = [];
  let hasShadow = false;
  let hasGlow = false;
  let borderSeen = false;
  let alignCounts = { left: 0, center: 0, right: 0 };
  let iconFillCount = 0;
  let iconStrokeCount = 0;
  let imageCount = 0;

  const sortedByY = nodes
    .filter((n) => n.type !== "group")
    .slice()
    .sort((a, b) => a.y - b.y);

  for (let i = 0; i < sortedByY.length - 1; i++) {
    const cur = sortedByY[i];
    const next = sortedByY[i + 1];
    const gap = next.y - (cur.y + cur.height);
    if (gap > 0) gaps.push(Math.round(gap));
  }

  nodes.forEach((node) => {
    const area = Math.max(1, node.width * node.height);
    const opacity = node.opacity ?? 1;
    if (node.style?.borderRadius) radii.push(node.style.borderRadius);

    if (node.type === "image") imageCount += 1;

    const fill = parseColor(node.style?.fill);
    if (fill) {
      const weight = area * opacity * (fill.a ?? 1);
      const bucket = colorBucket(fill);
      if (!fillWeights[bucket]) {
        fillWeights[bucket] = {
          color: colorToHex(fill),
          weight: 0,
          hsl: rgbToHsl(fill),
        };
      }
      fillWeights[bucket].weight += weight;
    }

    if (node.style?.stroke) {
      borderSeen = true;
      const stroke = parseColor(node.style.stroke);
      if (stroke) iconStrokeCount += 1;
    }

    if (node.type === "shape" || node.type === "box") {
      if (node.style?.fill) iconFillCount += 1;
    }

    if (node.type === "text") {
      const textColor = parseColor(node.style?.fill);
      if (textColor) {
        const bucket = colorBucket(textColor);
        const weight = area * opacity;
        if (!textWeights[bucket]) {
          textWeights[bucket] = { color: colorToHex(textColor), weight: 0 };
        }
        textWeights[bucket].weight += weight;
      }

      const fontSize = node.style?.fontSize;
      if (fontSize) fontSizes.push(fontSize);
      const family = node.style?.fontFamily;
      if (family) fontFamilies[family] = (fontFamilies[family] || 0) + 1;
      const weight = node.style?.fontWeight ? String(node.style.fontWeight) : "400";
      fontWeights[weight] = (fontWeights[weight] || 0) + 1;
      const align = node.style?.textAlign;
      if (align) alignCounts[align] += 1;
    }

    const raw = node.raw as any;
    if (raw?.shadow?.enabled) hasShadow = true;
    if (Array.isArray(raw?.effects)) {
      raw.effects.forEach((effect: any) => {
        if (effect?.type === "dropShadow" || effect?.type === "innerShadow") hasShadow = true;
        if (effect?.type === "outerGlow" || effect?.type === "innerGlow") hasGlow = true;
      });
    }
  });

  const fills = Object.values(fillWeights);
  const background = weightedColorPick(fills.map((f) => ({ color: f.color, weight: f.weight })));
  const primary = weightedColorPick(fills.filter((f) => f.color !== background).map((f) => ({ color: f.color, weight: f.weight }))) || background;
  const accentCandidate = fills
    .slice()
    .sort((a, b) => b.hsl.s - a.hsl.s)
    .find((entry) => entry.color !== background && entry.color !== primary);
  const accent = accentCandidate?.color || primary;

  const textColors = Object.values(textWeights).sort((a, b) => b.weight - a.weight);
  const textPrimary = textColors[0]?.color || DEFAULT_PROFILE.colors.textPrimary;
  const textSecondary = textColors[1]?.color || textPrimary;

  const family = Object.entries(fontFamilies).sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_PROFILE.typography.fontFamily;
  const sortedSizes = fontSizes.slice().sort((a, b) => b - a);
  const h1 = sortedSizes[0] || DEFAULT_PROFILE.typography.h1;
  const h2 = sortedSizes[1] || Math.max(DEFAULT_PROFILE.typography.h2, Math.round(h1 * 0.7));
  const body = sortedSizes[Math.floor(sortedSizes.length / 2)] || DEFAULT_PROFILE.typography.body;
  const headingWeight = Object.entries(fontWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_PROFILE.typography.headingWeight;
  const bodyWeight = headingWeight;

  const baseGap = gaps.length ? mostCommon(gaps) : DEFAULT_PROFILE.spacing.base;
  const density = baseGap <= 8 ? "compact" : baseGap <= 16 ? "comfortable" : "spacious";
  const scale = [0.5, 1, 1.5, 2].map((m) => Math.max(2, Math.round(baseGap * m)));
  const radius = radii.length ? mostCommon(radii) : DEFAULT_PROFILE.shape.cornerRadius;
  const alignment = maxKey(alignCounts) as "left" | "center" | "right";

  let iconStyle: StyleProfile["iconStyle"] = "mixed";
  if (imageCount > 0) iconStyle = "image";
  else if (iconFillCount > 0 && iconStrokeCount === 0) iconStyle = "filled";
  else if (iconStrokeCount > 0 && iconFillCount === 0) iconStyle = "outline";

  return {
    colors: { background, primary, accent, textPrimary, textSecondary },
    typography: {
      fontFamily: family,
      h1,
      h2,
      body,
      headingWeight: normalizeWeight(headingWeight),
      bodyWeight: normalizeWeight(bodyWeight),
    },
    spacing: { base: baseGap, scale, density },
    shape: { cornerRadius: radius, border: borderSeen },
    effects: { shadow: hasShadow, glow: hasGlow },
    layout: { alignment },
    iconStyle,
  };
}

function mostCommon(values: number[]) {
  const freq = new Map<number, number>();
  values.forEach((v) => freq.set(Math.round(v), (freq.get(Math.round(v)) || 0) + 1));
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

function maxKey(obj: Record<string, number>) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || "left";
}

function normalizeWeight(weight: string | number | "normal" | "bold") {
  if (weight === "bold") return 700;
  if (weight === "normal") return 400;
  const parsed = typeof weight === "string" ? parseInt(weight, 10) : weight;
  return Number.isNaN(parsed) ? 400 : parsed;
}

function detectWarnings(nodes: NodeLike[], groupBounds: { width: number; height: number }) {
  const warnings: string[] = [];
  if (nodes.length > 30) warnings.push("Panel source has more than 30 nodes.");
  const rotations = nodes.filter((n) => Math.abs(n.rotation || 0) > 10);
  if (rotations.length) warnings.push("Panel source contains rotated elements.");

  let overlapArea = 0;
  let totalArea = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].type === "group") continue;
    const a = nodes[i];
    totalArea += a.width * a.height;
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].type === "group") continue;
      const b = nodes[j];
      const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      overlapArea += xOverlap * yOverlap;
    }
  }
  const overlapRatio = totalArea ? overlapArea / totalArea : 0;
  if (overlapRatio > 0.5) warnings.push("Panel source has heavy overlap.");

  if (groupBounds.width * groupBounds.height === 0) {
    warnings.push("Panel source bounds could not be resolved.");
  }
  return warnings;
}

function extractTextNodes(nodes: NodeLike[]) {
  return nodes.filter((n) => n.type === "text" && n.content).sort((a, b) => a.y - b.y);
}

function extractAnatomy(nodes: NodeLike[], groupBounds: { x: number; y: number; width: number; height: number }) {
  const area = groupBounds.width * groupBounds.height;
  let container: NodeLike | null = null;
  const textNodes = extractTextNodes(nodes);
  textNodes.sort((a, b) => (b.style?.fontSize || 0) - (a.style?.fontSize || 0));
  const header = textNodes.find((t) => t.y <= groupBounds.y + groupBounds.height * 0.3) || textNodes[0] || null;

  nodes.forEach((node) => {
    if (node.type !== "box" && node.type !== "shape") return;
    const nodeArea = node.width * node.height;
    if (nodeArea / Math.max(1, area) >= 0.7) container = node;
  });

  const listCandidates = extractTextNodes(nodes).filter((n) => n !== header);
  const listLike = listCandidates.length >= 3;

  return {
    container,
    header,
    contentType: listLike ? "list" : "text",
    listItems: listCandidates,
  };
}

function generatePanelsFromAnatomy(anatomy: ReturnType<typeof extractAnatomy>, config: PanelGenerationConfig): Panel[] {
  const panels: Panel[] = [];
  const textNodes = anatomy.listItems || [];
  const bodyText = textNodes.map((t) => t.content).filter(Boolean).join("\n").trim();
  const items = textNodes.map((t) => ({ label: t.content || "" })).filter((item) => item.label);

  const title = anatomy.header?.content || "";

  config.panelTypes.forEach((type, index) => {
    const template = PANEL_TEMPLATES.find((t) => t.type === type) || PANEL_TEMPLATES[0];
    const layout = config.layoutVariants?.[type] || template.layoutVariants[0];
    const panel: Panel = {
      id: `panel_${type}_${index}_${Date.now().toString(36)}`,
      type,
      title,
      layout,
      content: {},
    };
    if (template.slots.includes("text")) panel.content.text = bodyText;
    if (template.slots.includes("items")) panel.content.items = items;
    panels.push(panel);
  });

  return panels;
}

function computeBounds(nodes: NodeLike[]) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const x2s = nodes.map((n) => n.x + n.width);
  const y2s = nodes.map((n) => n.y + n.height);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...x2s) - Math.min(...xs),
    height: Math.max(...y2s) - Math.min(...ys),
  };
}

export function generatePanelPackFromGroup(
  groupId: string,
  elements: OverlayElement[],
  config: PanelGenerationConfig
): PanelPack | null {
  const elementsById = Object.fromEntries(elements.map((el) => [el.id, el]));
  const root = elementsById[groupId];
  if (!root) return null;
  const node = toNodeLike(root, elementsById);
  if (!node) return null;
  const nodes = flattenNodes(node).filter((n) => n.type !== "group");
  const bounds = computeBounds(nodes);
  const warnings = detectWarnings(nodes, bounds);
  const styleProfile = extractStyleProfile(nodes);
  const anatomy = extractAnatomy(nodes, bounds);
  const panels = generatePanelsFromAnatomy(anatomy, config);
  return {
    styleProfile,
    panels,
    warnings,
  };
}

export function getDefaultPanelConfig(): PanelGenerationConfig {
  return {
    panelTypes: ["about"],
    layoutVariants: {},
  };
}
