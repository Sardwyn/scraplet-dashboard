import type {
  OverlayBooleanElement,
  OverlayBoxElement,
  OverlayCornerRadii,
  OverlayCornerType,
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

function commandPoint(command: Exclude<PathCommand, { type: "close" }>): Point {
  return { x: command.x, y: command.y };
}

function rectCornerRadii(
  width: number,
  height: number,
  radius: number,
  cornerRadii?: OverlayCornerRadii
) {
  const maxRadius = Math.min(width, height) / 2;
  return {
    topLeft: Math.max(0, Math.min(cornerRadii?.topLeft ?? radius, maxRadius)),
    topRight: Math.max(0, Math.min(cornerRadii?.topRight ?? radius, maxRadius)),
    bottomRight: Math.max(0, Math.min(cornerRadii?.bottomRight ?? radius, maxRadius)),
    bottomLeft: Math.max(0, Math.min(cornerRadii?.bottomLeft ?? radius, maxRadius)),
  };
}

function roundedRectPath(
  width: number,
  height: number,
  radius: number,
  cornerRadii?: OverlayCornerRadii,
  cornerType: OverlayCornerType = "round"
): OverlayPath {
  const radii = rectCornerRadii(width, height, radius, cornerRadii);
  const commands: PathCommand[] = [];

  const tl = cornerType === "angle" ? 0 : radii.topLeft;
  const tr = cornerType === "angle" ? 0 : radii.topRight;
  const br = cornerType === "angle" ? 0 : radii.bottomRight;
  const bl = cornerType === "angle" ? 0 : radii.bottomLeft;

  pushMove(commands, tl, 0);
  pushLine(commands, width - tr, 0);

  if (cornerType === "cut" && tr > 0) {
    pushLine(commands, width, tr);
  } else if (tr > 0) {
    const c = tr * ELLIPSE_KAPPA;
    pushCurve(commands, width - tr + c, 0, width, tr - c, width, tr);
  } else {
    pushLine(commands, width, 0);
  }

  pushLine(commands, width, height - br);
  if (cornerType === "cut" && br > 0) {
    pushLine(commands, width - br, height);
  } else if (br > 0) {
    const c = br * ELLIPSE_KAPPA;
    pushCurve(commands, width, height - br + c, width - br + c, height, width - br, height);
  } else {
    pushLine(commands, width, height);
  }

  pushLine(commands, bl, height);
  if (cornerType === "cut" && bl > 0) {
    pushLine(commands, 0, height - bl);
  } else if (bl > 0) {
    const c = bl * ELLIPSE_KAPPA;
    pushCurve(commands, bl - c, height, 0, height - bl + c, 0, height - bl);
  } else {
    pushLine(commands, 0, height);
  }

  pushLine(commands, 0, tl);
  if (cornerType === "cut" && tl > 0) {
    pushLine(commands, tl, 0);
  } else if (tl > 0) {
    const c = tl * ELLIPSE_KAPPA;
    pushCurve(commands, 0, tl - c, tl - c, 0, tl, 0);
  } else {
    pushLine(commands, 0, 0);
  }

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

function regularPolygonPath(width: number, height: number, sides = 6, rotationDeg = -90): OverlayPath {
  const count = Math.max(3, Math.round(sides));
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const radOffset = (rotationDeg * Math.PI) / 180;
  const commands: PathCommand[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = radOffset + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    if (i === 0) pushMove(commands, x, y);
    else pushLine(commands, x, y);
  }
  pushClose(commands);
  return { commands };
}

function starPath(width: number, height: number, points = 5, innerRatio = 0.5, rotationDeg = -90): OverlayPath {
  const count = Math.max(3, Math.round(points));
  const cx = width / 2;
  const cy = height / 2;
  const outerRx = width / 2;
  const outerRy = height / 2;
  const innerRx = outerRx * Math.max(0.05, Math.min(innerRatio, 0.95));
  const innerRy = outerRy * Math.max(0.05, Math.min(innerRatio, 0.95));
  const radOffset = (rotationDeg * Math.PI) / 180;
  const commands: PathCommand[] = [];

  for (let i = 0; i < count * 2; i += 1) {
    const outer = i % 2 === 0;
    const radiusX = outer ? outerRx : innerRx;
    const radiusY = outer ? outerRy : innerRy;
    const angle = radOffset + (i / (count * 2)) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radiusX;
    const y = cy + Math.sin(angle) * radiusY;
    if (i === 0) pushMove(commands, x, y);
    else pushLine(commands, x, y);
  }
  pushClose(commands);
  return { commands };
}

function arrowPath(
  width: number,
  height: number,
  direction: NonNullable<OverlayShapeElement["arrow"]>["direction"] = "right",
  shaftRatio = 0.42,
  headRatio = 0.34
): OverlayPath {
  const shaft = Math.max(0.1, Math.min(shaftRatio, 0.8));
  const head = Math.max(0.15, Math.min(headRatio, 0.8));
  const horizontal = direction === "left" || direction === "right";
  const shaftHalf = ((horizontal ? height : width) * shaft) / 2;
  const headStart = (horizontal ? width : height) * (1 - head);

  const points =
    direction === "left"
      ? [
          { x: width, y: height / 2 - shaftHalf },
          { x: width - headStart, y: height / 2 - shaftHalf },
          { x: width - headStart, y: 0 },
          { x: 0, y: height / 2 },
          { x: width - headStart, y: height },
          { x: width - headStart, y: height / 2 + shaftHalf },
          { x: width, y: height / 2 + shaftHalf },
        ]
      : direction === "up"
        ? [
            { x: width / 2 - shaftHalf, y: height },
            { x: width / 2 - shaftHalf, y: headStart },
            { x: 0, y: headStart },
            { x: width / 2, y: 0 },
            { x: width, y: headStart },
            { x: width / 2 + shaftHalf, y: headStart },
            { x: width / 2 + shaftHalf, y: height },
          ]
        : direction === "down"
          ? [
              { x: width / 2 - shaftHalf, y: 0 },
              { x: width / 2 - shaftHalf, y: height - headStart },
              { x: 0, y: height - headStart },
              { x: width / 2, y: height },
              { x: width, y: height - headStart },
              { x: width / 2 + shaftHalf, y: height - headStart },
              { x: width / 2 + shaftHalf, y: 0 },
            ]
          : [
              { x: 0, y: height / 2 - shaftHalf },
              { x: headStart, y: height / 2 - shaftHalf },
              { x: headStart, y: 0 },
              { x: width, y: height / 2 },
              { x: headStart, y: height },
              { x: headStart, y: height / 2 + shaftHalf },
              { x: 0, y: height / 2 + shaftHalf },
            ];
  const commands: PathCommand[] = [];
  pushMove(commands, points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) pushLine(commands, points[i].x, points[i].y);
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
  return roundedRectPath(
    box.width ?? 0,
    box.height ?? 0,
    (box as any).borderRadiusPx ?? (box as any).borderRadius ?? 0,
    box.cornerRadii,
    box.cornerType ?? "round"
  );
}

export function shapeElementToPath(shape: OverlayShapeElement): OverlayPath {
  const width = shape.width ?? 0;
  const height = shape.height ?? 0;
  switch (shape.shape) {
    case "circle":
      return ellipsePath(width, height);
    case "triangle":
      return trianglePath(width, height, shape.triangle?.direction);
    case "polygon":
      return regularPolygonPath(width, height, shape.polygon?.sides, shape.polygon?.rotationDeg);
    case "star":
      return starPath(width, height, shape.star?.points, shape.star?.innerRatio, shape.star?.rotationDeg);
    case "arrow":
      return arrowPath(width, height, shape.arrow?.direction, shape.arrow?.shaftRatio, shape.arrow?.headRatio);
    case "line":
      return linePath(width, height, shape.line);
    case "rect":
    default:
      return roundedRectPath(
        width,
        height,
        (shape as any).cornerRadiusPx ?? (shape as any).cornerRadius ?? 0,
        shape.cornerRadii,
        shape.cornerType ?? "round"
      );
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

export function isClosedPath(path: OverlayPath) {
  return path.commands.some((command) => command.type === "close");
}

export function translateOverlayPath(path: OverlayPath, dx: number, dy: number): OverlayPath {
  return {
    commands: path.commands.map((command) => {
      if (command.type === "close") return command;
      if (command.type === "curve") {
        return {
          ...command,
          x1: command.x1 + dx,
          y1: command.y1 + dy,
          x2: command.x2 + dx,
          y2: command.y2 + dy,
          x: command.x + dx,
          y: command.y + dy,
        };
      }
      return {
        ...command,
        x: command.x + dx,
        y: command.y + dy,
      };
    }),
  };
}

export function reverseOpenPath(path: OverlayPath): OverlayPath {
  const drawable = path.commands.filter((command) => command.type !== "close") as Exclude<PathCommand, { type: "close" }>[];
  if (drawable.length <= 1) return path;

  const reversed: PathCommand[] = [];
  const last = drawable[drawable.length - 1];
  reversed.push({ type: "move", x: last.x, y: last.y });

  for (let index = drawable.length - 1; index >= 1; index -= 1) {
    const segment = drawable[index];
    const previous = drawable[index - 1];
    if (segment.type === "curve") {
      reversed.push({
        type: "curve",
        x1: segment.x2,
        y1: segment.y2,
        x2: segment.x1,
        y2: segment.y1,
        x: previous.x,
        y: previous.y,
      });
    } else {
      reversed.push({
        type: "line",
        x: previous.x,
        y: previous.y,
      });
    }
  }

  return { commands: reversed };
}

export function splitOverlayPathAtAnchor(path: OverlayPath, commandIndex: number): OverlayPath[] {
  const indexed = path.commands
    .map((command, index) => ({ command, index }))
    .filter((entry) => entry.command.type !== "close") as { command: Exclude<PathCommand, { type: "close" }>; index: number }[];
  const selectedDrawableIndex = indexed.findIndex((entry) => entry.index === commandIndex);
  if (selectedDrawableIndex === -1) return [path];

  if (isClosedPath(path)) {
    if (indexed.length < 3) return [path];
    const selected = indexed[selectedDrawableIndex].command;
    const commands: PathCommand[] = [{ type: "move", x: selected.x, y: selected.y }];

    for (let i = selectedDrawableIndex + 1; i < indexed.length; i += 1) {
      commands.push({ ...indexed[i].command });
    }

    const first = indexed[0].command;
    if (selectedDrawableIndex !== 0) {
      commands.push({ type: "line", x: first.x, y: first.y });
    }

    for (let i = 1; i < selectedDrawableIndex; i += 1) {
      commands.push({ ...indexed[i].command });
    }

    return [{ commands }];
  }

  if (selectedDrawableIndex === 0 || selectedDrawableIndex === indexed.length - 1) {
    return [path];
  }

  const firstPath: PathCommand[] = path.commands
    .filter((_, index) => index <= commandIndex && path.commands[index].type !== "close")
    .map((command) => ({ ...command })) as PathCommand[];

  const secondAnchor = indexed[selectedDrawableIndex].command;
  const secondPath: PathCommand[] = [
    { type: "move", x: secondAnchor.x, y: secondAnchor.y },
    ...path.commands
      .filter((_, index) => index > commandIndex && path.commands[index].type !== "close")
      .map((command) => ({ ...command })) as PathCommand[],
  ];

  if (firstPath.length < 2 || secondPath.length < 2) return [path];
  return [{ commands: firstPath }, { commands: secondPath }];
}

function pathEndpoints(path: OverlayPath) {
  const drawable = path.commands.filter((command) => command.type !== "close") as Exclude<PathCommand, { type: "close" }>[];
  if (!drawable.length) return null;
  return {
    start: commandPoint(drawable[0]),
    end: commandPoint(drawable[drawable.length - 1]),
  };
}

export function joinOpenOverlayPaths(pathA: OverlayPath, pathB: OverlayPath): OverlayPath | null {
  if (isClosedPath(pathA) || isClosedPath(pathB)) return null;

  const candidates = [
    { a: pathA, b: pathB },
    { a: pathA, b: reverseOpenPath(pathB) },
    { a: reverseOpenPath(pathA), b: pathB },
    { a: reverseOpenPath(pathA), b: reverseOpenPath(pathB) },
  ];

  let best: { a: OverlayPath; b: OverlayPath; distance: number } | null = null;
  for (const candidate of candidates) {
    const endpointsA = pathEndpoints(candidate.a);
    const endpointsB = pathEndpoints(candidate.b);
    if (!endpointsA || !endpointsB) continue;
    const distance = Math.hypot(endpointsA.end.x - endpointsB.start.x, endpointsA.end.y - endpointsB.start.y);
    if (!best || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }

  if (!best) return null;
  const endpointsA = pathEndpoints(best.a);
  const endpointsB = pathEndpoints(best.b);
  if (!endpointsA || !endpointsB) return null;

  const commands: PathCommand[] = best.a.commands.map((command) => ({ ...command })) as PathCommand[];
  if (best.distance > 0.001) {
    commands.push({ type: "line", x: endpointsB.start.x, y: endpointsB.start.y });
  }
  const tail = best.b.commands.slice(1).map((command) => ({ ...command })) as PathCommand[];
  commands.push(...tail);
  return { commands };
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
