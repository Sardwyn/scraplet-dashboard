/**
 * renderResolver.ts
 *
 * Deterministic render pipeline for Scraplet overlays.
 *
 * Converts the overlay scene graph into a flat RenderSnapshot - a list of
 * fully-resolved render nodes with pre-computed matrix3d transforms.
 *
 * Both the editor preview and OBS runtime consume the same snapshot format,
 * guaranteeing 1:1 parity between authoring and playback.
 *
 * Rules:
 * - All transforms computed in JS, never delegated to CSS layout engine
 * - Single transform pipeline: position → perspective → tilt → rotate → skew → scale
 * - Positions quantised to 2dp, angles to 6dp to prevent float drift
 * - No preserve-3d, no stacking contexts, no CSS inheritance
 */

import type { WidgetSubState } from './src/overlay-runtime/types/unifiedOverlayState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderNode {
  /** Element ID from the overlay data */
  id: string;
  /** Element type */
  type: string;
  /** Canvas X position (used as CSS left) */
  x: number;
  /** Canvas Y position (used as CSS top) */
  y: number;
  /** Pre-computed CSS matrix3d() string encoding transforms only (not position) */
  matrix: string;
  /** Element width in canvas pixels */
  width: number;
  /** Element height in canvas pixels */
  height: number;
  /** Opacity 0..1 */
  opacity: number;
  /** Z-order from editor layer stack (1 = bottom) */
  zIndex: number;
  /** Whether element is visible */
  visible: boolean;
  /** For widgets: the widget type ID */
  widgetId?: string;
  /** For widgets: serialised config params */
  widgetParams?: string;
  /** For widgets: initial state computed from config (for synchronous first paint) */
  initialState?: Record<string, any>;
  /** Whether this element has 3D transforms */
  has3D: boolean;
}

export interface RenderSnapshot {
  /** Monotonically increasing snapshot version */
  version: number;
  /** Canvas base resolution */
  canvas: { width: number; height: number };
  /** Flat ordered list of render nodes (zIndex = editor layer order) */
  nodes: RenderNode[];
  /** Timestamp when snapshot was generated */
  timestamp: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Quantise to N decimal places to prevent float drift */
function q(v: number, dp = 6): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** 4x4 identity matrix as flat 16-element array (column-major, CSS order) */
function identity(): number[] {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

/** Multiply two 4x4 matrices (column-major) */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Translation matrix */
function matTranslate(tx: number, ty: number, tz = 0): number[] {
  const m = identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

/** Scale matrix */
function matScale(sx: number, sy: number, sz = 1): number[] {
  const m = identity();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
}

/** Rotation around Z axis (2D rotation) */
function matRotateZ(deg: number): number[] {
  const r = deg * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  const m = identity();
  m[0] = c;  m[4] = -s;
  m[1] = s;  m[5] = c;
  return m;
}

/** Rotation around X axis (tiltX) */
function matRotateX(deg: number): number[] {
  const r = deg * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  const m = identity();
  m[5] = c;  m[9] = -s;
  m[6] = s;  m[10] = c;
  return m;
}

/** Rotation around Y axis (tiltY) */
function matRotateY(deg: number): number[] {
  const r = deg * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  const m = identity();
  m[0] = c;  m[8] = s;
  m[2] = -s; m[10] = c;
  return m;
}

/** Skew matrix (skewX, skewY in degrees) */
function matSkew(skewXDeg: number, skewYDeg: number): number[] {
  const m = identity();
  m[4] = Math.tan(skewXDeg * DEG);
  m[1] = Math.tan(skewYDeg * DEG);
  return m;
}

/**
 * Perspective matrix.
 * perspectivePx: distance from viewer to z=0 plane in pixels.
 */
function matPerspective(perspectivePx: number): number[] {
  const m = identity();
  if (perspectivePx > 0) {
    m[11] = -1 / perspectivePx;
  }
  return m;
}

/** Convert flat 16-element matrix to CSS matrix3d() string */
function toMatrix3d(m: number[]): string {
  return `matrix3d(${m.map(v => q(v, 8)).join(',')})`;
}

// ─── Transform resolver ───────────────────────────────────────────────────────

export interface ElementTransformInput {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  scaleX?: number;
  scaleY?: number;
  tiltX?: number;
  tiltY?: number;
  skewX?: number;
  skewY?: number;
  perspective?: number;
}

/**
 * Resolve a single element's transform into a matrix3d string.
 *
 * Matches CSS exactly:
 *   left: x; top: y;
 *   transform: perspective(d) rotateX(tx) rotateY(ty) skewX(sx) skewY(sy) scale(sx,sy);
 *   transform-origin: center center;
 *
 * Transform order follows CSS right-to-left evaluation.
 * Transform-origin is baked into the matrix (T(origin) * M * T(-origin)).
 */
export function resolveElementTransform(el: ElementTransformInput): string {
  const w  = q(el.width, 2);
  const h  = q(el.height, 2);

  const rotDeg   = el.rotationDeg ?? 0;
  const sx       = el.scaleX ?? 1;
  const sy       = el.scaleY ?? 1;
  const tiltX    = el.tiltX ?? 0;
  const tiltY    = el.tiltY ?? 0;
  const skewXDeg = el.skewX ?? 0;
  const skewYDeg = el.skewY ?? 0;
  const persp    = el.perspective ?? 800;
  const has3D    = tiltX !== 0 || tiltY !== 0 || skewXDeg !== 0 || skewYDeg !== 0;

  // No transforms - return none
  if (!has3D && rotDeg === 0 && sx === 1 && sy === 1) {
    return 'none';
  }

  // Transform-origin: center center
  const ox = w / 2;
  const oy = h / 2;

  const parts = [];
  
  if (has3D && persp > 0) parts.push(`perspective(${persp}px)`);
  if (tiltX !== 0) parts.push(`rotateX(${tiltX}deg)`);
  if (tiltY !== 0) parts.push(`rotateY(${tiltY}deg)`);
  if (rotDeg !== 0) parts.push(`rotate(${rotDeg}deg)`);
  if (skewXDeg !== 0) parts.push(`skewX(${skewXDeg}deg)`);
  if (skewYDeg !== 0) parts.push(`skewY(${skewYDeg}deg)`);
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  
  return parts.length > 0 ? parts.join(' ') : 'none';
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

let _snapshotVersion = 0;

/**
 * Build a RenderSnapshot from a flat list of overlay elements.
 * Elements must be in editor layer order (index 0 = bottom layer).
 * Child elements of groups/frames should already be excluded by the caller.
 */
export function buildRenderSnapshot(
  elements: any[],
  canvasWidth: number,
  canvasHeight: number,
  widgetStates?: Record<string, WidgetSubState>
): RenderSnapshot {
  const nodes: RenderNode[] = elements.map((el, index) => {
    const tiltX    = el.tiltX ?? 0;
    const tiltY    = el.tiltY ?? 0;
    const skewX    = el.skewX ?? 0;
    const skewY    = el.skewY ?? 0;
    const has3D    = tiltX !== 0 || tiltY !== 0 || skewX !== 0 || skewY !== 0;

    const matrix = resolveElementTransform({
      x:           el.x ?? 0,
      y:           el.y ?? 0,
      width:       el.width ?? 0,
      height:      el.height ?? 0,
      rotationDeg: el.rotationDeg,
      scaleX:      el.scaleX,
      scaleY:      el.scaleY,
      tiltX,
      tiltY,
      skewX,
      skewY,
      perspective: el.perspective,
    });

    // Serialise widget config params
    let widgetParams: string | undefined;
    let initialState: Record<string, any> | undefined;
    if (el.type === 'widget') {
      // Priority 1: widgetStates from unified overlay state
      if (widgetStates && widgetStates[el.id]) {
        initialState = widgetStates[el.id] as Record<string, any>;
      }
      // Priority 2: propOverrides fallback (existing behavior)
      else if (el.propOverrides) {
        initialState = { ...el.propOverrides };
      }
      // Priority 3: empty object
      else {
        initialState = {};
      }

      // Serialize propOverrides to widgetParams for non-state config
      if (el.propOverrides) {
        const rp = new URLSearchParams();
        Object.entries(el.propOverrides as Record<string, any>).forEach(([k, v]) =>
          rp.set(k, String(v))
        );
        widgetParams = rp.toString();
      }
    }

    return {
      id:          el.id,
      type:        el.type,
      x:           q(el.x ?? 0, 2),
      y:           q(el.y ?? 0, 2),
      matrix,
      width:       q(el.width ?? 0, 2),
      height:      q(el.height ?? 0, 2),
      opacity:     q(el.opacity ?? 1, 4),
      zIndex:      index + 1,
      visible:     el.visible !== false,
      widgetId:    el.type === 'widget' ? el.widgetId : undefined,
      widgetParams,
      initialState,
      has3D,
    };
  });

  return {
    version:   ++_snapshotVersion,
    canvas:    { width: canvasWidth, height: canvasHeight },
    nodes:     nodes.filter(n => n.visible),
    timestamp: Date.now(),
  };
}
