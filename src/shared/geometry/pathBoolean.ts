import * as martinez from "martinez-polygon-clipping";
import ClipperLib from "clipper-lib";
import type {
  OverlayBooleanOperation,
  OverlayElement,
  OverlayPath,
} from "../overlayTypes";
import {
  elementToOverlayPath,
  flattenPath,
  normalizePathToBounds,
  ringsToOverlayPath,
  translateRings,
  type Point,
  type PolygonSet,
} from "./pathUtils";

type MartinezPolygon = number[][][];
const CLIPPER_SCALE = 1000;

function ringsToMartinez(rings: PolygonSet): MartinezPolygon {
  return rings.map((ring) => [ring.map((point) => [point.x, point.y])]);
}

function martinezToRings(result: any): PolygonSet {
  if (!Array.isArray(result)) return [];
  const rings: PolygonSet = [];
  for (const polygon of result) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue;
      rings.push(ring.map((point: number[]) => ({ x: point[0], y: point[1] })));
    }
  }
  return rings;
}

function pointInRing(point: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / Math.max(yj - yi, 1e-6) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonArea(ring: Point[]) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const next = ring[(i + 1) % ring.length];
    area += ring[i].x * next.y - next.x * ring[i].y;
  }
  return area / 2;
}

function classifyRings(rings: PolygonSet) {
  const outers: PolygonSet = [];
  const holes: PolygonSet = [];
  for (const ring of rings) {
    if (polygonArea(ring) >= 0) outers.push(ring);
    else holes.push(ring);
  }
  return { outers, holes };
}

function ringsToClipperPaths(rings: PolygonSet) {
  return rings.map((ring) =>
    ring.map((point) => ({
      X: Math.round(point.x * CLIPPER_SCALE),
      Y: Math.round(point.y * CLIPPER_SCALE),
    }))
  );
}

function clipperPathsToRings(paths: any[]): PolygonSet {
  return paths.map((path) =>
    path.map((point: { X: number; Y: number }) => ({
      x: point.X / CLIPPER_SCALE,
      y: point.Y / CLIPPER_SCALE,
    }))
  );
}

export function resolveElementRings(element: OverlayElement): PolygonSet {
  const path = elementToOverlayPath(element);
  if (!path) return [];
  return translateRings(flattenPath(path), element.x ?? 0, element.y ?? 0);
}

export function applyBooleanOperation(operation: OverlayBooleanOperation, children: OverlayElement[]) {
  if (!children.length) {
    return { path: { commands: [] } as OverlayPath, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  let current = ringsToMartinez(resolveElementRings(children[0]));
  for (let i = 1; i < children.length; i += 1) {
    const next = ringsToMartinez(resolveElementRings(children[i]));
    switch (operation) {
      case "subtract":
        current = (martinez as any).diff(current, next) ?? [];
        break;
      case "intersect":
        current = (martinez as any).intersection(current, next) ?? [];
        break;
      case "exclude":
        current = (martinez as any).xor(current, next) ?? [];
        break;
      case "union":
      default:
        current = (martinez as any).union(current, next) ?? [];
        break;
    }
  }

  const resultRings = martinezToRings(current);
  const normalized = normalizePathToBounds(ringsToOverlayPath(resultRings));
  return normalized;
}

export function offsetOverlayPath(path: OverlayPath, distance: number) {
  const rings = flattenPath(path);
  const { outers, holes } = classifyRings(rings);
  const clipper = new (ClipperLib as any).ClipperOffset(2, 0.25);
  if (outers.length) clipper.AddPaths(ringsToClipperPaths(outers), (ClipperLib as any).JoinType.jtRound, (ClipperLib as any).EndType.etClosedPolygon);
  if (holes.length) clipper.AddPaths(ringsToClipperPaths(holes), (ClipperLib as any).JoinType.jtRound, (ClipperLib as any).EndType.etClosedPolygon);
  const solution: any[] = [];
  clipper.Execute(solution, distance * CLIPPER_SCALE);
  return normalizePathToBounds(ringsToOverlayPath(clipperPathsToRings(solution)));
}
