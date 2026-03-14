import type {
  OverlayBooleanElement,
  OverlayBoxElement,
  OverlayElement,
  OverlayPath,
  OverlayPathElement,
  OverlayShapeElement,
  PathCommand,
} from "../overlayTypes";

export type Point = { x: number; y: number };
export type PolygonRing = Point[];
export type PolygonSet = PolygonRing[];

const ELLIPSE_KAPPA = 0.5522847498307936;

function pushMove(commands: PathCommand[], x: number, y: number) {
  commands.push({ type: "move", x, y });
}

function pushLine(commands: PathCommand[], x: number, y: number) {
  commands.push({ type: "line", x, y });
}

function pushCurve(commands: PathCommand[], x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
  commands.push({ type: "curve", x1, y1, x2, y2, x, y });
}

function pushClose(commands: PathCommand[]) {
  commands.push({ type: "close" });
}

export function svgPathFromCommands(path: OverlayPath) {
  return path.commands
    .map((command) => {
      switch (command.type) {
        case "move":
          return `M ${command.x} ${command.y}`;
        case "line":
          return `L ${command.x} ${command.y}`;
        case "curve":
          return `C ${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}`;
        case "close":
          return "Z";
      }
    })
    .join(" ");
}

function roundedRectPath(width: number, height: number, radius: number): OverlayPath {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  if (r === 0) {
    return {
      commands: [
        { type: "move", x: 0, y: 0 },
        { type: "line", x: width, y: 0 },
        { type: "line", x: width, y: height },
        { type: "line", x: 0, y: height },
        { type: "close" },
      ],
    };
  }

  const c = r * ELLIPSE_KAPPA;
  const commands: PathCommand[] = [];
  pushMove(commands, r, 0);
  pushLine(commands, width - r, 0);
  pushCurve(commands, width - r + c, 0, width, r - c, width, r);
  pushLine(commands, width, height - r);
  pushCurve(commands, width, height - r + c, width - r + c, height, width - r, height);
  pushLine(commands, r, height);
  pushCurve(commands, r - c, height, 0, height - r + c, 0, height - r);
  pushLine(commands, 0, r);
  pushCurve(commands, 0, r - c, r - c, 0, r, 0);
  pushClose(commands);
  return { commands };
}

function ellipsePath(width: number, height: number): OverlayPath {
  const rx = width / 2;
  const ry = height / 2;
  const cx = rx;
  const cy = ry;
  const ox = rx * ELLIPSE_KAPPA;
  const oy = ry * ELLIPSE_KAPPA;
  const commands: PathCommand[] = [];
  pushMove(commands, cx, 0);
  pushCurve(commands, cx + ox, 0, width, cy - oy, width, cy);
  pushCurve(commands, width, cy + oy, cx + ox, height, cx, height);
  pushCurve(commands, cx - ox, height, 0, cy + oy, 0, cy);
  pushCurve(commands, 0, cy - oy, cx - ox, 0, cx, 0);
  pushClose(commands);
  return { commands };
}

function trianglePath(width: number, height: number, direction: OverlayShapeElement["triangle"] extends infer T ? T extends { direction?: infer D } ? D : never : never = "up"): OverlayPath {
  const commands: PathCommand[] = [];
  const points =
    direction === "down"
      ? [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width / 2, y: height }]
      : direction === "left"
        ? [{ x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height / 2 }]
        : direction === "right"
          ? [{ x: 0, y: 0 }, { x: width, y: height / 2 }, { x: 0, y: height }]
          : [{ x: width / 2, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  pushMove(commands, points[0].x, points[0].y);
  pushLine(commands, points[1].x, points[1].y);
  pushLine(commands, points[2].x, points[2].y);
  pushClose(commands);
  return { commands };
}

function linePath(width: number, height: number, line?: OverlayShapeElement["line"]): OverlayPath {
  return {
    commands: [
      { type: "move", x: (line?.x1 ?? 0) * width, y: (line?.y1 ?? 0.5) * height },
      { type: "line", x: (line?.x2 ?? 1) * width, y: (line?.y2 ?? 0.5) * height },
    ],
  };
}

export function boxElementToPath(box: OverlayBoxElement): OverlayPath {
  return roundedRectPath(box.width ?? 0, box.height ?? 0, (box as any).borderRadiusPx ?? (box as any).borderRadius ?? 0);
}

export function shapeElementToPath(shape: OverlayShapeElement): OverlayPath {
  const width = shape.width ?? 0;
  const height = shape.height ?? 0;
  switch (shape.shape) {
    case "circle":
      return ellipsePath(width, height);
    case "triangle":
      return trianglePath(width, height, shape.triangle?.direction);
    case "line":
      return linePath(width, height, shape.line);
    case "rect":
    default:
      return roundedRectPath(width, height, (shape as any).cornerRadiusPx ?? (shape as any).cornerRadius ?? 0);
  }
}

function scalePathToBounds(path: OverlayPath, width: number, height: number): OverlayPath {
  const bounds = getPathBounds(path);
  if (bounds.width === 0 && bounds.height === 0) {
    return path;
  }

  const scaleX = bounds.width > 0 ? width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? height / bounds.height : 1;
  if (scaleX === 1 && scaleY === 1 && bounds.x === 0 && bounds.y === 0) {
    return path;
  }

  const commands = path.commands.map((command) => {
    if (command.type === "close") return command;
    if (command.type === "curve") {
      return {
        ...command,
        x1: (command.x1 - bounds.x) * scaleX,
        y1: (command.y1 - bounds.y) * scaleY,
        x2: (command.x2 - bounds.x) * scaleX,
        y2: (command.y2 - bounds.y) * scaleY,
        x: (command.x - bounds.x) * scaleX,
        y: (command.y - bounds.y) * scaleY,
      };
    }
    return {
      ...command,
      x: (command.x - bounds.x) * scaleX,
      y: (command.y - bounds.y) * scaleY,
    };
  });
  return { commands };
}

export function elementToOverlayPath(element: OverlayElement): OverlayPath | null {
  if (element.type === "path") {
    const pathEl = element as OverlayPathElement;
    return scalePathToBounds(pathEl.path, pathEl.width ?? 0, pathEl.height ?? 0);
  }
  if (element.type === "shape") return shapeElementToPath(element as OverlayShapeElement);
  if (element.type === "box") return boxElementToPath(element as OverlayBoxElement);
  return null;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

export function flattenPath(path: OverlayPath, segmentsPerCurve = 12): PolygonSet {
  const rings: PolygonSet = [];
  let currentRing: PolygonRing = [];
  let currentPoint: Point | null = null;
  let subpathStart: Point | null = null;

  for (const command of path.commands) {
    if (command.type === "move") {
      if (currentRing.length > 1) rings.push(currentRing);
      currentRing = [{ x: command.x, y: command.y }];
      currentPoint = { x: command.x, y: command.y };
      subpathStart = { x: command.x, y: command.y };
      continue;
    }
    if (!currentPoint) continue;
    if (command.type === "line") {
      currentRing.push({ x: command.x, y: command.y });
      currentPoint = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "curve") {
      const p0 = currentPoint;
      for (let i = 1; i <= segmentsPerCurve; i += 1) {
        const point = cubicPoint(
          p0,
          { x: command.x1, y: command.y1 },
          { x: command.x2, y: command.y2 },
          { x: command.x, y: command.y },
          i / segmentsPerCurve
        );
        currentRing.push(point);
      }
      currentPoint = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "close") {
      if (subpathStart && currentRing.length > 0) {
        const first = currentRing[0];
        const last = currentRing[currentRing.length - 1];
        if (first.x !== last.x || first.y !== last.y) currentRing.push({ ...first });
      }
      if (currentRing.length > 1) rings.push(currentRing);
      currentRing = [];
      currentPoint = null;
      subpathStart = null;
    }
  }

  if (currentRing.length > 1) rings.push(currentRing);
  return rings;
}

export function ringsToOverlayPath(rings: PolygonSet): OverlayPath {
  const commands: PathCommand[] = [];
  for (const ring of rings) {
    if (!ring.length) continue;
    pushMove(commands, ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i += 1) {
      pushLine(commands, ring[i].x, ring[i].y);
    }
    pushClose(commands);
  }
  return { commands };
}

export function translateRings(rings: PolygonSet, dx: number, dy: number): PolygonSet {
  return rings.map((ring) => ring.map((point) => ({ x: point.x + dx, y: point.y + dy })));
}

export function getPathBounds(path: OverlayPath) {
  const rings = flattenPath(path);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function normalizePathToBounds(path: OverlayPath) {
  const bounds = getPathBounds(path);
  if (bounds.width === 0 && bounds.height === 0) {
    return { path, bounds };
  }
  const commands = path.commands.map((command) => {
    if (command.type === "close") return command;
    if (command.type === "curve") {
      return {
        ...command,
        x1: command.x1 - bounds.x,
        y1: command.y1 - bounds.y,
        x2: command.x2 - bounds.x,
        y2: command.y2 - bounds.y,
        x: command.x - bounds.x,
        y: command.y - bounds.y,
      };
    }
    return { ...command, x: command.x - bounds.x, y: command.y - bounds.y };
  });
  return { path: { commands }, bounds };
}

export function booleanContainerBounds(element: OverlayBooleanElement, children: OverlayElement[]) {
  const bounds = children.map((child) => ({
    x: child.x ?? 0,
    y: child.y ?? 0,
    width: child.width ?? 0,
    height: child.height ?? 0,
  }));
  if (!bounds.length) return { x: element.x ?? 0, y: element.y ?? 0, width: element.width ?? 0, height: element.height ?? 0 };
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
