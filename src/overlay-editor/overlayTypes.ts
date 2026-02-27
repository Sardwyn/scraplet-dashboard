// src/shared/overlayTypes.ts

export type OverlayElementType = "text" | "box" | "shape" | "image" | "video";

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
  rotationDeg?: number; // future: rotate around center
}

/* =========================
   TEXT
========================= */

export interface OverlayTextElement extends OverlayElementBase {
  type: "text";
  text: string;

  /**
   * V1 responsive sizing:
   * - fontSizePx: literal pixels
   * - fontSizeRel: 0..1 of min(viewportW, viewportH)
   *
   * V0 editor can continue using fontSizePx only.
   */
  fontSizePx?: number;
  fontSizeRel?: number;

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
   UNIONS
========================= */

export type OverlayElement =
  | OverlayTextElement
  | OverlayBoxElement
  | OverlayShapeElement
  | OverlayImageElement
  | OverlayVideoElement;

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
