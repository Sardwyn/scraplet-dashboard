// src/shared/overlayTypes.ts

export type OverlayElementType =
  | "text"
  | "box"
  | "shape"
  | "path"
  | "boolean"
  | "image"
  | "video"
  | "frame"
  | "group"
  | "progressBar"
  | "progressRing"
  | "lower_third"
  | "mask"
  | "componentInstance"
  | "widget"
  | "countdown"
  | "clock"
  | "audioVisualiser";

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

export type OverlayClipType = "none" | "roundRect" | "circle" | "parent";

export interface OverlayElementBase extends OverlayEditorFields {
  id: string;
  type: OverlayElementType;
  unit?: OverlayUnit;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned?: boolean;
  opacity?: number;
  rotationDeg?: number;
  scaleX?: number;
  scaleY?: number;
  tiltX?: number;
  tiltY?: number;
  skewX?: number;
  skewY?: number;
  perspective?: number;
  constraints?: OverlayConstraints;
  shadow?: {
    enabled: boolean;
    color: string;
    blur: number;
    x: number;
    y: number;
    spread?: number;
  };
  effects?: OverlayEffect[];
  clip?: {
    type: OverlayClipType;
    radius?: number;
  };
  parentId?: string;  // set on texture child elements
  bindings?: Record<string, DynamicBinding>;
  animation?: OverlayAnimation;
}

export type OverlayConstraintMode = "start" | "end" | "stretch" | "center" | "scale";

export interface OverlayConstraints {
  horizontal?: OverlayConstraintMode;
  vertical?: OverlayConstraintMode;
}

/* =========================
   GEOMETRY
========================= */

export type PathCommand =
  | { type: "move"; x: number; y: number }
  | { type: "line"; x: number; y: number }
  | { type: "curve"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "close" };

export interface OverlayPath {
  commands: PathCommand[];
}

export type OverlayBooleanOperation = "union" | "subtract" | "intersect" | "exclude";

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
  blendMode?: OverlayBlendMode;
  type: "group";
  childIds: string[]; // Order matters (z-index within group)

  // Optional styling for the group container itself
  backgroundColor?: string;
  borderRadiusPx?: number;
  borderColor?: string;
  borderWidth?: number;
}

export type OverlayFrameLayoutMode = "free" | "horizontal" | "vertical";
export type OverlayFrameAlign = "start" | "center" | "end" | "stretch";
export type OverlayFrameJustify = "start" | "center" | "end" | "space-between";

export interface OverlayFrameLayout {
  mode?: OverlayFrameLayoutMode;
  gap?: number;
  padding?: number;
  align?: OverlayFrameAlign;
  justify?: OverlayFrameJustify;
  wrap?: boolean;
}

export interface OverlayFrameElement extends OverlayElementBase {
  type: "frame";
  childIds: string[];
  backgroundColor?: string;
  borderRadiusPx?: number;
  borderColor?: string;
  borderWidth?: number;
  layout?: OverlayFrameLayout;
  clipContent?: boolean;
}

/* =========================
   MASKING
 ========================= */
export interface OverlayMaskElement extends OverlayElementBase {
  type: "mask";
  childIds: string[]; // [maskShape, content]
  invert?: boolean;
}

export function isMaskElement(el: OverlayElement): el is OverlayMaskElement {
  return el.type === "mask";
}

export function isGroupElement(el: OverlayElement): el is OverlayGroupElement {
  return el.type === "group";
}

/* =========================
   ANIMATION
========================= */

export type OverlayMotionPreset =
  | "none"
  | "fade"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "scaleIn"
  | "scaleOut"
  | "zoomIn"
  | "zoomOut"
  | "blurIn"
  | "blurOut"
  | "rotateIn"
  | "rotateOut";

export type OverlayAnimationPhase =
  | "hidden"
  | "entering"
  | "visible"
  | "exiting";

export interface OverlayAnimation {
  enter?: OverlayMotionPreset;
  exit?: OverlayMotionPreset;
  durationMs?: number;
  delayMs?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  distance?: number;   // slide distance in px (default 32)
  scale?: number;      // scale factor for scaleIn/Out (default 0.8)
  rotation?: number;   // rotation degrees for rotateIn/Out (default 90)
  blur?: number;       // blur px for blurIn/Out (default 12)
}

/* =========================
   FILLS
========================= */

export type OverlayPatternFit = "tile" | "cover" | "contain" | "stretch";
export type OverlayFillType = "solid" | "linear" | "radial" | "conic" | "pattern" | "texture";

export interface OverlayFillStop {
  color: string;
  opacity?: number;
  position?: number;
}

export interface OverlayFillBase {
  id?: string;
  type: OverlayFillType;
  opacity?: number;
}

export interface OverlaySolidFill extends OverlayFillBase {
  type: "solid";
  color: string;
}

export interface OverlayGradientFill extends OverlayFillBase {
  type: "linear" | "radial" | "conic";
  stops: OverlayFillStop[];
  angleDeg?: number;
}

export interface OverlayPatternFill extends OverlayFillBase {
  type: "pattern";
  src: string;
  fit?: OverlayPatternFit;
  scale?: number;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  rotationDeg?: number;
}

export interface OverlayTextureFill extends OverlayFillBase {
  type: "texture";
  src: string;           // upload path or URL
  fit?: "tile" | "stretch" | "fit";
  scaleX?: number;       // 1.0 = natural size
  scaleY?: number;
  offsetX?: number;
  offsetY?: number;
  blendMode?: OverlayBlendMode;
  /** id of the child image element that renders this texture */
  childElementId?: string;
}

export type OverlayFill = OverlaySolidFill | OverlayGradientFill | OverlayPatternFill | OverlayTextureFill;

/* =========================
   EFFECTS
========================= */

export type OverlayEffectType =
  | "dropShadow"
  | "innerShadow"
  | "outerGlow"
  | "innerGlow"
  | "layerBlur"
  | "backdropBlur"
  | "noise"
  | "chromaticAberration"
  | "colorGrade"
  | "parametric";

export interface OverlayEffectBase {
  id?: string;
  type: OverlayEffectType;
  enabled?: boolean;
  opacity?: number;
}

export interface OverlayShadowEffect extends OverlayEffectBase {
  type: "dropShadow" | "innerShadow";
  color: string;
  blur: number;
  x: number;
  y: number;
  spread?: number;
}

export interface OverlayGlowEffect extends OverlayEffectBase {
  type: "outerGlow" | "innerGlow";
  color: string;
  blur: number;
  spread?: number;
}

export interface OverlayLayerBlurEffect extends OverlayEffectBase {
  type: "layerBlur";
  blur: number;
}

export interface OverlayNoiseEffect extends OverlayEffectBase {
  type: "noise";
  amount: number;
  scale?: number;
}

export interface OverlayBackdropBlurEffect extends OverlayEffectBase {
  type: "backdropBlur";
  blur: number;
}

export interface OverlayChromaticAberrationEffect extends OverlayEffectBase {
  type: "chromaticAberration";
  offsetX: number;  // px red/blue channel offset
  offsetY: number;
  strength?: number; // 0..1
}

export interface OverlayColorGradeEffect extends OverlayEffectBase {
  type: "colorGrade";
  hue?: number;        // degrees -180..180
  saturation?: number; // -1..1
  brightness?: number; // -1..1
  contrast?: number;   // -1..1
}

export interface OverlayParametricEffect extends OverlayEffectBase {
  type: "parametric";
  preset: string;
  params: Record<string, number | string | boolean>;
  keyframes?: Array<{ t: number; params: Record<string, number | string | boolean> }>;
  duration?: number; // loop duration ms
}

export type OverlayEffect =

  | OverlayShadowEffect
  | OverlayGlowEffect
  | OverlayLayerBlurEffect
  | OverlayNoiseEffect
  | OverlayBackdropBlurEffect
  | OverlayChromaticAberrationEffect
  | OverlayColorGradeEffect
  | OverlayParametricEffect;

/* =========================
   TIMELINE
========================= */

export type OverlayTimelineProperty =
  | "x"
  | "y"
  | "width"
  | "height"
  | "opacity"
  | "rotationDeg"
  | "scaleX"
  | "scaleY"
  // Pseudo-3D transforms
  | "tiltX"
  | "tiltY"
  | "skewX"
  | "skewY"
  | "perspective";

export type OverlayTimelineEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "hold";

export interface OverlayTimelinePlayback {
  loop?: boolean;
  reverse?: boolean;
}

export interface OverlayTimelineKeyframe {
  id: string;
  t: number;
  value: number;
  easing?: OverlayTimelineEasing;
}

export interface OverlayTimelineTrack {
  id: string;
  elementId: string;
  property: OverlayTimelineProperty;
  keyframes: OverlayTimelineKeyframe[];
  enabled?: boolean;
}

export interface OverlayTimeline {
  durationMs: number;
  tracks: OverlayTimelineTrack[];
  playback?: OverlayTimelinePlayback;
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

  // Ticker / scroll mode (REQ-6)
  tickerMode?: boolean;
  tickerSpeed?: number;    // px/s, default 60
  tickerDirection?: "left" | "right";
  tickerGap?: number;      // px gap between repeats, default 40

  // Text on path
  textOnPathId?: string;   // id of a path element to follow
  textOnPathOffset?: number; // 0–100, start offset %
}

/* =========================
   BOX
========================= */

export interface OverlayBoxElement extends OverlayElementBase {
  type: "box";
  backgroundColor?: string;
  pattern?: OverlayPatternFill;
  fills?: OverlayFill[];

  borderRadiusPx?: number;
  borderRadiusRel?: number; // V1: 0..1 of min(viewportW, viewportH)
  cornerRadii?: OverlayCornerRadii;
  cornerType?: OverlayCornerType;

  // Optional stroke for boxes (handy once you add “stroke options”)
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeOpacity?: number;
  strokeAlign?: OverlayStrokeAlign;
  strokeLineCap?: OverlayStrokeLineCap;
  strokeLineJoin?: OverlayStrokeLineJoin;
  strokeDash?: number[];
  strokeSides?: OverlayStrokeSides;
}

/* =========================
   SHAPES
========================= */

export type OverlayShapeKind = "rect" | "circle" | "line" | "triangle" | "polygon" | "star" | "arrow";

export type OverlayStrokeLineCap = "butt" | "round" | "square";
export type OverlayStrokeLineJoin = "miter" | "round" | "bevel";
export type OverlayStrokeAlign = "inside" | "center" | "outside";
export type OverlayCornerType = "round" | "cut" | "angle";

export interface OverlayCornerRadii {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
}

export interface OverlayStrokeSides {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export interface OverlayShapeElement extends OverlayElementBase {
  type: "shape";
  shape: OverlayShapeKind;
  pattern?: OverlayPatternFill;
  fills?: OverlayFill[];

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
  strokeAlign?: OverlayStrokeAlign;
  strokeSides?: OverlayStrokeSides;

  // Rect-specific
  cornerRadiusPx?: number;
  cornerRadii?: OverlayCornerRadii;
  cornerType?: OverlayCornerType;

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

  polygon?: {
    sides?: number;
    rotationDeg?: number;
  };

  star?: {
    points?: number;
    innerRatio?: number;
    rotationDeg?: number;
  };

  arrow?: {
    direction?: "up" | "down" | "left" | "right";
    shaftRatio?: number;
    headRatio?: number;
  };
}

export interface OverlayPathElement extends OverlayElementBase {
  type: "path";
  path: OverlayPath;
  pathSource?: {
    kind: "offset";
    sourceId: string;
    distance: number;
  };
  fillColor?: string;
  fillOpacity?: number;
  fills?: OverlayFill[];
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeOpacity?: number;
  strokeDash?: number[];
  strokeLineCap?: OverlayStrokeLineCap;
  strokeLineJoin?: OverlayStrokeLineJoin;
  strokeAlign?: OverlayStrokeAlign;
}

export interface OverlayBooleanElement extends OverlayElementBase {
  type: "boolean";
  operation: OverlayBooleanOperation;
  childIds: string[];
  fillColor?: string;
  fillOpacity?: number;
  fills?: OverlayFill[];
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeOpacity?: number;
  strokeDash?: number[];
  strokeLineCap?: OverlayStrokeLineCap;
  strokeLineJoin?: OverlayStrokeLineJoin;
  strokeAlign?: OverlayStrokeAlign;
}

/* =========================
   MEDIA
========================= */

export type OverlayMediaFit = "contain" | "cover" | "fill";
export type OverlayBlendMode =
  | "normal" | "screen" | "multiply"
  | "overlay" | "hard-light" | "soft-light"
  | "difference" | "exclusion"
  | "color-dodge" | "color-burn";
export type OverlayKeyMode = "none" | "alphaBlack" | "alphaWhite" | "chromaKey";

export interface OverlayKeying {
  mode?: OverlayKeyMode;
  threshold?: number;
  softness?: number;
  keyColor?: string;
  tolerance?: number;
  spillReduction?: number;
}

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
  blendMode?: OverlayBlendMode;
  keying?: OverlayKeying;
}

export interface OverlayVideoElement extends OverlayElementBase, OverlayMediaBase {
  type: "video";
  blendMode?: OverlayBlendMode;
  keying?: OverlayKeying;

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
    easing?: OverlayAnimation["easing"];      // runtime may still default custom easing
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
  variantGroupId?: string;
  variantName?: string;
  widgetManifest?: WidgetManifest;
  // Named variants — each stores property overrides per element
  variants?: Array<{
    id: string;
    name: string;
    overrides: Record<string, Partial<OverlayElement>>; // elementId → property overrides
  }>;
}

export interface OverlayComponentInstanceElement extends OverlayElementBase {
  type: "componentInstance";
  componentId: string;
  propOverrides: Record<string, any>;
  activeVariantId?: string; // which variant is active on this instance
}

// ── Widget System ─────────────────────────────────────────────────────────────

export type WidgetCategory = "data" | "display" | "hybrid" | "utility";

export interface WidgetDataContract {
  /** SSE event type this widget subscribes to at runtime, e.g. "stake.update" */
  sseEventType: string | null;
  /** Fields this widget exposes to the binding engine */
  fields: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean";
    fallback: string | number | boolean | null;
  }>;
}

export interface WidgetLiveDataSource {
  /** Matches WidgetDataContract.sseEventType */
  sseEventType: string | null;
  /** Optional: override beacon endpoint per-instance */
  beaconEndpoint?: string;
}

export interface WidgetManifest {
  widgetId: string;
  category: WidgetCategory;
  version: string;
  displayName: string;
  description: string;
  icon: string;
  dataContract: WidgetDataContract;
  beaconEndpoint: string | null;
  /** If true, renders as zero-footprint placeholder in editor and is invisible at runtime */
  invisible?: boolean;
  /** Path to the runtime script injected into OBS browser source */
  runtimeScript?: string;
  configSchema: Array<{
    key: string;
    type: "text" | "number" | "boolean" | "select" | "color";
    label: string;
    default: any;
    options?: string[];
  }>;
  defaultProps: Record<string, unknown>;
  previewImageUrl: string | null;
}

export interface OverlayWidgetElement extends OverlayElementBase {
  type: "widget";
  widgetId: string;
  propOverrides: Record<string, any>;
  liveDataSource: WidgetLiveDataSource;
  keying?: OverlayKeying;
}

/* =========================
   COUNTDOWN TIMER
========================= */

export interface OverlayCountdownElement extends OverlayElementBase {
  type: "countdown";
  mode: "duration" | "target";
  durationMs: number;
  targetDatetime?: string;
  endBehaviour: "hold" | "hide" | "loop";
  format: string; // "HH:MM:SS" | "MM:SS" | "SS" | custom e.g. "{m}m {s}s"
  color: string;
  fontFamily?: string;
  fontSizePx: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
}


/* =========================
   CLOCK
========================= */

export interface OverlayClockElement extends OverlayElementBase {
  type: "clock";
  clockMode: "wall" | "elapsed" | "stopwatch";
  startDatetime?: string;   // ISO string for elapsed mode
  timezone?: string;        // IANA timezone for wall clock e.g. "Europe/London"
  format: string;           // e.g. "HH:mm:ss", "mm:ss", "h:mm a"
  use12h: boolean;
  color: string;
  fontFamily?: string;
  fontSizePx: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
}

export function isClockElement(el: OverlayElement): el is OverlayClockElement {
  return el.type === "clock";
}

/* =========================
   CUSTOM VARIABLES (REQ-5)
========================= */

export interface OverlayVariable {
  id: string;
  name: string;
  type: "text" | "number" | "boolean";
  value: string | number | boolean;
  defaultValue: string | number | boolean;
}

/* =========================
   AUDIO VISUALISER (REQ-8)
========================= */

export interface OverlayAudioVisualiserElement extends OverlayElementBase {
  type: "audioVisualiser";
  sourceId: string;           // "default" or OBS audio source ID
  barCount: number;           // default 32
  barColor: string;           // default "#6366f1"
  barGap: number;             // px gap between bars, default 2
  style: "bars" | "wave" | "circle" | "pips";
  // Pips style colours (thresholds: 0-60% low, 60-85% med, 85-100% high)
  pipsColorLow?: string;      // default "#22c55e" (green)
  pipsColorMid?: string;      // default "#f97316" (orange)
  pipsColorHigh?: string;     // default "#ef4444" (red)
}

/* =========================
   UNIONS
========================= */

export type OverlayElement =
  | OverlayTextElement
  | OverlayBoxElement
  | OverlayShapeElement
  | OverlayPathElement
  | OverlayBooleanElement
  | OverlayImageElement
  | OverlayVideoElement
  | OverlayFrameElement
  | OverlayGroupElement
  | OverlayProgressBarElement
  | OverlayProgressRingElement
  | OverlayLowerThirdElement
  | OverlayMaskElement
  | OverlayComponentInstanceElement
  | OverlayWidgetElement
  | OverlayCountdownElement
  | OverlayClockElement
  | OverlayAudioVisualiserElement;

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
  timeline?: OverlayTimeline;
  /** Named event timelines — keyed by event name e.g. "raid", "sub", "follow" */
  eventTimelines?: Record<string, OverlayTimeline>;

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
    | OverlayPathElement
    | OverlayBooleanElement
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
    | OverlayWidgetElement
  >;
}

/**
 * V1 (responsive)
 */
export interface OverlayConfigV1 {
  version: 1;
  backgroundColor?: string; // optional => transparent default
  timeline?: OverlayTimeline;
  eventTimelines?: Record<string, OverlayTimeline>;
  variables?: OverlayVariable[];
  elements: OverlayElement[];
}

export type OverlayConfig = OverlayConfigV0 | OverlayConfigV1;
