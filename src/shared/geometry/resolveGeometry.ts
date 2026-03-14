import type {
  OverlayBooleanElement,
  OverlayElement,
  OverlayPath,
} from "../overlayTypes";
import { applyBooleanOperation } from "./pathBoolean";
import { elementToOverlayPath } from "./pathUtils";

type ResolvedGeometry = {
  path: OverlayPath;
  bounds: { x: number; y: number; width: number; height: number };
};

const booleanPathCache = new Map<string, ResolvedGeometry>();

function geometrySignature(element: OverlayElement, elementsById?: Record<string, OverlayElement>): string {
  if (element.type === "boolean") {
    const booleanEl = element as OverlayBooleanElement;
    const childSignatures = (booleanEl.childIds ?? [])
      .map((childId) => {
        const child = elementsById?.[childId];
        return child ? geometrySignature(child, elementsById) : `missing:${childId}`;
      })
      .join("|");
    return [
      "boolean",
      element.id,
      booleanEl.operation,
      element.x ?? 0,
      element.y ?? 0,
      element.width ?? 0,
      element.height ?? 0,
      childSignatures,
    ].join(":");
  }

  const geometry =
    element.type === "path"
      ? JSON.stringify((element as any).path ?? {})
      : element.type === "shape"
        ? JSON.stringify({
            shape: (element as any).shape,
            cornerRadiusPx: (element as any).cornerRadiusPx ?? (element as any).cornerRadius ?? 0,
            line: (element as any).line,
            triangle: (element as any).triangle,
          })
        : element.type === "box"
          ? JSON.stringify({
              borderRadiusPx: (element as any).borderRadiusPx ?? (element as any).borderRadius ?? 0,
            })
          : "";

  return [
    element.type,
    element.id,
    element.x ?? 0,
    element.y ?? 0,
    element.width ?? 0,
    element.height ?? 0,
    geometry,
  ].join(":");
}

export function resolveElementGeometry(
  element: OverlayElement,
  elementsById?: Record<string, OverlayElement>
): ResolvedGeometry | null {
  if (element.type === "boolean") {
    if (!elementsById) return null;
    const signature = geometrySignature(element, elementsById);
    const cached = booleanPathCache.get(signature);
    if (cached) return cached;
    const booleanEl = element as OverlayBooleanElement;
    const children = booleanEl.childIds
      .map((childId) => elementsById[childId])
      .filter(Boolean) as OverlayElement[];
    if (!children.length) return null;
    const resolved = applyBooleanOperation(booleanEl.operation, children);
    booleanPathCache.set(signature, resolved);
    return resolved;
  }

  const path = elementToOverlayPath(element);
  if (!path) return null;
  return {
    path,
    bounds: {
      x: element.x ?? 0,
      y: element.y ?? 0,
      width: element.width ?? 0,
      height: element.height ?? 0,
    },
  };
}

export function clearGeometryCache() {
  booleanPathCache.clear();
}
