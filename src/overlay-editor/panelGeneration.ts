import type {
  OverlayBoxElement,
  OverlayElement,
  OverlayFrameElement,
  OverlayGroupElement,
  OverlayShapeElement,
  OverlayTextElement,
} from "../shared/overlayTypes";

export type PanelTemplateType = "about" | "social" | "donate" | "rules";

export type PanelStyleVariant = {
  id: string;
  shape?: "rectangle" | "rounded" | "pill" | "tab";
  highlight?: "top" | "side" | "outline" | "none";
  accent?: boolean;
  icon?: "included" | "omitted";
  textTreatment?: "bold" | "outline" | "secondaryGlyph" | "plain";
};

export type Panel = {
  id: string;
  type: PanelTemplateType;
  title: string;
  layout: string;
  content: { text?: string; items?: { icon?: string; label: string }[] };
  styleVariant?: PanelStyleVariant;
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
    body: number;
    headingWeight: number | "normal" | "bold";
  };
  shape: {
    cornerRadius: number;
    border: boolean;
  };
  spacing: {
    base: number;
  };
  iconStyle: "outline" | "filled" | "image" | "mixed";
};

export type PanelPack = {
  styleProfile: StyleProfile;
  panels: Panel[];
  warnings: string[];
};

export type PanelGenerationConfig = {
  panelTypes: PanelTemplateType[];
};

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
    background: "#101114",
    primary: "#e2e8f0",
    accent: "#38bdf8",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5f5",
  },
  typography: {
    fontFamily: "Inter",
    body: 16,
    headingWeight: "bold",
  },
  shape: {
    cornerRadius: 12,
    border: false,
  },
  spacing: {
    base: 12,
  },
  iconStyle: "mixed",
};

export const PANEL_VARIANTS: PanelStyleVariant[] = [
  { id: "rect-outline", shape: "rectangle", highlight: "outline", accent: false, icon: "omitted", textTreatment: "plain" },
  { id: "rounded-top", shape: "rounded", highlight: "top", accent: true, icon: "included", textTreatment: "bold" },
  { id: "pill-side", shape: "pill", highlight: "side", accent: true, icon: "included", textTreatment: "plain" },
  { id: "tab-accent", shape: "tab", highlight: "none", accent: true, icon: "omitted", textTreatment: "secondaryGlyph" },
];

export function getDefaultPanelConfig(): PanelGenerationConfig {
  return {
    panelTypes: ["about", "social", "donate", "rules"],
  };
}

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
        fontFamily:
          textEl.fontFamily ||
          (textEl as any).style?.fontFamily ||
          (textEl as any).font?.family ||
          (textEl as any).font,
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
    if (current.children?.length) queue.push(...current.children);
  }
  return output;
}

function parseColor(input?: string) {
  if (!input) return null;
  const value = input.trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
  }
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b] = [parts[0], parts[1], parts[2]];
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
  }
  return null;
}

function colorToHex(color: { r: number; g: number; b: number }) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function collectMostCommon<T>(entries: T[]) {
  const map = new Map<string, { value: T; count: number }>();
  entries.forEach((entry) => {
    const key = JSON.stringify(entry);
    const current = map.get(key);
    if (current) current.count += 1;
    else map.set(key, { value: entry, count: 1 });
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count)[0]?.value;
}

function extractStyleProfile(nodes: NodeLike[]): StyleProfile {
  const fills: Array<{ color: string; weight: number }> = [];
  const textColors: Array<{ color: string; weight: number }> = [];
  let largestFont: { size: number; family: string } | null = null;
  const fontSizes: number[] = [];
  const fontWeights: Array<{ weight: number; count: number }> = [];
  const radii: number[] = [];
  const gaps: number[] = [];
  let iconFillCount = 0;
  let iconStrokeCount = 0;
  let imageCount = 0;
  let borderSeen = false;

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
    if (node.style?.borderRadius) radii.push(node.style.borderRadius);
    if (node.type === "image") imageCount += 1;
    const fill = parseColor(node.style?.fill);
    if (fill) fills.push({ color: colorToHex(fill), weight: area * (node.opacity ?? 1) });
    if (node.style?.stroke) {
      iconStrokeCount += 1;
      borderSeen = true;
    }
    if (node.type === "shape" || node.type === "box") {
      if (node.style?.fill) iconFillCount += 1;
    }
    if (node.type === "text") {
      const textFill = parseColor(node.style?.fill);
      if (textFill) textColors.push({ color: colorToHex(textFill), weight: area * (node.opacity ?? 1) });
      if (node.style?.fontSize) {
        fontSizes.push(node.style.fontSize);
        if (node.style?.fontFamily) {
          if (!largestFont || node.style.fontSize > largestFont.size) {
            largestFont = { size: node.style.fontSize, family: node.style.fontFamily };
          }
        }
      }
      const weightValue = node.style?.fontWeight ? Number(node.style.fontWeight) : 400;
      if (!Number.isNaN(weightValue)) {
        const existing = fontWeights.find((entry) => entry.weight === weightValue);
        if (existing) existing.count += 1;
        else fontWeights.push({ weight: weightValue, count: 1 });
      }
    }
  });

  const background = collectMostCommonWeighted(fills) || DEFAULT_PROFILE.colors.background;
  const textPrimary = collectMostCommonWeighted(textColors) || DEFAULT_PROFILE.colors.textPrimary;
  const accent = pickAccent(fills.map((f) => f.color), background) || DEFAULT_PROFILE.colors.accent;
  const fontFamily = largestFont?.family || DEFAULT_PROFILE.typography.fontFamily;
  const body = collectMostCommon(fontSizes) || DEFAULT_PROFILE.typography.body;
  const headingWeight =
    fontWeights.sort((a, b) => b.count - a.count)[0]?.weight || DEFAULT_PROFILE.typography.headingWeight;
  const cornerRadius = collectMostCommon(radii) || DEFAULT_PROFILE.shape.cornerRadius;
  const spacingBase = clamp(mostCommon(gaps) || DEFAULT_PROFILE.spacing.base, 8, 20);

  let iconStyle: StyleProfile["iconStyle"] = "mixed";
  if (imageCount > 0) iconStyle = "image";
  else if (iconFillCount > 0 && iconStrokeCount === 0) iconStyle = "filled";
  else if (iconStrokeCount > 0 && iconFillCount === 0) iconStyle = "outline";

  return {
    colors: {
      background,
      primary: textPrimary,
      accent,
      textPrimary,
      textSecondary: textPrimary,
    },
    typography: {
      fontFamily,
      body,
      headingWeight,
    },
    shape: {
      cornerRadius,
      border: borderSeen,
    },
    spacing: {
      base: spacingBase,
    },
    iconStyle,
  };
}

function detectWarnings(nodes: NodeLike[]) {
  const warnings: string[] = [];
  if (nodes.length > 30) warnings.push("Panel source has more than 30 nodes.");
  if (nodes.some((n) => Math.abs(n.rotation || 0) > 10)) warnings.push("Panel source contains rotated elements.");

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
  return warnings;
}

function deriveTitle(nodes: NodeLike[]) {
  const textNodes = nodes.filter((n) => n.type === "text" && n.content);
  if (!textNodes.length) return "Panel";
  const sorted = textNodes
    .slice()
    .sort((a, b) => (b.style?.fontSize || 0) - (a.style?.fontSize || 0));
  const primary = sorted[0];
  const words = String(primary.content || "").trim().split(/\s+/).slice(0, 2);
  return words.join(" ") || "Panel";
}

function buildPanels(config: PanelGenerationConfig, title: string, styleProfile: StyleProfile): Panel[] {
  return config.panelTypes.map((type, index) => {
    let variant = { ...PANEL_VARIANTS[index % PANEL_VARIANTS.length] };
    if (!styleProfile.shape.border && variant.highlight === "outline") {
      variant.highlight = "none";
    }
    if (styleProfile.iconStyle === "image") {
      variant.icon = "included";
    } else if (styleProfile.iconStyle === "outline") {
      variant.icon = "included";
    } else if (styleProfile.iconStyle === "filled") {
      variant.icon = "included";
    }
    return {
      id: `panel_${type}_${index}_${Date.now().toString(36)}`,
      type,
      title,
      layout: variant.id,
      content: {},
      styleVariant: { ...variant },
    };
  });
}

function collectMostCommonWeighted(entries: Array<{ color: string; weight: number }>) {
  if (!entries.length) return null;
  const bucket = new Map<string, number>();
  entries.forEach((entry) => bucket.set(entry.color, (bucket.get(entry.color) || 0) + entry.weight));
  return Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function pickAccent(colors: string[], background: string) {
  const candidates = colors.filter((c) => c !== background);
  return candidates[0] || null;
}

function mostCommon(values: number[]) {
  const freq = new Map<number, number>();
  values.forEach((v) => freq.set(Math.round(v), (freq.get(Math.round(v)) || 0) + 1));
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  const warnings = detectWarnings(nodes);
  const styleProfile = extractStyleProfile(nodes);
  const title = deriveTitle(nodes);
  const panels = buildPanels(config, title, styleProfile);
  return {
    styleProfile,
    panels,
    warnings,
  };
}
