// src/shared/layout/resolveConstraints.ts
// Pure constraint resolution — no React, no side effects

import type { OverlayConstraintMode } from '../overlayTypes';

export interface Resolution { width: number; height: number; }

export interface ElementRect { x: number; y: number; width: number; height: number; }

// Resolve a single axis
function resolveAxis(
  pos: number,
  size: number,
  canvasFrom: number,
  canvasTo: number,
  mode: OverlayConstraintMode | undefined
): { pos: number; size: number } {
  const right = canvasFrom - pos - size; // distance from far edge
  const scale = canvasTo / canvasFrom;

  switch (mode) {
    case 'start':   // pin to near edge — pos fixed, size fixed
      return { pos, size };
    case 'end':     // pin to far edge — maintain distance from far edge
      return { pos: canvasTo - right - size, size };
    case 'stretch': // pin both edges — pos fixed, size grows
      return { pos, size: canvasTo - pos - right };
    case 'center': {  // pin to centre — maintain offset from centre
      const centre = canvasFrom / 2;
      const offset = pos + size / 2 - centre;
      const newCentre = canvasTo / 2;
      return { pos: newCentre + offset - size / 2, size };
    }
    case 'scale':   // proportional scale
    default:
      return { pos: pos * scale, size: size * scale };
  }
}

export function resolveElement(
  el: ElementRect & { constraints?: { horizontal?: OverlayConstraintMode; vertical?: OverlayConstraintMode } },
  from: Resolution,
  to: Resolution
): ElementRect {
  if (from.width === to.width && from.height === to.height) return el;
  const h = resolveAxis(el.x, el.width,  from.width,  to.width,  el.constraints?.horizontal);
  const v = resolveAxis(el.y, el.height, from.height, to.height, el.constraints?.vertical);
  return { x: h.pos, y: v.pos, width: h.size, height: v.size };
}

export function resolveLayout<T extends ElementRect & { constraints?: { horizontal?: OverlayConstraintMode; vertical?: OverlayConstraintMode } }>(
  elements: T[],
  from: Resolution,
  to: Resolution
): T[] {
  if (from.width === to.width && from.height === to.height) return elements;
  return elements.map(el => ({ ...el, ...resolveElement(el, from, to) }));
}
