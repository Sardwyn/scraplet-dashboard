// src/shared/overlayTypes.ts

export type OverlayElementType =
  | "text"
  | "box"
  | "shape"
  | "image"
  | "video"
  | "group"
  | "progressBar"
  | "progressRing"
  | "lower_third"
  | "mask"
  | "componentInstance";

/**
 * V1 uses normalized coords (0..1) relative to the browser source viewport.
 * V0 uses pixel coords in baseResolution space (your current editor).
 */
export type OverlayUnit = "rel"; // V1 only

/**
 * Editor-only convenience fields (runtime may ignore)
 */
export interface OverlayEditorFields {
  name?: string;
  visible?: boolean; // default true
  locked?: boolean;  // default false
}

export type OverlayClipType = "none" | "roundRect" | "circle";

export interface OverlayElementBase extends OverlayEditorFields {
  id: string;
  type: OverlayElementType;

  // V1 only; V0 should omit this.
  unit?: OverlayUnit;

  // Position + size:
  // - V0: px in baseResolution space
  // - V1: 0..1 normalized
  x: number;
  y: number;
  width: number;
  height: number;

  pinned?: boolean;

  // Optional: consistent across all element types
  opacity?: number; // 0..1

  // Advanced Transforms
  rotationDeg?: number; // -180..180

  // Effects
  shadow?: {
    enabled: boolean;
    color: string;
    blur: number;
    x: number;
    y: number; // offset
    spread?: number; // optional (box-shadow only)
  };

  // Clipping / Masking
  clip?: {
    type: OverlayClipType;
    radius?: number; // used if type="roundRect"
  };

  /**
   * Dynamic property bindings.
   * Maps property name (e.g. "text", "src") to a binding configuration.
   */
  bindings?: Record<string, DynamicBinding>;
}

/* =========================
   DYNAMIC BINDINGS
========================= */

export interface BindingFormat {
  type: "text" | "number" | "currency";
  prefix?: string;
  suffix?: string;
  precision?: number;
  casing?: "none" | "upper" | "lower";
}

export interface DynamicBinding {
  mode: "dynamic";
  sourceId: string;
  fieldId: string;
  fallback: any;
  format?: BindingFormat;
}

export interface SourceFieldDef {
  id: string;
  label: string;
  type: "text" | "number" | "image";
  path: string; // Internal canonical resolution path (e.g. "event.author.display")
}

export interface SourceDef {
  id: string;
  label: string;
  fields: SourceFieldDef[];
}

/* =========================
   GROUPING
========================= */
export interface OverlayGroupElement extends OverlayElementBase {
  type: "group";
  childIds: string[]; // Order matters (z-index within group)

  // Optional styling for the group container itself
  backgroundColor?: string;
  borderRadiusPx?: number;
  borderColor?: string;
  borderWidth?: number;
}

/* =========================
   MASKING
 ========================= */
export interface OverlayMaskElement extends OverlayElementBase {
  type: "mask";
  childIds: string[]; // [maskShape, content]
}

export function isMaskElement(el: OverlayElement): el is OverlayMaskElement {
  return el.type === "mask";
}

export function isGroupElement(el: OverlayElement): el is OverlayGroupElement {
  return el.type === "group";
}

/* =========================
   TEXT
========================= */

export interface OverlayTextElement extends OverlayElementBase {
  type: "text";
  text: string; // Supports {{variable}}

  /**
   * V1 responsive sizing:
   * - fontSizePx: literal pixels
   * - fontSizeRel: 0..1 of min(viewportW, viewportH)
   *
   * V0 editor can continue using fontSizePx only.
   */
  fontSizePx?: number;
  fontSizeRel?: number;

  fontFamily?: string;  // [NEW] Google Fonts family name

  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  color?: string;

  // Text outline (runtime may ignore initially)
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeOpacity?: number;
}

/* =========================
   BOX
========================= */

export interface OverlayBoxElement extends OverlayElementBase {
  type: "box";
  backgroundColor?: string;

  borderRadiusPx?: number;
  borderRadiusRel?: number; // V1: 0..1 of min(viewportW, viewportH)

  // Optional stroke for boxes (handy once you add “stroke options”)
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeOpacity?: number;
}

/* =========================
   SHAPES
========================= */

export type OverlayShapeKind = "rect" | "circle" | "line" | "triangle";

export type OverlayStrokeLineCap = "butt" | "round" | "square";
export type OverlayStrokeLineJoin = "miter" | "round" | "bevel";

export interface OverlayShapeElement extends OverlayElementBase {
  type: "shape";
  shape: OverlayShapeKind;

  // Fill
  fillColor?: string;     // if omitted => transparent
  fillOpacity?: number;   // 0..1

  // Stroke
  strokeColor?: string;   // if omitted => transparent
  strokeWidthPx?: number; // if omitted => 0
  strokeOpacity?: number; // 0..1
  strokeDash?: number[];  // e.g. [6,4]
  strokeLineCap?: OverlayStrokeLineCap;
  strokeLineJoin?: OverlayStrokeLineJoin;

  // Rect-specific
  cornerRadiusPx?: number;

  /**
   * Line-specific geometry (normalized inside the element box).
   * Required for "line" to be unambiguous and always renderable.
   */
  line?: {
    x1: number; y1: number; // 0..1
    x2: number; y2: number; // 0..1
  };

  /**
   * Triangle-specific preset (optional).
   * If omitted, renderer can use an "up" triangle by default.
   */
  triangle?: {
    direction?: "up" | "down" | "left" | "right";
  };
}

/* =========================
   MEDIA
========================= */

export type OverlayMediaFit = "contain" | "cover" | "fill";

export type OverlaySrcKind = "upload" | "library" | "url";

export interface OverlayMediaBase {
  /**
   * src is what runtime uses. Keep it simple.
   * - upload/library: typically a same-origin path like "/uploads/.."
   * - url: external URL (fragile; expect CORS/hotlink issues)
   */
  src: string;

  /**
   * Optional editor metadata:
   * - assetId lets your picker/library re-open and show the chosen asset.
   * - srcKind tells the editor how to treat this src.
   */
  assetId?: string;
  srcKind?: OverlaySrcKind;

  fit?: OverlayMediaFit;
  borderRadiusPx?: number;
}

export interface OverlayImageElement extends OverlayElementBase, OverlayMediaBase {
  type: "image";
}

export interface OverlayVideoElement extends OverlayElementBase, OverlayMediaBase {
  type: "video";

  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  poster?: string;
}

/* =========================
   PROGRESS PRIMITIVES
========================= */

export interface OverlayProgressBarElement extends OverlayElementBase {
  type: "progressBar";
  value: number; // 0..1
  direction: "ltr" | "rtl" | "ttb" | "btt";

  backgroundColor?: string;
  fillColor?: string;
  borderRadiusPx?: number;
}

export interface OverlayProgressRingElement extends OverlayElementBase {
  type: "progressRing";
  value: number; // 0..1
  startAngleDeg?: number;

  strokeWidthPx: number;
  backgroundColor?: string; // track color
  fillColor?: string;       // progress color
}


/* =========================
   LOWER THIRD
========================= */

export type LowerThirdLayoutMode = "single" | "stacked" | "split";
export type LowerThirdVariant = "solid" | "glass" | "minimal" | "accent-bar";
export type LowerThirdAnim = "slideUp" | "slideLeft" | "fade" | "none";
export type LowerThirdAnimOut = "slideDown" | "slideRight" | "fade" | "none";

export interface OverlayLowerThirdElement extends OverlayElementBase {
  type: "lower_third";
  // Anchor removed for V1 per user request - effectively standard x/y positioning used.

  layout?: {
    mode?: LowerThirdLayoutMode;              // default "stacked"
    splitRatio?: number;                      // default 0.6
  };
  bind?: {
    textKey?: string;                         // default "lower_third"
    titleKey?: string;                        // default "lower_third.title"
    subtitleKey?: string;                     // default "lower_third.subtitle"
    activeKey?: string;                       // default "lower_third.active"
  };
  style?: {
    variant?: LowerThirdVariant;              // default "accent-bar"
    paddingPx?: number;                       // default 20
    cornerRadiusPx?: number;                  // default 18
    bgColor?: string;                         // default "#111"
    bgOpacity?: number;                       // default 0.75
    accentColor?: string;                     // default "#4f46e5"
    fontFamily?: string;
    titleColor?: string;                      // default "#fff"
    subtitleColor?: string;                   // default "rgba(255,255,255,0.85)"
    titleSizePx?: number;                     // default 40
    subtitleSizePx?: number;                  // default 26
    titleWeight?: "normal" | "bold";          // default "bold"
  };
  animation?: {
    in?: LowerThirdAnim;                      // default "slideUp"
    out?: LowerThirdAnimOut;                  // default "slideDown"
    durationMs?: number;                      // default 450
    easing?: string;                          // default "cubic-bezier(0.2, 0.9, 0.2, 1)"
  };
  defaultDurationMs?: number;                 // default 8000
}

/* =========================
   COMPONENTS
========================= */

export interface OverlayComponentInstanceElement extends OverlayElementBase {
  type: "componentInstance";
  componentId: string; // The ID of the OverlayComponentDef this instantiates
  propOverrides: Record<string, any>; // User-edited field overrides matching propsSchema
}

export interface OverlayComponentDef {
  id: string;
  name: string;
  schemaVersion: number;
  elements: OverlayElement[]; // Flat array, group.childIds apply here too
  propsSchema: {
    [propKey: string]: { type: "text" | "color" | "image" | "boolean"; label: string; default: any }
  };
  metadata: Record<string, any>; // Hooks e.g., durationMs, animationIn
}

/* =========================
   UNIONS
========================= */

export type OverlayElement =
  | OverlayTextElement
  | OverlayBoxElement
  | OverlayShapeElement
  | OverlayImageElement
  | OverlayVideoElement
  | OverlayGroupElement
  | OverlayProgressBarElement
  | OverlayProgressRingElement
  | OverlayLowerThirdElement
  | OverlayMaskElement
  | OverlayComponentInstanceElement;

/* =========================
   CONFIGS
========================= */

/**
 * Legacy V0 (pixel coords in baseResolution space)
 * - This is what your editor is using today.
 */
export interface OverlayConfigV0 {
  version: 0;
  baseResolution: { width: number; height: number };

  // IMPORTANT: make this optional to allow transparent default
  backgroundColor?: string;

  elements: Array<
    | (Omit<OverlayTextElement, "fontSizePx" | "fontSizeRel" | "unit"> & {
      // legacy alias
      fontSize?: number;
      strokeWidth?: number;
      strokeOpacity?: number;
    })
    | (Omit<OverlayBoxElement, "borderRadiusPx" | "borderRadiusRel" | "unit"> & {
      borderRadius?: number;
    })
    | (Omit<OverlayShapeElement, "unit"> & {
      strokeWidth?: number;
      strokeOpacity?: number;
      cornerRadius?: number;
    })
    | (Omit<OverlayImageElement, "unit"> & {
      borderRadius?: number;
    })
    | (Omit<OverlayVideoElement, "unit"> & {
      borderRadius?: number;
    })
    | OverlayGroupElement
    | OverlayProgressBarElement
    | OverlayProgressRingElement
    | OverlayLowerThirdElement
    | OverlayMaskElement
    | OverlayComponentInstanceElement
  >;
}

/**
 * V1 (responsive)
 */
export interface OverlayConfigV1 {
  version: 1;
  backgroundColor?: string; // optional => transparent default
  elements: OverlayElement[];
}

export type OverlayConfig = OverlayConfigV0 | OverlayConfigV1;
