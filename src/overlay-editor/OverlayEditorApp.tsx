import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd, RndDragCallback, RndResizeCallback } from "react-rnd";
import {
  OverlayAnimation,
  OverlayBooleanElement,
  OverlayBooleanOperation,
  OverlayCornerRadii,
  OverlayCornerType,
  OverlayConfigV0,
  OverlayElement,
  OverlayPath,
  OverlayPathElement,
  OverlayFill,
  OverlayFillStop,
  OverlayEffect,
  OverlayConstraintMode,
  OverlayConstraints,
  OverlayGlowEffect,
  OverlayLayerBlurEffect,
  OverlayNoiseEffect,
  OverlayShadowEffect,
  OverlayPatternFill,
  OverlayPatternFit,
  OverlayFrameAlign,
  OverlayFrameElement,
  OverlayFrameJustify,
  OverlayFrameLayoutMode,
  OverlayStrokeAlign,
  PathCommand,
  OverlayTimeline,
  OverlayTimelineEasing,
  OverlayTimelineKeyframe,
  OverlayTimelineProperty,
  OverlayTimelineTrack,
  OverlayTextElement,
  OverlayBoxElement,
  OverlayShapeElement,
  OverlayImageElement,
  OverlayVideoElement,
  OverlayShapeKind,
  OverlayMediaFit,
  OverlayLowerThirdElement,
  OverlayComponentDef,
  OverlayMotionPreset
} from "../shared/overlayTypes";
import { ElementRenderer } from "../shared/overlayRenderer";
import { FontLoader } from "../shared/FontManager";
import { BindingPicker } from "./BindingPicker";
import { SourceCatalog } from "../shared/bindingEngine";
import { FontPicker } from "./FontPicker";
import { useElementAnimationPhases } from "../overlay-runtime/useElementAnimationPhases";
import { evaluateTimeline } from "../shared/timeline/evaluateTimeline";
import { TimelinePanel } from "./components/TimelinePanel";
import { ShortcutCheatsheetModal } from "./components/ShortcutCheatsheetModal";
import { PanelGeneratorPanel } from "./components/PanelGeneratorPanel";
import { getAllWidgets, getWidgetDef } from "../shared/widgetRegistry";
import "../stakeMonitor/stakeMonitorWidget";
import "../ttsWidget/ttsWidget";
import "../widgets/allWidgets";
import { formatShortcutTooltip, shortcutMatchesEvent } from "./shortcutRegistry";
import { uiClasses } from "./uiTokens";
import { deriveStyleProfile } from "./panelStyleEngine";
import { expandStrokePath, offsetOverlayPath } from "../shared/geometry/pathBoolean";
import {
  booleanContainerBounds,
  elementToOverlayPath,
  isClosedPath,
  joinOpenOverlayPaths,
  normalizePathToBounds,
  reverseOpenPath,
  splitOverlayPathAtAnchor,
  svgPathFromCommands,
  translateOverlayPath,
} from "../shared/geometry/pathUtils";
import { resolveElementGeometry } from "../shared/geometry/resolveGeometry";


interface ServerOverlay {
  id: number;
  name: string;
  slug: string;
  public_id: string;
  config_json: OverlayConfigV0;
  isComponentMaster?: boolean;
  schemaVersion?: number;
  propsSchema?: any;
  metadata?: any;
}

interface Props {
  initialOverlay: ServerOverlay;
}

type AnyEl = OverlayElement & {
  // Optional editor-only fields
  name?: string;
  visible?: boolean;
  locked?: boolean;

  // Editor legacy fields still used by your V0 config
  fontSize?: number;
  borderRadius?: number;

  // Shape legacy
  strokeWidth?: number;
  strokeOpacity?: number;
  cornerRadius?: number;

  // Media legacy
  opacity?: number;
};

type ZoomMode = "fit" | "manual";

type GuideKind = "stage" | "element";
type GuideLine = { pos: number; kind: GuideKind };

type GuideState = {
  show: boolean;
  v?: GuideLine[];
  h?: GuideLine[];
  spacing?: Array<
    | { axis: "x"; y: number; start: number; end: number; label: string }
    | { axis: "y"; x: number; start: number; end: number; label: string }
  >;
};

type SnapOptions = {
  enabled: boolean;
  threshold: number;
};

type MarqueeState = {
  active: boolean;
  shift: boolean;
  start: { x: number; y: number } | null; // stage coords
  cur: { x: number; y: number } | null; // stage coords
};

// ===== Asset picker types =====
type AssetKind = "images" | "videos";
type AssetScope = "overlays" | "profiles" | "widgets";

type AssetItem = {
  url: string;
  name?: string;
  kind: AssetKind;
  addedAt: number;
};

const TIMELINE_PROPERTIES: OverlayTimelineProperty[] = [
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "rotationDeg",
  "scaleX",
  "scaleY",
];

const DEFAULT_TIMELINE_DURATION_MS = 5000;
const KEYFRAME_TIME_EPSILON_MS = 10;
const TOOL_ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const ACCENT_TINT = "#818cf8";
const ACCENT_TINT_SOFT = "rgba(129,140,248,0.2)";
const ACCENT_FILL_SOFT = "rgba(129,140,248,0.12)";

function genId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rand}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundToGrid(n: number, grid: number) {
  if (!grid || grid <= 1) return Math.round(n);
  return Math.round(n / grid) * grid;
}

function isTypingTarget(el: Element | null) {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function ensureTimeline(timeline?: OverlayTimeline): OverlayTimeline {
  return {
    durationMs: Math.max(100, timeline?.durationMs ?? DEFAULT_TIMELINE_DURATION_MS),
    tracks: [...(timeline?.tracks ?? [])],
    playback: {
      loop: timeline?.playback?.loop ?? false,
      reverse: timeline?.playback?.reverse ?? false,
    },
  };
}

function isTimelineEligibleElement(element: OverlayElement) {
  return element.type !== "lower_third";
}

function applyTimelineOverridesToElement(
  element: OverlayElement,
  timelineValues?: Partial<Record<OverlayTimelineProperty, number>>
) {
  if (!timelineValues) return element;

  const nextBindings = element.bindings ? { ...element.bindings } : undefined;
  let removedBinding = false;

  for (const property of TIMELINE_PROPERTIES) {
    if (timelineValues[property] === undefined) continue;
    if (nextBindings && property in nextBindings) {
      delete nextBindings[property];
      removedBinding = true;
    }
  }

  return {
    ...element,
    ...timelineValues,
    bindings: removedBinding
      ? Object.keys(nextBindings || {}).length > 0
        ? nextBindings
        : undefined
      : element.bindings,
  } as OverlayElement;
}

function snapRotationValue(value: number, allowFreeform: boolean) {
  if (allowFreeform) return value;
  return Math.round(value / 15) * 15;
}

type ResizeHandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function rotateVector(x: number, y: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function handleAxes(handle: ResizeHandleKind) {
  return {
    sx: handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0,
    sy: handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0,
  };
}

function getResizeCursor(handle: ResizeHandleKind, rotationDeg: number) {
  const cursors = ["ew-resize", "nesw-resize", "ns-resize", "nwse-resize", "ew-resize", "nesw-resize", "ns-resize", "nwse-resize"];
  const baseAngle = {
    e: 0,
    ne: 45,
    n: 90,
    nw: 135,
    w: 180,
    sw: 225,
    s: 270,
    se: 315,
  } as const;
  const angle = (((baseAngle[handle] + rotationDeg) % 360) + 360) % 360;
  const index = Math.round(angle / 45) % 8;
  return cursors[index];
}

function getElementRadiusValue(el: AnyEl) {
  if (el.type === "box") {
    const corners = (el as any).cornerRadii as OverlayCornerRadii | undefined;
    if (corners) return Math.max(corners.topLeft ?? 0, corners.topRight ?? 0, corners.bottomRight ?? 0, corners.bottomLeft ?? 0);
    return Number((el as any).borderRadiusPx ?? (el as any).borderRadius ?? 0);
  }
  if (el.type === "shape" && (el as any).shape === "rect") {
    const corners = (el as any).cornerRadii as OverlayCornerRadii | undefined;
    if (corners) return Math.max(corners.topLeft ?? 0, corners.topRight ?? 0, corners.bottomRight ?? 0, corners.bottomLeft ?? 0);
    return Number((el as any).cornerRadiusPx ?? (el as any).cornerRadius ?? 0);
  }
  return 0;
}

function supportsRadiusHandle(el: AnyEl) {
  return el.type === "box" || (el.type === "shape" && (el as any).shape === "rect");
}

function getRadiusPatch(el: AnyEl, radius: number): Partial<AnyEl> {
  const cornerRadii: OverlayCornerRadii = { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
  if (el.type === "box") return { borderRadius: radius, borderRadiusPx: radius, cornerRadii } as any;
  if (el.type === "shape" && (el as any).shape === "rect") return { cornerRadius: radius, cornerRadiusPx: radius, cornerRadii } as any;
  return {};
}

function computeResizeDraft(
  origin: { x: number; y: number; width: number; height: number; rotationDeg: number },
  handle: ResizeHandleKind,
  deltaWorld: { x: number; y: number },
  options: { preserveAspect: boolean; resizeFromCenter: boolean }
) {
  const minSize = 8;
  const { sx, sy } = handleAxes(handle);
  const deltaLocal = rotateVector(deltaWorld.x, deltaWorld.y, -origin.rotationDeg);
  const aspect = origin.height !== 0 ? origin.width / origin.height : 1;
  let left = -origin.width / 2;
  let right = origin.width / 2;
  let top = -origin.height / 2;
  let bottom = origin.height / 2;
  let centerLocalX = 0;
  let centerLocalY = 0;

  if (options.resizeFromCenter) {
    let width = origin.width;
    let height = origin.height;
    if (sx !== 0) width = Math.max(minSize, origin.width + sx * deltaLocal.x * 2);
    if (sy !== 0) height = Math.max(minSize, origin.height + sy * deltaLocal.y * 2);

    if (options.preserveAspect) {
      if (sx === 0 && sy !== 0) width = Math.max(minSize, height * aspect);
      else if (sy === 0 && sx !== 0) height = Math.max(minSize, width / Math.max(aspect, 0.0001));
      else if (sx !== 0 && sy !== 0) {
        const widthScale = width / Math.max(origin.width, minSize);
        const heightScale = height / Math.max(origin.height, minSize);
        if (Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)) {
          height = Math.max(minSize, width / Math.max(aspect, 0.0001));
        } else {
          width = Math.max(minSize, height * aspect);
        }
      }
    }

    left = -width / 2;
    right = width / 2;
    top = -height / 2;
    bottom = height / 2;
  } else {
    if (sx === -1) left += deltaLocal.x;
    if (sx === 1) right += deltaLocal.x;
    if (sy === -1) top += deltaLocal.y;
    if (sy === 1) bottom += deltaLocal.y;

    if (options.preserveAspect) {
      if (sx === 0 && sy !== 0) {
        const height = Math.max(minSize, bottom - top);
        const width = Math.max(minSize, height * aspect);
        const cx = (left + right) / 2;
        left = cx - width / 2;
        right = cx + width / 2;
      } else if (sy === 0 && sx !== 0) {
        const width = Math.max(minSize, right - left);
        const height = Math.max(minSize, width / Math.max(aspect, 0.0001));
        const cy = (top + bottom) / 2;
        top = cy - height / 2;
        bottom = cy + height / 2;
      } else if (sx !== 0 && sy !== 0) {
        const width = Math.max(minSize, right - left);
        const height = Math.max(minSize, bottom - top);
        const widthScale = width / Math.max(origin.width, minSize);
        const heightScale = height / Math.max(origin.height, minSize);
        if (Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)) {
          const nextHeight = Math.max(minSize, width / Math.max(aspect, 0.0001));
          if (sy < 0) top = bottom - nextHeight;
          else bottom = top + nextHeight;
        } else {
          const nextWidth = Math.max(minSize, height * aspect);
          if (sx < 0) left = right - nextWidth;
          else right = left + nextWidth;
        }
      }
    }

    if (right - left < minSize) {
      if (sx < 0) left = right - minSize;
      if (sx > 0) right = left + minSize;
    }
    if (bottom - top < minSize) {
      if (sy < 0) top = bottom - minSize;
      if (sy > 0) bottom = top + minSize;
    }

    centerLocalX = (left + right) / 2;
    centerLocalY = (top + bottom) / 2;
  }

  const nextWidth = Math.max(minSize, right - left);
  const nextHeight = Math.max(minSize, bottom - top);
  const originCenter = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 };
  const centerOffsetWorld = rotateVector(centerLocalX, centerLocalY, origin.rotationDeg);
  const nextCenter = {
    x: originCenter.x + centerOffsetWorld.x,
    y: originCenter.y + centerOffsetWorld.y,
  };

  return {
    x: nextCenter.x - nextWidth / 2,
    y: nextCenter.y - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  };
}

function collectDescendantIds(elementsById: Record<string, AnyEl>, id: string, acc = new Set<string>()) {
  const el = elementsById[id];
  if (!el) return acc;
  if (el.type !== "group" && el.type !== "frame" && el.type !== "mask" && el.type !== "boolean") return acc;

  for (const childId of (el as any).childIds ?? []) {
    if (acc.has(childId)) continue;
    acc.add(childId);
    collectDescendantIds(elementsById, childId, acc);
  }
  return acc;
}

function scaleDescendantRect(
  rect: { x: number; y: number; width: number; height: number },
  origin: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number }
) {
  const scaleX = next.width / Math.max(origin.width, 1);
  const scaleY = next.height / Math.max(origin.height, 1);
  return {
    x: next.x + (rect.x - origin.x) * scaleX,
    y: next.y + (rect.y - origin.y) * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

function scaleNumericValue(value: unknown, scale: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric * scale;
}

function isPathCapableElement(el: AnyEl | null | undefined): el is AnyEl {
  return !!el && (el.type === "shape" || el.type === "path" || el.type === "box" || el.type === "boolean");
}

function getScaledTextPatch(
  el: AnyEl,
  origin: { width: number; height: number },
  next: { width: number; height: number }
): Partial<AnyEl> {
  if (el.type !== "text") return {};

  const scaleX = next.width / Math.max(origin.width, 1);
  const scaleY = next.height / Math.max(origin.height, 1);
  const textScale = Math.max(0.1, Math.min(scaleX, scaleY));
  const patch: Partial<AnyEl> = {};

  const fontSizePx = scaleNumericValue((el as any).fontSizePx, textScale);
  if (fontSizePx !== undefined) patch.fontSizePx = fontSizePx as any;

  const fontSize = scaleNumericValue((el as any).fontSize, textScale);
  if (fontSize !== undefined) patch.fontSize = fontSize as any;

  const strokeWidthPx = scaleNumericValue((el as any).strokeWidthPx, textScale);
  if (strokeWidthPx !== undefined) patch.strokeWidthPx = strokeWidthPx as any;

  const strokeWidth = scaleNumericValue((el as any).strokeWidth, textScale);
  if (strokeWidth !== undefined) patch.strokeWidth = strokeWidth as any;

  if ((el as any).shadow && typeof (el as any).shadow === "object") {
    const shadow = (el as any).shadow;
    patch.shadow = {
      ...shadow,
      blur: scaleNumericValue(shadow.blur, textScale) ?? shadow.blur,
      x: scaleNumericValue(shadow.x, textScale) ?? shadow.x,
      y: scaleNumericValue(shadow.y, textScale) ?? shadow.y,
      spread: scaleNumericValue(shadow.spread, textScale) ?? shadow.spread,
    } as any;
  }

  if (Array.isArray((el as any).effects)) {
    patch.effects = (el as any).effects.map((effect: OverlayEffect) => {
      if (effect.type === "dropShadow" || effect.type === "innerShadow") {
        return {
          ...effect,
          blur: scaleNumericValue(effect.blur, textScale) ?? effect.blur,
          x: scaleNumericValue(effect.x, textScale) ?? effect.x,
          y: scaleNumericValue(effect.y, textScale) ?? effect.y,
          spread: scaleNumericValue(effect.spread, textScale) ?? effect.spread,
        } as OverlayShadowEffect;
      }
      if (effect.type === "outerGlow" || effect.type === "innerGlow") {
        return {
          ...effect,
          blur: scaleNumericValue(effect.blur, textScale) ?? effect.blur,
          spread: scaleNumericValue(effect.spread, textScale) ?? effect.spread,
        } as OverlayGlowEffect;
      }
      if (effect.type === "layerBlur") {
        return {
          ...effect,
          blur: scaleNumericValue(effect.blur, textScale) ?? effect.blur,
        } as OverlayLayerBlurEffect;
      }
      return effect.type === "noise"
        ? ({
            ...effect,
            scale: scaleNumericValue(effect.scale, textScale) ?? effect.scale,
          } as OverlayNoiseEffect)
        : effect;
    }) as any;
  }

  return patch;
}

function getElementWithDraft(
  element: AnyEl,
  draftRect?: { x: number; y: number; width: number; height: number },
  draftPatch?: Partial<AnyEl>
) {
  return {
    ...element,
    ...(draftRect ? draftRect : {}),
    ...(draftPatch ? draftPatch : {}),
  } as AnyEl;
}

type PathAnchor = {
  commandIndex: number;
  x: number;
  y: number;
};

type PathHandle = {
  anchorCommandIndex: number;
  curveCommandIndex: number;
  role: "in" | "out";
  x: number;
  y: number;
};

function getPathAnchors(path: OverlayPath): PathAnchor[] {
  const anchors: PathAnchor[] = [];
  path.commands.forEach((command, commandIndex) => {
    if (command.type === "move" || command.type === "line" || command.type === "curve") {
      anchors.push({ commandIndex, x: command.x, y: command.y });
    }
  });
  return anchors;
}

function getPathHandles(path: OverlayPath): PathHandle[] {
  const handles: PathHandle[] = [];
  path.commands.forEach((command, commandIndex) => {
    if (command.type === "curve") {
      handles.push({
        anchorCommandIndex: commandIndex,
        curveCommandIndex: commandIndex,
        role: "in",
        x: command.x2,
        y: command.y2,
      });
      const previous = path.commands[commandIndex - 1] as any;
      if (previous && previous.type !== "close") {
        handles.push({
          anchorCommandIndex: commandIndex - 1,
          curveCommandIndex: commandIndex,
          role: "out",
          x: command.x1,
          y: command.y1,
        });
      }
    }
  });
  return handles;
}

function updatePathAnchor(path: OverlayPath, commandIndex: number, nextPoint: { x: number; y: number }) {
  const commands = path.commands.map((command) => ({ ...command })) as PathCommand[];
  const current = commands[commandIndex] as any;
  if (!current || current.type === "close") return path;
  const dx = nextPoint.x - current.x;
  const dy = nextPoint.y - current.y;
  current.x = nextPoint.x;
  current.y = nextPoint.y;
  if (current.type === "curve") {
    current.x2 += dx;
    current.y2 += dy;
  }

  const nextCurve = commands[commandIndex + 1] as any;
  if (nextCurve?.type === "curve") {
    nextCurve.x1 += dx;
    nextCurve.y1 += dy;
  }

  const prevCurve = commands[commandIndex - 1] as any;
  if (prevCurve?.type === "curve") {
    prevCurve.x2 += dx;
    prevCurve.y2 += dy;
  }

  return { commands };
}

function updatePathHandle(path: OverlayPath, curveCommandIndex: number, role: "in" | "out", nextPoint: { x: number; y: number }) {
  const commands = path.commands.map((command) => ({ ...command })) as PathCommand[];
  const curve = commands[curveCommandIndex] as any;
  if (!curve || curve.type !== "curve") return path;
  if (role === "in") {
    curve.x2 = nextPoint.x;
    curve.y2 = nextPoint.y;
  } else {
    curve.x1 = nextPoint.x;
    curve.y1 = nextPoint.y;
  }
  return { commands };
}

function removePathAnchor(path: OverlayPath, commandIndex: number) {
  const removable = getPathAnchors(path);
  if (removable.length <= 2) return path;
  const commands = path.commands.filter((_, index) => index !== commandIndex);
  const firstDrawableIndex = commands.findIndex((command) => command.type !== "close");
  if (firstDrawableIndex >= 0 && commands[firstDrawableIndex].type !== "move") {
    commands[firstDrawableIndex] = { ...(commands[firstDrawableIndex] as any), type: "move" };
  }
  return { commands };
}

function addPathAnchorAfterSelection(path: OverlayPath, commandIndex: number) {
  const anchors = getPathAnchors(path);
  const currentAnchorIndex = anchors.findIndex((anchor) => anchor.commandIndex === commandIndex);
  if (currentAnchorIndex === -1) return path;
  const currentAnchor = anchors[currentAnchorIndex];
  const isClosed = path.commands.some((command) => command.type === "close");
  const nextAnchor = anchors[currentAnchorIndex + 1] ?? (isClosed ? anchors[0] : undefined);
  if (!nextAnchor) return path;
  const midpoint = {
    x: (currentAnchor.x + nextAnchor.x) / 2,
    y: (currentAnchor.y + nextAnchor.y) / 2,
  };
  const nextCommands = [...path.commands];
  const insertIndex =
    currentAnchorIndex === anchors.length - 1 && isClosed
      ? nextCommands.findIndex((command) => command.type === "close")
      : nextAnchor.commandIndex;
  nextCommands.splice(Math.max(0, insertIndex), 0, { type: "line", ...midpoint } as PathCommand);
  return { commands: nextCommands };
}

function hasVerticalOverlap(a: ReturnType<typeof rectFromEl>, b: ReturnType<typeof rectFromEl>) {
  return Math.min(a.b, b.b) - Math.max(a.t, b.t) > 12;
}

function hasHorizontalOverlap(a: ReturnType<typeof rectFromEl>, b: ReturnType<typeof rectFromEl>) {
  return Math.min(a.r, b.r) - Math.max(a.l, b.l) > 12;
}

function computeEqualSpacingGuides(
  rect: ReturnType<typeof rectFromEl>,
  others: AnyEl[],
  threshold: number
): GuideState["spacing"] {
  const guides: NonNullable<GuideState["spacing"]> = [];

  const horizontal = others
    .map((el) => ({ el, rect: rectFromEl(el) }))
    .filter(({ rect: other }) => hasVerticalOverlap(rect, other));
  const left = horizontal
    .filter(({ rect: other }) => other.r <= rect.l)
    .sort((a, b) => b.rect.r - a.rect.r)[0];
  const right = horizontal
    .filter(({ rect: other }) => other.l >= rect.r)
    .sort((a, b) => a.rect.l - b.rect.l)[0];

  if (left && right) {
    const leftGap = rect.l - left.rect.r;
    const rightGap = right.rect.l - rect.r;
    if (leftGap >= 0 && rightGap >= 0 && Math.abs(leftGap - rightGap) <= threshold) {
      const y = rect.cy;
      const label = `${Math.round((leftGap + rightGap) / 2)}px`;
      guides.push({ axis: "x", y, start: left.rect.r, end: rect.l, label });
      guides.push({ axis: "x", y, start: rect.r, end: right.rect.l, label });
    }
  }

  const vertical = others
    .map((el) => ({ el, rect: rectFromEl(el) }))
    .filter(({ rect: other }) => hasHorizontalOverlap(rect, other));
  const top = vertical
    .filter(({ rect: other }) => other.b <= rect.t)
    .sort((a, b) => b.rect.b - a.rect.b)[0];
  const bottom = vertical
    .filter(({ rect: other }) => other.t >= rect.b)
    .sort((a, b) => a.rect.t - b.rect.t)[0];

  if (top && bottom) {
    const topGap = rect.t - top.rect.b;
    const bottomGap = bottom.rect.t - rect.b;
    if (topGap >= 0 && bottomGap >= 0 && Math.abs(topGap - bottomGap) <= threshold) {
      const x = rect.cx;
      const label = `${Math.round((topGap + bottomGap) / 2)}px`;
      guides.push({ axis: "y", x, start: top.rect.b, end: rect.t, label });
      guides.push({ axis: "y", x, start: rect.b, end: bottom.rect.t, label });
    }
  }

  return guides;
}

function rectFromEl(el: AnyEl) {
  const x = el.x ?? 0;
  const y = el.y ?? 0;
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  return {
    x,
    y,
    w,
    h,
    l: x,
    r: x + w,
    t: y,
    b: y + h,
    cx: x + w / 2,
    cy: y + h / 2,
  };
}

function computeSelectionBounds(elements: AnyEl[]) {
  if (!elements.length) return null;

  const rects = elements.map(rectFromEl);
  const l = Math.min(...rects.map((r) => r.l));
  const t = Math.min(...rects.map((r) => r.t));
  const r = Math.max(...rects.map((rr) => rr.r));
  const b = Math.max(...rects.map((rr) => rr.b));
  return {
    x: l,
    y: t,
    w: r - l,
    h: b - t,
    l,
    t,
    r,
    b,
    cx: l + (r - l) / 2,
    cy: t + (b - t) / 2,
  };
}

function rectsIntersect(a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) {
  return a.l <= b.r && a.r >= b.l && a.t <= b.b && a.b >= b.t;
}

function buildSnapLines(baseW: number, baseH: number, elements: AnyEl[], excludeIds: Set<string>) {
  const stageV = [0, baseW / 2, baseW];
  const stageH = [0, baseH / 2, baseH];

  const v: GuideLine[] = stageV.map((pos) => ({ pos, kind: "stage" as const }));
  const h: GuideLine[] = stageH.map((pos) => ({ pos, kind: "stage" as const }));

  for (const el of elements) {
    if (excludeIds.has(el.id)) continue;
    if (el.visible === false) continue;

    const r = rectFromEl(el);
    v.push({ pos: r.l, kind: "element" }, { pos: r.cx, kind: "element" }, { pos: r.r, kind: "element" });
    h.push({ pos: r.t, kind: "element" }, { pos: r.cy, kind: "element" }, { pos: r.b, kind: "element" });
  }

  const vKeyed = uniq(v.map((x) => `${x.kind}:${x.pos}`)).map((k) => {
    const [kind, posStr] = k.split(":");
    return { kind: kind as GuideKind, pos: Number(posStr) };
  });
  const hKeyed = uniq(h.map((x) => `${x.kind}:${x.pos}`)).map((k) => {
    const [kind, posStr] = k.split(":");
    return { kind: kind as GuideKind, pos: Number(posStr) };
  });

  return {
    v: vKeyed.sort((a, b) => a.pos - b.pos),
    h: hKeyed.sort((a, b) => a.pos - b.pos),
  };
}

function snapRectToLines(
  rect: ReturnType<typeof rectFromEl> | ReturnType<typeof computeSelectionBounds>,
  lines: { v: GuideLine[]; h: GuideLine[] },
  opts: SnapOptions
) {
  if (!opts.enabled || !rect) {
    return { dx: 0, dy: 0, guides: { v: [] as GuideLine[], h: [] as GuideLine[] } };
  }

  const threshold = opts.threshold;

  const vx = [rect.l, rect.cx, rect.r];
  const hy = [rect.t, rect.cy, rect.b];

  let bestDx = 0;
  let bestDy = 0;
  let bestV: GuideLine | null = null;
  let bestH: GuideLine | null = null;

  let bestVDist = Infinity;
  for (const p of vx) {
    for (const line of lines.v) {
      const d = line.pos - p;
      const ad = Math.abs(d);
      if (ad < bestVDist) {
        bestVDist = ad;
        bestDx = d;
        bestV = line;
      }
    }
  }
  if (bestVDist > threshold) {
    bestDx = 0;
    bestV = null;
  }

  let bestHDist = Infinity;
  for (const p of hy) {
    for (const line of lines.h) {
      const d = line.pos - p;
      const ad = Math.abs(d);
      if (ad < bestHDist) {
        bestHDist = ad;
        bestDy = d;
        bestH = line;
      }
    }
  }
  if (bestHDist > threshold) {
    bestDy = 0;
    bestH = null;
  }

  return {
    dx: bestDx,
    dy: bestDy,
    guides: { v: bestV ? [bestV] : [], h: bestH ? [bestH] : [] },
  };
}

// ===== Recent assets (Phase 1: localStorage only) =====
function lsKeyForAssets(scope: AssetScope, kind: AssetKind) {
  return `scraplet_assets_recent:${scope}:${kind}`;
}

function loadRecentAssets(scope: AssetScope, kind: AssetKind): AssetItem[] {
  try {
    const raw = localStorage.getItem(lsKeyForAssets(scope, kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.url === "string")
      .map((x) => ({
        url: String(x.url),
        name: typeof x.name === "string" ? x.name : undefined,
        kind,
        addedAt: typeof x.addedAt === "number" ? x.addedAt : Date.now(),
      }))
      .slice(0, 40);
  } catch {
    return [];
  }
}

function pushRecentAsset(scope: AssetScope, kind: AssetKind, url: string, name?: string) {
  try {
    const existing = loadRecentAssets(scope, kind);
    const next: AssetItem[] = [
      { url, name, kind, addedAt: Date.now() },
      ...existing.filter((x) => x.url !== url),
    ].slice(0, 40);
    localStorage.setItem(lsKeyForAssets(scope, kind), JSON.stringify(next));
  } catch {
    // ignore
  }
}

// ===== Upload helper =====
async function uploadAssetFile(file: File, scope: AssetScope, kind: AssetKind): Promise<{ url: string }> {
  const qs = new URLSearchParams({ scope, kind });
  const res = await fetch(`/dashboard/api/assets/upload?${qs.toString()}`, {
    method: "POST",
    body: (() => {
      const fd = new FormData();
      fd.append("file", file);
      return fd;
    })(),
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  if (!data?.ok || typeof data.url !== "string") throw new Error("Upload failed: invalid response");
  return { url: data.url };
}

export function OverlayEditorApp({ initialOverlay }: Props) {
  const [name, setName] = useState(initialOverlay.name || "Untitled Overlay");
  const [slug, setSlug] = useState(initialOverlay.slug || "");
  const [config, setConfig] = useState<OverlayConfigV0>(
    initialOverlay.config_json || {
      version: 0,
      baseResolution: { width: 1920, height: 1080 },
      elements: [],
    }
  );

  // Component Master State
  const [isComponentMaster, setIsComponentMaster] = useState(initialOverlay.isComponentMaster || false);
  const [propsSchema, setPropsSchema] = useState<any>(initialOverlay.propsSchema || {});
  const [metadata, setMetadata] = useState<any>(initialOverlay.metadata || {});

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const last = config.elements?.[config.elements.length - 1]?.id ?? null;
    return last ? [last] : [];
  });
  const primarySelectedId = selectedIds[selectedIds.length - 1] ?? null;

  // Resize Interaction State (tracks transient values during resize)
  const [resizeStatus, setResizeStatus] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  // Draft positions for smooth dragging/resizing
  const [draftRects, setDraftRects] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // UX controls
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(16);
  const [showGrid, setShowGrid] = useState(true);

  const [guideSnapEnabled, setGuideSnapEnabled] = useState(true);
  const [guides, setGuides] = useState<GuideState>({ show: false, v: [], h: [] });

  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [manualScale, setManualScale] = useState(1);
  const [zoomAnimating, setZoomAnimating] = useState(false);
  const [activeCreationTool, setActiveCreationTool] = useState<null | "pen">(null);
  const [penDraft, setPenDraft] = useState<{
    anchors: { x: number; y: number }[];
    commands: PathCommand[];
    previewPoint?: { x: number; y: number };
    sourceElementId?: string;
  } | null>(null);

  // PAN (space/middle-mouse)
  const [spaceDown, setSpaceDown] = useState(false);
  const [shiftDown, setShiftDown] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [panPx, setPanPx] = useState({ x: 0, y: 0 });

  // Marquee
  const [marquee, setMarquee] = useState<MarqueeState>({ active: false, shift: false, start: null, cur: null });
  const marqueeStartSelectedRef = useRef<string[]>([]);
  const clickCycleRef = useRef<{ x: number; y: number; ids: string[]; index: number } | null>(null);
  const dragDuplicateRef = useRef<{ sourceId: string; duplicateId: string } | null>(null);
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});
  const penPointerSessionRef = useRef<{ start: { x: number; y: number } } | null>(null);
  const rndRefs = useRef<Record<string, any>>({});
  const resizeOriginRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [draftRotationDegs, setDraftRotationDegs] = useState<Record<string, number>>({});
  const [draftRadiusValues, setDraftRadiusValues] = useState<Record<string, number>>({});
  const [draftElementPatches, setDraftElementPatches] = useState<Record<string, Partial<AnyEl>>>({});
  const [selectedPathAnchor, setSelectedPathAnchor] = useState<{ elementId: string; commandIndex: number } | null>(null);
  const [pathAnchorDragSession, setPathAnchorDragSession] = useState<{
    elementId: string;
    commandIndex: number;
    startStage: { x: number; y: number };
    originPath: OverlayPath;
    rotationDeg: number;
  } | null>(null);
  const [pathHandleDragSession, setPathHandleDragSession] = useState<{
    elementId: string;
    curveCommandIndex: number;
    role: "in" | "out";
    startStage: { x: number; y: number };
    originPath: OverlayPath;
    rotationDeg: number;
  } | null>(null);
  const rotationDragRef = useRef<{ id: string; cx: number; cy: number } | null>(null);
  const [primaryDragSession, setPrimaryDragSession] = useState<{
    id: string;
    startStage: { x: number; y: number };
    origin: { x: number; y: number };
  } | null>(null);
  const [resizeDragSession, setResizeDragSession] = useState<{
    id: string;
    handle: ResizeHandleKind;
    startStage: { x: number; y: number };
    origin: { x: number; y: number; width: number; height: number; rotationDeg: number };
    descendants?: Record<string, { x: number; y: number; width: number; height: number }>;
  } | null>(null);
  const [radiusDragSession, setRadiusDragSession] = useState<{
    id: string;
    origin: { x: number; y: number; width: number; height: number; rotationDeg: number };
  } | null>(null);

  // Layers rename UX
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Asset picker modal state
  const [assetPicker, setAssetPicker] = useState<{
    open: boolean;
    kind: AssetKind;
    scope: AssetScope;
    title: string;
    onPick: (url: string) => void;
  }>({ open: false, kind: "images", scope: "overlays", title: "Pick asset", onPick: () => { } });

  // Template Picker State
  // (templates state removed)
  const [leftTab, setLeftTab] = useState<"layers" | "components" | "panels" | "widgets">("layers");
  const [showShortcutModal, setShowShortcutModal] = useState(false);
  const [editorStatus, setEditorStatus] = useState<{ title: string; detail?: string } | null>(null);
  const [timelinePlayheadMs, setTimelinePlayheadMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [selectedTimelineTrackId, setSelectedTimelineTrackId] = useState<string | null>(null);
  const [selectedTimelineKeyframeId, setSelectedTimelineKeyframeId] = useState<string | null>(null);
  const timelinePlaybackStartRef = useRef<number | null>(null);

  const [overlayComponents, setOverlayComponents] = useState<OverlayComponentDef[]>([]);
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [originalConfig, setOriginalConfig] = useState<OverlayConfigV0 | null>(null);
  const [originalIsMaster, setOriginalIsMaster] = useState(false);
  const [originalName, setOriginalName] = useState("");
  const [originalSlug, setOriginalSlug] = useState("");
  const [previewVisibilityOverrides, setPreviewVisibilityOverrides] = useState<Record<string, boolean | undefined>>({});
  const [previewAnimationResetKeys, setPreviewAnimationResetKeys] = useState<Record<string, number>>({});
  const previewStartTimersRef = useRef<Record<string, number[]>>({});
  const statusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      for (const timerIds of Object.values(previewStartTimersRef.current)) {
        timerIds.forEach((timerId) => window.clearTimeout(timerId));
      }
      previewStartTimersRef.current = {};
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  const showEditorStatus = useCallback((title: string, detail?: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    setEditorStatus({ title, detail });
    statusTimerRef.current = window.setTimeout(() => {
      setEditorStatus(null);
      statusTimerRef.current = null;
    }, 3200);
  }, []);

  // Fetch components
  useEffect(() => {
    fetch("/dashboard/api/overlay-components")
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const defs: OverlayComponentDef[] = rows.map((r: any) => ({
          id: r.public_id,
          name: r.name,
          schemaVersion: r.schema_version,
          elements: r.component_json?.elements || [],
          propsSchema: r.component_json?.propsSchema || {},
          metadata: r.component_json?.metadata || {}
        }));
        setOverlayComponents(defs);
      })
      .catch((e: Error) => console.error("Failed to load components:", e));
  }, []);

  // (legacy template state removed)

  // (legacy template functions removed)

  function enterIsolationMode(componentId: string, directDef?: OverlayComponentDef) {
    const def = directDef || overlayComponents.find(c => c.id === componentId);
    if (!def) {
      alert("Component definition not found.");
      return;
    }

    setOriginalConfig(config);
    setOriginalIsMaster(isComponentMaster);
    setOriginalName(name);
    setOriginalSlug(slug);

    setConfig({ ...config, elements: def.elements });
    setIsComponentMaster(true);
    setName(def.name);
    setSlug(`component-${def.id}`);
    setPropsSchema(def.propsSchema);
    setMetadata(def.metadata);
    setEditingMasterId(def.id);
    setSelectedIds([]);
  }

  function exitIsolationMode() {
    if (!originalConfig) {
      setEditingMasterId(null);
      setIsComponentMaster(false);
      return;
    }
    setConfig(originalConfig);
    setIsComponentMaster(originalIsMaster);
    setName(originalName);
    setSlug(originalSlug);
    setEditingMasterId(null);
    setOriginalConfig(null);
    setSelectedIds([]);
  }

  const { baseResolution } = config;
  const timeline = useMemo(() => ensureTimeline(config.timeline), [config.timeline]);
  const timelineValues = useMemo(
    () => evaluateTimeline(timeline, timelinePlayheadMs),
    [timeline, timelinePlayheadMs]
  );

  const previewElements = useMemo(
    () =>
      config.elements.map((el) => {
        const overrideVisible = previewVisibilityOverrides[el.id];
        const visibilityResolved =
          typeof overrideVisible === "boolean"
            ? ({ ...el, visible: overrideVisible } as OverlayElement)
            : el;
        return applyTimelineOverridesToElement(
          visibilityResolved,
          timelineValues[el.id]
        ) as AnyEl;
      }),
    [config.elements, previewVisibilityOverrides, timelineValues]
  );

  // Memoize elementsById using the SAME logic as runtime
  // This allows O(1) lookup for recursive rendering
  const elementsById = useMemo(() => {
    const map: Record<string, AnyEl> = {};
    for (const el of config.elements) {
      map[el.id] = el as AnyEl;
    }
    return map;
  }, [config.elements]);

  const previewElementsById = useMemo(() => {
    const map: Record<string, AnyEl> = {};
    for (const el of previewElements) {
      const draft = draftRects[el.id];
      const draftRotation = draftRotationDegs[el.id];
      const draftRadius = draftRadiusValues[el.id];
      const draftPatch = draftElementPatches[el.id];
      map[el.id] = {
        ...(el as AnyEl),
        ...(draft ? draft : {}),
        ...(draftRotation !== undefined ? { rotationDeg: draftRotation } : {}),
        ...(draftRadius !== undefined ? getRadiusPatch(el as AnyEl, draftRadius) : {}),
        ...(draftPatch ? draftPatch : {}),
      } as AnyEl;
    }
    return map;
  }, [draftElementPatches, previewElements, draftRadiusValues, draftRects, draftRotationDegs]);

  const previewAnimationPhases = useElementAnimationPhases(
    previewElements as OverlayElement[],
    previewAnimationResetKeys
  );

  useEffect(() => {
    const durationMs = timeline.durationMs;
    setTimelinePlayheadMs((prev) => clamp(prev, 0, durationMs));
  }, [timeline.durationMs]);

  useEffect(() => {
    if (!isTimelinePlaying) return;

    const durationMs = Math.max(0, timeline.durationMs);
    if (durationMs <= 0) {
      setIsTimelinePlaying(false);
      return;
    }

    const reverse = timeline.playback?.reverse === true;
    const loop = timeline.playback?.loop === true;
    let frameId = 0;
    const startOffset = reverse ? durationMs - timelinePlayheadMs : timelinePlayheadMs;
    timelinePlaybackStartRef.current = performance.now() - startOffset;

    const tick = (now: number) => {
      const startedAt = timelinePlaybackStartRef.current ?? now;
      const elapsed = Math.max(0, now - startedAt);
      const clampedElapsed = loop && durationMs > 0 ? elapsed % durationMs : Math.min(durationMs, elapsed);
      const next = reverse ? durationMs - clampedElapsed : clampedElapsed;
      setTimelinePlayheadMs(next);

      const reachedEnd = !reverse && elapsed >= durationMs;
      const reachedStart = reverse && elapsed >= durationMs;
      if (!loop && (reachedEnd || reachedStart)) {
        setTimelinePlayheadMs(reverse ? 0 : durationMs);
        setIsTimelinePlaying(false);
        timelinePlaybackStartRef.current = null;
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      timelinePlaybackStartRef.current = null;
    };
  }, [isTimelinePlaying, timeline.durationMs, timeline.playback?.loop, timeline.playback?.reverse, timelinePlayheadMs]);

  // Test Data for variable substitution ({{var}})
  const [testData, setTestData] = useState<Record<string, string>>({
    name: "User",
    count: "42",
  });

  // Lower Third Preview State (Editor Only)
  const [ltPreview, setLtPreview] = useState({
    // active: removed - auto-preview based on selection
    text: "Preview Text",
    title: "Preview Title",
    subtitle: "Preview Subtitle"
  });

  // Merge preview data if active
  const renderData = useMemo(() => {
    // Phase 1: Auto-preview if selected element is lower_third
    const isLtSelected = primarySelectedId && config.elements.find(e => e.id === primarySelectedId)?.type === "lower_third";

    if (!isLtSelected) return testData;

    return {
      ...testData,
      "lower_third.active": "1",
      "lower_third": ltPreview.text,
      "lower_third.title": ltPreview.title,
      "lower_third.subtitle": ltPreview.subtitle,
    };
  }, [testData, ltPreview, primarySelectedId, config.elements]);

  useEffect(() => {
    if (!primarySelectedId) return;

    setPreviewVisibilityOverrides((prev) => {
      if (!(primarySelectedId in prev)) return prev;
      const next = { ...prev };
      delete next[primarySelectedId];
      return next;
    });
  }, [primarySelectedId]);
  const canvasOuterRef = useRef<HTMLDivElement | null>(null);
  const [canvasBox, setCanvasBox] = useState({ w: 1000, h: 700 });

  // Throttle guide updates
  const rafRef = useRef<number | null>(null);
  const lastGuideRef = useRef<{ v: GuideLine[]; h: GuideLine[]; spacing?: GuideState["spacing"] } | null>(null);

  const clearGuides = useCallback(() => {
    lastGuideRef.current = null;
    setGuides({ show: false, v: [], h: [], spacing: [] });
  }, []);

  const updateGuidesThrottled = useCallback((next: { v: GuideLine[]; h: GuideLine[]; spacing?: GuideState["spacing"] }) => {
    lastGuideRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const g = lastGuideRef.current;
      if (!g) return;
      setGuides({ show: true, v: g.v, h: g.h, spacing: g.spacing ?? [] });
    });
  }, []);

  // Watch canvas size
  useEffect(() => {
    const el = canvasOuterRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCanvasBox({
        w: Math.max(240, Math.floor(r.width)),
        h: Math.max(240, Math.floor(r.height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    const s = Math.min(canvasBox.w / baseResolution.width, canvasBox.h / baseResolution.height);
    return clamp(s, 0.05, 2);
  }, [canvasBox.w, canvasBox.h, baseResolution.width, baseResolution.height]);

  const scale = zoomMode === "fit" ? fitScale : clamp(manualScale, 0.1, 2);

  const elementsAny = useMemo(() => config.elements.map((e) => e as AnyEl), [config.elements]);
  const selectedEls = useMemo(() => {
    const set = new Set(selectedIds);
    return elementsAny
      .filter((e) => set.has(e.id))
      .map((el) => {
        const draft = draftRects[el.id];
        if (draft) return { ...el, ...draft };
        return el;
      });
  }, [elementsAny, selectedIds, draftRects]);

  const primarySelectedEl = useMemo(() => {
    if (!primarySelectedId) return null;
    return (elementsAny.find((el) => el.id === primarySelectedId) ?? null) as AnyEl | null;
  }, [elementsAny, primarySelectedId]);


  useEffect(() => {
    if (!selectedPathAnchor) return;
    if (primarySelectedEl?.type !== "path" || primarySelectedEl.id !== selectedPathAnchor.elementId) {
      setSelectedPathAnchor(null);
    }
  }, [primarySelectedEl, selectedPathAnchor]);

  const selectedTimelineState = useMemo(() => {
    if (!primarySelectedId) {
      return {
        playheadMs: timelinePlayheadMs,
        hasAnimatedProperties: false,
        properties: {} as Partial<Record<OverlayTimelineProperty, { hasTrack: boolean; hasKeyframeAtPlayhead: boolean }>>,
      };
    }

    const properties: Partial<Record<OverlayTimelineProperty, { hasTrack: boolean; hasKeyframeAtPlayhead: boolean }>> = {};
    let hasAnimatedProperties = false;

    for (const property of TIMELINE_PROPERTIES) {
      const track = timeline.tracks.find((candidate) => candidate.elementId === primarySelectedId && candidate.property === property);
      if (!track) continue;
      hasAnimatedProperties = true;
      properties[property] = {
        hasTrack: true,
        hasKeyframeAtPlayhead: track.keyframes.some((keyframe) => Math.abs(keyframe.t - timelinePlayheadMs) <= KEYFRAME_TIME_EPSILON_MS),
      };
    }

    return { playheadMs: timelinePlayheadMs, hasAnimatedProperties, properties };
  }, [primarySelectedId, timeline.tracks, timelinePlayheadMs]);

  const selectedTimelineKeyframe = useMemo(() => {
    if (!selectedTimelineTrackId || !selectedTimelineKeyframeId) return null;
    const track = timeline.tracks.find((candidate) => candidate.id === selectedTimelineTrackId);
    if (!track) return null;
    return track.keyframes.find((candidate) => candidate.id === selectedTimelineKeyframeId) ?? null;
  }, [selectedTimelineKeyframeId, selectedTimelineTrackId, timeline.tracks]);

  const canGroup = selectedIds.length > 0;
  const canUngroup = !!primarySelectedEl && (primarySelectedEl.type === 'group' || primarySelectedEl.type === 'frame' || primarySelectedEl.type === 'boolean');
  const selectedPathElements = useMemo(() => selectedEls.filter(isPathCapableElement), [selectedEls]);
  const canBooleanSelection = selectedPathElements.length >= 2;
  const canOffsetSelection = !!primarySelectedEl && isPathCapableElement(primarySelectedEl);
  const canFlattenBoolean = primarySelectedEl?.type === "boolean";
  const canConvertSelectionToPath = !!primarySelectedEl && (primarySelectedEl.type === "shape" || primarySelectedEl.type === "box");
  const selectedParentFrame = useMemo(
    () =>
      selectedIds[0]
        ? ((config.elements.find(
            (candidate) =>
              candidate.type === "frame" &&
              Array.isArray((candidate as any).childIds) &&
              (candidate as any).childIds.includes(selectedIds[0])
          ) as OverlayFrameElement | undefined) ?? null)
        : null,
    [config.elements, selectedIds]
  );

  const selectionBounds = useMemo(() => computeSelectionBounds(selectedEls), [selectedEls]);
  const selectionHasLocked = useMemo(() => selectedEls.some((e) => e.locked === true), [selectedEls]);

  const layersTopToBottom = useMemo(() => {
    const els = elementsAny.slice();
    return els.reverse();
  }, [elementsAny]);

  const panelStyleProfile = useMemo(
    () => deriveStyleProfile(metadata, config.elements),
    [metadata, config.elements]
  );

  const usedFonts = useMemo(() => {
    const set = new Set<string>();
    for (const el of config.elements) {
      if (el.type === "text" && (el as OverlayTextElement).fontFamily) {
        set.add((el as OverlayTextElement).fontFamily!);
      }
    }
    if (panelStyleProfile.fontFamily) {
      set.add(panelStyleProfile.fontFamily);
    }
    return Array.from(set);
  }, [config.elements, panelStyleProfile.fontFamily]);


  const allChildIds = useMemo(() => {
    const s = new Set<string>();
    previewElements.forEach(e => {
      if (isContainerElement(e as AnyEl)) {
        (e as any).childIds?.forEach((cid: string) => s.add(cid));
      }
    });
    return s;
  }, [previewElements]);

  function setTimeline(nextTimelineOrUpdater: OverlayTimeline | ((current: OverlayTimeline) => OverlayTimeline)) {
    setConfig((prev) => {
      const currentTimeline = ensureTimeline(prev.timeline);
      const nextTimeline =
        typeof nextTimelineOrUpdater === "function"
          ? nextTimelineOrUpdater(currentTimeline)
          : nextTimelineOrUpdater;
      return { ...prev, timeline: nextTimeline };
    });
  }

  function upsertKeyframeAtPlayhead(
    currentTimeline: OverlayTimeline,
    elementId: string,
    property: OverlayTimelineProperty,
    value: number
  ) {
    const nextTimeline = ensureTimeline(currentTimeline);
    const nextTracks = [...nextTimeline.tracks];
    const trackIndex = nextTracks.findIndex(
      (track) => track.elementId === elementId && track.property === property
    );

    const nextKeyframe: OverlayTimelineKeyframe = {
      id: genId("kf"),
      t: clamp(Math.round(timelinePlayheadMs), 0, nextTimeline.durationMs),
      value,
      easing: "linear",
    };

    if (trackIndex === -1) {
      const nextTrack: OverlayTimelineTrack = {
        id: genId("track"),
        elementId,
        property,
        keyframes: [nextKeyframe],
      };
      nextTracks.push(nextTrack);
      return {
        timeline: { ...nextTimeline, tracks: nextTracks },
        keyframeId: nextKeyframe.id,
        trackId: nextTrack.id,
      };
    }

    const track = nextTracks[trackIndex];
    const keyframes = [...track.keyframes];
    const existingIndex = keyframes.findIndex(
      (keyframe) => Math.abs(keyframe.t - nextKeyframe.t) <= KEYFRAME_TIME_EPSILON_MS
    );

    if (existingIndex >= 0) {
      const currentKeyframe = keyframes[existingIndex];
      keyframes[existingIndex] = {
        ...currentKeyframe,
        t: nextKeyframe.t,
        value,
      };
      nextTracks[trackIndex] = {
        ...track,
        keyframes: keyframes.sort((a, b) => a.t - b.t),
      };
      return {
        timeline: { ...nextTimeline, tracks: nextTracks },
        keyframeId: currentKeyframe.id,
        trackId: track.id,
      };
    }

    nextTracks[trackIndex] = {
      ...track,
      keyframes: [...keyframes, nextKeyframe].sort((a, b) => a.t - b.t),
    };

    return {
      timeline: { ...nextTimeline, tracks: nextTracks },
      keyframeId: nextKeyframe.id,
      trackId: track.id,
    };
  }

  function addTimelineTrack(elementId: string, property: OverlayTimelineProperty) {
    const element = previewElementsById[elementId];
    if (!element) return;

    setConfig((prev) => {
      const ensured = ensureTimeline(prev.timeline);
      if (ensured.tracks.some((track) => track.elementId === elementId && track.property === property)) {
        return prev;
      }

      const fallbackValue = property === "scaleX" || property === "scaleY" ? 1 : 0;
      const value = Number((element as any)[property] ?? fallbackValue);
      const keyframe: OverlayTimelineKeyframe = {
        id: genId("kf"),
        t: clamp(Math.round(timelinePlayheadMs), 0, ensured.durationMs),
        value,
        easing: "linear",
      };

      const nextTimeline: OverlayTimeline = {
        ...ensured,
        tracks: [
          ...ensured.tracks,
          {
            id: genId("track"),
            elementId,
            property,
            keyframes: [keyframe],
          },
        ],
      };

      setSelectedTimelineTrackId(nextTimeline.tracks[nextTimeline.tracks.length - 1].id);
      setSelectedTimelineKeyframeId(keyframe.id);
      return { ...prev, timeline: nextTimeline };
    });
  }

  function moveTimelineKeyframe(trackId: string, keyframeId: string, nextTimeMs: number) {
    setTimeline((currentTimeline) => ({
      ...currentTimeline,
      tracks: currentTimeline.tracks.map((track) => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          keyframes: track.keyframes
            .map((keyframe) =>
              keyframe.id === keyframeId
                ? { ...keyframe, t: clamp(Math.round(nextTimeMs), 0, currentTimeline.durationMs) }
                : keyframe
            )
            .sort((a, b) => a.t - b.t),
        };
      }),
    }));
  }

  function addTimelineKeyframeAtTime(trackId: string, timeMs: number) {
    setTimeline((currentTimeline) => {
      const ensured = ensureTimeline(currentTimeline);
      return {
        ...ensured,
        tracks: ensured.tracks.map((track) => {
          if (track.id !== trackId) return track;
          const sorted = [...track.keyframes].sort((a, b) => a.t - b.t);
          const clampedTime = clamp(Math.round(timeMs), 0, ensured.durationMs);
          let value = sorted[0]?.value ?? 0;
          for (const keyframe of sorted) {
            if (keyframe.t <= clampedTime) value = keyframe.value;
          }
          return {
            ...track,
            keyframes: [...track.keyframes, {
              id: genId("kf"),
              t: clampedTime,
              value,
              easing: "linear",
            }].sort((a, b) => a.t - b.t),
          };
        }),
      };
    });
  }

  function duplicateTimelineKeyframe(trackId: string, keyframeId: string, nextTimeMs: number) {
    let createdId: string | null = null;
    setTimeline((currentTimeline) => ({
      ...currentTimeline,
      tracks: currentTimeline.tracks.map((track) => {
        if (track.id !== trackId) return track;
        const source = track.keyframes.find((keyframe) => keyframe.id === keyframeId);
        if (!source) return track;
        createdId = genId("kf");
        return {
          ...track,
          keyframes: [
            ...track.keyframes,
            {
              ...source,
              id: createdId,
              t: clamp(Math.round(nextTimeMs), 0, currentTimeline.durationMs),
            },
          ].sort((a, b) => a.t - b.t),
        };
      }),
    }));
    if (createdId) {
      setSelectedTimelineTrackId(trackId);
      setSelectedTimelineKeyframeId(createdId);
    }
    return createdId;
  }

  function updateSelectedTimelineKeyframeEasing(easing: OverlayTimelineEasing) {
    if (!selectedTimelineTrackId || !selectedTimelineKeyframeId) return;

    setTimeline((currentTimeline) => ({
      ...currentTimeline,
      tracks: currentTimeline.tracks.map((track) => {
        if (track.id !== selectedTimelineTrackId) return track;
        return {
          ...track,
          keyframes: track.keyframes.map((keyframe) =>
            keyframe.id === selectedTimelineKeyframeId ? { ...keyframe, easing } : keyframe
          ),
        };
      }),
    }));
  }

  function deleteSelectedTimelineKeyframe() {
    if (!selectedTimelineTrackId || !selectedTimelineKeyframeId) return;

    setTimeline((currentTimeline) => ({
      ...currentTimeline,
      tracks: currentTimeline.tracks
        .map((track) => {
          if (track.id !== selectedTimelineTrackId) return track;
          return {
            ...track,
            keyframes: track.keyframes.filter((keyframe) => keyframe.id !== selectedTimelineKeyframeId),
          };
        })
        .filter((track) => track.keyframes.length > 0),
    }));

    setSelectedTimelineTrackId(null);
    setSelectedTimelineKeyframeId(null);
  }

  function updateElement(id: string, patch: Partial<AnyEl>) {
    const touchedTimelineProperties = TIMELINE_PROPERTIES.filter((property) => patch[property] !== undefined);
    setConfig((prev) => {
      const nextEls = [...prev.elements];
      const idx = nextEls.findIndex(e => e.id === id);
      if (idx === -1) return prev;

      const oldEl = nextEls[idx];
      nextEls[idx] = { ...oldEl, ...patch } as any;
      let nextTimeline = prev.timeline;
      const timelineElement = nextEls[idx] as OverlayElement;
      let timelineKeyframeId: string | null = null;
      let timelineTrackId: string | null = null;

      if (isTimelineEligibleElement(timelineElement)) {
        for (const property of TIMELINE_PROPERTIES) {
          if (patch[property] === undefined) continue;
          const numericValue = Number(patch[property]);
          if (!Number.isFinite(numericValue)) continue;
          const result = upsertKeyframeAtPlayhead(
            ensureTimeline(nextTimeline),
            id,
            property,
            numericValue
          );
          nextTimeline = result.timeline;
          timelineKeyframeId = result.keyframeId;
          timelineTrackId = result.trackId;
        }
      }

      // Propagate group movement to children (recursive)
      if ((oldEl.type === 'group' || oldEl.type === 'frame' || oldEl.type === 'boolean') && (patch.x !== undefined || patch.y !== undefined)) {
        const dx = (patch.x ?? oldEl.x) - oldEl.x;
        const dy = (patch.y ?? oldEl.y) - oldEl.y;

        if (dx !== 0 || dy !== 0) {
          const toMove = new Set<string>();
          // Helper to find descendants
          const collect = (pid: string) => {
            const p = nextEls.find(e => e.id === pid);
            if (p && (p.type === 'group' || p.type === 'frame' || p.type === 'boolean')) {
              (p as any).childIds?.forEach((cid: string) => {
                if (!toMove.has(cid)) {
                  toMove.add(cid);
                  collect(cid);
                }
              });
            }
          };
          collect(id);

          toMove.forEach(mid => {
            const cIdx = nextEls.findIndex(e => e.id === mid);
            if (cIdx !== -1) {
              const c = nextEls[cIdx];
              nextEls[cIdx] = { ...c, x: c.x + dx, y: c.y + dy } as any;
            }
          });
        }
      }
      if (nextEls[idx]?.type === "frame") {
        nextEls.splice(0, nextEls.length, ...reflowFrameInElementList(id, nextEls as AnyEl[]));
      }
      if (timelineKeyframeId) {
        setSelectedTimelineTrackId(timelineTrackId);
        setSelectedTimelineKeyframeId(timelineKeyframeId);
      }
      return { ...prev, elements: nextEls, timeline: nextTimeline };
    });
    if (touchedTimelineProperties.length > 0) {
      showEditorStatus(
        `Timeline edit at ${formatTimelineTime(timelinePlayheadMs)}`,
        `Updated ${touchedTimelineProperties.join(", ")} keyframe${touchedTimelineProperties.length > 1 ? "s" : ""}.`
      );
    }
  }

  function deleteElement(id: string) {
    setConfig((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== id) }));
    setSelectedIds((prevSel) => prevSel.filter((x) => x !== id));
  }

  function triggerPreviewVisibility(id: string, action: "enter" | "exit" | "reset") {
    const activeTimers = previewStartTimersRef.current[id];
    if (activeTimers) {
      activeTimers.forEach((timerId) => window.clearTimeout(timerId));
      delete previewStartTimersRef.current[id];
    }

    if (action === "reset") {
      setPreviewVisibilityOverrides((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    if (action === "exit") {
      setPreviewVisibilityOverrides((prev) => ({ ...prev, [id]: false }));
      return;
    }

    setPreviewVisibilityOverrides((prev) => ({ ...prev, [id]: false }));
    setPreviewAnimationResetKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

    const frameTimer = window.setTimeout(() => {
      const startTimer = window.setTimeout(() => {
        setPreviewVisibilityOverrides((prev) => ({ ...prev, [id]: true }));
        delete previewStartTimersRef.current[id];
      }, 16);

      previewStartTimersRef.current[id] = [frameTimer, startTimer];
    }, 16);

    previewStartTimersRef.current[id] = [frameTimer];
  }

  function addText() {
    const id = genId("text");
    const el: AnyEl = {
      id,
      type: "text" as any,
      name: "Text",
      x: 120,
      y: 120,
      width: 700,
      height: 120,
      visible: true,
      locked: false,
      text: "New text",
      fontSize: 56,
      fontWeight: "bold",
      textAlign: "left",
      color: "#e2e8f0",
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function addBox() {
    const id = genId("box");
    const el: AnyEl = {
      id,
      type: "box" as any,
      name: "Box",
      x: 200,
      y: 260,
      width: 600,
      height: 360,
      visible: true,
      locked: false,
      backgroundColor: "rgba(15,23,42,0.85)",
      borderRadius: 16,
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function addShape(kind: OverlayShapeKind) {
    const id = genId("shape");
    const { width: bw, height: bh } = baseResolution;

    // Defaults matching requirements
    const w = kind === "line" ? 200 : kind === "arrow" ? 260 : 200;
    const h = kind === "line" ? 40 : kind === "arrow" ? 140 : 200;

    // Center in base resolution
    const x = Math.round(bw / 2 - w / 2);
    const y = Math.round(bh / 2 - h / 2);

    const el: AnyEl = {
      id,
      type: "shape" as any,
      name:
        kind === "rect"
          ? "Rectangle"
          : kind === "circle"
            ? "Circle"
            : kind === "line"
              ? "Line"
              : kind === "polygon"
                ? "Polygon"
                : kind === "star"
                  ? "Star"
                  : kind === "arrow"
                    ? "Arrow"
                    : "Triangle",
      x,
      y,
      width: w,
      height: h,
      visible: true,
      locked: false,
      shape: kind,
      fillColor: "#ffffff",
      fillOpacity: 1,
      strokeColor: "#000000",
      strokeWidthPx: 2,
      strokeOpacity: 1,
      strokeDash: [],
      cornerRadiusPx: 0,
      polygon: kind === "polygon" ? { sides: 6, rotationDeg: -90 } : undefined,
      star: kind === "star" ? { points: 5, innerRatio: 0.5, rotationDeg: -90 } : undefined,
      arrow: kind === "arrow" ? { direction: "right", shaftRatio: 0.42, headRatio: 0.34 } : undefined,
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function addPathElement(
    path: OverlayPath,
    bounds: { x: number; y: number; width: number; height: number },
    name = "Path",
    overrides?: Partial<AnyEl>
  ) {
    const id = genId("path");
    const el: AnyEl = {
      id,
      type: "path",
      name,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      visible: true,
      locked: false,
      fillColor: "#ffffff",
      fillOpacity: 1,
      strokeColor: "#000000",
      strokeWidthPx: 2,
      strokeOpacity: 1,
      strokeDash: [],
      path,
      ...overrides,
    } as any;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
    return id;
  }

  function createBooleanFromSelection(operation: OverlayBooleanOperation) {
    const selected = selectedEls.filter(isPathCapableElement);
    if (selected.length < 2) return;
    const id = genId("bool");
    const bounds = booleanContainerBounds({ id, type: "boolean" } as OverlayBooleanElement, selected as OverlayElement[]);
    const el: AnyEl = {
      id,
      type: "boolean",
      name: `${operation[0].toUpperCase()}${operation.slice(1)}`,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      visible: true,
      locked: false,
      operation,
      childIds: selected.map((item) => item.id),
      fillColor: "#ffffff",
      fillOpacity: 1,
      strokeColor: "#000000",
      strokeWidthPx: 2,
      strokeOpacity: 1,
    } as any;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function createResolvedPathElement(
    source: AnyEl,
    options?: {
      name?: string;
      removeIds?: string[];
      insertAtId?: string;
    }
  ) {
    const resolved = resolveElementGeometry(source as any, elementsById as Record<string, OverlayElement>);
    if (!resolved) return null;

    const pathId = genId("path");
    const pathEl: AnyEl = {
      id: pathId,
      type: "path",
      name: options?.name ?? `${source.name || defaultElementLabel(source)} Path`,
      x: Math.round(resolved.bounds.x),
      y: Math.round(resolved.bounds.y),
      width: Math.max(1, Math.round(resolved.bounds.width)),
      height: Math.max(1, Math.round(resolved.bounds.height)),
      visible: source.visible !== false,
      locked: source.locked === true,
      opacity: (source as any).opacity ?? 1,
      rotationDeg: (source as any).rotationDeg ?? 0,
      fillColor: (source as any).fillColor ?? "#ffffff",
      fillOpacity: (source as any).fillOpacity ?? 1,
      strokeColor: (source as any).strokeColor ?? "#000000",
      strokeWidthPx: (source as any).strokeWidthPx ?? 2,
      strokeOpacity: (source as any).strokeOpacity ?? 1,
      strokeDash: Array.isArray((source as any).strokeDash) ? [...(source as any).strokeDash] : [],
      path: resolved.path,
    } as any;

    const removeIds = new Set(options?.removeIds ?? []);
    setConfig((prev) => {
      const insertAtIdx = options?.insertAtId ? prev.elements.findIndex((candidate) => candidate.id === options.insertAtId) : -1;
      const kept = prev.elements.filter((candidate) => !removeIds.has(candidate.id));
      if (insertAtIdx < 0) {
        return { ...prev, elements: [...kept, pathEl as any] };
      }
      const before = kept.slice(0, Math.min(insertAtIdx, kept.length));
      const after = kept.slice(Math.min(insertAtIdx, kept.length));
      return { ...prev, elements: [...before, pathEl as any, ...after] };
    });
    setSelectedIds([pathId]);
    return pathId;
  }

  function createOffsetPath(distance: number) {
    const source = primarySelectedEl;
    if (!isPathCapableElement(source)) return;
    const resolved = resolveElementGeometry(source as any, elementsById as Record<string, OverlayElement>);
    if (!resolved) return;
    const result = offsetOverlayPath(resolved.path, distance);
    const pathId = addPathElement(result.path, {
      x: (source.x ?? 0) + result.bounds.x,
      y: (source.y ?? 0) + result.bounds.y,
      width: result.bounds.width,
      height: result.bounds.height,
    }, distance < 0 ? "Inset Path" : "Outset Path");
    if (!pathId) return;
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((candidate) =>
        candidate.id === pathId
          ? ({
              ...candidate,
              pathSource: {
                kind: "offset",
                sourceId: source.id,
                distance,
              },
            } as any)
          : candidate
      ),
    }));
  }

  function flattenBooleanSelected() {
    if (!primarySelectedEl || primarySelectedEl.type !== "boolean") return;
    const booleanEl = primarySelectedEl as OverlayBooleanElement;
    createResolvedPathElement(booleanEl as any, {
      name: `${booleanEl.name || defaultElementLabel(booleanEl)} Path`,
      removeIds: [booleanEl.id, ...(booleanEl.childIds ?? [])],
      insertAtId: booleanEl.id,
    });
  }

  function convertSelectedToPath() {
    if (!primarySelectedEl || (primarySelectedEl.type !== "shape" && primarySelectedEl.type !== "box")) return;
    createResolvedPathElement(primarySelectedEl as any, {
      name: primarySelectedEl.name || defaultElementLabel(primarySelectedEl),
      removeIds: [primarySelectedEl.id],
      insertAtId: primarySelectedEl.id,
    });
  }

  function addSelectedPathNode() {
    if (!primarySelectedEl || primarySelectedEl.type !== "path" || !selectedPathAnchor) return;
    updateElement(primarySelectedEl.id, {
      path: addPathAnchorAfterSelection((primarySelectedEl as any).path, selectedPathAnchor.commandIndex),
    } as any);
  }

  function removeSelectedPathNode() {
    if (!primarySelectedEl || primarySelectedEl.type !== "path" || !selectedPathAnchor) return;
    updateElement(primarySelectedEl.id, {
      path: removePathAnchor((primarySelectedEl as any).path, selectedPathAnchor.commandIndex),
    } as any);
    setSelectedPathAnchor(null);
  }

  function splitSelectedPath() {
    if (!primarySelectedEl || primarySelectedEl.type !== "path" || !selectedPathAnchor) return;
    const displayPath = elementToOverlayPath(primarySelectedEl as any);
    if (!displayPath) return;
    const splitPaths = splitOverlayPathAtAnchor(displayPath, selectedPathAnchor.commandIndex);
    if (splitPaths.length === 1) {
      const normalized = normalizePathToBounds(splitPaths[0]);
      updateElement(primarySelectedEl.id, {
        x: Math.round((primarySelectedEl.x ?? 0) + normalized.bounds.x),
        y: Math.round((primarySelectedEl.y ?? 0) + normalized.bounds.y),
        width: Math.max(1, Math.round(normalized.bounds.width)),
        height: Math.max(1, Math.round(normalized.bounds.height)),
        path: normalized.path,
      } as any);
      setSelectedPathAnchor({ elementId: primarySelectedEl.id, commandIndex: 0 });
      return;
    }

    const [firstPath, secondPath] = splitPaths.map((candidate) => normalizePathToBounds(candidate));
    const secondId = genId("path");
    const secondEl: AnyEl = {
      ...(primarySelectedEl as any),
      id: secondId,
      name: `${primarySelectedEl.name || defaultElementLabel(primarySelectedEl)} Split`,
      x: Math.round((primarySelectedEl.x ?? 0) + secondPath.bounds.x),
      y: Math.round((primarySelectedEl.y ?? 0) + secondPath.bounds.y),
      width: Math.max(1, Math.round(secondPath.bounds.width)),
      height: Math.max(1, Math.round(secondPath.bounds.height)),
      path: secondPath.path,
    };

    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.flatMap((candidate) =>
        candidate.id === primarySelectedEl.id
          ? [
              {
                ...(candidate as any),
                x: Math.round((primarySelectedEl.x ?? 0) + firstPath.bounds.x),
                y: Math.round((primarySelectedEl.y ?? 0) + firstPath.bounds.y),
                width: Math.max(1, Math.round(firstPath.bounds.width)),
                height: Math.max(1, Math.round(firstPath.bounds.height)),
                path: firstPath.path,
              },
              secondEl as any,
            ]
          : [candidate]
      ),
    }));
    setSelectedIds([primarySelectedEl.id, secondId]);
    setSelectedPathAnchor(null);
  }

  function continueSelectedPath() {
    if (!primarySelectedEl || primarySelectedEl.type !== "path" || !selectedPathAnchor) return;
    const displayPath = elementToOverlayPath(primarySelectedEl as any);
    if (!displayPath || isClosedPath(displayPath)) return;
    const anchors = getPathAnchors(displayPath);
    const selectedIndex = anchors.findIndex((anchor) => anchor.commandIndex === selectedPathAnchor.commandIndex);
    if (selectedIndex === -1) return;
    if (selectedIndex !== 0 && selectedIndex !== anchors.length - 1) return;

    const continuedPath = selectedIndex === 0 ? reverseOpenPath(displayPath) : displayPath;
    setActiveCreationTool("pen");
    const continuedAnchors = getPathAnchors(continuedPath).map((anchor) => ({ x: anchor.x, y: anchor.y }));
    setPenDraft({
      sourceElementId: primarySelectedEl.id,
      anchors: continuedAnchors,
      commands: continuedPath.commands.map((command) => ({ ...command })) as PathCommand[],
      previewPoint: continuedAnchors[continuedAnchors.length - 1],
    });
    showEditorStatus("Continuing path", "Click to extend from the selected endpoint.");
  }

  function joinSelectedPaths() {
    if (selectedIds.length !== 2) return;
    const selectedPaths = selectedIds
      .map((id) => elementsById[id])
      .filter((candidate): candidate is OverlayPathElement => Boolean(candidate) && candidate.type === "path");
    if (selectedPaths.length !== 2) return;

    const [first, second] = selectedPaths;
    const worldFirst = translateOverlayPath(elementToOverlayPath(first as any) ?? first.path, first.x ?? 0, first.y ?? 0);
    const worldSecond = translateOverlayPath(elementToOverlayPath(second as any) ?? second.path, second.x ?? 0, second.y ?? 0);
    const joined = joinOpenOverlayPaths(worldFirst, worldSecond);
    if (!joined) return;

    const normalized = normalizePathToBounds(joined);
    const joinedId = genId("path");
    const joinedEl: AnyEl = {
      ...(first as any),
      id: joinedId,
      name: `${first.name || defaultElementLabel(first)} Join`,
      x: Math.round(normalized.bounds.x),
      y: Math.round(normalized.bounds.y),
      width: Math.max(1, Math.round(normalized.bounds.width)),
      height: Math.max(1, Math.round(normalized.bounds.height)),
      path: normalized.path,
      pathSource: undefined,
    };

    setConfig((prev) => ({
      ...prev,
      elements: [...prev.elements.filter((candidate) => candidate.id !== first.id && candidate.id !== second.id), joinedEl as any],
    }));
    setSelectedIds([joinedId]);
    setSelectedPathAnchor(null);
  }

  function expandSelectedStroke() {
    const source = primarySelectedEl;
    if (!source || !isPathCapableElement(source)) return;
    const resolved = resolveElementGeometry(source as any, elementsById as Record<string, OverlayElement>);
    if (!resolved) return;
    const strokeWidth = Math.max(
      1,
      Number((source as any).strokeWidthPx ?? (source as any).strokeWidth ?? 0) || 1
    );
    const expanded = expandStrokePath(resolved.path, strokeWidth);
    addPathElement(
      expanded.path,
      {
        x: Math.round((source.x ?? 0) + expanded.bounds.x),
        y: Math.round((source.y ?? 0) + expanded.bounds.y),
        width: Math.max(1, Math.round(expanded.bounds.width)),
        height: Math.max(1, Math.round(expanded.bounds.height)),
      },
      `${source.name || defaultElementLabel(source)} Stroke`,
      {
        fillColor: (source as any).strokeColor ?? "#ffffff",
        fillOpacity: (source as any).strokeOpacity ?? 1,
        strokeColor: "transparent",
        strokeWidthPx: 0,
      }
    );
  }

  function commitPenDraft(closePath = false) {
    if (!penDraft || penDraft.anchors.length < 2) return;
    const commands = closePath ? [...penDraft.commands, { type: "close" } as PathCommand] : penDraft.commands;
    const normalized = normalizePathToBounds({ commands });
    if (penDraft.sourceElementId) {
      const source = elementsById[penDraft.sourceElementId] as AnyEl | undefined;
      if (source) {
        updateElement(penDraft.sourceElementId, {
          x: Math.round((source.x ?? 0) + normalized.bounds.x),
          y: Math.round((source.y ?? 0) + normalized.bounds.y),
          width: Math.max(1, Math.round(normalized.bounds.width)),
          height: Math.max(1, Math.round(normalized.bounds.height)),
          path: normalized.path,
        } as any);
      }
    } else {
      addPathElement(normalized.path, normalized.bounds, "Pen Path");
    }
    setPenDraft(null);
    setActiveCreationTool(null);
  }

  function applyDerivedOffsetPathDrafts(
    nextDrafts: Record<string, { x: number; y: number; width: number; height: number }>,
    nextPatches: Record<string, Partial<AnyEl>>
  ) {
    for (const [draftId] of Object.entries(nextDrafts)) {
      const candidate = previewElementsById[draftId];
      if (!candidate || candidate.type !== "path") continue;
      const pathSource = (candidate as any).pathSource;
      if (!pathSource || pathSource.kind !== "offset") continue;

      const sourceBase = previewElementsById[pathSource.sourceId] ?? elementsById[pathSource.sourceId];
      if (!sourceBase) continue;
      const sourceDraft = nextDrafts[pathSource.sourceId];
      const sourcePatch = nextPatches[pathSource.sourceId];
      const sourceElement = getElementWithDraft(sourceBase, sourceDraft, sourcePatch);
      if (!isPathCapableElement(sourceElement)) continue;

      const resolved = resolveElementGeometry(sourceElement as any, nextDrafts[pathSource.sourceId] ? ({
        ...elementsById,
        [pathSource.sourceId]: sourceElement,
      } as Record<string, OverlayElement>) : (elementsById as Record<string, OverlayElement>));
      if (!resolved) continue;

      const offset = offsetOverlayPath(resolved.path, Number(pathSource.distance) || 0);
      nextDrafts[draftId] = {
        x: Math.round((sourceElement.x ?? 0) + offset.bounds.x),
        y: Math.round((sourceElement.y ?? 0) + offset.bounds.y),
        width: Math.max(1, Math.round(offset.bounds.width)),
        height: Math.max(1, Math.round(offset.bounds.height)),
      };
      nextPatches[draftId] = {
        ...(nextPatches[draftId] ?? {}),
        path: offset.path,
      };
    }
  }

  function addImage() {
    const id = genId("image");
    const el: AnyEl = {
      id,
      type: "image" as any,
      name: "Image",
      x: 220,
      y: 180,
      width: 520,
      height: 320,
      visible: true,
      locked: false,
      src: "",
      fit: "cover",
      opacity: 1,
      borderRadius: 16,
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function addVideo() {
    const id = genId("video");
    const el: AnyEl = {
      id,
      type: "video" as any,
      name: "Video",
      x: 220,
      y: 180,
      width: 640,
      height: 360,
      visible: true,
      locked: false,
      src: "",
      fit: "cover",
      autoplay: true,
      muted: true,
      loop: true,
      controls: false,
      poster: "",
      opacity: 1,
      borderRadius: 16,
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
  }

  function addProgressBar() {
    const id = genId("prog");
    const el: AnyEl = {
      id,
      type: "progressBar",
      name: "Progress Bar",
      x: 300, y: 300, width: 240, height: 24,
      visible: true, locked: false, opacity: 1,
      progress: {
        value: 0.5,
        color1: "#3b82f6",
        color2: "#1e293b",
        direction: "ltr",
        radius: 4
      }
    } as any;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedIds([id]);
  }

  function addProgressRing() {
    const id = genId("ring");
    const el: AnyEl = {
      id,
      type: "progressRing",
      name: "Progress Ring",
      x: 300, y: 300, width: 100, height: 100,
      visible: true, locked: false, opacity: 1,
      progress: {
        value: 0.75,
        color1: "#10b981",
        color2: "#1e293b",
        strokeWidth: 10,
        startAngle: -90
      }
    } as any;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedIds([id]);
  }

  function addLowerThird() {
    const id = genId("lt");
    const el: OverlayLowerThirdElement = {
      type: "lower_third",
      id,
      x: 0,
      y: baseResolution.height - 300, // Bottom area
      width: baseResolution.width,
      height: 250,
      // V1 uses global keys
      bind: {
        activeKey: "lower_third.active",
        textKey: "lower_third",
        titleKey: "lower_third.title",
        subtitleKey: "lower_third.subtitle"
      },
      layout: { mode: "stacked", splitRatio: 0.6 },
      style: {
        variant: "accent-bar",
        bgColor: "#111111",
        bgOpacity: 0.9,
        accentColor: "#4f46e5",
        titleColor: "#ffffff",
        subtitleColor: "#dddddd",
        paddingPx: 30,
        cornerRadiusPx: 0
      },
      animation: {
        in: "slideUp",
        out: "slideDown",
        durationMs: 450
      },
      defaultDurationMs: 8000
    };
    setConfig(prev => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedIds([id]);
  }

  function addFrame() {
    if (selectedIds.length > 0) {
      const id = genId("frame");

      setConfig((prev) => {
        const els = prev.elements;
        const selectedElsInOrder = els.filter((e) => selectedIds.includes(e.id));
        if (!selectedElsInOrder.length) return prev;

        let highestIdx = -1;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        selectedElsInOrder.forEach((el) => {
          const idx = els.findIndex((candidate) => candidate.id === el.id);
          if (idx > highestIdx) highestIdx = idx;
          minX = Math.min(minX, el.x);
          minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + el.width);
          maxY = Math.max(maxY, el.y + el.height);
        });

        if (!isFinite(minX)) return prev;

        const framePadding = 16;
        const frameEl: AnyEl = {
          id,
          type: "frame",
          name: "Frame",
          x: Math.round(minX - framePadding),
          y: Math.round(minY - framePadding),
          width: Math.round(maxX - minX + framePadding * 2),
          height: Math.round(maxY - minY + framePadding * 2),
          visible: true,
          locked: false,
          opacity: 1,
          childIds: selectedElsInOrder.map((e) => e.id),
          layout: {
            mode: "free",
            gap: 12,
            padding: framePadding,
            align: "start",
            justify: "start",
            wrap: false,
          },
          clipContent: true,
          constraints: { horizontal: "start", vertical: "start" },
        } as any;

        const withoutSelected = els.filter((e) => !selectedIds.includes(e.id));
        let shift = 0;
        for (let i = 0; i < highestIdx; i++) {
          if (selectedIds.includes(els[i].id)) shift++;
        }
        const targetIdx = highestIdx - shift + 1;
        const before = withoutSelected.slice(0, targetIdx);
        const after = withoutSelected.slice(targetIdx);
        return { ...prev, elements: [...before, ...selectedElsInOrder, frameEl, ...after] };
      });

      setSelectedIds([id]);
      return;
    }

    const id = genId("frame");
    const el: AnyEl = {
      id,
      type: "frame",
      name: "Frame",
      x: 260,
      y: 180,
      width: 420,
      height: 240,
      visible: true,
      locked: false,
      opacity: 1,
      childIds: [],
      backgroundColor: "rgba(15,23,42,0.18)",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderRadiusPx: 16,
      clipContent: true,
      layout: {
        mode: "free",
        gap: 12,
        padding: 16,
        align: "start",
        justify: "start",
        wrap: false,
      },
    } as any;
    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedIds([id]);
  }

  function groupSelected() {
    if (selectedIds.length < 2) return;
    const id = genId("group");

    setConfig((prev) => {
      const els = prev.elements;

      const selectedElsInOrder = els.filter(e => selectedIds.includes(e.id));
      if (selectedElsInOrder.length === 0) return prev;

      let highestIdx = -1;
      selectedElsInOrder.forEach(el => {
        const idx = els.findIndex(e => e.id === el.id);
        if (idx > highestIdx) highestIdx = idx;
      });

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectedElsInOrder.forEach(el => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      });

      if (!isFinite(minX)) return prev;

      const grp: AnyEl = {
        id, type: "group", name: "Group",
        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        visible: true, locked: false, opacity: 1,
        childIds: selectedElsInOrder.map(e => e.id),
      } as any;

      const withoutSelected = els.filter(e => !selectedIds.includes(e.id));

      let shift = 0;
      for (let i = 0; i < highestIdx; i++) {
        if (selectedIds.includes(els[i].id)) shift++;
      }
      const targetIdx = highestIdx - shift + 1;

      const before = withoutSelected.slice(0, targetIdx);
      const after = withoutSelected.slice(targetIdx);

      const newElements = [
        ...before,
        ...selectedElsInOrder,
        grp,
        ...after
      ];

      return { ...prev, elements: newElements };
    });
    setSelectedIds([id]);
  }

  function handleMaskElement(shapeId: string) {
    const maskId = `mask-${Math.random().toString(36).substr(2, 9)}`;
    let createdContentLabel = "content";

    setConfig(prev => {
      const els = [...prev.elements];
      const shapeIdx = els.findIndex(e => e.id === shapeId);
      if (shapeIdx < 0) return prev;

      const shapeEl = els[shapeIdx];

      // Use ALL selected ids except the shape itself as content candidates.
      const contentIds = selectedIds.filter(id => id !== shapeId);

      let contentNode: AnyEl | undefined;

      if (contentIds.length === 1) {
        contentNode = els.find(e => e.id === contentIds[0]) as AnyEl | undefined;
        createdContentLabel = contentNode?.name || defaultElementLabel(contentNode as AnyEl);
      } else if (contentIds.length > 1) {
        const contentEls = els.filter(e => contentIds.includes(e.id)) as AnyEl[];
        if (!contentEls.length) return prev;

        const minX = Math.min(...contentEls.map(e => e.x ?? 0));
        const minY = Math.min(...contentEls.map(e => e.y ?? 0));
        const maxX = Math.max(...contentEls.map(e => (e.x ?? 0) + (e.width ?? 0)));
        const maxY = Math.max(...contentEls.map(e => (e.y ?? 0) + (e.height ?? 0)));

        const groupId = genId("group");
        const groupEl: AnyEl = {
          id: groupId,
          type: "group",
          name: "Masked Content",
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          visible: true,
          locked: false,
          opacity: 1,
          childIds: contentEls.map(e => e.id),
        } as any;

        els.push(groupEl);
        contentNode = groupEl;
        createdContentLabel = "Masked Content";
      } else {
        // No explicit content selected: fall back to the layer below in z-order.
        if (shapeIdx <= 0) return prev;
        contentNode = els[shapeIdx - 1] as AnyEl | undefined;
        createdContentLabel = contentNode?.name || defaultElementLabel(contentNode as AnyEl);
      }

      if (!contentNode) return prev;

      const x = Math.min(shapeEl.x ?? 0, contentNode.x ?? 0);
      const y = Math.min(shapeEl.y ?? 0, contentNode.y ?? 0);
      const w = Math.max(
        (shapeEl.x ?? 0) + (shapeEl.width ?? 0),
        (contentNode.x ?? 0) + (contentNode.width ?? 0)
      ) - x;
      const h = Math.max(
        (shapeEl.y ?? 0) + (shapeEl.height ?? 0),
        (contentNode.y ?? 0) + (contentNode.height ?? 0)
      ) - y;

      const maskGroup: AnyEl = {
        id: maskId,
        type: "mask",
        name: `Mask (${shapeEl.name || "Shape"})`,
        x,
        y,
        width: w,
        height: h,
        visible: true,
        locked: false,
        opacity: 1,
        invert: false,
        childIds: [shapeId, contentNode.id],
      } as any;

      return {
        ...prev,
        elements: [...els, maskGroup as any],
      };
    });

    setSelectedIds([maskId]);
    const shapeLabel = elementsById[shapeId]?.name || defaultElementLabel((elementsById[shapeId] as AnyEl) ?? ({ type: "shape" } as AnyEl));
    showEditorStatus("Mask created", `${shapeLabel} is now the mask shape. ${createdContentLabel} is now the masked content.`);
  }

  function handleReleaseMask(maskId: string) {
    setConfig(prev => {
      const els = [...prev.elements];
      const maskIdx = els.findIndex(e => e.id === maskId);
      if (maskIdx === -1) return prev;
      const mask = els[maskIdx] as any;
      if (mask.type !== "mask") return prev;

      const withoutMask = els.filter(e => e.id !== maskId);
      return { ...prev, elements: withoutMask };
    });
  }

  async function createComponentSelected() {
    let grp = (primarySelectedEl as any);
    let childrenIds: string[] = [];
    let bounds = { x: 0, y: 0, width: 0, height: 0 };
    let childElements: AnyEl[] = [];

    // 1. Determine the logical grouping/container
    if (!grp || (grp.type !== 'group' && grp.type !== 'frame')) {
      if (selectedIds.length === 0) {
        alert("Please select elements to convert into a component.");
        return;
      }

      // Local calculation for grouping (don't rely on groupSelected state update)
      const selectedElementsInOrder = config.elements.filter(e => selectedIds.includes(e.id));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectedElementsInOrder.forEach(el => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + (el.width || 0));
        maxY = Math.max(maxY, el.y + (el.height || 0));
      });

      bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      childrenIds = selectedIds;
      childElements = selectedElementsInOrder;
    } else {
      childrenIds = grp.childIds || [];
      if (childrenIds.length === 0) {
        alert("Selected group is empty.");
        return;
      }
      bounds = { x: grp.x, y: grp.y, width: grp.width, height: grp.height };
      childElements = config.elements.filter(e => childrenIds.includes(e.id));
    }

    const componentName = prompt("Enter a name for this new component:", "My Component");
    if (!componentName) return;

    // Relative offset of children
    const elementsForMaster = childElements.map(e => ({
      ...e,
      x: e.x - bounds.x,
      y: e.y - bounds.y
    }));

    const payload = {
      name: componentName,
      schemaVersion: 1,
      elements: elementsForMaster,
      propsSchema: {},
      metadata: {}
    };

    try {
      const res = await fetch("/dashboard/api/overlay-components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const newDef: OverlayComponentDef = {
        id: data.public_id,
        name: componentName,
        schemaVersion: 1,
        elements: payload.elements as any,
        propsSchema: {},
        metadata: {}
      };

      // Sync master definitions in state IMMEDIATELY
      setOverlayComponents(prev => [...prev, newDef]);

      const instId = genId("instance");
      const instanceEl: AnyEl = {
        id: instId,
        type: "componentInstance",
        name: componentName,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        visible: true,
        locked: false,
        opacity: 1,
        componentId: data.public_id,
        propOverrides: {}
      } as any;

      setConfig((prev) => {
        // Remove children (and/or the group we used as anchor)
        const toRemove = new Set([...childrenIds, grp?.id].filter(Boolean));
        const withoutOld = prev.elements.filter(e => !toRemove.has(e.id));

        // Try to insert at a reasonable index
        return { ...prev, elements: [...withoutOld, instanceEl] };
      });

      setSelectedIds([instId]);

      // Proactive: Use the direct newDef to avoid state reconciliation lag
      enterIsolationMode(data.public_id, newDef);

    } catch (err) {
      console.error(err);
      alert("Failed to save component. Check console for details.");
    }
  }

  async function deleteComponent(componentId: string) {
    const comp = overlayComponents.find(c => c.id === componentId);
    if (!comp) return;

    if (!confirm(`Are you sure you want to delete the component "${comp.name}"? This will not remove existing instances from your overlays, but they will show a 'missing' state until replaced.`)) {
      return;
    }

    try {
      const res = await fetch(`/dashboard/api/overlay-components/${componentId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await res.text());

      setOverlayComponents(prev => prev.filter(c => c.id !== componentId));
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete component. " + err.message);
    }
  }

  function detachSelectedComponentInstance() {
    if (!primarySelectedEl || primarySelectedEl.type !== "componentInstance") return;
    const instance = primarySelectedEl as AnyEl;
    const def = overlayComponents.find((component) => component.id === (instance as any).componentId);
    if (!def) return;

    const masterBounds = computeSelectionBounds(def.elements as AnyEl[]);
    if (!masterBounds) return;

    const scaleX = (instance.width ?? masterBounds.w) / Math.max(1, masterBounds.w);
    const scaleY = (instance.height ?? masterBounds.h) / Math.max(1, masterBounds.h);
    const idMap = new Map<string, string>();
    const overrides = ((instance as any).propOverrides ?? {}) as Record<string, any>;

    const clones = (def.elements as AnyEl[]).map((source) => {
      const nextId = genId(source.type === "text" ? "text" : source.type);
      idMap.set(source.id, nextId);

      const localX = (source.x ?? 0) - masterBounds.x;
      const localY = (source.y ?? 0) - masterBounds.y;
      const clone: AnyEl = {
        ...source,
        id: nextId,
        x: Math.round((instance.x ?? 0) + localX * scaleX),
        y: Math.round((instance.y ?? 0) + localY * scaleY),
        width: Math.max(1, Math.round((source.width ?? 0) * scaleX)),
        height: Math.max(1, Math.round((source.height ?? 0) * scaleY)),
      } as AnyEl;

      if (source.type === "text") {
        Object.assign(clone, getScaledTextPatch(source as AnyEl, { width: masterBounds.w, height: masterBounds.h }, { width: instance.width ?? masterBounds.w, height: instance.height ?? masterBounds.h }));
      }

      if (source.bindings) {
        const nextBindings = { ...source.bindings };
        for (const [key, value] of Object.entries(overrides)) {
          if (key in nextBindings) delete nextBindings[key];
          if (key in clone) (clone as any)[key] = value;
        }
        clone.bindings = nextBindings;
      }

      return clone;
    });

    const remapped = clones.map((clone) => {
      if (Array.isArray((clone as any).childIds)) {
        return {
          ...clone,
          childIds: (clone as any).childIds.map((childId: string) => idMap.get(childId) ?? childId),
        };
      }
      return clone;
    });

    setConfig((prev) => {
      const index = prev.elements.findIndex((candidate) => candidate.id === instance.id);
      const kept = prev.elements.filter((candidate) => candidate.id !== instance.id);
      const insertAt = index < 0 ? kept.length : Math.min(index, kept.length);
      return {
        ...prev,
        elements: [...kept.slice(0, insertAt), ...remapped, ...kept.slice(insertAt)],
      };
    });
    setSelectedIds(remapped.filter((element) => !allChildIds.has(element.id)).map((element) => element.id));
    showEditorStatus("Instance detached", `${def.name} is now editable local geometry.`);
  }

  async function createVariantFromComponent(componentId: string) {
    const def = overlayComponents.find((component) => component.id === componentId);
    if (!def) return;
    const variantName = prompt("Enter a name for this variant:", def.variantName ? `${def.variantName} Copy` : `${def.name} Variant`);
    if (!variantName) return;
    const variantGroupId = def.variantGroupId || def.id;
    const payload = {
      name: `${def.name} / ${variantName}`,
      schemaVersion: def.schemaVersion || 1,
      elements: def.elements,
      propsSchema: def.propsSchema || {},
      metadata: def.metadata || {},
      variantGroupId,
      variantName,
    };
    try {
      const res = await fetch("/dashboard/api/overlay-components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOverlayComponents((prev) => [
        ...prev,
        {
          id: data.public_id,
          name: payload.name,
          schemaVersion: payload.schemaVersion,
          elements: payload.elements as any,
          propsSchema: payload.propsSchema,
          metadata: payload.metadata,
          variantGroupId,
          variantName,
        },
      ]);
      showEditorStatus("Variant created", `${variantName} is available in the component library.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to create variant. " + err.message);
    }
  }

  function ungroupSelected() {
    if (!primarySelectedEl || (primarySelectedEl.type !== 'group' && primarySelectedEl.type !== 'frame' && primarySelectedEl.type !== "boolean")) return;
    const grp = primarySelectedEl as any;
    const children = grp.childIds || [];

    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.filter(e => e.id !== grp.id)
    }));
    setSelectedIds(children);
  }

  function duplicateSelected() {
    if (!primarySelectedEl) return;

    const prefix =
      primarySelectedEl.type === "text"
        ? "text"
        : primarySelectedEl.type === "box"
          ? "box"
          : primarySelectedEl.type === "shape"
            ? "shape"
            : primarySelectedEl.type === "image"
              ? "image"
              : primarySelectedEl.type === "video"
                ? "video"
                : primarySelectedEl.type === "lower_third"
                  ? "lt"
                  : "el";

    const copyId = genId(prefix);

    const copy: AnyEl = {
      ...(primarySelectedEl as any),
      id: copyId,
      name: `${primarySelectedEl.name || defaultElementLabel(primarySelectedEl)} copy`,
      x: (primarySelectedEl.x ?? 0) + 20,
      y: (primarySelectedEl.y ?? 0) + 20,
    };

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, copy as any] }));
    setSelectedIds([copyId]);
  }

  function createDragDuplicate(source: AnyEl) {
    const prefix =
      source.type === "text"
        ? "text"
        : source.type === "box"
          ? "box"
          : source.type === "shape"
            ? "shape"
            : source.type === "image"
              ? "image"
              : source.type === "video"
                ? "video"
                : source.type === "lower_third"
                  ? "lt"
                  : source.type === "componentInstance"
                    ? "instance"
                    : "el";

    const duplicateId = genId(prefix);
    const copy: AnyEl = {
      ...(source as any),
      id: duplicateId,
      name: `${source.name || defaultElementLabel(source)} copy`,
      x: source.x ?? 0,
      y: source.y ?? 0,
    };

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, copy as any] }));
    setDraftRects((prev) => ({
      ...prev,
      [duplicateId]: {
        x: source.x ?? 0,
        y: source.y ?? 0,
        width: source.width ?? 0,
        height: source.height ?? 0,
      },
    }));
    return duplicateId;
  }

  function moveLayerBy(id: string, delta: number) {
    setConfig((prev) => {
      const idx = prev.elements.findIndex((e) => e.id === id);
      if (idx < 0) return prev;

      const el = prev.elements[idx] as any;

      // V1 rule: do not reorder children inside masks.
      // Mask child order is structural: [maskShape, content]
      const parentMask = prev.elements.find(
        (e) => e.type === "mask" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      ) as any | undefined;
      if (parentMask) return prev;

      const next = prev.elements.slice();

      // If this element is inside a group, reorder within group.childIds only.
      const parentGroup = prev.elements.find(
        (e) => (e.type === "group" || e.type === "frame") && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      ) as any | undefined;

      if (parentGroup) {
        const childIds = [...(parentGroup.childIds || [])];
        const childIdx = childIds.indexOf(id);
        if (childIdx === -1) return prev;

        const targetIdx = Math.max(0, Math.min(childIds.length - 1, childIdx + delta));
        if (targetIdx === childIdx) return prev;

        childIds.splice(childIdx, 1);
        childIds.splice(targetIdx, 0, id);

        return {
          ...prev,
          elements: next.map((item) =>
            item.id === parentGroup.id ? { ...(item as any), childIds } : item
          ),
        };
      }

      // Otherwise reorder at root level in the flat elements array.
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;

      const [picked] = next.splice(idx, 1);
      next.splice(target, 0, picked);
      return { ...prev, elements: next };
    });
  }

  function bringLayerToFront(id: string) {
    setConfig((prev) => {
      const el = prev.elements.find((e) => e.id === id) as any;
      if (!el) return prev;

      const parentMask = prev.elements.find(
        (e) => e.type === "mask" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      );
      if (parentMask) return prev;

      const parentGroup = prev.elements.find(
        (e) => (e.type === "group" || e.type === "frame") && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      ) as any | undefined;

      if (parentGroup) {
        const childIds = [...(parentGroup.childIds || [])];
        const idx = childIds.indexOf(id);
        if (idx === -1 || idx === childIds.length - 1) return prev;
        childIds.splice(idx, 1);
        childIds.push(id);

        return {
          ...prev,
          elements: prev.elements.map((item) =>
            item.id === parentGroup.id ? { ...(item as any), childIds } : item
          ),
        };
      }

      const kept = prev.elements.filter((e) => e.id !== id);
      return { ...prev, elements: [...kept, el] };
    });
  }

  function sendLayerToBack(id: string) {
    setConfig((prev) => {
      const el = prev.elements.find((e) => e.id === id) as any;
      if (!el) return prev;

      const parentMask = prev.elements.find(
        (e) => e.type === "mask" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      );
      if (parentMask) return prev;

      const parentGroup = prev.elements.find(
        (e) => (e.type === "group" || e.type === "frame") && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
      ) as any | undefined;

      if (parentGroup) {
        const childIds = [...(parentGroup.childIds || [])];
        const idx = childIds.indexOf(id);
        if (idx <= 0) return prev;
        childIds.splice(idx, 1);
        childIds.unshift(id);

        return {
          ...prev,
          elements: prev.elements.map((item) =>
            item.id === parentGroup.id ? { ...(item as any), childIds } : item
          ),
        };
      }

      const kept = prev.elements.filter((e) => e.id !== id);
      return { ...prev, elements: [el, ...kept] };
    });
  }

  // ===== Power-user transform tools =====
  function setMany(patches: Record<string, Partial<AnyEl>>) {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        const p = patches[el.id];
        return p ? ({ ...(el as any), ...p } as any) : el;
      }),
    }));
  }

  function alignSelection(mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    if (selectionHasLocked) return;
    if (!selectionBounds) return;
    if (selectedEls.length < 2) return;

    const b = selectionBounds;
    const patches: Record<string, Partial<AnyEl>> = {};

    for (const el of selectedEls) {
      const w = el.width ?? 0;
      const h = el.height ?? 0;

      if (mode === "left") patches[el.id] = { x: b.l };
      if (mode === "hcenter") patches[el.id] = { x: b.cx - w / 2 };
      if (mode === "right") patches[el.id] = { x: b.r - w };

      if (mode === "top") patches[el.id] = { y: b.t };
      if (mode === "vcenter") patches[el.id] = { y: b.cy - h / 2 };
      if (mode === "bottom") patches[el.id] = { y: b.b - h };
    }

    setMany(patches);
  }

  function distributeSelection(axis: "x" | "y") {
    if (selectionHasLocked) return;
    if (!selectionBounds) return;
    if (selectedEls.length < 3) return;

    const items = selectedEls
      .map((el) => ({ el, r: rectFromEl(el) }))
      .sort((a, b) => (axis === "x" ? a.r.l - b.r.l : a.r.t - b.r.t));

    const first = items[0];
    const last = items[items.length - 1];

    const spanStart = axis === "x" ? first.r.l : first.r.t;
    const spanEnd = axis === "x" ? last.r.r : last.r.b;

    const totalSize = items.reduce((sum, it) => sum + (axis === "x" ? it.r.w : it.r.h), 0);
    const gaps = items.length - 1;
    const gap = (spanEnd - spanStart - totalSize) / gaps;

    if (!isFinite(gap)) return;

    const patches: Record<string, Partial<AnyEl>> = {};
    let cursor = spanStart;

    for (let i = 0; i < items.length; i++) {
      const { el, r } = items[i];
      if (i === 0) {
        patches[el.id] = axis === "x" ? { x: spanStart } : { y: spanStart };
        cursor = spanStart + (axis === "x" ? r.w : r.h) + gap;
        continue;
      }
      if (i === items.length - 1) {
        const lastPos = axis === "x" ? spanEnd - r.w : spanEnd - r.h;
        patches[el.id] = axis === "x" ? { x: lastPos } : { y: lastPos };
        continue;
      }

      patches[el.id] = axis === "x" ? { x: cursor } : { y: cursor };
      cursor += (axis === "x" ? r.w : r.h) + gap;
    }

    setMany(patches);
  }

  function bringToFront() {
    if (selectionHasLocked) return;
    if (!selectedIds.length) return;

    const sel = new Set(selectedIds);
    setConfig((prev) => {
      const kept = prev.elements.filter((e) => !sel.has(e.id));
      const picked = prev.elements.filter((e) => sel.has(e.id));
      return { ...prev, elements: [...kept, ...picked] };
    });
  }

  function sendToBack() {
    if (selectionHasLocked) return;
    if (!selectedIds.length) return;

    const sel = new Set(selectedIds);
    setConfig((prev) => {
      const kept = prev.elements.filter((e) => !sel.has(e.id));
      const picked = prev.elements.filter((e) => sel.has(e.id));
      return { ...prev, elements: [...picked, ...kept] };
    });
  }

  function beginRename(el: AnyEl) {
    setRenamingId(el.id);
    setRenameDraft(el.name || defaultElementLabel(el));
  }

  function commitRename() {
    if (!renamingId) return;
    const id = renamingId;
    const nextName = (renameDraft || "").trim();
    updateElement(id, { name: nextName || undefined });
    setRenamingId(null);
    setRenameDraft("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft("");
  }

  async function handleSave() {
    try {
      setSaving(true);
      setSaveError(null);
      setSaveOk(false);

      let url = `/dashboard/api/overlays/${initialOverlay.id}`;
      let body: any = { name, slug, config_json: config };

      if (isComponentMaster) {
        let idToSave = initialOverlay.id;
        if (editingMasterId) {
          idToSave = editingMasterId as any;
        }
        url = `/dashboard/api/overlay-components/${idToSave}`;
        body = {
          name,
          schemaVersion: (initialOverlay as any).schemaVersion || 1,
          elements: config.elements,
          propsSchema,
          metadata
        };
      }

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setSaveOk(true);
    } catch (err: any) {
      setSaveError(err?.message || "Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveOk(false), 2000);
    }
  }

  // Space key tracking + hotkeys
  useEffect(() => {
    if (!zoomAnimating) return;
    const timer = window.setTimeout(() => setZoomAnimating(false), 180);
    return () => window.clearTimeout(timer);
  }, [zoomAnimating]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;

      if (shortcutMatchesEvent("show-shortcuts", e)) {
        e.preventDefault();
        setShowShortcutModal(true);
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.key === "Shift") setShiftDown(true);
      if (e.key === "Alt") setAltDown(true);

      if (shortcutMatchesEvent("toggle-grid", e)) {
        e.preventDefault();
        setShowGrid((v) => !v);
        return;
      }

      if (shortcutMatchesEvent("group", e)) {
        e.preventDefault();
        groupSelected();
        return;
      }

      if (shortcutMatchesEvent("ungroup", e)) {
        e.preventDefault();
        ungroupSelected();
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
      if (e.key === "Shift") setShiftDown(false);
      if (e.key === "Alt") setAltDown(false);
    };

    window.addEventListener("keydown", onKeyDown, { passive: false } as any);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown as any);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Keyboard UX (nudge, delete, duplicate, zoom)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (activeCreationTool === "pen") {
        if (e.key === "Escape") {
          e.preventDefault();
          setPenDraft(null);
          setActiveCreationTool(null);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commitPenDraft(false);
          return;
        }
      }
      if (showShortcutModal && e.key === "Escape") {
        e.preventDefault();
        setShowShortcutModal(false);
        return;
      }
      if (isTypingTarget(document.activeElement)) return;

      const hasSel = !!primarySelectedEl;
      const step = e.shiftKey ? 10 : 1;

      // Duplicate: Ctrl/Cmd + D
      if (shortcutMatchesEvent("duplicate", e)) {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Zoom: Ctrl/Cmd + / - / 0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          setZoomAnimating(true);
          setZoomMode("manual");
          setManualScale((s) => clamp(s + 0.1, 0.1, 2));
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          setZoomAnimating(true);
          setZoomMode("manual");
          setManualScale((s) => clamp(s - 0.1, 0.1, 2));
          return;
        }
        if (shortcutMatchesEvent("zoom-fit", e)) {
          e.preventDefault();
          zoomFit();
          return;
        }
        if (shortcutMatchesEvent("zoom-100", e)) {
          e.preventDefault();
          zoom100();
          return;
        }
        if (shortcutMatchesEvent("select-matching", e) && primarySelectedEl) {
          e.preventDefault();
          const matchType = primarySelectedEl.type;
          const nextIds = config.elements
            .filter((el) => el.type === matchType && el.locked !== true)
            .map((el) => el.id);
          setSelectedIds(nextIds);
          return;
        }
      }

      if (shortcutMatchesEvent("zoom-selection", e)) {
        e.preventDefault();
        zoomToSelection();
        return;
      }

      if (selectedPathAnchor && primarySelectedEl?.type === "path" && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        updateElement(primarySelectedEl.id, {
          path: removePathAnchor((primarySelectedEl as any).path, selectedPathAnchor.commandIndex),
        } as any);
        setSelectedPathAnchor(null);
        return;
      }

      // Delete (primary selection)
      if (hasSel && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteElement(primarySelectedEl!.id);
        return;
      }

      // Nudges
      if (!selectedEls.length) return;
      if (selectionHasLocked) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const touchedTimelineProperties: OverlayTimelineProperty[] = [];
        if (dx !== 0) touchedTimelineProperties.push("x");
        if (dy !== 0) touchedTimelineProperties.push("y");

        setConfig((prev) => {
          const sel = new Set(selectedIds);
          let nextTimeline = prev.timeline;
          let lastTimelineTrackId: string | null = null;
          let lastTimelineKeyframeId: string | null = null;
          const next = prev.elements.map((raw) => {
            if (!sel.has(raw.id)) return raw;

            const el = raw as AnyEl;
            const nx = (el.x ?? 0) + dx;
            const ny = (el.y ?? 0) + dy;
            const nextX = Math.round(nx);
            const nextY = Math.round(ny);

            if (isTimelineEligibleElement(el as OverlayElement)) {
              if (dx !== 0) {
                const result = upsertKeyframeAtPlayhead(
                  ensureTimeline(nextTimeline),
                  el.id,
                  "x",
                  nextX
                );
                nextTimeline = result.timeline;
                lastTimelineTrackId = result.trackId;
                lastTimelineKeyframeId = result.keyframeId;
              }
              if (dy !== 0) {
                const result = upsertKeyframeAtPlayhead(
                  ensureTimeline(nextTimeline),
                  el.id,
                  "y",
                  nextY
                );
                nextTimeline = result.timeline;
                lastTimelineTrackId = result.trackId;
                lastTimelineKeyframeId = result.keyframeId;
              }
            }

            return {
              ...(raw as any),
              x: nextX,
              y: nextY,
            };
          });

          if (lastTimelineTrackId) setSelectedTimelineTrackId(lastTimelineTrackId);
          if (lastTimelineKeyframeId) setSelectedTimelineKeyframeId(lastTimelineKeyframeId);
          return { ...prev, elements: next, timeline: nextTimeline };
        });
        if (touchedTimelineProperties.length > 0) {
          showEditorStatus(
            `Timeline edit at ${formatTimelineTime(timelinePlayheadMs)}`,
            `Updated ${touchedTimelineProperties.join(", ")} keyframe${touchedTimelineProperties.length > 1 ? "s" : ""}.`
          );
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCreationTool, commitPenDraft, primarySelectedEl, selectedIds, selectedEls, selectedPathAnchor, selectionHasLocked, snapEnabled, gridSize, showShortcutModal, timelinePlayheadMs, showEditorStatus]);

  // ===== Pan handlers =====
  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      panStartRef.current = { x: clientX, y: clientY, panX: panPx.x, panY: panPx.y };
      setIsPanning(true);
      clearGuides();
      setMarquee({ active: false, shift: false, start: null, cur: null });
    },
    [panPx.x, panPx.y, clearGuides]
  );

  const updatePan = useCallback((clientX: number, clientY: number) => {
    const st = panStartRef.current;
    if (!st) return;
    const dx = clientX - st.x;
    const dy = clientY - st.y;
    setPanPx({ x: st.panX + dx, y: st.panY + dy });
  }, []);

  const endPan = useCallback(() => {
    panStartRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      updatePan(e.clientX, e.clientY);
    };
    const onUp = (e: MouseEvent) => {
      e.preventDefault();
      endPan();
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);

    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [isPanning, updatePan, endPan]);

  // ===== Wheel zoom =====
  useEffect(() => {
    const outer = canvasOuterRef.current;
    if (!outer) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = outer.getBoundingClientRect();
      const relMouse = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };

      const oldScale = scale;
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.1 : 1 / 1.1;
      const target = clamp(oldScale * factor, 0.1, 2);

      setZoomMode("manual");
      setManualScale(target);

      const ratio = target / oldScale;
      const nextPanX = relMouse.x * (1 - ratio) + ratio * panPx.x;
      const nextPanY = relMouse.y * (1 - ratio) + ratio * panPx.y;
      setPanPx({ x: nextPanX, y: nextPanY });
    };

    outer.addEventListener("wheel", handleWheel, { passive: false });
    return () => outer.removeEventListener("wheel", handleWheel);
  }, [scale, panPx.x, panPx.y]);

  // ===== marquee coordinate mapping =====
  const clientToStage = useCallback(
    (clientX: number, clientY: number) => {
      const outer = canvasOuterRef.current;
      if (!outer) return null;

      const rect = outer.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const vx = mx - cx - panPx.x;
      const vy = my - cy - panPx.y;

      const vtlx = -(baseResolution.width * scale) / 2;
      const vtly = -(baseResolution.height * scale) / 2;

      const lx = vx - vtlx;
      const ly = vy - vtly;

      const sx = lx / scale;
      const sy = ly / scale;

      return {
        x: clamp(sx, 0, baseResolution.width),
        y: clamp(sy, 0, baseResolution.height),
      };
    },
    [baseResolution.width, baseResolution.height, panPx.x, panPx.y, scale]
  );

  useEffect(() => {
    if (!rotationDragRef.current) return;

    const onMove = (e: MouseEvent) => {
      const active = rotationDragRef.current;
      if (!active) return;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;

      const rawDeg = Math.atan2(stagePoint.y - active.cy, stagePoint.x - active.cx) * (180 / Math.PI) + 90;
      const nextDeg = snapRotationValue(rawDeg, e.altKey);
      setDraftRotationDegs((prev) => ({ ...prev, [active.id]: nextDeg }));
    };

    const onUp = (e: MouseEvent) => {
      const active = rotationDragRef.current;
      rotationDragRef.current = null;
      if (!active) return;

      const stagePoint = clientToStage(e.clientX, e.clientY);
      const draft = draftRotationDegs[active.id];
      const resolvedDeg =
        draft ?? (stagePoint ? snapRotationValue(Math.atan2(stagePoint.y - active.cy, stagePoint.x - active.cx) * (180 / Math.PI) + 90, e.altKey) : 0);

      updateElement(active.id, { rotationDeg: resolvedDeg } as any);
      setDraftRotationDegs((prev) => {
        const next = { ...prev };
        delete next[active.id];
        return next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftRotationDegs]);

  useEffect(() => {
    if (!resizeDragSession) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const active = resizeDragSession;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;

      const draft = computeResizeDraft(
        active.origin,
        active.handle,
        { x: stagePoint.x - active.startStage.x, y: stagePoint.y - active.startStage.y },
        { preserveAspect: e.shiftKey, resizeFromCenter: e.altKey }
      );

      const nextDrafts: Record<string, { x: number; y: number; width: number; height: number }> = {
        [active.id]: draft,
      };
      const nextPatches: Record<string, Partial<AnyEl>> = {};
      if (active.descendants) {
        const activeElement = previewElementsById[active.id] as AnyEl | undefined;
        const shouldScaleFrameText = !(activeElement?.type === "frame" && ensureFrameLayout((activeElement as OverlayFrameElement).layout).mode !== "free");
        for (const [descendantId, rect] of Object.entries(active.descendants)) {
          const descendantEl = previewElementsById[descendantId] as AnyEl | undefined;
          nextDrafts[descendantId] =
            activeElement?.type === "frame" && descendantEl
              ? constrainFrameChildRect(descendantEl, active.origin, draft)
              : scaleDescendantRect(rect, active.origin, draft);
          if (descendantEl?.type === "text" && shouldScaleFrameText) {
            nextPatches[descendantId] = getScaledTextPatch(descendantEl as AnyEl, active.origin, draft);
          }
        }
        if (activeElement?.type === "frame" && ensureFrameLayout((activeElement as OverlayFrameElement).layout).mode !== "free") {
          const frameDraft: OverlayFrameElement = { ...(activeElement as OverlayFrameElement), ...draft };
          const draftElements = Object.values(previewElementsById).map((element) =>
            element.id === active.id
              ? ({ ...element, ...draft } as AnyEl)
              : nextDrafts[element.id]
                ? ({ ...element, ...nextDrafts[element.id] } as AnyEl)
                : element
          ) as AnyEl[];
          const reflowed = reflowFrameElements(frameDraft, draftElements);
          reflowed.forEach((element) => {
            if (active.descendants?.[element.id]) {
              nextDrafts[element.id] = {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
              };
            }
          });
        }
        applyDerivedOffsetPathDrafts(nextDrafts, nextPatches);
      }

      rndRefs.current[active.id]?.updatePosition?.({ x: draft.x, y: draft.y });
      rndRefs.current[active.id]?.updateSize?.({ width: draft.width, height: draft.height });
      setResizeStatus(draft);
      setDraftRects((prev) => ({ ...prev, ...nextDrafts }));
      setDraftElementPatches((prev) => ({ ...prev, ...nextPatches }));
    };

    const onUp = (e: MouseEvent) => {
      const active = resizeDragSession;
      setResizeDragSession(null);

      const stagePoint = clientToStage(e.clientX, e.clientY);
      const draft =
        draftRects[active.id] ??
        (stagePoint
          ? computeResizeDraft(
              active.origin,
              active.handle,
              { x: stagePoint.x - active.startStage.x, y: stagePoint.y - active.startStage.y },
              { preserveAspect: e.shiftKey, resizeFromCenter: e.altKey }
            )
          : active.origin);

      let nx = Math.round(draft.x);
      let ny = Math.round(draft.y);
      let nw = Math.round(draft.width);
      let nh = Math.round(draft.height);

      if (snapEnabled) {
        nx = roundToGrid(nx, gridSize);
        ny = roundToGrid(ny, gridSize);
        nw = roundToGrid(nw, gridSize);
        nh = roundToGrid(nh, gridSize);
      }

      const nextGroupRect = { x: nx, y: ny, width: nw, height: nh };
      if (!active.descendants || Object.keys(active.descendants).length === 0) {
        updateElement(active.id, { x: nx, y: ny, width: nw, height: nh });
      } else {
        setConfig((prev) => {
          const activeElement = prev.elements.find((element) => element.id === active.id) as AnyEl | undefined;
          let nextTimeline = prev.timeline;
          let lastTimelineTrackId: string | null = null;
          let lastTimelineKeyframeId: string | null = null;
          const shouldScaleFrameText = !(activeElement?.type === "frame" && ensureFrameLayout((activeElement as OverlayFrameElement).layout).mode !== "free");
          const nextElements = prev.elements.map((raw) => {
            if (raw.id === active.id) {
              const base = raw as AnyEl;
              if (isTimelineEligibleElement(base as OverlayElement)) {
                for (const [property, value] of Object.entries(nextGroupRect) as [OverlayTimelineProperty, number][]) {
                  const result = upsertKeyframeAtPlayhead(
                    ensureTimeline(nextTimeline),
                    raw.id,
                    property,
                    value
                  );
                  nextTimeline = result.timeline;
                  lastTimelineTrackId = result.trackId;
                  lastTimelineKeyframeId = result.keyframeId;
                }
              }
              return { ...base, ...nextGroupRect };
            }

            const descendantRect = active.descendants?.[raw.id];
            if (!descendantRect) return raw;
            const scaled =
              activeElement?.type === "frame"
                ? constrainFrameChildRect(raw as AnyEl, active.origin, nextGroupRect)
                : scaleDescendantRect(descendantRect, active.origin, nextGroupRect);
            const rounded = {
              x: Math.round(scaled.x),
              y: Math.round(scaled.y),
              width: Math.round(scaled.width),
              height: Math.round(scaled.height),
            };
            const base = raw as AnyEl;
            let extraPatch: Partial<AnyEl> = base.type === "text" && shouldScaleFrameText ? getScaledTextPatch(base, active.origin, nextGroupRect) : {};
            if (base.type === "path" && (base as any).pathSource?.kind === "offset") {
              const pathSource = (base as any).pathSource;
              const sourceRaw = prev.elements.find((candidate) => candidate.id === pathSource.sourceId) as AnyEl | undefined;
              let sourceElement = sourceRaw;
              if (sourceRaw) {
                if (sourceRaw.id === active.id) {
                  sourceElement = { ...sourceRaw, ...nextGroupRect } as AnyEl;
                } else if (active.descendants?.[sourceRaw.id]) {
                  sourceElement = {
                    ...sourceRaw,
                    ...scaleDescendantRect(active.descendants[sourceRaw.id], active.origin, nextGroupRect),
                  } as AnyEl;
                }
              }
              if (sourceElement && isPathCapableElement(sourceElement)) {
                const resolved = resolveElementGeometry(sourceElement as any, Object.fromEntries(
                  prev.elements.map((candidate) => [candidate.id, candidate as OverlayElement])
                ) as Record<string, OverlayElement>);
                if (resolved) {
                  const offset = offsetOverlayPath(resolved.path, Number(pathSource.distance) || 0);
                  rounded.x = Math.round((sourceElement.x ?? 0) + offset.bounds.x);
                  rounded.y = Math.round((sourceElement.y ?? 0) + offset.bounds.y);
                  rounded.width = Math.max(1, Math.round(offset.bounds.width));
                  rounded.height = Math.max(1, Math.round(offset.bounds.height));
                  extraPatch = { ...extraPatch, path: offset.path };
                }
              }
            }
            if (isTimelineEligibleElement(base as OverlayElement)) {
              for (const [property, value] of Object.entries(rounded) as [OverlayTimelineProperty, number][]) {
                const result = upsertKeyframeAtPlayhead(
                  ensureTimeline(nextTimeline),
                  raw.id,
                  property,
                  value
                );
                nextTimeline = result.timeline;
                lastTimelineTrackId = result.trackId;
                lastTimelineKeyframeId = result.keyframeId;
              }
            }
            return { ...base, ...rounded, ...extraPatch };
          });

          const finalizedElements =
            activeElement?.type === "frame" && ensureFrameLayout((activeElement as OverlayFrameElement).layout).mode !== "free"
              ? reflowFrameInElementList(active.id, nextElements as AnyEl[])
              : nextElements;

          if (lastTimelineTrackId) setSelectedTimelineTrackId(lastTimelineTrackId);
          if (lastTimelineKeyframeId) setSelectedTimelineKeyframeId(lastTimelineKeyframeId);

          return {
            ...prev,
            elements: finalizedElements,
            timeline: nextTimeline,
          };
        });
      }
      setResizeStatus(null);
      setDraftRects((prev) => {
        const next = { ...prev };
        delete next[active.id];
        if (active.descendants) {
          for (const descendantId of Object.keys(active.descendants)) delete next[descendantId];
        }
        return next;
      });
      setDraftElementPatches((prev) => {
        const next = { ...prev };
        if (active.descendants) {
          for (const descendantId of Object.keys(active.descendants)) delete next[descendantId];
        }
        return next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftRects, gridSize, resizeDragSession, snapEnabled]);

  useEffect(() => {
    if (!radiusDragSession) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const active = radiusDragSession;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;

      const centerX = active.origin.x + active.origin.width / 2;
      const centerY = active.origin.y + active.origin.height / 2;
      const localPoint = rotateVector(stagePoint.x - centerX, stagePoint.y - centerY, -active.origin.rotationDeg);
      const radius = clamp(
        Math.min(localPoint.x + active.origin.width / 2, localPoint.y + active.origin.height / 2),
        0,
        Math.min(active.origin.width, active.origin.height) / 2
      );

      setDraftRadiusValues((prev) => ({ ...prev, [active.id]: radius }));
      const target = elementsById[active.id] as AnyEl | undefined;
      if (target) {
        updateElement(active.id, getRadiusPatch(target, Math.round(radius)) as any);
      }
    };

    const onUp = (e: MouseEvent) => {
      const active = radiusDragSession;
      setRadiusDragSession(null);

      const stagePoint = clientToStage(e.clientX, e.clientY);
      let radius = draftRadiusValues[active.id];
      if (radius === undefined && stagePoint) {
        const centerX = active.origin.x + active.origin.width / 2;
        const centerY = active.origin.y + active.origin.height / 2;
        const localPoint = rotateVector(stagePoint.x - centerX, stagePoint.y - centerY, -active.origin.rotationDeg);
        radius = clamp(
          Math.min(localPoint.x + active.origin.width / 2, localPoint.y + active.origin.height / 2),
          0,
          Math.min(active.origin.width, active.origin.height) / 2
        );
      }

      const nextRadius = Math.round(radius ?? getElementRadiusValue((elementsById[active.id] as AnyEl) ?? ({ type: "box" } as AnyEl)));
      const target = elementsById[active.id] as AnyEl | undefined;
      if (target) {
        updateElement(active.id, getRadiusPatch(target, nextRadius) as any);
      }

      setDraftRadiusValues((prev) => {
        const next = { ...prev };
        delete next[active.id];
        return next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftRadiusValues, elementsById, radiusDragSession]);

  useEffect(() => {
    if (!pathAnchorDragSession) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const active = pathAnchorDragSession;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;
      const deltaWorld = {
        x: stagePoint.x - active.startStage.x,
        y: stagePoint.y - active.startStage.y,
      };
      const deltaLocal = rotateVector(deltaWorld.x, deltaWorld.y, -active.rotationDeg);
      const originAnchor = getPathAnchors(active.originPath).find((anchor) => anchor.commandIndex === active.commandIndex);
      if (!originAnchor) return;
      const nextPath = updatePathAnchor(active.originPath, active.commandIndex, {
        x: originAnchor.x + deltaLocal.x,
        y: originAnchor.y + deltaLocal.y,
      });
      setDraftElementPatches((prev) => ({
        ...prev,
        [active.elementId]: {
          ...(prev[active.elementId] ?? {}),
          path: nextPath,
        },
      }));
    };

    const onUp = () => {
      const active = pathAnchorDragSession;
      setPathAnchorDragSession(null);
      const patch = draftElementPatches[active.elementId];
      const nextPath = patch?.path as OverlayPath | undefined;
      if (nextPath) {
        updateElement(active.elementId, { path: nextPath } as any);
      }
      setDraftElementPatches((prev) => {
        const next = { ...prev };
        if (next[active.elementId]) {
          next[active.elementId] = { ...next[active.elementId] };
          delete next[active.elementId].path;
          if (!Object.keys(next[active.elementId]).length) delete next[active.elementId];
        }
        return next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftElementPatches, pathAnchorDragSession]);

  useEffect(() => {
    if (!pathHandleDragSession) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const active = pathHandleDragSession;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;
      const deltaWorld = {
        x: stagePoint.x - active.startStage.x,
        y: stagePoint.y - active.startStage.y,
      };
      const deltaLocal = rotateVector(deltaWorld.x, deltaWorld.y, -active.rotationDeg);
      const curve = active.originPath.commands[active.curveCommandIndex] as any;
      if (!curve || curve.type !== "curve") return;
      const originPoint =
        active.role === "in"
          ? { x: curve.x2, y: curve.y2 }
          : { x: curve.x1, y: curve.y1 };
      const nextPath = updatePathHandle(active.originPath, active.curveCommandIndex, active.role, {
        x: originPoint.x + deltaLocal.x,
        y: originPoint.y + deltaLocal.y,
      });
      setDraftElementPatches((prev) => ({
        ...prev,
        [active.elementId]: {
          ...(prev[active.elementId] ?? {}),
          path: nextPath,
        },
      }));
    };

    const onUp = () => {
      const active = pathHandleDragSession;
      setPathHandleDragSession(null);
      const patch = draftElementPatches[active.elementId];
      const nextPath = patch?.path as OverlayPath | undefined;
      if (nextPath) {
        updateElement(active.elementId, { path: nextPath } as any);
      }
      setDraftElementPatches((prev) => {
        const next = { ...prev };
        if (next[active.elementId]) {
          next[active.elementId] = { ...next[active.elementId] };
          delete next[active.elementId].path;
          if (!Object.keys(next[active.elementId]).length) delete next[active.elementId];
        }
        return next;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftElementPatches, pathHandleDragSession]);

  const getMarqueeRect = useCallback(() => {
    if (!marquee.active || !marquee.start || !marquee.cur) return null;
    const x1 = marquee.start.x;
    const y1 = marquee.start.y;
    const x2 = marquee.cur.x;
    const y2 = marquee.cur.y;

    const l = Math.min(x1, x2);
    const t = Math.min(y1, y2);
    const r = Math.max(x1, x2);
    const b = Math.max(y1, y2);
    return { l, t, r, b, w: r - l, h: b - t, x: l, y: t };
  }, [marquee.active, marquee.start, marquee.cur]);

  const applyMarqueeSelection = useCallback(() => {
    const rect = getMarqueeRect();
    if (!rect) return;

    const hits = elementsAny
      .filter((el) => el.visible !== false)
      .filter((el) => el.locked !== true)
      .filter((el) => rectsIntersect(rect, rectFromEl(el)))
      .map((el) => el.id);

    if (!marquee.shift) {
      const hitSet = new Set(hits);
      const ordered = config.elements.map((e) => e.id).filter((id) => hitSet.has(id));
      setSelectedIds(ordered);
      return;
    }

    const startSel = marqueeStartSelectedRef.current || [];
    const set = new Set(startSel);
    for (const id of hits) {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    }
    const ordered = config.elements.map((e) => e.id).filter((id) => set.has(id));
    setSelectedIds(ordered);
  }, [config.elements, elementsAny, getMarqueeRect, marquee.shift]);

  useEffect(() => {
    if (!marquee.active) return;

    const onMove = (e: MouseEvent) => {
      const p = clientToStage(e.clientX, e.clientY);
      if (!p) return;
      setMarquee((m) => {
        if (!m.active) return m;
        return { ...m, cur: p };
      });
      window.requestAnimationFrame(() => applyMarqueeSelection());
    };

    const onUp = (e: MouseEvent) => {
      e.preventDefault();
      setMarquee((m) => ({ ...m, active: false }));
      applyMarqueeSelection();
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);

    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [marquee.active, clientToStage, applyMarqueeSelection]);

  // Drag/resize commit (on stop)
  const handleDragStop = (_e: any, d: any, id: string | number) => {
    const elId = String(id);
    const el = elementsAny.find((x) => x.id === elId);
    if (!el) return;
    const duplicate = dragDuplicateRef.current?.sourceId === elId ? dragDuplicateRef.current : null;
    const commitId = duplicate?.duplicateId || elId;

    const exclude = new Set<string>([elId]);
    if (duplicate?.duplicateId) exclude.add(duplicate.duplicateId);
    const lines = buildSnapLines(baseResolution.width, baseResolution.height, elementsAny, exclude);

    const rect = {
      ...rectFromEl(el),
      x: d.x,
      y: d.y,
      l: d.x,
      r: d.x + (el.width ?? 0),
      t: d.y,
      b: d.y + (el.height ?? 0),
      cx: d.x + (el.width ?? 0) / 2,
      cy: d.y + (el.height ?? 0) / 2,
      w: el.width ?? 0,
      h: el.height ?? 0,
    };

    const snap = snapRectToLines(rect, lines, { enabled: guideSnapEnabled, threshold: 6 });

    let nx = Math.round(d.x + snap.dx);
    let ny = Math.round(d.y + snap.dy);

    if (snapEnabled) {
      nx = roundToGrid(nx, gridSize);
      ny = roundToGrid(ny, gridSize);
    }

    const dx = nx - (el.x ?? 0);
    const dy = ny - (el.y ?? 0);

    setConfig((prev) => {
      const prevMap = Object.fromEntries(prev.elements.map((item) => [item.id, item as AnyEl])) as Record<string, AnyEl>;
      const descendantIds = duplicate ? [] : Array.from(collectDescendantIds(prevMap, elId));
      const movedIds = new Set([commitId, ...descendantIds]);
      let nextTimeline = prev.timeline;
      let lastTimelineTrackId: string | null = null;
      let lastTimelineKeyframeId: string | null = null;

      const nextElements = prev.elements.map((raw) => {
        if (!movedIds.has(raw.id)) return raw;
        const base = raw as AnyEl;
        const nextX = raw.id === commitId ? nx : Math.round((base.x ?? 0) + dx);
        const nextY = raw.id === commitId ? ny : Math.round((base.y ?? 0) + dy);

        if (isTimelineEligibleElement(base as OverlayElement)) {
          const xResult = upsertKeyframeAtPlayhead(
            ensureTimeline(nextTimeline),
            raw.id,
            "x",
            nextX
          );
          nextTimeline = xResult.timeline;
          lastTimelineTrackId = xResult.trackId;
          lastTimelineKeyframeId = xResult.keyframeId;

          const yResult = upsertKeyframeAtPlayhead(
            ensureTimeline(nextTimeline),
            raw.id,
            "y",
            nextY
          );
          nextTimeline = yResult.timeline;
          lastTimelineTrackId = yResult.trackId;
          lastTimelineKeyframeId = yResult.keyframeId;
        }

        return { ...base, x: nextX, y: nextY };
      });

      if (lastTimelineTrackId) setSelectedTimelineTrackId(lastTimelineTrackId);
      if (lastTimelineKeyframeId) setSelectedTimelineKeyframeId(lastTimelineKeyframeId);

      return {
        ...prev,
        elements: nextElements,
        timeline: nextTimeline,
      };
    });
    clearGuides();
    setDraftRects((prev) => {
      const next = { ...prev };
      delete next[commitId];
      if (!duplicate) {
        for (const movedId of collectDescendantIds(previewElementsById, elId)) delete next[movedId];
      }
      if (duplicate?.duplicateId) {
        delete next[duplicate.duplicateId];
      }
      return next;
    });
  };

  const handleResizeStop = (_e: any, _dir: any, ref: any, _delta: any, pos: any, id: string | number) => {
    const elId = String(id);

    let nx = Math.round(pos.x);
    let ny = Math.round(pos.y);
    let nw = Math.round(ref.offsetWidth);
    let nh = Math.round(ref.offsetHeight);
    const origin = resizeOriginRef.current[elId];

    if (altDown && origin) {
      const dw = nw - origin.width;
      const dh = nh - origin.height;
      nx = Math.round(origin.x - dw / 2);
      ny = Math.round(origin.y - dh / 2);
    }

    if (snapEnabled) {
      nx = roundToGrid(nx, gridSize);
      ny = roundToGrid(ny, gridSize);
      nw = roundToGrid(nw, gridSize);
      nh = roundToGrid(nh, gridSize);
    }

    updateElement(elId, { x: nx, y: ny, width: nw, height: nh });
    clearGuides();
    setResizeStatus(null);
    delete resizeOriginRef.current[elId];
    setDraftRects((prev) => {
      const next = { ...prev };
      delete next[elId];
      return next;
    });
  };

  const handleDragLive = useCallback(
    (id: string, x: number, y: number, options?: { shiftKey?: boolean }) => {
      const el = elementsAny.find((e) => e.id === id);
      if (!el) return;
      const duplicate = dragDuplicateRef.current?.sourceId === id ? dragDuplicateRef.current : null;
      const draftId = duplicate?.duplicateId || id;
      const descendantIds = duplicate ? [] : Array.from(collectDescendantIds(elementsById, id));
      const axisLock = options?.shiftKey === true;

      let nx = x;
      let ny = y;
      const start = dragStartRef.current[id] ?? { x: el.x ?? 0, y: el.y ?? 0 };
      if (axisLock) {
        const dx = x - start.x;
        const dy = y - start.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          ny = start.y;
        } else {
          nx = start.x;
        }
      }

      if (guideSnapEnabled) {
        const exclude = new Set<string>([id]);
        if (duplicate?.duplicateId) exclude.add(duplicate.duplicateId);
        const lines = buildSnapLines(baseResolution.width, baseResolution.height, elementsAny, exclude);

        const rect = {
          ...rectFromEl(el),
          x: nx,
          y: ny,
          l: nx,
          r: nx + (el.width ?? 0),
          t: ny,
          b: ny + (el.height ?? 0),
          cx: nx + (el.width ?? 0) / 2,
          cy: ny + (el.height ?? 0) / 2,
          w: el.width ?? 0,
          h: el.height ?? 0,
        };

        const snap = snapRectToLines(rect, lines, { enabled: true, threshold: 6 });
        nx += snap.dx;
        ny += snap.dy;
        const spacing = computeEqualSpacingGuides(
          {
            ...rect,
            x: nx,
            y: ny,
            l: nx,
            r: nx + rect.w,
            t: ny,
            b: ny + rect.h,
            cx: nx + rect.w / 2,
            cy: ny + rect.h / 2,
          },
          elementsAny.filter((candidate) => candidate.id !== id && (!duplicate || candidate.id !== duplicate.duplicateId)),
          6
        );
        updateGuidesThrottled({ v: snap.guides.v, h: snap.guides.h, spacing });
      } else {
        clearGuides();
      }

      if (snapEnabled) {
        nx = roundToGrid(nx, gridSize);
        ny = roundToGrid(ny, gridSize);
      }

      const dx = nx - (el.x ?? 0);
      const dy = ny - (el.y ?? 0);
      setDraftRects((prev) => ({
        ...prev,
        [id]: duplicate
          ? {
              x: start.x,
              y: start.y,
              width: prev[id]?.width ?? el.width ?? 0,
              height: prev[id]?.height ?? el.height ?? 0,
            }
          : {
              x: nx,
              y: ny,
              width: prev[id]?.width ?? el.width ?? 0,
              height: prev[id]?.height ?? el.height ?? 0,
            },
        [draftId]: {
          x: nx,
          y: ny,
          width: prev[draftId]?.width ?? el.width ?? 0,
          height: prev[draftId]?.height ?? el.height ?? 0,
        },
        ...Object.fromEntries(
          descendantIds.map((childId) => {
            const child = elementsById[childId];
            const childDraft = prev[childId];
            return [
              childId,
              {
                x: Math.round((child?.x ?? 0) + dx),
                y: Math.round((child?.y ?? 0) + dy),
                width: childDraft?.width ?? child?.width ?? 0,
                height: childDraft?.height ?? child?.height ?? 0,
              },
            ];
          })
        ),
      }));
    },
    [guideSnapEnabled, snapEnabled, gridSize, elementsAny, elementsById, baseResolution.width, baseResolution.height, updateGuidesThrottled]
  );

  useEffect(() => {
    if (!primaryDragSession) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const active = primaryDragSession;
      const stagePoint = clientToStage(e.clientX, e.clientY);
      if (!stagePoint) return;
      const nextX = active.origin.x + (stagePoint.x - active.startStage.x);
      const nextY = active.origin.y + (stagePoint.y - active.startStage.y);
      handleDragLive(active.id, nextX, nextY, { shiftKey: e.shiftKey });
    };

    const onUp = (e: MouseEvent) => {
      const active = primaryDragSession;
      setPrimaryDragSession(null);
      const draft = draftRects[active.id];
      const stagePoint = clientToStage(e.clientX, e.clientY);
      const fallbackX = active.origin.x + ((stagePoint?.x ?? active.startStage.x) - active.startStage.x);
      const fallbackY = active.origin.y + ((stagePoint?.y ?? active.startStage.y) - active.startStage.y);
      handleDragStop(e, { x: draft?.x ?? fallbackX, y: draft?.y ?? fallbackY }, active.id);
      const duplicateRequested = dragDuplicateRef.current?.sourceId === active.id;
      const duplicateId = dragDuplicateRef.current?.duplicateId;
      dragDuplicateRef.current = null;
      delete dragStartRef.current[active.id];
      if (duplicateRequested && duplicateId) {
        setSelectedIds([duplicateId]);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [clientToStage, draftRects, handleDragLive, primaryDragSession]);

  useEffect(() => {
    if (activeCreationTool !== "pen") return;

    const onMove = (e: MouseEvent) => {
      if (!penDraft) return;
      const point = clientToStage(e.clientX, e.clientY);
      if (!point) return;
      setPenDraft((prev) => (prev ? { ...prev, previewPoint: point } : prev));
    };

    const onUp = (e: MouseEvent) => {
      const session = penPointerSessionRef.current;
      penPointerSessionRef.current = null;
      if (!session) return;
      const point = clientToStage(e.clientX, e.clientY);
      if (!point) return;
      const dx = point.x - session.start.x;
      const dy = point.y - session.start.y;
      const dragDistance = Math.hypot(dx, dy);

      if (penDraft) {
        const first = penDraft.anchors[0];
        if (penDraft.anchors.length >= 2 && Math.hypot(point.x - first.x, point.y - first.y) < 12) {
          const normalized = normalizePathToBounds({
            commands: [...penDraft.commands, { type: "close" }],
          });
          addPathElement(normalized.path, normalized.bounds, "Pen Path");
          setPenDraft(null);
          setActiveCreationTool(null);
          return;
        }
      }

      setPenDraft((prev) => {
        if (!prev) {
          return {
            anchors: [point],
            commands: [{ type: "move", x: point.x, y: point.y }],
          };
        }
        const last = prev.anchors[prev.anchors.length - 1];
        const nextCommands =
          dragDistance > 8
            ? [
                ...prev.commands,
                {
                  type: "curve" as const,
                  x1: last.x + dx / 2,
                  y1: last.y + dy / 2,
                  x2: point.x - dx / 2,
                  y2: point.y - dy / 2,
                  x: point.x,
                  y: point.y,
                },
              ]
            : [...prev.commands, { type: "line" as const, x: point.x, y: point.y }];
        return {
          anchors: [...prev.anchors, point],
          commands: nextCommands,
          previewPoint: point,
        };
      });
    };

    window.addEventListener("mousemove", onMove, { passive: false } as any);
    window.addEventListener("mouseup", onUp, { passive: false } as any);
    return () => {
      window.removeEventListener("mousemove", onMove as any);
      window.removeEventListener("mouseup", onUp as any);
    };
  }, [activeCreationTool, clientToStage, penDraft]);

  // Group drag (selection bounds Rnd)
  const groupDragStartRef = useRef<{
    startX: number;
    startY: number;
    initial: Record<string, { x: number; y: number }>;
  } | null>(null);

  const onGroupDragStart: RndDragCallback = (_e, d) => {
    if (!selectionBounds) return;
    const initial: Record<string, { x: number; y: number }> = {};
    for (const el of selectedEls) {
      initial[el.id] = { x: el.x ?? 0, y: el.y ?? 0 };
    }
    groupDragStartRef.current = { startX: d.x, startY: d.y, initial };
  };

  const onGroupDrag: RndDragCallback = (_e, d) => {
    if (!selectionBounds) return;
    const start = groupDragStartRef.current;
    if (!start) return;

    let gx = d.x;
    let gy = d.y;
    if (shiftDown) {
      const dx = gx - start.startX;
      const dy = gy - start.startY;
      if (Math.abs(dx) >= Math.abs(dy)) {
        gy = start.startY;
      } else {
        gx = start.startX;
      }
    }

    if (guideSnapEnabled) {
      const exclude = new Set<string>(selectedIds);
      const lines = buildSnapLines(baseResolution.width, baseResolution.height, elementsAny, exclude);

      const rect = {
        ...selectionBounds,
        x: gx,
        y: gy,
        l: gx,
        t: gy,
        r: gx + selectionBounds.w,
        b: gy + selectionBounds.h,
        cx: gx + selectionBounds.w / 2,
        cy: gy + selectionBounds.h / 2,
        w: selectionBounds.w,
        h: selectionBounds.h,
      };

      const snap = snapRectToLines(rect, lines, { enabled: true, threshold: 6 });
      gx += snap.dx;
      gy += snap.dy;
      const spacing = computeEqualSpacingGuides(
        {
          ...rect,
          x: gx,
          y: gy,
          l: gx,
          r: gx + rect.w,
          t: gy,
          b: gy + rect.h,
          cx: gx + rect.w / 2,
          cy: gy + rect.h / 2,
        },
        elementsAny.filter((candidate) => !selectedIds.includes(candidate.id)),
        6
      );
      updateGuidesThrottled({ v: snap.guides.v, h: snap.guides.h, spacing });
    } else {
      clearGuides();
    }

    if (snapEnabled) {
      gx = roundToGrid(gx, gridSize);
      gy = roundToGrid(gy, gridSize);
    }

    // Update drafts for all selected items
    const dx = gx - start.startX;
    const dy = gy - start.startY;

    const patches: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of selectedIds) {
      const init = start.initial[id];
      const el = elementsAny.find((e) => e.id === id);
      if (init && el) {
        patches[id] = {
          x: Math.round(init.x + dx),
          y: Math.round(init.y + dy),
          width: el.width ?? 0,
          height: el.height ?? 0,
        };
      }
    }
    setDraftRects((prev) => ({ ...prev, ...patches }));
  };

  const onGroupDragStop: RndDragCallback = (_e, d) => {
    const start = groupDragStartRef.current;
    groupDragStartRef.current = null;

    if (!start || !selectionBounds) {
      clearGuides();
      return;
    }

    const exclude = new Set<string>(selectedIds);
    const lines = buildSnapLines(baseResolution.width, baseResolution.height, elementsAny, exclude);

    const rect = {
      ...selectionBounds,
      x: d.x,
      y: d.y,
      l: d.x,
      t: d.y,
      r: d.x + selectionBounds.w,
      b: d.y + selectionBounds.h,
      cx: d.x + selectionBounds.w / 2,
      cy: d.y + selectionBounds.h / 2,
      w: selectionBounds.w,
      h: selectionBounds.h,
    };

    const snap = snapRectToLines(rect, lines, { enabled: guideSnapEnabled, threshold: 6 });

    let targetX = d.x + snap.dx;
    let targetY = d.y + snap.dy;

    if (snapEnabled) {
      targetX = roundToGrid(Math.round(targetX), gridSize);
      targetY = roundToGrid(Math.round(targetY), gridSize);
    } else {
      targetX = Math.round(targetX);
      targetY = Math.round(targetY);
    }

    const dx = targetX - start.startX;
    const dy = targetY - start.startY;

    setConfig((prev) => {
      const sel = new Set(selectedIds);
      const next = prev.elements.map((raw) => {
        if (!sel.has(raw.id)) return raw;
        const base = start.initial[raw.id] ?? { x: (raw as any).x ?? 0, y: (raw as any).y ?? 0 };
        return { ...(raw as any), x: Math.round(base.x + dx), y: Math.round(base.y + dy) };
      });
      return { ...prev, elements: next };
    });

    setDraftRects((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        delete next[id];
      }
      return next;
    });

    clearGuides();
  };

  function zoomIn() {
    setZoomAnimating(true);
    setZoomMode("manual");
    setManualScale((s) => clamp(s + 0.1, 0.1, 2));
  }

  function reorderLayerRelative(id: string, targetId: string, placement: "before" | "after") {
    if (id === targetId) return;

    setConfig((prev) => {
      const picked = prev.elements.find((el) => el.id === id);
      const target = prev.elements.find((el) => el.id === targetId);
      if (!picked || !target) return prev;

      const maskFor = (elementId: string) =>
        prev.elements.find(
          (el) => el.type === "mask" && Array.isArray((el as any).childIds) && (el as any).childIds.includes(elementId)
        ) as any | undefined;
      if (maskFor(id) || maskFor(targetId)) return prev;

      const groupFor = (elementId: string) =>
        prev.elements.find(
          (el) => (el.type === "group" || el.type === "frame") && Array.isArray((el as any).childIds) && (el as any).childIds.includes(elementId)
        ) as any | undefined;

      const parentGroup = groupFor(id);
      const targetParentGroup = groupFor(targetId);
      const pickedParentId = parentGroup?.id ?? null;
      const targetParentId = targetParentGroup?.id ?? null;
      if (pickedParentId !== targetParentId) return prev;

      if (parentGroup) {
        const childIds = [...(parentGroup.childIds || [])];
        const fromIndex = childIds.indexOf(id);
        const targetIndex = childIds.indexOf(targetId);
        if (fromIndex === -1 || targetIndex === -1) return prev;

        childIds.splice(fromIndex, 1);
        const insertIndex = placement === "before"
          ? (fromIndex < targetIndex ? targetIndex - 1 : targetIndex)
          : (fromIndex < targetIndex ? targetIndex : targetIndex + 1);
        childIds.splice(Math.max(0, Math.min(childIds.length, insertIndex)), 0, id);

        return {
          ...prev,
          elements: prev.elements.map((item) =>
            item.id === parentGroup.id ? { ...(item as any), childIds } : item
          ),
        };
      }

      const next = prev.elements.slice();
      const fromIndex = next.findIndex((el) => el.id === id);
      const targetIndex = next.findIndex((el) => el.id === targetId);
      if (fromIndex === -1 || targetIndex === -1) return prev;

      const [moved] = next.splice(fromIndex, 1);
      const adjustedTargetIndex = next.findIndex((el) => el.id === targetId);
      const insertIndex = placement === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
      next.splice(Math.max(0, Math.min(next.length, insertIndex)), 0, moved);
      return { ...prev, elements: next };
    });
  }
  function zoomOut() {
    setZoomAnimating(true);
    setZoomMode("manual");
    setManualScale((s) => clamp(s - 0.1, 0.1, 2));
  }
  function zoom100() {
    setZoomAnimating(true);
    setZoomMode("manual");
    setManualScale(1);
  }
  function zoomFit() {
    setZoomAnimating(true);
    setZoomMode("fit");
  }

  function zoomToSelection() {
    if (!selectionBounds) return;
    const pad = 80;
    const fit = Math.min(
      Math.max(0.1, (canvasBox.w - pad * 2) / Math.max(1, selectionBounds.w)),
      Math.max(0.1, (canvasBox.h - pad * 2) / Math.max(1, selectionBounds.h))
    );
    setZoomAnimating(true);
    setZoomMode("manual");
    setManualScale(clamp(fit, 0.1, 2));
    const cx = baseResolution.width / 2;
    const cy = baseResolution.height / 2;
    setPanPx({
      x: (cx - selectionBounds.cx) * fit,
      y: (cy - selectionBounds.cy) * fit,
    });
  }

  const onSelectElement = useCallback((id: string, additive: boolean) => {
    setSelectedIds((prev) => {
      if (!additive) return [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  const cycleSelectAtPoint = useCallback((clientX: number, clientY: number, additive: boolean, includeChildren = false) => {
    const stagePoint = clientToStage(clientX, clientY);
    if (!stagePoint) return null;

    const hits = config.elements
      .filter((el) => includeChildren || !allChildIds.has(el.id))
      .filter((el) => el.visible !== false && el.locked !== true)
      .filter((el) => pointInRect(stagePoint.x, stagePoint.y, rectFromEl(el as AnyEl)))
      .map((el) => el.id)
      .reverse();

    if (!hits.length) {
      clickCycleRef.current = null;
      return null;
    }

    const prev = clickCycleRef.current;
    const samePoint =
      prev &&
      Math.abs(prev.x - stagePoint.x) < 4 &&
      Math.abs(prev.y - stagePoint.y) < 4 &&
      prev.ids.join(",") === hits.join(",");

    const index = samePoint ? (prev.index + 1) % hits.length : 0;
    clickCycleRef.current = { x: stagePoint.x, y: stagePoint.y, ids: hits, index };
    const nextId = hits[index];
    onSelectElement(nextId, additive);
    return nextId;
  }, [allChildIds, clientToStage, config.elements, onSelectElement]);

  const openPicker = useCallback((kind: AssetKind, onPick: (url: string) => void) => {
    setAssetPicker({
      open: true,
      kind,
      scope: "overlays",
      title: kind === "images" ? "Pick an image" : "Pick a video",
      onPick,
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full overflow-hidden bg-[#0b0b0c] text-slate-200">
      {/* Asset Picker Modal */}
      <FontLoader fonts={usedFonts} />
      {assetPicker.open && (
        <AssetPickerModal
          title={assetPicker.title}
          scope={assetPicker.scope}
          kind={assetPicker.kind}
          onClose={() => setAssetPicker((s) => ({ ...s, open: false }))}
          onPick={(url) => {
            assetPicker.onPick(url);
            setAssetPicker((s) => ({ ...s, open: false }));
          }}
        />
      )}

      {/* (legacy SaveTemplateModal removed) */}



      {/* LEFT SIDEBAR: Creation & Layers */}
      <div className="z-10 flex w-60 flex-none flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#111113]">
        {/* Header */}
        <div className="space-y-2 border-b border-[rgba(255,255,255,0.08)] p-3">
          <input
            className="h-7 w-full rounded-md border border-transparent bg-transparent px-2 text-[14px] leading-[1.4] font-semibold text-slate-100 placeholder-slate-500 transition-colors hover:border-[rgba(255,255,255,0.08)] focus:border-indigo-500 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled Overlay"
          />
          <div className="flex gap-2 pl-1 font-mono text-[11px] leading-[1.4] text-slate-500">
            <span>{baseResolution.width} x {baseResolution.height}</span>
            <span className="text-slate-700">|</span>
            <span className="truncate max-w-[120px]" title={slug}>/o/{slug}</span>
          </div>
        </div>

        {/* Creation Toolbar */}
        <CreationToolbar
          onAddText={addText}
          onAddBox={addBox}
          onAddShape={addShape}
          onTogglePenTool={() => {
            setActiveCreationTool((prev) => prev === "pen" ? null : "pen");
            setPenDraft(null);
          }}
          penToolActive={activeCreationTool === "pen"}
          onAddImage={addImage}
          onAddVideo={addVideo}
          onAddFrame={addFrame}
          onAddProgress={(t) => t === 'bar' ? addProgressBar() : addProgressRing()}
          onAddLowerThird={addLowerThird}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onCreateComponent={createComponentSelected}
          canGroup={canGroup}
          canUngroup={canUngroup}
          canCreateComponent={selectedIds.length > 0}
          onSave={handleSave}
          saving={saving}
          saveOk={saveOk}
          saveError={saveError}
          onTestEvent={async () => {
            try {
              const payload = {
                type: "test.follow",
                message: "Hello from Scraplet!",
                actor: { displayName: "Sardwyn" },
                count: Math.floor(Math.random() * 100).toString(),
                action: "Follow"
              };

              const res = await fetch(`/dashboard/overlays/${initialOverlay.id}/test-event`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error("Test Event Server Error:", res.status, err);
                alert(`Failed: ${err.error || res.statusText}`);
                return;
              }
              console.log("Test Event Sent");
            } catch (e) {
              console.error("Test Event Network Error", e);
              alert("Failed to send test event (Network)");
            }
          }}
        />

        {/* Sidebar Tabs */}
        <div className="mt-2 flex border-b border-t border-[rgba(255,255,255,0.08)] bg-[#111113]">
          <button
            onClick={() => setLeftTab("layers")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 text-[11px] leading-[1.4] font-semibold uppercase tracking-[0.08em] transition-all ${leftTab === "layers" ? "border-b-2 border-indigo-500 bg-[rgba(255,255,255,0.05)] text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg {...TOOL_ICON_PROPS}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            <span>Layers</span>
          </button>
          <button
            onClick={() => setLeftTab("components")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 text-[11px] leading-[1.4] font-semibold uppercase tracking-[0.08em] transition-all ${leftTab === "components" ? "border-b-2 border-indigo-500 bg-[rgba(255,255,255,0.05)] text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg {...TOOL_ICON_PROPS}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </button>
          <button
            title="Panels"
            onClick={() => setLeftTab("panels")}
            className={`flex-1 flex items-center justify-center px-2 py-2.5 transition-all ${leftTab === "panels" ? "border-b-2 border-indigo-500 bg-[rgba(255,255,255,0.05)] text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg {...TOOL_ICON_PROPS}><path d="M4 4h16v6H4zM4 14h10v6H4zM16 14h4v6h-4z" /></svg>
          </button>
          <button
            title="Widgets"
            onClick={() => setLeftTab("widgets")}
            className={`flex-1 flex items-center justify-center px-2 py-2.5 transition-all ${leftTab === "widgets" ? "border-b-2 border-indigo-500 bg-[rgba(255,255,255,0.05)] text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg {...TOOL_ICON_PROPS}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="17" cy="8" r="2"/></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {leftTab === "layers" && (
            <div className="flex-1 min-h-0 flex flex-col pt-1">
              <LayersPanel
                elements={config.elements}
                layersTopToBottom={config.elements.slice().reverse()}
                selectedIds={selectedIds}
                onSelect={onSelectElement}
                onToggleVisible={(id) => updateElement(id, { visible: !(elementsById[id]?.visible !== false) })}
                onToggleLock={(id) => updateElement(id, { locked: !(elementsById[id]?.locked === true) })}
                onMask={handleMaskElement}
                onReleaseMask={handleReleaseMask}
                onMoveUp={(id) => moveLayerBy(id, 1)}
                onMoveDown={(id) => moveLayerBy(id, -1)}
                onBringToFront={bringLayerToFront}
                onSendToBack={sendLayerToBack}
                onReorderLayer={reorderLayerRelative}
                renamingId={renamingId}
                renameDraft={renameDraft}
                onBeginRename={(id) => {
                  const el = elementsById[id] as AnyEl | undefined;
                  if (el) beginRename(el);
                }}
                onRenameDraftChange={setRenameDraft}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
              />
            </div>
          )}
          {leftTab === "components" && (
            <div className="flex-1 min-h-0 flex flex-col pt-1">
              <ComponentLibraryPanel
                components={overlayComponents}
                onEdit={enterIsolationMode}
                onDelete={deleteComponent}
                onCreateVariant={createVariantFromComponent}
                onInsert={(comp) => {
                  const instId = genId("instance");

                  // Approx bounds calculation
                  let minX = 0, minY = 0, maxX = 200, maxY = 100;
                  if (comp.elements && comp.elements.length > 0) {
                    minX = Math.min(...comp.elements.map((e: any) => e.x));
                    minY = Math.min(...comp.elements.map((e: any) => e.y));
                    maxX = Math.max(...comp.elements.map((e: any) => e.x + e.width));
                    maxY = Math.max(...comp.elements.map((e: any) => e.y + e.height));
                  }

                  const instanceEl: AnyEl = {
                    id: instId,
                    type: "componentInstance",
                    name: comp.name || "Component",
                    x: 50,
                    y: 50,
                    width: maxX - minX || 200,
                    height: maxY - minY || 100,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    componentId: comp.id,
                    propOverrides: {}
                  } as any;
                  setConfig(prev => ({ ...prev, elements: [...prev.elements, instanceEl] }));
                  setSelectedIds([instId]);
                }}
              />
            </div>
          )}
          {leftTab === "panels" && (
            <div className="flex-1 min-h-0 flex flex-col pt-1">
              <PanelGeneratorPanel
                profile={panelStyleProfile}
                seedBase={initialOverlay.id != null ? String(initialOverlay.id) : "panel"}
              />
            </div>
          )}
          {leftTab === "widgets" && (
            <div className="flex-1 min-h-0 flex flex-col pt-1 px-2 gap-2 overflow-y-auto">
              <p className="text-[11px] text-slate-500 px-1 pt-2">
                Drag or click a widget to add it to the canvas. Widgets connect live data sources to your overlay.
              </p>
              {/* Category filter */}
              {(() => {
                const categories = [...new Set(getAllWidgets().map(w => w.widgetManifest.category))];
                return categories.length > 1 ? (
                  <div className="flex gap-1 px-1 flex-wrap">
                    {categories.map(cat => (
                      <span key={cat} className="text-[10px] text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded-full border border-indigo-500/20 capitalize">{cat}</span>
                    ))}
                  </div>
                ) : null;
              })()}
              {getAllWidgets().map((widgetDef) => {
                const m = widgetDef.widgetManifest;
                return (
                  <button
                    key={m.widgetId}
                    onClick={() => {
                      const wId = genId("widget");
                      const widgetEl: AnyEl = {
                        id: wId,
                        type: "widget" as any,
                        name: m.displayName,
                        x: 50,
                        y: 50,
                        width: m.invisible ? 0 : 200,
                        height: m.invisible ? 0 : 100,
                        visible: !m.invisible,
                        locked: false,
                        opacity: 1,
                        widgetId: m.widgetId,
                        propOverrides: { ...m.defaultProps },
                        liveDataSource: {
                          sseEventType: m.dataContract?.sseEventType ?? null,
                          beaconEndpoint: m.beaconEndpoint ?? undefined,
                        },
                      } as any;
                      setConfig(prev => ({ ...prev, elements: [...prev.elements, widgetEl] }));
                      setSelectedIds([wId]);
                    }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.07)] hover:border-indigo-500/50 hover:bg-[#1e1e2a] transition-all text-left"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-md bg-indigo-900/40 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-200 flex items-center gap-2">
                        {m.displayName}
                        {m.invisible && (
                          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">invisible</span>
                        )}
                        <span className="text-[10px] text-indigo-400 bg-indigo-900/30 px-1.5 py-0.5 rounded ml-auto">{m.category}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{m.description}</div>
                      {m.dataContract?.sseEventType && (
                        <div className="text-[10px] text-emerald-500/70 mt-1">● {m.dataContract.sseEventType}</div>
                      )}
                    </div>
                  </button>
                );
              })}
              {getAllWidgets().length === 0 && (
                <p className="text-[11px] text-slate-600 px-1 text-center mt-4">No widgets registered yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer / Shortcuts */}
        <div className="flex justify-between border-t border-[rgba(255,255,255,0.08)] p-2 text-[11px] leading-[1.4] text-slate-600">
          <span>Ctrl+D Duplicate</span>
          <span>? Shortcuts</span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0 flex min-w-0">
      {/* CENTER: Canvas */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-[#0b0b0c]" onMouseDown={() => { /* clear selection if bg click? handled in canvas */ }}>

        {/* Top Data Bar / Canvas Settings */}
        <div className="z-10 flex h-8 items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[#111113] px-4">
          <div className="flex items-center gap-4">
            {/* Grid / Snap Controls */}
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] leading-[1.4] text-slate-400 hover:text-slate-200">
                <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500" />
                <span>Snap</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] leading-[1.4] text-slate-400 hover:text-slate-200">
                <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500" />
                <span>Grid</span>
              </label>
              <select
                value={gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className={`${uiClasses.field} pr-6 text-[12px] disabled:opacity-50`}
                disabled={!snapEnabled}
              >
                <option value={8}>8px</option>
                <option value={16}>16px</option>
                <option value={32}>32px</option>
              </select>
            </div>

            <div className="h-4 w-px bg-[rgba(255,255,255,0.08)]" />

            {/* Alignment Tools */}
            <div className="flex items-center gap-1">
              <button onClick={() => alignSelection("left")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Left">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="6" y1="5" x2="6" y2="19" /><line x1="10" y1="7" x2="10" y2="17" /><line x1="14" y1="9" x2="14" y2="15" /></svg>
                </span>
              </button>
              <button onClick={() => alignSelection("hcenter")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Center">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="12" y1="5" x2="12" y2="19" /><line x1="8" y1="7" x2="8" y2="17" /><line x1="16" y1="7" x2="16" y2="17" /></svg>
                </span>
              </button>
              <button onClick={() => alignSelection("right")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Right">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="18" y1="5" x2="18" y2="19" /><line x1="14" y1="7" x2="14" y2="17" /><line x1="10" y1="9" x2="10" y2="15" /></svg>
                </span>
              </button>
              <button onClick={() => alignSelection("top")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Top">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="5" y1="6" x2="19" y2="6" /><line x1="7" y1="10" x2="17" y2="10" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                </span>
              </button>
              <button onClick={() => alignSelection("vcenter")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Middle">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="5" y1="12" x2="19" y2="12" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="16" x2="17" y2="16" /></svg>
                </span>
              </button>
              <button onClick={() => alignSelection("bottom")} disabled={selectedIds.length < 2} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Align Bottom">
                <span className="relative -top-px flex items-center justify-center">
                  <svg {...TOOL_ICON_PROPS}><line x1="5" y1="18" x2="19" y2="18" /><line x1="7" y1="14" x2="17" y2="14" /><line x1="9" y1="10" x2="15" y2="10" /></svg>
                </span>
              </button>
            </div>

            <div className="h-4 w-px bg-[rgba(255,255,255,0.08)]" />

            <div className="flex items-center gap-1">
              <button onClick={() => createBooleanFromSelection("union")} disabled={!canBooleanSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Union Selection">
                <svg {...TOOL_ICON_PROPS}><path d="M8 8h8v8H8z" /><path d="M4 4h8v8H4z" /></svg>
              </button>
              <button onClick={() => createBooleanFromSelection("subtract")} disabled={!canBooleanSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Subtract Selection">
                <svg {...TOOL_ICON_PROPS}><rect x="4" y="4" width="14" height="14" /><path d="M10 10h10v10H10z" fill="#0b0b0c" stroke="none" /></svg>
              </button>
              <button onClick={() => createBooleanFromSelection("intersect")} disabled={!canBooleanSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Intersect Selection">
                <svg {...TOOL_ICON_PROPS}><path d="M7 12a5 5 0 1 1 10 0a5 5 0 1 1-10 0z" /></svg>
              </button>
              <button onClick={() => createBooleanFromSelection("exclude")} disabled={!canBooleanSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Exclude Selection">
                <svg {...TOOL_ICON_PROPS}><path d="M9 12a5 5 0 1 1 6 4.58" /><path d="M15 12a5 5 0 1 1-6-4.58" /></svg>
              </button>
              <button onClick={() => createOffsetPath(-8)} disabled={!canOffsetSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Create Inset Path">
                <svg {...TOOL_ICON_PROPS}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
              </button>
              <button onClick={() => createOffsetPath(8)} disabled={!canOffsetSelection} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Create Outset Path">
                <svg {...TOOL_ICON_PROPS}><rect x="7" y="7" width="10" height="10" rx="1" /><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              </button>
              <button onClick={convertSelectedToPath} disabled={!canConvertSelectionToPath} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Convert Selection to Path">
                <svg {...TOOL_ICON_PROPS}><path d="M5 6h8" /><path d="M5 10h12" /><path d="M5 14h9" /><path d="M16 5l3 3-6 6-4 1 1-4Z" /></svg>
              </button>
              <button onClick={flattenBooleanSelected} disabled={!canFlattenBoolean} className={`${uiClasses.iconButton} disabled:opacity-20`} title="Flatten Boolean to Path">
                <svg {...TOOL_ICON_PROPS}><path d="M5 6h14" /><path d="M5 10h14" /><path d="M5 14h14" /><path d="M5 18h14" /></svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={zoomOut} className={uiClasses.iconButton} title={formatShortcutTooltip("zoom-canvas", "Zoom Out")}>－</button>
            <span className="w-10 text-center font-mono text-[12px] leading-[1.4] text-slate-300">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} className={uiClasses.iconButton} title={formatShortcutTooltip("zoom-canvas", "Zoom In")}>＋</button>
            <button onClick={zoomFit} className={uiClasses.button} title={formatShortcutTooltip("zoom-fit")}>Fit</button>
          </div>
        </div>
        {activeCreationTool === "pen" && (
          <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
            <div className="min-w-0 flex-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">
              Pen mode:
              <span className="ml-1 text-slate-200">{penDraft?.anchors.length ? `${penDraft.anchors.length} point${penDraft.anchors.length === 1 ? "" : "s"}` : "click to start a path"}</span>
            </div>
            <button onClick={() => commitPenDraft(false)} disabled={!penDraft || penDraft.anchors.length < 2} className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}>
              Finish
            </button>
            <button onClick={() => commitPenDraft(true)} disabled={!penDraft || penDraft.anchors.length < 2} className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}>
              Close
            </button>
            <button onClick={() => { setPenDraft(null); setActiveCreationTool(null); }} className={`${uiClasses.buttonGhost} h-7`}>
              Cancel
            </button>
          </div>
        )}
        {/* Canvas Inner */}
        <div
          ref={canvasOuterRef}
          className="flex-1 relative overflow-hidden custom-scrollbar"
          style={{
            cursor: isPanning ? "grabbing" : spaceDown ? "grab" : marquee.active ? "crosshair" : "default"
          }}
          onMouseDown={(e) => {
            const isMiddle = e.button === 1;
            const isSpaceLeft = spaceDown && e.button === 0;

            if (isMiddle || isSpaceLeft) {
              e.preventDefault();
              beginPan(e.clientX, e.clientY);
              return;
            }

            if (e.button === 0 && e.target === e.currentTarget) {
              setSelectedIds([]);
              clearGuides();
            }
          }}
          onMouseUp={(e) => {
            if (isPanning) {
              e.preventDefault();
              endPan();
            }
          }}
        >
          {editorStatus && (
            <div className="absolute right-4 top-4 z-[70] max-w-[360px] rounded-md border border-indigo-400/15 bg-[#161618]/95 px-3 py-2 shadow-xl shadow-black/35 backdrop-blur-sm">
              <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">{editorStatus.title}</div>
              {editorStatus.detail && (
                <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">{editorStatus.detail}</div>
              )}
            </div>
          )}
          {editingMasterId && (
            <div className="absolute left-1/2 top-4 z-[50] flex -translate-x-1/2 items-center gap-3 rounded-md border border-indigo-400/20 bg-[#161618] px-4 py-2 text-white shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 text-indigo-200">
                <span className="relative -top-px"><svg {...TOOL_ICON_PROPS}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
                <span className="text-[11px] leading-[1.4] font-semibold uppercase tracking-[0.08em]">Isolation Mode</span>
              </div>
              <div className="w-px h-3 bg-indigo-400/50" />
              <div className="max-w-[200px] truncate text-[13px] leading-[1.4] font-semibold">{name}</div>
              <div className="w-px h-3 bg-indigo-400/50" />
              <button
                onClick={exitIsolationMode}
                className={uiClasses.buttonGhost}
              >
                Exit
              </button>
            </div>
          )}
          {/* Stage viewport */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: baseResolution.width * scale,
              height: baseResolution.height * scale,
              transform: `translate(-50%, -50%) translate(${panPx.x}px, ${panPx.y}px)`,
              transformOrigin: "center",
              transition: zoomAnimating ? "transform 160ms ease-out, width 160ms ease-out, height 160ms ease-out" : undefined,
            }}
            onMouseDown={(e) => {
              const isMiddle = (e as any).button === 1;
              const isSpaceLeft = spaceDown && (e as any).button === 0;
              if (isMiddle || isSpaceLeft) {
                e.preventDefault();
                beginPan((e as any).clientX, (e as any).clientY);
              }
            }}
          >
            <div
              className="relative bg-[#0f1012]"
              style={{
                width: baseResolution.width,
                height: baseResolution.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                transition: zoomAnimating ? "transform 160ms ease-out" : undefined,
              }}
              onMouseDown={(e) => {
                if (spaceDown || (e as any).button === 1) return;
                if ((e as any).button !== 0) return;

                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  clearGuides();

                  const p = clientToStage((e as any).clientX, (e as any).clientY);
                  if (!p) return;

                  if (activeCreationTool === "pen") {
                    penPointerSessionRef.current = { start: p };
                    if (!penDraft) {
                      setPenDraft({
                        anchors: [p],
                        commands: [{ type: "move", x: p.x, y: p.y }],
                        previewPoint: p,
                      });
                    } else {
                      setPenDraft((prev) => (prev ? { ...prev, previewPoint: p } : prev));
                    }
                    return;
                  }

                  marqueeStartSelectedRef.current = selectedIds.slice();
                  setMarquee({
                    active: true,
                    shift: (e as any).shiftKey === true,
                    start: p,
                    cur: p,
                  });

                  if (!(e as any).shiftKey) setSelectedIds([]);
                }
              }}
            >
              {/* Grid */}
              {showGrid && (
                <div
                  className="absolute inset-0 opacity-[0.015] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                  }}
                />
              )}

              {/* Safe area */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-8 border border-white/10 rounded-sm" />
              </div>

              {/* Guides */}
              {guides.show && (
                <div className="absolute inset-0 pointer-events-none">
                  {(guides.v || []).map((g, idx) => (
                    <div
                      key={`gv_${idx}_${g.kind}_${g.pos}`}
                      className={"absolute top-0 bottom-0 w-px " + (g.kind === "stage" ? "bg-amber-400/80" : "bg-fuchsia-400/80")}
                      style={{ left: g.pos }}
                    />
                  ))}
                  {(guides.h || []).map((g, idx) => (
                    <div
                      key={`gh_${idx}_${g.kind}_${g.pos}`}
                      className={"absolute left-0 right-0 h-px " + (g.kind === "stage" ? "bg-amber-400/80" : "bg-fuchsia-400/80")}
                      style={{ top: g.pos }}
                    />
                  ))}
                  {(guides.spacing || []).map((g, idx) =>
                    g.axis === "x" ? (
                      <React.Fragment key={`gsx_${idx}_${g.start}_${g.end}_${g.y}`}>
                        <div
                          className="absolute h-px bg-fuchsia-300/90"
                          style={{ left: g.start, top: g.y, width: Math.max(0, g.end - g.start) }}
                        />
                        <div
                          className="absolute w-px h-2 bg-fuchsia-300/90"
                          style={{ left: g.start, top: g.y - 3 }}
                        />
                        <div
                          className="absolute w-px h-2 bg-fuchsia-300/90"
                          style={{ left: g.end, top: g.y - 3 }}
                        />
                        <div
                          className="absolute -translate-x-1/2 -translate-y-full rounded-md border border-fuchsia-200/15 bg-[#161618] px-2 py-1 font-mono text-[11px] leading-[1.4] tracking-[-0.02em] text-fuchsia-100 shadow-sm shadow-black/20"
                          style={{ left: (g.start + g.end) / 2, top: g.y - 6 }}
                        >
                          {g.label}
                        </div>
                      </React.Fragment>
                    ) : (
                      <React.Fragment key={`gsy_${idx}_${g.start}_${g.end}_${g.x}`}>
                        <div
                          className="absolute w-px bg-fuchsia-300/90"
                          style={{ left: g.x, top: g.start, height: Math.max(0, g.end - g.start) }}
                        />
                        <div
                          className="absolute h-px w-2 bg-fuchsia-300/90"
                          style={{ left: g.x - 3, top: g.start }}
                        />
                        <div
                          className="absolute h-px w-2 bg-fuchsia-300/90"
                          style={{ left: g.x - 3, top: g.end }}
                        />
                        <div
                          className="absolute -translate-y-1/2 rounded-md border border-fuchsia-200/15 bg-[#161618] px-2 py-1 font-mono text-[11px] leading-[1.4] tracking-[-0.02em] text-fuchsia-100 shadow-sm shadow-black/20"
                          style={{ left: g.x + 8, top: (g.start + g.end) / 2 }}
                        >
                          {g.label}
                        </div>
                      </React.Fragment>
                    )
                  )}
                </div>
              )}

              {/* Marquee */}
              {activeCreationTool === "pen" && penDraft && (
                <svg className="absolute inset-0 pointer-events-none overflow-visible">
                  <path
                    d={svgPathFromCommands({
                      commands:
                        penDraft.previewPoint && penDraft.anchors.length
                          ? [...penDraft.commands, { type: "line", x: penDraft.previewPoint.x, y: penDraft.previewPoint.y } as PathCommand]
                          : penDraft.commands,
                    })}
                    fill="none"
                    stroke="rgba(99,102,241,0.95)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {penDraft.anchors.map((anchor, index) => (
                    <circle
                      key={`pen-anchor-${index}`}
                      cx={anchor.x}
                      cy={anchor.y}
                      r={4}
                      fill={index === 0 ? "rgba(99,102,241,0.95)" : "#fff"}
                      stroke="rgba(15,23,42,0.9)"
                      strokeWidth={1.5}
                    />
                  ))}
                </svg>
              )}

              {/* Marquee */}
              {marquee.active && (() => {
                const r = getMarqueeRect();
                if (!r) return null;
                return (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute border bg-transparent"
                      style={{ left: r.l, top: r.t, width: r.w, height: r.h, borderColor: ACCENT_TINT, background: ACCENT_FILL_SOFT }}
                    />
                  </div>
                );
              })()}

              {/* Resize Dimensions Overlay */}
              {resizeStatus && (
                <div
                  className="absolute z-50 pointer-events-none rounded-md border bg-[#161618] px-2 py-1 font-mono text-[11px] leading-[1.4] tracking-[-0.02em] shadow-sm shadow-black/20"
                  style={{
                    borderColor: ACCENT_TINT_SOFT,
                    color: "#e0e7ff",
                    left: (resizeStatus.x ?? 0) + (resizeStatus.width ?? 0) / 2,
                    top: (resizeStatus.y ?? 0) + (resizeStatus.height ?? 0) + 10,
                    transform: "translateX(-50%)"
                  }}
                >
                  {Math.round(resizeStatus.width)} × {Math.round(resizeStatus.height)}
                </div>
              )}

              {/* Group bounding box */}
              {selectionBounds && selectedIds.length >= 2 && !selectionHasLocked && (
                <Rnd
                  key={"__group__"}
                  size={{ width: selectionBounds.w, height: selectionBounds.h }}
                  position={{ x: selectionBounds.x, y: selectionBounds.y }}
                  bounds="parent"
                  scale={scale}
                  disableDragging={isPanning || marquee.active}
                  enableResizing={false}
                  onDragStart={onGroupDragStart}
                  onDrag={onGroupDrag}
                  onDragStop={onGroupDragStop}
                  className="cursor-move border border-dashed"
                  style={{ borderColor: ACCENT_TINT }}
                >
                  <div className="w-full h-full bg-transparent">
                    <div className="absolute -top-6 left-0 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 py-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-200 shadow-sm shadow-black/20">
                      Group ({selectedIds.length})
                    </div>
                  </div>
                </Rnd>
              )}

              {/* Empty State Hint */}
              {config.elements.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-[rgba(255,255,255,0.12)]">
                    <span className="text-3xl text-slate-500">+</span>
                  </div>
                  <p className="text-[13px] leading-[1.4] font-medium text-slate-400">Canvas is empty</p>
                  <p className="mt-1 text-[12px] leading-[1.4] text-slate-600">Select a tool to add content</p>
                </div>
              )}

              {previewElements.map((raw) => {
                const el = raw as AnyEl;
                if (allChildIds.has(el.id) && !selectedIds.includes(el.id)) return null;

                const isLocked = el.locked === true;
                const isSelected = selectedIds.includes(el.id);
                const isPrimary = selectedIds[0] === el.id;
                const animationPhase = previewAnimationPhases[el.id]?.phase;
                if (animationPhase === "hidden" && !isSelected) return null;

                // Draft state
                const draft = draftRects[el.id];
                const x = draft?.x ?? el.x;
                const y = draft?.y ?? el.y;
                const w = draft?.width ?? el.width;
                const h = draft?.height ?? el.height;
                const rotationDeg = draftRotationDegs[el.id] ?? Number(el.rotationDeg ?? 0);
                const draftRadius = draftRadiusValues[el.id];
                const draftPatch = draftElementPatches[el.id];
                const renderedEl = ({
                  ...el,
                  ...(draft ? draft : {}),
                  ...(draftRotationDegs[el.id] !== undefined ? { rotationDeg: draftRotationDegs[el.id] } : {}),
                  ...(draftRadius !== undefined ? getRadiusPatch(el, draftRadius) : {}),
                  ...(draftPatch ? draftPatch : {}),
                } as AnyEl);
                const editablePath = renderedEl.type === "path" ? elementToOverlayPath(renderedEl as any) : null;
                const pathAnchors = editablePath ? getPathAnchors(editablePath) : [];
                const pathHandles = editablePath ? getPathHandles(editablePath) : [];
                const radiusValue = clamp(
                  draftRadius ?? getElementRadiusValue(renderedEl),
                  0,
                  Math.min(Math.max(1, w), Math.max(1, h)) / 2
                );
                const showTransformOverlay = isPrimary && !isLocked && !isPanning && !marquee.active && selectedIds.length === 1;
                const forcePlainWrapper =
                  (renderedEl.type === "image" || renderedEl.type === "video") &&
                  ((renderedEl as any).blendMode ?? "normal") !== "normal";
                const suppressLayerPointerEvents = activeCreationTool === "pen";

                // Figma-style high-contrast selection border
                const selectionStyle = isPrimary
                  ? {}
                  : isSelected
                    ? { boxShadow: `0 0 0 1px ${ACCENT_TINT_SOFT}` }
                    : {};

                const contentNode = (
                  <>
                    <ElementRenderer
                      element={renderedEl as any}
                      layout="fill"
                      elementsById={previewElementsById}
                      overlayComponents={overlayComponents}
                      animationPhase={animationPhase}
                      animationPhases={previewAnimationPhases}
                      data={renderData}
                      visited={new Set()}
                    />

                    {isPrimary && !resizeStatus && (
                      <div className="absolute -top-6 left-0 rounded-md border bg-[#161618] px-2 py-1 text-[11px] leading-[1.4] tracking-[-0.02em] font-medium shadow-sm shadow-black/20" style={{ borderColor: ACCENT_TINT_SOFT, color: "#e0e7ff" }}>
                        {el.type === "mask" ? "Mask Group" : el.name || defaultElementLabel(el)}
                        {isLocked ? " (Locked)" : ""}
                      </div>
                    )}
                    {showTransformOverlay && (
                      <div className="absolute inset-0 overflow-visible pointer-events-none">
                        <div
                          className="absolute inset-0"
                          style={{ transform: `rotate(${rotationDeg}deg)`, transformOrigin: "center center" }}
                        >
                          <div
                            className="absolute inset-0 rounded-[2px] border shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
                            style={{
                              borderColor: ACCENT_TINT,
                              borderRadius: supportsRadiusHandle(renderedEl) ? radiusValue : 2,
                            }}
                          />
                          {([
                            ["nw", 0, 0],
                            ["n", (w ?? 0) / 2, 0],
                            ["ne", w ?? 0, 0],
                            ["e", w ?? 0, (h ?? 0) / 2],
                            ["se", w ?? 0, h ?? 0],
                            ["s", (w ?? 0) / 2, h ?? 0],
                            ["sw", 0, h ?? 0],
                            ["w", 0, (h ?? 0) / 2],
                          ] as [ResizeHandleKind, number, number][]).map(([handle, left, top]) => (
                            <button
                              key={`${el.id}_${handle}`}
                              type="button"
                              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-white bg-[#111113] shadow-[0_0_0_1px_rgba(79,70,229,0.7)]"
                              style={{ left, top, cursor: getResizeCursor(handle, rotationDeg), pointerEvents: "auto" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const stagePoint = clientToStage((e as any).clientX, (e as any).clientY);
                                if (!stagePoint) return;
                                const descendants =
                                  renderedEl.type === "group" || renderedEl.type === "frame" || renderedEl.type === "mask" || renderedEl.type === "boolean"
                                    ? Object.fromEntries(
                                        Array.from(collectDescendantIds(previewElementsById, el.id))
                                          .map((childId) => {
                                            const child = previewElementsById[childId];
                                            if (!child) return null;
                                            return [
                                              childId,
                                              {
                                                x: child.x ?? 0,
                                                y: child.y ?? 0,
                                                width: child.width ?? 0,
                                                height: child.height ?? 0,
                                              },
                                            ] as const;
                                          })
                                          .filter(Boolean) as [string, { x: number; y: number; width: number; height: number }][]
                                      )
                                    : undefined;
                                setResizeDragSession({
                                  id: el.id,
                                  handle,
                                  startStage: stagePoint,
                                  origin: {
                                    x: x ?? 0,
                                    y: y ?? 0,
                                    width: w ?? 0,
                                    height: h ?? 0,
                                    rotationDeg,
                                  },
                                  descendants,
                                });
                                setResizeStatus({ x: x ?? 0, y: y ?? 0, width: w ?? 0, height: h ?? 0 });
                              }}
                              aria-label={`Resize ${handle}`}
                            />
                          ))}
                          {renderedEl.type === "path" && (
                            <svg className="absolute inset-0 overflow-visible pointer-events-none">
                              {pathHandles
                                .filter((handle) => selectedPathAnchor?.elementId === el.id && selectedPathAnchor.commandIndex === handle.anchorCommandIndex)
                                .map((handle) => {
                                  const anchor = pathAnchors.find((candidate) => candidate.commandIndex === handle.anchorCommandIndex);
                                  if (!anchor) return null;
                                  return (
                                    <line
                                      key={`${el.id}_handle_line_${handle.curveCommandIndex}_${handle.role}`}
                                      x1={anchor.x}
                                      y1={anchor.y}
                                      x2={handle.x}
                                      y2={handle.y}
                                      stroke="rgba(165,180,252,0.8)"
                                      strokeWidth={1}
                                    />
                                  );
                                })}
                            </svg>
                          )}
                          {renderedEl.type === "path" && pathHandles
                            .filter((handle) => selectedPathAnchor?.elementId === el.id && selectedPathAnchor.commandIndex === handle.anchorCommandIndex)
                            .map((handle) => {
                              return (
                                <React.Fragment key={`${el.id}_handle_${handle.curveCommandIndex}_${handle.role}`}>
                                  <button
                                    type="button"
                                    className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-100 bg-indigo-400 shadow-[0_0_0_1px_rgba(15,23,42,0.85)]"
                                    style={{ left: handle.x, top: handle.y, cursor: "grab", pointerEvents: "auto" }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const stagePoint = clientToStage((e as any).clientX, (e as any).clientY);
                                      if (!stagePoint || !editablePath) return;
                                      setPathHandleDragSession({
                                        elementId: el.id,
                                        curveCommandIndex: handle.curveCommandIndex,
                                        role: handle.role,
                                        startStage: stagePoint,
                                        originPath: editablePath,
                                        rotationDeg,
                                      });
                                    }}
                                  />
                                </React.Fragment>
                              );
                            })}
                          {renderedEl.type === "path" && pathAnchors.map((anchor, anchorIndex) => (
                            <button
                              key={`${el.id}_anchor_${anchor.commandIndex}`}
                              type="button"
                              className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-[0_0_0_1px_rgba(15,23,42,0.85)] ${
                                selectedPathAnchor?.elementId === el.id && selectedPathAnchor.commandIndex === anchor.commandIndex
                                  ? "border-indigo-100 bg-indigo-300"
                                  : "border-white bg-[#111113]"
                              }`}
                              style={{ left: anchor.x, top: anchor.y, cursor: "grab", pointerEvents: "auto" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const stagePoint = clientToStage((e as any).clientX, (e as any).clientY);
                                if (!stagePoint || !editablePath) return;
                                setSelectedPathAnchor({ elementId: el.id, commandIndex: anchor.commandIndex });
                                setPathAnchorDragSession({
                                  elementId: el.id,
                                  commandIndex: anchor.commandIndex,
                                  startStage: stagePoint,
                                  originPath: editablePath,
                                  rotationDeg,
                                });
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedPathAnchor({ elementId: el.id, commandIndex: anchor.commandIndex });
                              }}
                              title={`Path point ${anchorIndex + 1}`}
                            />
                          ))}
                          {supportsRadiusHandle(renderedEl) && (
                            <button
                              type="button"
                              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#111113] shadow-[0_0_0_1px_rgba(79,70,229,0.7)]"
                              style={{
                                left: clamp(Math.max(radiusValue, 12), 12, Math.max(12, (w ?? 0) / 2)),
                                top: 0,
                                cursor: "grab",
                                pointerEvents: "auto",
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setRadiusDragSession({
                                  id: el.id,
                                  origin: {
                                    x: x ?? 0,
                                    y: y ?? 0,
                                    width: w ?? 0,
                                    height: h ?? 0,
                                    rotationDeg,
                                  },
                                });
                                setDraftRadiusValues((prev) => ({ ...prev, [el.id]: radiusValue }));
                              }}
                              aria-label="Adjust corner radius"
                            />
                          )}
                          <div className="absolute left-1/2 -top-6 h-6 w-px -translate-x-1/2 pointer-events-none" style={{ background: ACCENT_TINT }} />
                          <button
                            type="button"
                            className="absolute left-1/2 -top-10 h-4 w-4 -translate-x-1/2 rounded-full border border-white bg-indigo-400 shadow-[0_0_0_2px_rgba(15,23,42,0.85)] cursor-grab active:cursor-grabbing"
                            style={{ pointerEvents: "auto" }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const centerX = (x ?? 0) + (w ?? 0) / 2;
                              const centerY = (y ?? 0) + (h ?? 0) / 2;
                              rotationDragRef.current = { id: el.id, cx: centerX, cy: centerY };
                              const stagePoint = clientToStage((e as any).clientX, (e as any).clientY);
                              if (!stagePoint) return;
                              const rawDeg = Math.atan2(stagePoint.y - centerY, stagePoint.x - centerX) * (180 / Math.PI) + 90;
                              setDraftRotationDegs((prev) => ({
                                ...prev,
                                [el.id]: snapRotationValue(rawDeg, (e as any).altKey === true),
                              }));
                            }}
                            title="Rotate (snaps to 15deg, hold Alt for free rotate)"
                          />
                        </div>
                      </div>
                    )}
                  </>
                );

                if (showTransformOverlay || forcePlainWrapper) {
                  return (
                    <div
                      key={el.id}
                      className={(isLocked ? "cursor-not-allowed " : showTransformOverlay ? "cursor-move " : "") + "absolute"}
                      style={{
                        left: x,
                        top: y,
                        width: w,
                        height: h,
                        pointerEvents: suppressLayerPointerEvents ? "none" : undefined,
                        ...(isSelected ? selectionStyle : {}),
                      }}
                      onMouseDown={(e) => {
                        if (spaceDown || (e as any).button === 1) return;
                        if (marquee.active || isLocked) return;
                        if ((e as any).ctrlKey || (e as any).metaKey) {
                          cycleSelectAtPoint((e as any).clientX, (e as any).clientY, true, true);
                          return;
                        }
                        if (!showTransformOverlay && (e as any).shiftKey === true) {
                          onSelectElement(el.id, true);
                          return;
                        }
                        if (!showTransformOverlay) {
                          cycleSelectAtPoint((e as any).clientX, (e as any).clientY, false);
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        dragStartRef.current[el.id] = { x: el.x ?? 0, y: el.y ?? 0 };
                        if ((e as any).altKey === true) {
                          dragDuplicateRef.current = { sourceId: el.id, duplicateId: createDragDuplicate(el) };
                        } else {
                          dragDuplicateRef.current = null;
                        }
                        const stagePoint = clientToStage((e as any).clientX, (e as any).clientY);
                        if (!stagePoint) return;
                        setPrimaryDragSession({
                          id: el.id,
                          startStage: stagePoint,
                          origin: { x: x ?? 0, y: y ?? 0 },
                        });
                      }}
                    >
                      {contentNode}
                    </div>
                  );
                }

                return (
                  <Rnd
                    key={el.id}
                    id={el.id}
                    ref={(node) => {
                      if (node) rndRefs.current[el.id] = node;
                      else delete rndRefs.current[el.id];
                    }}
                    size={{ width: w, height: h }}
                    position={{ x, y }}
                    bounds="parent"
                    scale={scale}
                    disableDragging={isLocked || isPanning || marquee.active}
                    enableResizing={false}
                    onDragStart={(e) => {
                      dragStartRef.current[el.id] = { x: el.x ?? 0, y: el.y ?? 0 };
                      if ((e as any).altKey === true) {
                        dragDuplicateRef.current = { sourceId: el.id, duplicateId: createDragDuplicate(el) };
                      } else {
                        dragDuplicateRef.current = null;
                      }
                    }}
                    onDrag={(e, d) => handleDragLive(el.id, d.x, d.y, { shiftKey: (e as any).shiftKey === true })}
                    onDragStop={(e, d) => {
                      handleDragStop(e, d, el.id);
                      const duplicateRequested = dragDuplicateRef.current?.sourceId === el.id;
                      const duplicateId = dragDuplicateRef.current?.duplicateId;
                      dragDuplicateRef.current = null;
                      delete dragStartRef.current[el.id];
                      if (duplicateRequested && duplicateId) {
                        setSelectedIds([duplicateId]);
                      }
                    }}
                    onMouseDown={(e) => {
                      if (spaceDown || (e as any).button === 1) return;
                      if (marquee.active) return;
                      if ((e as any).ctrlKey || (e as any).metaKey) {
                        cycleSelectAtPoint((e as any).clientX, (e as any).clientY, true, true);
                        return;
                      }
                      if ((e as any).shiftKey === true) {
                        onSelectElement(el.id, true);
                        return;
                      }
                      cycleSelectAtPoint((e as any).clientX, (e as any).clientY, false);
                    }}
                    className={
                      (isLocked ? "cursor-not-allowed " : "cursor-move ") +
                      (!isSelected && !isLocked ? "hover:ring-1 hover:ring-slate-500/50 " : "")
                    }
                    style={{
                      ...(isSelected ? selectionStyle : {}),
                      pointerEvents: suppressLayerPointerEvents ? "none" : undefined,
                    }}
                  >
                    {contentNode}
                  </Rnd>
                );
              })}
            </div>
          </div>
        </div>
      </div> {/* Close Center Column */}

      {/* Right Column / Inspector */}
      <div className="flex w-80 flex-col overflow-y-auto border-l border-[rgba(255,255,255,0.08)] bg-[#111113]">
        {primarySelectedEl ? (
          <InspectorPanel
            element={(previewElementsById[selectedIds[0]] ?? elementsById[selectedIds[0]]) as AnyEl}
            onChange={(u) => updateElement(selectedIds[0], u)}
            onRename={(n) => updateElement(selectedIds[0], { name: n })}
            onPickImage={() => {
              setAssetPicker({
                open: true,
                kind: "images",
                scope: "profiles",
                title: "Pick Image",
                onPick: (url) => updateElement(selectedIds[0], { src: url } as any)
              });
            }}
            onPickPatternImage={() => {
              const currentElement = elementsById[selectedIds[0]] as AnyEl | undefined;
              setAssetPicker({
                open: true,
                kind: "images",
                scope: "overlays",
                title: "Pick Pattern",
                onPick: (url) =>
                  updateElement(selectedIds[0], {
                    pattern: {
                      ...ensurePatternFill(currentElement?.pattern as OverlayPatternFill | undefined),
                      src: url,
                    },
                  } as any),
              });
            }}
            onPickVideo={() => {
              setAssetPicker({
                open: true,
                kind: "videos",
                scope: "profiles",
                title: "Pick Video",
                onPick: (url) => updateElement(selectedIds[0], { url } as any)
              });
            }}
            ltPreview={ltPreview}
            onLtPreviewChange={setLtPreview}
            onTestLowerThird={async (action) => {
              try {
                const body = action === "show" ? {
                  title: ltPreview.title,
                  subtitle: ltPreview.subtitle,
                  text: ltPreview.text,
                  duration_ms: 5000
                } : {};

                const res = await fetch(`/dashboard/api/overlays/${initialOverlay.id}/test-lower-third/${action}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                });

                if (!res.ok) throw new Error(res.statusText);
                console.log(`Test ${action} sent`);
              } catch (e) {
                console.error("Test Event Error", e);
                alert("Failed to send test event");
              }
            }}
            overlayComponents={overlayComponents}
            isComponentMaster={isComponentMaster}
            propsSchema={propsSchema}
            onUpdateSchema={setPropsSchema}
            onEditMaster={enterIsolationMode}
            onReleaseMask={handleReleaseMask}
            onReleaseBoolean={ungroupSelected}
            onFlattenBoolean={flattenBooleanSelected}
            onConvertToPath={convertSelectedToPath}
            onDetachInstance={detachSelectedComponentInstance}
            onCreateVariant={createVariantFromComponent}
            parentFrame={selectedParentFrame}
            selectedPathAnchor={selectedPathAnchor?.elementId === selectedIds[0] ? selectedPathAnchor.commandIndex : null}
            onAddPathNode={addSelectedPathNode}
            onRemovePathNode={removeSelectedPathNode}
            onSplitPath={splitSelectedPath}
            onContinuePath={continueSelectedPath}
            onJoinPaths={joinSelectedPaths}
            onExpandStroke={expandSelectedStroke}
            canContinuePath={Boolean(
              primarySelectedEl?.type === "path" &&
              selectedPathAnchor &&
              selectedPathAnchor.elementId === primarySelectedEl.id &&
              (() => {
                const path = elementToOverlayPath(primarySelectedEl as any);
                if (!path || isClosedPath(path)) return false;
                const anchors = getPathAnchors(path);
                const selectedIndex = anchors.findIndex((anchor) => anchor.commandIndex === selectedPathAnchor.commandIndex);
                return selectedIndex === 0 || selectedIndex === anchors.length - 1;
              })()
            )}
            canJoinPaths={
              selectedIds.length === 2 &&
              selectedIds.every((id) => elementsById[id]?.type === "path") &&
              selectedIds.every((id) => {
                const candidate = elementsById[id] as AnyEl | undefined;
                const path = candidate ? elementToOverlayPath(candidate as any) : null;
                return Boolean(path && !isClosedPath(path));
              })
            }
            previewVisible={previewElementsById[selectedIds[0]]?.visible !== false}
            onPreviewVisibilityAction={(action) => triggerPreviewVisibility(selectedIds[0], action)}
            timelineState={selectedTimelineState}
          />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center text-[12px] leading-[1.4] text-slate-500">
            <p>Select an element to edit</p>
          </div>
        )}

        <TestDataPanel
          data={testData}
          onChange={(k, v) => {
            if (v === "" && confirm("Delete?")) {
              const n = { ...testData }; delete n[k]; setTestData(n);
            } else {
              setTestData({ ...testData, [k]: v });
            }
          }}
        />
      </div>
      </div>

      <TimelinePanel
        timeline={timeline}
        elements={config.elements}
        selectedIds={selectedIds}
        playheadMs={timelinePlayheadMs}
        isPlaying={isTimelinePlaying}
        selectedTrackId={selectedTimelineTrackId}
        selectedKeyframeId={selectedTimelineKeyframeId}
        selectedKeyframeEasing={selectedTimelineKeyframe?.easing ?? "linear"}
        onSelectKeyframe={(trackId, keyframeId) => {
          setSelectedTimelineTrackId(trackId);
          setSelectedTimelineKeyframeId(keyframeId);
        }}
        onPlay={() => {
          if (timeline.playback?.reverse) {
            if (timelinePlayheadMs <= 0) {
              setTimelinePlayheadMs(timeline.durationMs);
            }
          } else if (timelinePlayheadMs >= timeline.durationMs) {
            setTimelinePlayheadMs(0);
          }
          setIsTimelinePlaying(true);
        }}
        onPause={() => setIsTimelinePlaying(false)}
        onStop={() => {
          setIsTimelinePlaying(false);
          setTimelinePlayheadMs(timeline.playback?.reverse ? timeline.durationMs : 0);
        }}
        onSetPlayhead={(timeMs) => {
          setIsTimelinePlaying(false);
          setTimelinePlayheadMs(clamp(timeMs, 0, timeline.durationMs));
        }}
        onSetDuration={(durationMs) => {
          const nextDuration = Math.max(100, durationMs);
          setTimeline((currentTimeline) => ({ ...currentTimeline, durationMs: nextDuration }));
          setTimelinePlayheadMs((prev) => clamp(prev, 0, nextDuration));
        }}
        onDeleteSelectedKeyframe={deleteSelectedTimelineKeyframe}
        onSetPlayback={(patch) => {
          setTimeline((currentTimeline) => ({
            ...currentTimeline,
            playback: {
              ...(currentTimeline.playback ?? {}),
              ...patch,
            },
          }));
        }}
        onSetSelectedKeyframeEasing={updateSelectedTimelineKeyframeEasing}
        onAddTrack={addTimelineTrack}
        onMoveKeyframe={moveTimelineKeyframe}
        onDuplicateKeyframe={duplicateTimelineKeyframe}
        onAddKeyframeAtTime={addTimelineKeyframeAtTime}
      />
      <ShortcutCheatsheetModal open={showShortcutModal} onClose={() => setShowShortcutModal(false)} />
      </div>
    </div>
  );
}

function pointInRect(x: number, y: number, rect: { l: number; r: number; t: number; b: number }) {
  return x >= rect.l && x <= rect.r && y >= rect.t && y <= rect.b;
}

function defaultElementLabel(el: AnyEl) {
  if (el.type === "text") return ((el as any).text || "Text").slice(0, 28);
  if (el.type === "shape") return (el as any).shape || "shape";
  if (el.type === "path") return "Path";
  if (el.type === "boolean") return `${((el as any).operation || "boolean").toString()} boolean`;
  if (el.type === "image") return "Image";
  if (el.type === "video") return "Video";
  if (el.type === "frame") return "Frame";
  if (el.type === "group") return "Group";
  if (el.type === "progressBar") return "Progress Bar";
  if (el.type === "progressRing") return "Progress Ring";
  if (el.type === "lower_third") return "Lower Third";
  return el.type === "box" ? "Box" : String(el.type);
}

function fitToObjectFit(fit?: OverlayMediaFit) {
  if (fit === "contain") return "contain";
  if (fit === "fill") return "fill";
  return "cover";
}



interface InspectorProps {
  element: AnyEl;
  onChange: (patch: Partial<AnyEl>) => void;
  onRename: (name: string) => void;
  onPickImage: () => void;
  onPickPatternImage: () => void;
  onPickVideo: () => void;
  ltPreview: { text: string; title: string; subtitle: string };
  onLtPreviewChange: (v: { text: string; title: string; subtitle: string }) => void;
  onTestLowerThird: (action: "show" | "hide") => void;
  overlayComponents: OverlayComponentDef[];
  isComponentMaster?: boolean;
  propsSchema?: any;
  onUpdateSchema?: (schema: any) => void;
  onEditMaster?: (id: string) => void;
  onReleaseMask?: (id: string) => void;
  onReleaseBoolean?: () => void;
  onFlattenBoolean?: () => void;
  onConvertToPath?: () => void;
  onDetachInstance?: () => void;
  onCreateVariant?: (componentId: string) => void;
  parentFrame?: OverlayFrameElement | null;
  selectedPathAnchor?: number | null;
  onAddPathNode?: () => void;
  onRemovePathNode?: () => void;
  onSplitPath?: () => void;
  onContinuePath?: () => void;
  onJoinPaths?: () => void;
  onExpandStroke?: () => void;
  canContinuePath?: boolean;
  canJoinPaths?: boolean;
  previewVisible?: boolean;
  onPreviewVisibilityAction?: (action: "enter" | "exit" | "reset") => void;
  timelineState?: {
    playheadMs: number;
    hasAnimatedProperties: boolean;
    properties: Partial<Record<OverlayTimelineProperty, { hasTrack: boolean; hasKeyframeAtPlayhead: boolean }>>;
  };
}

function formatTimelineTime(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(2)}s`;
}

function TimelinePropertyMarker({
  state,
}: {
  state?: { hasTrack: boolean; hasKeyframeAtPlayhead: boolean };
}) {
  if (!state?.hasTrack) {
    return <span className="inline-block h-2.5 w-2.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-transparent rotate-45" />;
  }

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] border ${
        state.hasKeyframeAtPlayhead
          ? "border-indigo-200 bg-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.22)]"
          : "border-indigo-300/60 bg-indigo-500/20"
      }`}
    />
  );
}

function TimelineFieldLabel({
  label,
  timelineState,
}: {
  label: string;
  timelineState?: { hasTrack: boolean; hasKeyframeAtPlayhead: boolean };
}) {
  return (
    <span className="flex items-center gap-1.5">
      <TimelinePropertyMarker state={timelineState} />
      <span>{label}</span>
    </span>
  );
}

function ColorSwatch({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] shadow-sm flex-none ${className || "h-6 w-6"}`}>
      <div className="absolute inset-0" style={{ background: value }} />
      <input
        type="color"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        value={value && value.startsWith("#") ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ExposeButton({
  element, propPath, propsSchema, onUpdateSchema, onChange
}: {
  element: AnyEl, propPath: string, propsSchema: any, onUpdateSchema: any, onChange: any
}) {
  const isBound = element.bindings && element.bindings[propPath];
  const boundKey = isBound ? element.bindings![propPath] : null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBound) {
      // Unbind
      const nextBindings = { ...element.bindings };
      delete nextBindings[propPath];
      onChange({ bindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined });
    } else {
      // Bind
      const key = prompt("Enter property key for schema (e.g. 'titleColor'):", propPath);
      if (!key) return;

      const nextBindings = { ...(element.bindings || {}), [propPath]: key };
      onChange({ bindings: nextBindings });

      if (!propsSchema[key]) {
        onUpdateSchema({
          ...propsSchema,
          [key]: { type: "text", label: key, default: (element as any)[propPath] || "" }
        });
      }
    }
  };

  return (
    <button
      onClick={toggle}
      title={isBound ? `Bound to: ${boundKey}` : "Expose as Component Prop"}
      className={`ml-1 flex-none ${uiClasses.iconButton} ${isBound ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500 hover:text-white" : ""}`}
    >
      <LinkIcon />
    </button>
  );
}

function EyeIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-4.2 4.7" />
      <path d="M6.7 6.7A18.1 18.1 0 0 0 2 12s3.5 6 10 6a9.8 9.8 0 0 0 3.4-.6" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.2-2.4" />
    </svg>
  );
}

function MaskIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M12 3a9 9 0 1 0 0 18c2.3 0 4.3-.9 5.9-2.4A9 9 0 0 1 12 3Z" />
      <path d="M12 3a9 9 0 0 1 0 18" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M4 6h16" />
      <path d="M9 3h6" />
      <path d="M6 6v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="m6 14 6-6 6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="m6 10 6 6 6-6" />
    </svg>
  );
}

const GENERIC_MOTION_OPTIONS: Array<{ value: OverlayMotionPreset; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slideUp", label: "Slide Up" },
  { value: "slideDown", label: "Slide Down" },
  { value: "slideLeft", label: "Slide Left" },
  { value: "slideRight", label: "Slide Right" },
];

const GENERIC_EASING_OPTIONS: Array<NonNullable<OverlayAnimation["easing"]>> = [
  "ease-out",
  "ease-in",
  "ease-in-out",
  "linear",
];

const PATTERN_FIT_OPTIONS: Array<{ value: OverlayPatternFit; label: string }> = [
  { value: "tile", label: "Tile" },
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "stretch", label: "Stretch" },
];

const STROKE_ALIGN_OPTIONS: Array<{ value: OverlayStrokeAlign; label: string }> = [
  { value: "inside", label: "Inside" },
  { value: "center", label: "Center" },
  { value: "outside", label: "Outside" },
];

const CORNER_TYPE_OPTIONS: Array<{ value: OverlayCornerType; label: string }> = [
  { value: "round", label: "Round" },
  { value: "cut", label: "Cut" },
  { value: "angle", label: "Angle" },
];

const FRAME_LAYOUT_MODE_OPTIONS: Array<{ value: OverlayFrameLayoutMode; label: string }> = [
  { value: "free", label: "Free" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

const FRAME_ALIGN_OPTIONS: Array<{ value: OverlayFrameAlign; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

const FRAME_JUSTIFY_OPTIONS: Array<{ value: OverlayFrameJustify; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space Between" },
];

const CONSTRAINT_MODE_OPTIONS: Array<{ value: OverlayConstraintMode; label: string }> = [
  { value: "start", label: "Start" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "center", label: "Center" },
  { value: "scale", label: "Scale" },
];

const EFFECT_TYPE_OPTIONS: Array<{ value: OverlayEffect["type"]; label: string }> = [
  { value: "dropShadow", label: "Drop Shadow" },
  { value: "innerShadow", label: "Inner Shadow" },
  { value: "outerGlow", label: "Outer Glow" },
  { value: "innerGlow", label: "Inner Glow" },
  { value: "layerBlur", label: "Layer Blur" },
  { value: "noise", label: "Noise / Grain" },
];

function ensurePatternFill(pattern?: OverlayPatternFill): OverlayPatternFill {
  return {
    type: "pattern",
    src: pattern?.src ?? "",
    fit: pattern?.fit ?? "tile",
    scale: pattern?.scale ?? 100,
    opacity: pattern?.opacity ?? 1,
    offsetX: pattern?.offsetX ?? 0,
    offsetY: pattern?.offsetY ?? 0,
    rotationDeg: pattern?.rotationDeg ?? 0,
  };
}

function defaultGradientStops(): OverlayFillStop[] {
  return [
    { color: "#ffffff", opacity: 1, position: 0 },
    { color: "#7c3aed", opacity: 1, position: 100 },
  ];
}

function ensureFill(fill?: OverlayFill): OverlayFill {
  if (!fill) return { type: "solid", color: "#ffffff", opacity: 1 };
  if (fill.type === "solid") return { type: "solid", color: fill.color ?? "#ffffff", opacity: fill.opacity ?? 1, id: fill.id };
  if (fill.type === "pattern") return ensurePatternFill(fill);
  return {
    type: fill.type,
    id: fill.id,
    opacity: fill.opacity ?? 1,
    angleDeg: fill.angleDeg ?? 0,
    stops: Array.isArray(fill.stops) && fill.stops.length ? fill.stops : defaultGradientStops(),
  };
}

function getElementFills(element: AnyEl): OverlayFill[] {
  if (Array.isArray((element as any).fills) && (element as any).fills.length) {
    return (element as any).fills.map((fill: OverlayFill) => ensureFill(fill));
  }
  if (element.type === "box") {
    const fills: OverlayFill[] = [];
    if ((element as any).backgroundColor) fills.push({ type: "solid", color: (element as any).backgroundColor, opacity: 1 });
    if ((element as any).pattern?.src) fills.push(ensurePatternFill((element as any).pattern));
    return fills.length ? fills : [{ type: "solid", color: "#0f172a", opacity: 1 }];
  }
  const fills: OverlayFill[] = [];
  if ((element as any).fillColor) fills.push({ type: "solid", color: (element as any).fillColor, opacity: (element as any).fillOpacity ?? 1 });
  if ((element as any).pattern?.src) fills.push(ensurePatternFill((element as any).pattern));
  return fills.length ? fills : [{ type: "solid", color: "#ffffff", opacity: 1 }];
}

function defaultEffect(type: OverlayEffect["type"] = "dropShadow"): OverlayEffect {
  switch (type) {
    case "innerShadow":
      return { type, color: "rgba(15,23,42,0.7)", blur: 12, x: 0, y: 4, spread: 0, opacity: 1 };
    case "outerGlow":
      return { type, color: "#60a5fa", blur: 18, spread: 2, opacity: 0.9 };
    case "innerGlow":
      return { type, color: "#60a5fa", blur: 14, spread: 1, opacity: 0.65 };
    case "layerBlur":
      return { type, blur: 8, opacity: 1 };
    case "noise":
      return { type, amount: 0.18, scale: 24, opacity: 0.18 };
    case "dropShadow":
    default:
      return { type: "dropShadow", color: "rgba(15,23,42,0.55)", blur: 18, x: 0, y: 8, spread: 0, opacity: 1 };
  }
}

function ensureEffect(effect?: OverlayEffect): OverlayEffect {
  if (!effect) return defaultEffect();
  const base = { ...defaultEffect(effect.type), ...effect };
  if (base.type === "dropShadow" || base.type === "innerShadow") {
    return {
      type: base.type,
      id: base.id,
      enabled: base.enabled ?? true,
      opacity: base.opacity ?? 1,
      color: (base as OverlayShadowEffect).color,
      blur: (base as OverlayShadowEffect).blur,
      x: (base as OverlayShadowEffect).x,
      y: (base as OverlayShadowEffect).y,
      spread: (base as OverlayShadowEffect).spread ?? 0,
    };
  }
  if (base.type === "outerGlow" || base.type === "innerGlow") {
    return {
      type: base.type,
      id: base.id,
      enabled: base.enabled ?? true,
      opacity: base.opacity ?? 1,
      color: (base as OverlayGlowEffect).color,
      blur: (base as OverlayGlowEffect).blur,
      spread: (base as OverlayGlowEffect).spread ?? 0,
    };
  }
  if (base.type === "layerBlur") {
    return {
      type: "layerBlur",
      id: base.id,
      enabled: base.enabled ?? true,
      opacity: base.opacity ?? 1,
      blur: (base as OverlayLayerBlurEffect).blur,
    };
  }
  return {
    type: "noise",
    id: base.id,
    enabled: base.enabled ?? true,
    opacity: base.opacity ?? 1,
    amount: (base as OverlayNoiseEffect).amount,
    scale: (base as OverlayNoiseEffect).scale ?? 24,
  };
}

function getElementEffects(element: AnyEl): OverlayEffect[] {
  if (Array.isArray((element as any).effects) && (element as any).effects.length) {
    return (element as any).effects.map((effect: OverlayEffect) => ensureEffect(effect));
  }
  const shadow = (element as any).shadow;
  if (shadow?.enabled) {
    return [
      ensureEffect({
        type: "dropShadow",
        color: shadow.color,
        blur: shadow.blur,
        x: shadow.x,
        y: shadow.y,
        spread: shadow.spread ?? 0,
        opacity: 1,
      }),
    ];
  }
  return [];
}

function ensureConstraints(constraints?: OverlayConstraints): OverlayConstraints {
  return {
    horizontal: constraints?.horizontal ?? "start",
    vertical: constraints?.vertical ?? "start",
  };
}

function ensureFrameLayout(layout?: (OverlayFrameElement["layout"])) {
  return {
    mode: layout?.mode ?? "free",
    gap: layout?.gap ?? 12,
    padding: layout?.padding ?? 16,
    align: layout?.align ?? "start",
    justify: layout?.justify ?? "start",
    wrap: layout?.wrap ?? false,
  };
}

function isContainerElement(el: AnyEl | OverlayElement | null | undefined): el is AnyEl {
  return !!el && (el.type === "group" || el.type === "frame" || el.type === "mask" || el.type === "boolean");
}

function isFrameElement(el: AnyEl | OverlayElement | null | undefined): el is OverlayFrameElement {
  return !!el && el.type === "frame";
}

function constrainFrameChildRect(
  child: AnyEl,
  frameOrigin: { x: number; y: number; width: number; height: number },
  nextFrame: { x: number; y: number; width: number; height: number }
) {
  const constraints = ensureConstraints(child.constraints);
  const left = (child.x ?? 0) - frameOrigin.x;
  const top = (child.y ?? 0) - frameOrigin.y;
  const right = frameOrigin.width - left - (child.width ?? 0);
  const bottom = frameOrigin.height - top - (child.height ?? 0);
  const centerOffsetX = left + (child.width ?? 0) / 2 - frameOrigin.width / 2;
  const centerOffsetY = top + (child.height ?? 0) / 2 - frameOrigin.height / 2;
  const scaleX = nextFrame.width / Math.max(frameOrigin.width, 1);
  const scaleY = nextFrame.height / Math.max(frameOrigin.height, 1);

  let x = child.x ?? 0;
  let y = child.y ?? 0;
  let width = child.width ?? 0;
  let height = child.height ?? 0;

  switch (constraints.horizontal) {
    case "end":
      x = nextFrame.x + nextFrame.width - right - width;
      break;
    case "stretch":
      x = nextFrame.x + left;
      width = Math.max(1, nextFrame.width - left - right);
      break;
    case "center":
      x = nextFrame.x + nextFrame.width / 2 + centerOffsetX - width / 2;
      break;
    case "scale":
      x = nextFrame.x + left * scaleX;
      width = Math.max(1, width * scaleX);
      break;
    case "start":
    default:
      x = nextFrame.x + left;
      break;
  }

  switch (constraints.vertical) {
    case "end":
      y = nextFrame.y + nextFrame.height - bottom - height;
      break;
    case "stretch":
      y = nextFrame.y + top;
      height = Math.max(1, nextFrame.height - top - bottom);
      break;
    case "center":
      y = nextFrame.y + nextFrame.height / 2 + centerOffsetY - height / 2;
      break;
    case "scale":
      y = nextFrame.y + top * scaleY;
      height = Math.max(1, height * scaleY);
      break;
    case "start":
    default:
      y = nextFrame.y + top;
      break;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function reflowFrameElements(frame: OverlayFrameElement, elements: AnyEl[]) {
  const layout = ensureFrameLayout(frame.layout);
  if (layout.mode === "free") return elements;

  const elementMap = new Map(elements.map((element) => [element.id, element]));
  const children = (frame.childIds ?? [])
    .map((childId) => elementMap.get(childId))
    .filter((child): child is AnyEl => Boolean(child));

  if (!children.length) return elements;

  const pad = layout.padding ?? 0;
  const gap = layout.gap ?? 0;
  const isHorizontal = layout.mode === "horizontal";
  const mainSize = Math.max(0, (isHorizontal ? frame.width : frame.height) - pad * 2);
  const crossSize = Math.max(0, (isHorizontal ? frame.height : frame.width) - pad * 2);

  const rows: Array<{ children: AnyEl[]; used: number; cross: number }> = [];
  let currentRow: { children: AnyEl[]; used: number; cross: number } = { children: [], used: 0, cross: 0 };

  children.forEach((child, index) => {
    const childMain = Math.max(1, isHorizontal ? child.width ?? 0 : child.height ?? 0);
    const childCross = Math.max(1, isHorizontal ? child.height ?? 0 : child.width ?? 0);
    const nextUsed = currentRow.children.length === 0 ? childMain : currentRow.used + gap + childMain;
    const shouldWrap = layout.wrap && currentRow.children.length > 0 && nextUsed > mainSize;
    if (shouldWrap) {
      rows.push(currentRow);
      currentRow = { children: [], used: 0, cross: 0 };
    }
    currentRow.children.push(child);
    currentRow.used = currentRow.children.length === 1 ? childMain : currentRow.used + gap + childMain;
    currentRow.cross = Math.max(currentRow.cross, childCross);
    if (index === children.length - 1) rows.push(currentRow);
  });
  if (!rows.length) rows.push(currentRow);

  const totalCross = rows.reduce((sum, row) => sum + row.cross, 0) + gap * Math.max(0, rows.length - 1);
  let crossCursor = frame.y + pad;
  if (layout.align === "center" && !layout.wrap) {
    crossCursor = frame.y + pad + Math.max(0, (crossSize - totalCross) / 2);
  } else if (layout.align === "end" && !layout.wrap) {
    crossCursor = frame.y + pad + Math.max(0, crossSize - totalCross);
  }

  const updates = new Map<string, Partial<AnyEl>>();

  rows.forEach((row) => {
    let mainGap = gap;
    let mainCursor = frame.x + pad;
    if (layout.justify === "center") {
      mainCursor = frame.x + pad + Math.max(0, (mainSize - row.used) / 2);
    } else if (layout.justify === "end") {
      mainCursor = frame.x + pad + Math.max(0, mainSize - row.used);
    } else if (layout.justify === "space-between" && row.children.length > 1) {
      mainGap = Math.max(gap, (mainSize - row.children.reduce((sum, child) => sum + (isHorizontal ? child.width ?? 0 : child.height ?? 0), 0)) / (row.children.length - 1));
    }

    row.children.forEach((child) => {
      const childCross = Math.max(1, isHorizontal ? child.height ?? 0 : child.width ?? 0);
      let crossPos = crossCursor;
      let stretchPatch: Partial<AnyEl> = {};
      if (layout.align === "center") {
        crossPos = crossCursor + Math.max(0, (row.cross - childCross) / 2);
      } else if (layout.align === "end") {
        crossPos = crossCursor + Math.max(0, row.cross - childCross);
      } else if (layout.align === "stretch") {
        if (isHorizontal) {
          stretchPatch.height = Math.max(1, row.cross);
        } else {
          stretchPatch.width = Math.max(1, row.cross);
        }
      }

      updates.set(child.id, {
        ...stretchPatch,
        x: Math.round(isHorizontal ? mainCursor : crossPos),
        y: Math.round(isHorizontal ? crossPos : mainCursor),
      });
      mainCursor += (isHorizontal ? child.width ?? 0 : child.height ?? 0) + mainGap;
    });

    crossCursor += row.cross + gap;
  });

  return elements.map((element) => (updates.has(element.id) ? { ...element, ...updates.get(element.id) } : element));
}

function reflowFrameInElementList(frameId: string, elements: AnyEl[]) {
  const frame = elements.find((element) => element.id === frameId && element.type === "frame") as OverlayFrameElement | undefined;
  if (!frame) return elements;
  return reflowFrameElements(frame, elements);
}

function ensureCornerRadii(radius: number, cornerRadii?: OverlayCornerRadii): OverlayCornerRadii {
  return {
    topLeft: cornerRadii?.topLeft ?? radius,
    topRight: cornerRadii?.topRight ?? radius,
    bottomRight: cornerRadii?.bottomRight ?? radius,
    bottomLeft: cornerRadii?.bottomLeft ?? radius,
  };
}

function ensureKeying(keying?: any) {
  return {
    mode: keying?.mode ?? "none",
    threshold: keying?.threshold ?? 0.2,
    softness: keying?.softness ?? 0.15,
    keyColor: keying?.keyColor ?? "#00ff00",
    tolerance: keying?.tolerance ?? 0.2,
    spillReduction: keying?.spillReduction ?? 0,
  };
}

function PatternFillControls({
  pattern,
  onChange,
  onPickImage,
}: {
  pattern?: OverlayPatternFill;
  onChange: (pattern: OverlayPatternFill) => void;
  onPickImage: () => void;
}) {
  const nextPattern = ensurePatternFill(pattern);
  const [imageState, setImageState] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    if (!nextPattern.src.trim()) {
      setImageState("idle");
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setImageState("ok");
    };
    img.onerror = () => {
      if (!cancelled) setImageState("error");
    };
    img.src = nextPattern.src;

    return () => {
      cancelled = true;
    };
  }, [nextPattern.src]);

  return (
    <div className="ml-14 space-y-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618] p-3">
      <div className="flex items-center gap-2">
        <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Image</label>
        <input
          type="text"
          className={`flex-1 font-mono ${uiClasses.field}`}
          value={nextPattern.src}
          onChange={(e) => onChange({ ...nextPattern, src: e.target.value })}
          placeholder="/uploads/pattern.png"
        />
        <button
          type="button"
          onClick={onPickImage}
          className={uiClasses.button}
          title="Pick pattern image"
        >
          <FolderIcon />
        </button>
      </div>

      {imageState !== "idle" && (
        <div className={`text-[11px] leading-[1.4] ${imageState === "ok" ? "text-emerald-400" : "text-amber-400"}`}>
          {imageState === "ok"
            ? "Pattern image loaded."
            : "Pattern image could not be loaded. Renderer will fall back to solid fill."}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Fit</label>
        <select
          className={`flex-1 ${uiClasses.field}`}
          value={nextPattern.fit}
          onChange={(e) => onChange({ ...nextPattern, fit: e.target.value as OverlayPatternFit })}
        >
          {PATTERN_FIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Scale</label>
        <div className="w-20 relative">
          <NumberField
            label=""
            value={Math.round(nextPattern.scale ?? 100)}
            onChange={(v) => onChange({ ...nextPattern, scale: Math.max(1, v) })}
            noLabel
          />
          <span className="absolute right-4 top-[7px] text-[11px] leading-[1.4] text-slate-500">%</span>
        </div>
        <div className="flex-1 text-[11px] leading-[1.4] text-slate-600">
          Scale now applies to tile, cover, and contain.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Opacity</label>
        <div className="w-20 relative">
          <NumberField
            label=""
            value={Math.round((nextPattern.opacity ?? 1) * 100)}
            onChange={(v) => onChange({ ...nextPattern, opacity: Math.max(0, Math.min(1, v / 100)) })}
            noLabel
          />
          <span className="absolute right-4 top-[7px] text-[11px] leading-[1.4] text-slate-500">%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2">
          <label className={`${uiClasses.fieldLabel} w-10 flex-none`}>Off X</label>
          <NumberField label="" value={Math.round(nextPattern.offsetX ?? 0)} onChange={(v) => onChange({ ...nextPattern, offsetX: v })} noLabel className="flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <label className={`${uiClasses.fieldLabel} w-10 flex-none`}>Off Y</label>
          <NumberField label="" value={Math.round(nextPattern.offsetY ?? 0)} onChange={(v) => onChange({ ...nextPattern, offsetY: v })} noLabel className="flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <label className={`${uiClasses.fieldLabel} w-10 flex-none`}>Rot</label>
          <NumberField label="" value={Math.round(nextPattern.rotationDeg ?? 0)} onChange={(v) => onChange({ ...nextPattern, rotationDeg: v })} noLabel className="flex-1" />
        </div>
      </div>
    </div>
  );
}

function FillStackControls({
  element,
  onChange,
  onPickPatternImage,
}: {
  element: AnyEl;
  onChange: (patch: Partial<AnyEl>) => void;
  onPickPatternImage: () => void;
}) {
  const fills = getElementFills(element);
  const setFills = (nextFills: OverlayFill[]) => {
    if (element.type === "box") {
      const firstSolid = nextFills.find((fill) => fill.type === "solid") as any;
      const firstPattern = nextFills.find((fill) => fill.type === "pattern") as any;
      onChange({
        fills: nextFills,
        backgroundColor: firstSolid?.color,
        pattern: firstPattern,
      } as any);
      return;
    }
    const firstSolid = nextFills.find((fill) => fill.type === "solid") as any;
    const firstPattern = nextFills.find((fill) => fill.type === "pattern") as any;
    onChange({
      fills: nextFills,
      fillColor: firstSolid?.color,
      fillOpacity: firstSolid?.opacity,
      pattern: firstPattern,
    } as any);
  };

  return (
    <div className="space-y-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618] p-3">
      {fills.map((fill, index) => {
        const nextFill = ensureFill(fill);
        return (
          <div key={nextFill.id ?? `${nextFill.type}-${index}`} className="space-y-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#111113] p-3">
            <div className="flex items-center gap-2">
              <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Fill</label>
              <select
                className={`flex-1 ${uiClasses.field}`}
                value={nextFill.type}
                onChange={(e) => {
                  const replacement =
                    e.target.value === "solid"
                      ? ({ type: "solid", color: "#ffffff", opacity: 1 } as OverlayFill)
                      : e.target.value === "pattern"
                        ? (ensurePatternFill() as OverlayFill)
                        : ({ type: e.target.value as any, opacity: 1, angleDeg: 0, stops: defaultGradientStops() } as OverlayFill);
                  setFills(fills.map((candidate, candidateIndex) => (candidateIndex === index ? replacement : candidate)));
                }}
              >
                <option value="solid">Solid</option>
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
                <option value="conic">Conic</option>
                <option value="pattern">Pattern</option>
              </select>
              <button type="button" className={uiClasses.iconButton} onClick={() => setFills(fills.filter((_, candidateIndex) => candidateIndex !== index))}>
                <TrashIcon />
              </button>
            </div>

            {nextFill.type === "solid" && (
              <div className="flex items-center gap-2">
                <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Color</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={nextFill.color} onChange={(v) => setFills(fills.map((candidate, candidateIndex) => candidateIndex === index ? { ...nextFill, color: v } : candidate))} />
                  <input type="text" className={`flex-1 font-mono ${uiClasses.field}`} value={nextFill.color} onChange={(e) => setFills(fills.map((candidate, candidateIndex) => candidateIndex === index ? { ...nextFill, color: e.target.value } : candidate))} />
                </div>
              </div>
            )}

            {(nextFill.type === "linear" || nextFill.type === "radial" || nextFill.type === "conic") && (
              <>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Angle</label>
                  <NumberField label="" value={Math.round(nextFill.angleDeg ?? 0)} onChange={(v) => setFills(fills.map((candidate, candidateIndex) => candidateIndex === index ? { ...nextFill, angleDeg: v } : candidate))} noLabel className="flex-1" />
                </div>
                {[0, 1].map((stopIndex) => {
                  const stop = nextFill.stops[stopIndex] ?? defaultGradientStops()[stopIndex];
                  return (
                    <div key={stopIndex} className="grid grid-cols-[48px_1fr_80px] items-center gap-2">
                      <label className={uiClasses.fieldLabel}>{stopIndex === 0 ? "From" : "To"}</label>
                      <div className="flex gap-2">
                        <ColorSwatch
                          value={stop.color}
                          onChange={(v) =>
                            setFills(
                              fills.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...nextFill,
                                      stops: nextFill.stops.map((candidateStop, candidateStopIndex) =>
                                        candidateStopIndex === stopIndex ? { ...candidateStop, color: v } : candidateStop
                                      ),
                                    }
                                  : candidate
                              )
                            )
                          }
                        />
                        <input
                          type="text"
                          className={`flex-1 font-mono ${uiClasses.field}`}
                          value={stop.color}
                          onChange={(e) =>
                            setFills(
                              fills.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...nextFill,
                                      stops: nextFill.stops.map((candidateStop, candidateStopIndex) =>
                                        candidateStopIndex === stopIndex ? { ...candidateStop, color: e.target.value } : candidateStop
                                      ),
                                    }
                                  : candidate
                              )
                            )
                          }
                        />
                      </div>
                      <NumberField
                        label=""
                        value={Math.round(stop.position ?? (stopIndex === 0 ? 0 : 100))}
                        onChange={(v) =>
                          setFills(
                            fills.map((candidate, candidateIndex) =>
                              candidateIndex === index
                                ? {
                                    ...nextFill,
                                    stops: nextFill.stops.map((candidateStop, candidateStopIndex) =>
                                      candidateStopIndex === stopIndex ? { ...candidateStop, position: v } : candidateStop
                                    ),
                                  }
                                : candidate
                            )
                          )
                        }
                        noLabel
                      />
                    </div>
                  );
                })}
              </>
            )}

            {nextFill.type === "pattern" && (
              <PatternFillControls
                pattern={nextFill}
                onChange={(pattern) => setFills(fills.map((candidate, candidateIndex) => candidateIndex === index ? pattern : candidate))}
                onPickImage={onPickPatternImage}
              />
            )}
          </div>
        );
      })}

      <button
        type="button"
        className={`${uiClasses.buttonGhost} h-8 w-full`}
        onClick={() => setFills([...fills, { type: "solid", color: "#ffffff", opacity: 1 }])}
      >
        Add Fill
      </button>
    </div>
  );
}

function EffectsStackControls({
  element,
  onChange,
}: {
  element: AnyEl;
  onChange: (patch: Partial<AnyEl>) => void;
}) {
  const effects = getElementEffects(element);

  const setEffects = (nextEffects: OverlayEffect[]) => {
    const normalized = nextEffects.map((effect) => ensureEffect(effect));
    const legacyShadow = normalized.find((effect) => effect.type === "dropShadow") as OverlayShadowEffect | undefined;
    onChange({
      effects: normalized,
      shadow: legacyShadow
        ? {
            enabled: true,
            color: legacyShadow.color,
            blur: legacyShadow.blur,
            x: legacyShadow.x,
            y: legacyShadow.y,
            spread: legacyShadow.spread ?? 0,
          }
        : {
            enabled: false,
            color: "#000000",
            blur: 10,
            x: 0,
            y: 4,
            spread: 0,
          },
    } as any);
  };

  const moveEffect = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= effects.length) return;
    const next = [...effects];
    [next[index], next[target]] = [next[target], next[index]];
    setEffects(next);
  };

  return (
    <div className="space-y-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618] p-3">
      {effects.length === 0 && (
        <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
          No effects. Add shadows, glows, blur, or grain.
        </div>
      )}

      {effects.map((effect, index) => {
        const nextEffect = ensureEffect(effect);
        return (
          <div key={nextEffect.id ?? `${nextEffect.type}-${index}`} className="space-y-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#111113] p-3">
            <div className="flex items-center gap-2">
              <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Effect</label>
              <select
                className={`flex-1 ${uiClasses.field}`}
                value={nextEffect.type}
                onChange={(e) =>
                  setEffects(
                    effects.map((candidate, candidateIndex) =>
                      candidateIndex === index ? defaultEffect(e.target.value as OverlayEffect["type"]) : candidate
                    )
                  )
                }
              >
                {EFFECT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={uiClasses.iconButton}
                onClick={() => moveEffect(index, -1)}
                disabled={index === 0}
                title="Move effect up"
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                className={uiClasses.iconButton}
                onClick={() => moveEffect(index, 1)}
                disabled={index === effects.length - 1}
                title="Move effect down"
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className={uiClasses.iconButton}
                onClick={() => setEffects(effects.filter((_, candidateIndex) => candidateIndex !== index))}
                title="Remove effect"
              >
                <TrashIcon />
              </button>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500"
                checked={nextEffect.enabled !== false}
                onChange={(e) =>
                  setEffects(
                    effects.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...nextEffect, enabled: e.target.checked } : candidate
                    )
                  )
                }
              />
              <span className={uiClasses.fieldLabel}>Enabled</span>
            </label>

            {(nextEffect.type === "dropShadow" ||
              nextEffect.type === "innerShadow" ||
              nextEffect.type === "outerGlow" ||
              nextEffect.type === "innerGlow") && (
              <div className="flex items-center gap-2">
                <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Color</label>
                <div className="flex flex-1 gap-2">
                  <ColorSwatch
                    value={(nextEffect as OverlayShadowEffect | OverlayGlowEffect).color}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, color: v } as OverlayEffect : candidate
                        )
                      )
                    }
                  />
                  <input
                    type="text"
                    className={`flex-1 font-mono ${uiClasses.field}`}
                    value={(nextEffect as OverlayShadowEffect | OverlayGlowEffect).color}
                    onChange={(e) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, color: e.target.value } as OverlayEffect : candidate
                        )
                      )
                    }
                  />
                </div>
              </div>
            )}

            {(nextEffect.type === "dropShadow" || nextEffect.type === "innerShadow") && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Blur</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayShadowEffect).blur}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, blur: Math.max(0, v) } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Spread</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayShadowEffect).spread ?? 0}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, spread: v } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Off X</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayShadowEffect).x}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, x: v } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Off Y</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayShadowEffect).y}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, y: v } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {(nextEffect.type === "outerGlow" || nextEffect.type === "innerGlow") && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Blur</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayGlowEffect).blur}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, blur: Math.max(0, v) } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Spread</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayGlowEffect).spread ?? 0}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, spread: v } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {nextEffect.type === "layerBlur" && (
              <div className="flex items-center gap-2">
                <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Blur</label>
                <NumberField
                  label=""
                  value={(nextEffect as OverlayLayerBlurEffect).blur}
                  onChange={(v) =>
                    setEffects(
                      effects.map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...nextEffect, blur: Math.max(0, v) } as OverlayEffect : candidate
                      )
                    )
                  }
                  noLabel
                  className="flex-1"
                />
              </div>
            )}

            {nextEffect.type === "noise" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Amt</label>
                  <NumberField
                    label=""
                    value={Math.round(((nextEffect as OverlayNoiseEffect).amount ?? 0.18) * 100)}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, amount: Math.max(0, Math.min(1, v / 100)) } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${uiClasses.fieldLabel} w-12 flex-none`}>Scale</label>
                  <NumberField
                    label=""
                    value={(nextEffect as OverlayNoiseEffect).scale ?? 24}
                    onChange={(v) =>
                      setEffects(
                        effects.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...nextEffect, scale: Math.max(1, v) } as OverlayEffect : candidate
                        )
                      )
                    }
                    noLabel
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className={`${uiClasses.buttonGhost} h-8 w-full`}
        onClick={() => setEffects([...effects, defaultEffect("dropShadow")])}
      >
        Add Effect
      </button>
    </div>
  );
}

function InspectorPanel({
  element, onChange, onRename, onPickImage, onPickPatternImage, onPickVideo,
  ltPreview, onLtPreviewChange, onTestLowerThird,
  overlayComponents,
  isComponentMaster, propsSchema, onUpdateSchema,
  onEditMaster, onReleaseMask, onReleaseBoolean, onFlattenBoolean, onConvertToPath, onDetachInstance, onCreateVariant, parentFrame,
  selectedPathAnchor, onAddPathNode, onRemovePathNode, onSplitPath, onContinuePath, onJoinPaths, onExpandStroke, canContinuePath, canJoinPaths,
  previewVisible,
  onPreviewVisibilityAction,
  timelineState,
}: InspectorProps) {
  const isVisible = element.visible !== false;
  const isLocked = element.locked === true;
  const fieldClass = uiClasses.field;
  const fieldLabelClass = uiClasses.fieldLabel;
  const resolvedGeometry =
    element.type === "path" || element.type === "boolean" || element.type === "shape" || element.type === "box"
      ? resolveElementGeometry(element as any)
      : null;
  const pathCommandCount =
    element.type === "path"
      ? ((element as any).path?.commands?.length ?? 0)
      : element.type === "boolean"
        ? (resolvedGeometry?.path.commands.length ?? 0)
        : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-10 custom-scrollbar">
      {/* Header: Name & Global Status */}
      <div className="space-y-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3">
        <label className={`block ${uiClasses.label}`}>Layer</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`flex-1 ${fieldClass}`}
            value={element.name ?? ""}
            placeholder={defaultElementLabel(element)}
            onChange={(e) => onRename(e.target.value)}
          />
          <button
            onClick={() => onChange({ visible: !isVisible })}
            className={`${uiClasses.iconButton} ${!isVisible ? "text-slate-600" : "text-slate-400"}`}
            title="Toggle Visibility"
          >
            {isVisible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            onClick={() => onChange({ locked: !isLocked })}
            className={`${uiClasses.iconButton} ${isLocked ? "text-amber-500" : "text-slate-400"}`}
            title="Toggle Lock"
          >
            {isLocked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>
        {timelineState?.hasAnimatedProperties && element.type !== "lower_third" && (
          <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 px-3 py-2">
            <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">
              Editing animated state at {formatTimelineTime(timelineState.playheadMs)}
            </div>
            <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">
              Marked properties have timeline tracks. Editing them here updates keyframes at the current playhead.
            </div>
          </div>
        )}
        {element.type === "mask" && (
          <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 px-3 py-2">
            <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">Mask group selected</div>
            <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">
              This container uses its first child as the mask shape and clips the content child beneath it.
            </div>
          </div>
        )}
        {(element.type === "path" || element.type === "boolean") && (
          <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 px-3 py-2">
            <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">
              {element.type === "path" ? "Path geometry" : "Boolean geometry"}
            </div>
            <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">
              {element.type === "path"
                ? `This layer renders from ${pathCommandCount ?? 0} local path commands.`
                : `This container resolves ${((element as any).childIds?.length ?? 0)} child shapes into one cached path.`}
            </div>
            {element.type === "boolean" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onFlattenBoolean?.()}
                  className={`${uiClasses.buttonGhost} h-7`}
                >
                  Flatten to Path
                </button>
                <button
                  onClick={() => onReleaseBoolean?.()}
                  className={`${uiClasses.buttonGhost} h-7`}
                >
                  Release Boolean
                </button>
              </div>
            )}
            {element.type === "path" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onAddPathNode?.()}
                  className={`${uiClasses.buttonGhost} h-7`}
                >
                  Add Point
                </button>
                <button
                  onClick={() => onRemovePathNode?.()}
                  disabled={selectedPathAnchor == null}
                  className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}
                >
                  Remove Point
                </button>
                <button
                  onClick={() => onSplitPath?.()}
                  disabled={selectedPathAnchor == null}
                  className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}
                >
                  Split Path
                </button>
                <button
                  onClick={() => onContinuePath?.()}
                  disabled={!canContinuePath}
                  className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}
                >
                  Continue Path
                </button>
                <button
                  onClick={() => onExpandStroke?.()}
                  className={`${uiClasses.buttonGhost} h-7`}
                >
                  Expand Stroke
                </button>
                <button
                  onClick={() => onJoinPaths?.()}
                  disabled={!canJoinPaths}
                  className={`${uiClasses.buttonGhost} h-7 disabled:opacity-30`}
                >
                  Join Selected
                </button>
                <div className="flex items-center text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                  {selectedPathAnchor == null ? "Select a path point to edit it." : `Selected point #${selectedPathAnchor + 1}`}
                </div>
              </div>
            )}
          </div>
        )}
        {(element.type === "shape" || element.type === "box") && (
          <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 px-3 py-2">
            <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">Primitive geometry</div>
            <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">
              This layer is rendered through the shared path model and can be converted into an editable path element.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => onConvertToPath?.()}
                className={`${uiClasses.buttonGhost} h-7`}
              >
                Convert to Path
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transform Section */}
      <AccordionSection title="Transform" defaultOpen={true}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="X" timelineState={timelineState?.properties.x} /></label>
              <NumberField label="" value={element.x ?? 0} onChange={(v) => onChange({ x: v })} noLabel className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="Y" timelineState={timelineState?.properties.y} /></label>
              <NumberField label="" value={element.y ?? 0} onChange={(v) => onChange({ y: v })} noLabel className="flex-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="W" timelineState={timelineState?.properties.width} /></label>
              <NumberField label="" value={element.width ?? 0} onChange={(v) => onChange({ width: v })} noLabel className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="H" timelineState={timelineState?.properties.height} /></label>
              <NumberField label="" value={element.height ?? 0} onChange={(v) => onChange({ height: v })} noLabel className="flex-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="SX" timelineState={timelineState?.properties.scaleX} /></label>
              <NumberField label="" value={typeof (element as any).scaleX === "number" ? (element as any).scaleX : 1} onChange={(v) => onChange({ scaleX: Math.max(0.01, v) } as any)} noLabel className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-8`}><TimelineFieldLabel label="SY" timelineState={timelineState?.properties.scaleY} /></label>
              <NumberField label="" value={typeof (element as any).scaleY === "number" ? (element as any).scaleY : 1} onChange={(v) => onChange({ scaleY: Math.max(0.01, v) } as any)} noLabel className="flex-1" />
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.06)] pt-1">
            <label className={`${fieldLabelClass} w-20 flex-none`}><TimelineFieldLabel label="Rotation" timelineState={timelineState?.properties.rotationDeg} /></label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range" min="-180" max="180"
                className="h-1 flex-1 appearance-none rounded-full bg-[#161618] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400"
                value={(element as any).rotationDeg ?? 0}
                onChange={(e) => onChange({ rotationDeg: snapRotationValue(Number(e.target.value), altDown) } as any)}
              />
              <div className="w-12">
                <NumberField label="" value={(element as any).rotationDeg ?? 0} onChange={(v) => onChange({ rotationDeg: snapRotationValue(v, altDown) } as any)} noLabel />
              </div>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Appearance Section */}
      <AccordionSection title="Appearance" defaultOpen={true}>
        <div className="space-y-4">

          {/* Opacity (Global) */}
          <div className="flex items-center gap-2">
            <label className={`${fieldLabelClass} w-20 flex-none`}><TimelineFieldLabel label="Opacity" timelineState={timelineState?.properties.opacity} /></label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range" min="0" max="1" step="0.01"
                className="h-1 flex-1 appearance-none rounded-full bg-[#161618] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400"
                value={typeof element.opacity === "number" ? element.opacity : 1}
                onChange={(e) => onChange({ opacity: clamp(Number(e.target.value), 0, 1) })}
              />
              <div className="w-12 relative">
                <input
                  type="number"
                  className={`w-full pr-3 text-right ${fieldClass}`}
                  value={Math.round((typeof element.opacity === "number" ? element.opacity : 1) * 100)}
                  onChange={(e) => onChange({ opacity: clamp(Number(e.target.value) / 100, 0, 1) })}
                />
                <span className="absolute right-2 top-[7px] text-[11px] leading-[1.4] text-slate-500">%</span>
              </div>
            </div>
          </div>

          <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

          {/* WIDGET INSTANCE */}
          {(element as any).type === "widget" && (() => {
            const widgetId = (element as any).widgetId;
            const widgetDef = getWidgetDef(widgetId);
            const manifest = widgetDef?.widgetManifest;
            const schema = manifest?.configSchema || [];
            const overrides = (element as any).propOverrides || {};
            if (!manifest) return <div className="text-[12px] leading-[1.4] text-red-400 px-1">Widget definition not found: {widgetId}</div>;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[11px] font-semibold text-indigo-400">{manifest.displayName}</span>
                  {manifest.invisible && <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">invisible</span>}
                </div>
                <div className="text-[11px] text-slate-500 px-1 leading-snug">{manifest.description}</div>
                {schema.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <label className={uiClasses.label}>Widget Settings</label>
                    {schema.map((field: any) => {
                      const val = overrides[field.key] !== undefined ? overrides[field.key] : field.default;
                      return (
                        <div key={field.key} className="flex items-center gap-2">
                          <label className="w-24 truncate text-[11px] leading-[1.4] text-slate-500 flex-shrink-0" title={field.label}>{field.label}</label>
                          {field.type === "boolean" ? (
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={(e) => onChange({ propOverrides: { ...overrides, [field.key]: e.target.checked } } as any)}
                              className="w-4 h-4 accent-indigo-500"
                            />
                          ) : field.type === "select" ? (
                            <select
                              className={`flex-1 ${fieldClass} text-[11px]`}
                              value={val}
                              onChange={(e) => onChange({ propOverrides: { ...overrides, [field.key]: e.target.value } } as any)}
                            >
                              {(field.options || []).map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === "number" ? (
                            <input
                              type="number"
                              className={`flex-1 ${fieldClass}`}
                              value={val}
                              min={0}
                              max={field.key === "volume" ? 100 : undefined}
                              onChange={(e) => onChange({ propOverrides: { ...overrides, [field.key]: Number(e.target.value) } } as any)}
                            />
                          ) : (
                            <input
                              className={`flex-1 ${fieldClass}`}
                              value={val}
                              onChange={(e) => onChange({ propOverrides: { ...overrides, [field.key]: e.target.value } } as any)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {manifest.dataContract?.sseEventType && (
                  <div className="text-[10px] text-emerald-500/70 px-1 pt-1">● Live: {manifest.dataContract.sseEventType}</div>
                )}
              </div>
            );
          })()}

          {/* COMPONENT INSTANCE */}
          {element.type === "componentInstance" && (
            <div className="space-y-4">
              <label className={uiClasses.label}>Component Properties</label>
              {(() => {
                const def = overlayComponents.find(c => c.id === (element as any).componentId);
                if (!def) return <div className="text-[12px] leading-[1.4] text-red-400">Master Definition Missing</div>;
                if (!def.propsSchema || Object.keys(def.propsSchema).length === 0) {
                  return <div className="text-[11px] leading-[1.4] text-slate-500">No properties exposed by master.</div>;
                }
                const schemaKeys = Object.keys(def.propsSchema);
                return schemaKeys.map(key => {
                  const fieldDef = (def.propsSchema as any)[key];
                  const overrides = (element as any).propOverrides || {};
                  const val = overrides[key] !== undefined ? overrides[key] : fieldDef.default;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="w-16 truncate text-[11px] leading-[1.4] text-slate-500" title={fieldDef.label || key}>{fieldDef.label || key}</label>
                      {fieldDef.type === "color" ? (
                        <ColorSwatch value={val} onChange={(v) => onChange({ propOverrides: { ...overrides, [key]: v } } as any)} />
                      ) : (
                        <input
                          className={`flex-1 ${fieldClass}`}
                          value={val}
                          onChange={(e) => onChange({ propOverrides: { ...overrides, [key]: e.target.value } } as any)}
                        />
                      )}
                    </div>
                  );
                });
              })()}
              <div className="pt-2">
                <button
                  onClick={() => onEditMaster?.((element as any).componentId)}
                  className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] text-[12px] leading-[1.4] font-semibold text-slate-200 transition-colors hover:border-indigo-500 hover:bg-[#1d1d20]"
                >
                  <svg {...TOOL_ICON_PROPS}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                  Edit Master Component
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onDetachInstance?.()}
                  className={uiClasses.buttonGhost}
                >
                  Detach Instance
                </button>
                <button
                  onClick={() => onCreateVariant?.((element as any).componentId)}
                  className={uiClasses.buttonGhost}
                >
                  Create Variant
                </button>
              </div>
            </div>
          )}

          {/* LOWER THIRD */}
          {element.type === "lower_third" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className={uiClasses.label}>Layout</label>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Mode</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).layout?.mode ?? "stacked"}
                    onChange={(e) => onChange({ layout: { ...(element as any).layout, mode: e.target.value } } as any)}
                  >
                    <option value="stacked">Stacked</option>
                    <option value="single">Single Line</option>
                    <option value="split">Split</option>
                  </select>
                </div>
                {(element as any).layout?.mode === "split" && (
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12`}>Ratio</label>
                    <input
                      type="range" min="0.2" max="0.8" step="0.05"
                      className="h-1 flex-1 appearance-none rounded-full bg-[#161618] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400"
                      value={(element as any).layout?.splitRatio ?? 0.6}
                      onChange={(e) => onChange({ layout: { ...(element as any).layout, splitRatio: parseFloat(e.target.value) } } as any)}
                    />
                  </div>
                )}
              </div>

              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

              <div className="space-y-2">
                <label className={uiClasses.label}>Style</label>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Variant</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).style?.variant ?? "solid"}
                    onChange={(e) => onChange({ style: { ...(element as any).style, variant: e.target.value } } as any)}
                  >
                    <option value="solid">Solid</option>
                    <option value="glass">Glass</option>
                    <option value="minimal">Minimal</option>
                    <option value="accent-bar">Accent Bar</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Bg</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.bgColor} onChange={(v) => onChange({ style: { ...(element as any).style, bgColor: v } } as any)} />
                    <ColorSwatch value={(element as any).style?.accentColor} onChange={(v) => onChange({ style: { ...(element as any).style, accentColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Title</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.titleColor} onChange={(v) => onChange({ style: { ...(element as any).style, titleColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Sub</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.subtitleColor} onChange={(v) => onChange({ style: { ...(element as any).style, subtitleColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Pad/Rad</label>
                  <NumberField label="" value={(element as any).style?.paddingPx ?? 0} onChange={(v) => onChange({ style: { ...(element as any).style, paddingPx: v } } as any)} noLabel className="flex-1" />
                  <NumberField label="" value={(element as any).style?.cornerRadiusPx ?? 0} onChange={(v) => onChange({ style: { ...(element as any).style, cornerRadiusPx: v } } as any)} noLabel className="flex-1" />
                </div>
              </div>

              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

              <div className="space-y-2">
                <label className={uiClasses.label}>Preview (Editor Only)</label>
                <div className="mb-2 text-[11px] leading-[1.4] text-slate-500">
                  Auto-preview active when selected.
                </div>

                {/* (Save Template button removed) */}

                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => onTestLowerThird("show")}
                    className="h-7 flex-1 rounded-md border border-emerald-800 bg-emerald-900/30 text-[12px] leading-[1.4] text-emerald-200 transition-colors hover:bg-emerald-800/40"
                  >
                    Test Show (5s)
                  </button>
                  <button
                    onClick={() => onTestLowerThird("hide")}
                    className="h-7 flex-1 rounded-md border border-red-800 bg-red-900/30 text-[12px] leading-[1.4] text-red-200 transition-colors hover:bg-red-800/40"
                  >
                    Test Hide
                  </button>
                </div>

                {(element as any).layout?.mode === "single" ? (
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12`}>Text</label>
                    <input
                      className={`flex-1 ${fieldClass}`}
                      value={ltPreview.text}
                      onChange={(e) => onLtPreviewChange({ ...ltPreview, text: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <label className={`${fieldLabelClass} w-12`}>Title</label>
                      <input
                        className={`flex-1 ${fieldClass}`}
                        value={ltPreview.title}
                        onChange={(e) => onLtPreviewChange({ ...ltPreview, title: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`${fieldLabelClass} w-12`}>Sub</label>
                      <input
                        className={`flex-1 ${fieldClass}`}
                        value={ltPreview.subtitle}
                        onChange={(e) => onLtPreviewChange({ ...ltPreview, subtitle: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

              <div className="space-y-2">
                <label className={uiClasses.label}>Animation</label>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>In/Out</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).animation?.in ?? "slideUp"}
                    onChange={(e) => onChange({ animation: { ...(element as any).animation, in: e.target.value } } as any)}
                  >
                    <option value="fade">Fade</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="slideRight">Slide Right</option>
                    <option value="scale">Scale</option>
                  </select>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).animation?.out ?? "slideDown"}
                    onChange={(e) => onChange({ animation: { ...(element as any).animation, out: e.target.value } } as any)}
                  >
                    <option value="fade">Fade</option>
                    <option value="slideDown">Slide Down</option>
                    <option value="slideLeft">Slide Left</option>
                    <option value="scale">Scale</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Dur (ms)</label>
                  <NumberField label="" value={(element as any).animation?.durationMs ?? 400} onChange={(v) => onChange({ animation: { ...(element as any).animation, durationMs: v } } as any)} noLabel className="flex-1" />
                </div>
              </div>
            </div>
          )}

          {/* BOX */}
          {element.type === "box" && (
            <div className="space-y-3">
              <FillStackControls element={element} onChange={onChange} onPickPatternImage={onPickPatternImage} />
              {(() => {
                const uniformRadius = (element as any).borderRadius ?? (element as any).borderRadiusPx ?? 0;
                const cornerRadii = ensureCornerRadii(uniformRadius, (element as any).cornerRadii);
                return (
                  <>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Radius</label>
                <NumberField label="" value={(element as any).borderRadius ?? (element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadius: v, borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-2 ml-14">
                {([
                  ["TL", "topLeft"],
                  ["TR", "topRight"],
                  ["BL", "bottomLeft"],
                  ["BR", "bottomRight"],
                ] as const).map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="w-6 flex-none text-[11px] leading-[1.4] text-slate-500">{label}</label>
                    <NumberField
                      label=""
                      value={Math.round(cornerRadii[key] ?? 0)}
                      onChange={(v) => onChange({ borderRadius: v, borderRadiusPx: v, cornerRadii: { ...cornerRadii, [key]: v } } as any)}
                      noLabel
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Corner</label>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).cornerType ?? "round"}
                  onChange={(e) => onChange({ cornerType: e.target.value } as any)}
                >
                  {CORNER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Stroke</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).strokeColor ?? "#ffffff"} onChange={(v) => onChange({ strokeColor: v } as any)} />
                  <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).strokeColor ?? ""} onChange={(e) => onChange({ strokeColor: e.target.value } as any)} placeholder="None" />
                </div>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <NumberField label="" value={(element as any).strokeWidthPx ?? 0} onChange={(v) => onChange({ strokeWidthPx: v } as any)} noLabel className="w-16" />
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={Array.isArray((element as any).strokeDash) && (element as any).strokeDash.length > 0 ? "dashed" : "solid"}
                  onChange={(e) => onChange({ strokeDash: e.target.value === "dashed" ? [6, 4] : [] } as any)}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Align</label>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeAlign ?? "center"}
                  onChange={(e) => onChange({ strokeAlign: e.target.value } as any)}
                >
                  {STROKE_ALIGN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Join</label>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeLineJoin ?? "miter"}
                  onChange={(e) => onChange({ strokeLineJoin: e.target.value } as any)}
                >
                  <option value="miter">Miter</option>
                  <option value="round">Round</option>
                  <option value="bevel">Bevel</option>
                </select>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeLineCap ?? "butt"}
                  onChange={(e) => onChange({ strokeLineCap: e.target.value } as any)}
                >
                  <option value="butt">Butt</option>
                  <option value="round">Round</option>
                  <option value="square">Square</option>
                </select>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Sides</label>
                <div className="flex flex-1 gap-1">
                  {([
                    ["T", "top"],
                    ["R", "right"],
                    ["B", "bottom"],
                    ["L", "left"],
                  ] as const).map(([label, key]) => {
                    const active = (((element as any).strokeSides?.[key] ?? true) === true);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`${uiClasses.buttonGhost} h-7 flex-1 ${active ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-100" : ""}`}
                        onClick={() =>
                          onChange({
                            strokeSides: {
                              top: (element as any).strokeSides?.top ?? true,
                              right: (element as any).strokeSides?.right ?? true,
                              bottom: (element as any).strokeSides?.bottom ?? true,
                              left: (element as any).strokeSides?.left ?? true,
                              [key]: !active,
                            },
                          } as any)
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
                );
              })()}
            </div>
          )}

          {/* SHAPE / PATH / BOOLEAN */}
          {(element.type === "shape" || element.type === "path" || element.type === "boolean") && (
            <div className="space-y-3">
              {element.type === "shape" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12 flex-none`}>Shape</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).shape ?? "rect"}
                    onChange={(e) => onChange({ shape: e.target.value } as any)}
                  >
                    <option value="rect">Rectangle</option>
                    <option value="circle">Circle</option>
                    <option value="triangle">Triangle</option>
                    <option value="polygon">Polygon</option>
                    <option value="star">Star</option>
                    <option value="arrow">Arrow</option>
                    <option value="line">Line</option>
                  </select>
                </div>
              )}

              {element.type === "shape" && (element as any).shape === "polygon" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12 flex-none`}>Sides</label>
                  <NumberField
                    label=""
                    value={(element as any).polygon?.sides ?? 6}
                    onChange={(v) => onChange({ polygon: { ...(element as any).polygon, sides: Math.max(3, Math.round(v)) } } as any)}
                    noLabel
                    className="flex-1"
                  />
                </div>
              )}

              {element.type === "shape" && (element as any).shape === "star" && (
                <>
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12 flex-none`}>Points</label>
                    <NumberField
                      label=""
                      value={(element as any).star?.points ?? 5}
                      onChange={(v) => onChange({ star: { ...(element as any).star, points: Math.max(3, Math.round(v)) } } as any)}
                      noLabel
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12 flex-none`}>Inner</label>
                    <div className="w-16 relative">
                      <NumberField
                        label=""
                        value={Math.round(((element as any).star?.innerRatio ?? 0.5) * 100)}
                        onChange={(v) => onChange({ star: { ...(element as any).star, innerRatio: clamp(v / 100, 0.05, 0.95) } } as any)}
                        noLabel
                      />
                      <span className="absolute right-4 top-[7px] text-[11px] leading-[1.4] text-slate-500">%</span>
                    </div>
                  </div>
                </>
              )}

              {element.type === "shape" && (element as any).shape === "arrow" && (
                <>
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12 flex-none`}>Dir</label>
                    <select
                      className={`flex-1 ${fieldClass}`}
                      value={(element as any).arrow?.direction ?? "right"}
                      onChange={(e) => onChange({ arrow: { ...(element as any).arrow, direction: e.target.value } } as any)}
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabelClass} w-12 flex-none`}>Shaft</label>
                    <div className="w-16 relative">
                      <NumberField
                        label=""
                        value={Math.round(((element as any).arrow?.shaftRatio ?? 0.42) * 100)}
                        onChange={(v) => onChange({ arrow: { ...(element as any).arrow, shaftRatio: clamp(v / 100, 0.1, 0.8) } } as any)}
                        noLabel
                      />
                      <span className="absolute right-4 top-[7px] text-[11px] leading-[1.4] text-slate-500">%</span>
                    </div>
                  </div>
                </>
              )}

              {element.type === "boolean" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12 flex-none`}>Op</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={(element as any).operation ?? "union"}
                    onChange={(e) => onChange({ operation: e.target.value } as any)}
                  >
                    <option value="union">Union</option>
                    <option value="subtract">Subtract</option>
                    <option value="intersect">Intersect</option>
                    <option value="exclude">Exclude</option>
                  </select>
                </div>
              )}

              <FillStackControls element={element} onChange={onChange} onPickPatternImage={onPickPatternImage} />
              {element.type === "shape" && (element as any).shape === "line" && getElementFills(element).some((fill) => fill.type === "pattern") && (
                <div className="ml-14 text-[11px] leading-[1.4] text-slate-500">
                  Pattern fill is ignored for line shapes in this pass.
                </div>
              )}

              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Stroke</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).strokeColor} onChange={(v) => onChange({ strokeColor: v } as any)} />
                  <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).strokeColor ?? ""} onChange={(e) => onChange({ strokeColor: e.target.value } as any)} placeholder="None" />
                </div>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <NumberField label="" value={(element as any).strokeWidthPx ?? 0} onChange={(v) => onChange({ strokeWidthPx: v, strokeWidth: v } as any)} noLabel className="w-16" />
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={Array.isArray((element as any).strokeDash) && (element as any).strokeDash.length > 0 ? "dashed" : "solid"}
                  onChange={(e) => onChange({ strokeDash: e.target.value === "dashed" ? [6, 4] : [] } as any)}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Align</label>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeAlign ?? "center"}
                  onChange={(e) => onChange({ strokeAlign: e.target.value } as any)}
                >
                  {STROKE_ALIGN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Join</label>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeLineJoin ?? "miter"}
                  onChange={(e) => onChange({ strokeLineJoin: e.target.value } as any)}
                >
                  <option value="miter">Miter</option>
                  <option value="round">Round</option>
                  <option value="bevel">Bevel</option>
                </select>
                <select
                  className={`flex-1 ${fieldClass}`}
                  value={(element as any).strokeLineCap ?? "butt"}
                  onChange={(e) => onChange({ strokeLineCap: e.target.value } as any)}
                >
                  <option value="butt">Butt</option>
                  <option value="round">Round</option>
                  <option value="square">Square</option>
                </select>
              </div>
              {(element.type === "box" || (element.type === "shape" && (element as any).shape === "rect")) && (
                <div className="flex items-center gap-2 ml-14">
                  <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Sides</label>
                  <div className="flex flex-1 gap-1">
                    {([
                      ["T", "top"],
                      ["R", "right"],
                      ["B", "bottom"],
                      ["L", "left"],
                    ] as const).map(([label, key]) => {
                      const active = (((element as any).strokeSides?.[key] ?? true) === true);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`${uiClasses.buttonGhost} h-7 flex-1 ${active ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-100" : ""}`}
                          onClick={() =>
                            onChange({
                              strokeSides: {
                                top: (element as any).strokeSides?.top ?? true,
                                right: (element as any).strokeSides?.right ?? true,
                                bottom: (element as any).strokeSides?.bottom ?? true,
                                left: (element as any).strokeSides?.left ?? true,
                                [key]: !active,
                              },
                            } as any)
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {element.type === "shape" && (
                (() => {
                  const uniformRadius = (element as any).cornerRadiusPx ?? (element as any).cornerRadius ?? 0;
                  const cornerRadii = ensureCornerRadii(uniformRadius, (element as any).cornerRadii);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <label className={`${fieldLabelClass} w-12 flex-none`}>Radius</label>
                        <NumberField label="" value={uniformRadius} onChange={(v) => onChange({ cornerRadiusPx: v, cornerRadius: v } as any)} noLabel className="flex-1" />
                      </div>
                      {(element as any).shape === "rect" && (
                        <>
                          <div className="grid grid-cols-2 gap-2 ml-14">
                            {([
                              ["TL", "topLeft"],
                              ["TR", "topRight"],
                              ["BL", "bottomLeft"],
                              ["BR", "bottomRight"],
                            ] as const).map(([label, key]) => (
                              <div key={key} className="flex items-center gap-2">
                                <label className="w-6 flex-none text-[11px] leading-[1.4] text-slate-500">{label}</label>
                                <NumberField
                                  label=""
                                  value={Math.round(cornerRadii[key] ?? 0)}
                                  onChange={(v) => onChange({ cornerRadiusPx: v, cornerRadius: v, cornerRadii: { ...cornerRadii, [key]: v } } as any)}
                                  noLabel
                                  className="flex-1"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className={`${fieldLabelClass} w-12 flex-none`}>Corner</label>
                            <select
                              className={`flex-1 ${fieldClass}`}
                              value={(element as any).cornerType ?? "round"}
                              onChange={(e) => onChange({ cornerType: e.target.value } as any)}
                            >
                              {CORNER_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          )}

          {/* TEXT */}
          {element.type === "text" && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] leading-[1.4] font-semibold text-slate-300">Content</label>
                  <div className="flex items-center gap-2">
                    <BindingPicker
                      propName="text"
                      type="text"
                      binding={element.bindings?.["text"]}
                      onUpdate={(b) => {
                        const newBindings = { ...element.bindings };
                        if (b) newBindings["text"] = b;
                        else delete newBindings["text"];
                        onChange({ bindings: newBindings } as any);
                      }}
                    />
                    {isComponentMaster && <ExposeButton element={element} propPath="text" propsSchema={propsSchema} onUpdateSchema={onUpdateSchema} onChange={onChange} />}
                  </div>
                </div>
                {!element.bindings?.["text"] ? (
                  <textarea
                    className={`min-h-[60px] w-full font-mono ${fieldClass}`}
                    value={(element as any).text ?? ""}
                    onChange={(e) => onChange({ text: e.target.value } as any)}
                    placeholder="Enter static text..."
                  />
                ) : (
                  <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 p-3 text-[11px] leading-[1.4] italic text-indigo-300">
                    Bound to <span className="font-bold text-indigo-400">{SourceCatalog.find(s => s.id === element.bindings?.["text"]?.sourceId)?.label}</span>.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Font</label>
                <div className="flex-1">
                  <FontPicker
                    value={(element as any).fontFamily}
                    onChange={(v) => onChange({ fontFamily: v } as any)}
                    recentFonts={["Inter", "Roboto", "Open Sans", "Oswald", "Bebas Neue"]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Size</label>
                  <NumberField label="" value={(element as any).fontSize ?? 24} onChange={(v) => onChange({ fontSize: v } as any)} noLabel className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-8 flex-none text-[11px] leading-[1.4] text-slate-500">Wgt</label>
                  <select className={`flex-1 ${fieldClass}`} value={(element as any).fontWeight ?? "normal"} onChange={(e) => onChange({ fontWeight: e.target.value } as any)}>
                    <option value="normal">Reg</option>
                    <option value="bold">Bold</option>
                    <option value="100">Thin</option>
                    <option value="900">Heavy</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Align</label>
                <div className="flex flex-1 overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)]">
                  {["left", "center", "right"].map(a => (
                    <button
                      key={a}
                      className={`h-7 flex-1 text-[11px] leading-[1.4] uppercase ${(
                        element as any
                      ).textAlign === a ? "bg-[#1d1d20] text-white" : "bg-[#161618] text-slate-400 hover:bg-[#1d1d20]"}`}
                      onClick={() => onChange({ textAlign: a } as any)}
                    >
                      {a === 'left' ? '|<' : a === 'right' ? '>|' : '=|='}
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />

              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Color</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).color} onChange={(v) => onChange({ color: v } as any)} />
                  <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).color ?? ""} onChange={(e) => onChange({ color: e.target.value } as any)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Stroke</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).strokeColor} onChange={(v) => onChange({ strokeColor: v } as any)} />
                  <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).strokeColor ?? ""} onChange={(e) => onChange({ strokeColor: e.target.value } as any)} placeholder="None" />
                  <NumberField label="" value={(element as any).strokeWidthPx ?? 0} onChange={(v) => onChange({ strokeWidthPx: v } as any)} noLabel className="w-12" />
                </div>
              </div>
            </div>
          )}

          {/* IMAGE/VIDEO */}
          {(element.type === "image" || element.type === "video") && (
            <div className="space-y-3">
              {(() => {
                const keying = ensureKeying((element as any).keying);
                return (
                  <div className="space-y-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] p-3">
                    <div className="flex items-center gap-2">
                      <label className={`${fieldLabelClass} w-16 flex-none`}>Keying</label>
                      <select
                        className={`flex-1 ${fieldClass}`}
                        value={keying.mode}
                        onChange={(e) =>
                          onChange({
                            keying: e.target.value === "none"
                              ? { ...keying, mode: "none" }
                              : { ...keying, mode: e.target.value },
                          } as any)
                        }
                      >
                        <option value="none">None</option>
                        <option value="alphaBlack">Alpha from Black</option>
                        <option value="alphaWhite">Alpha from White</option>
                        <option value="chromaKey">Chroma Key</option>
                      </select>
                    </div>
                    {keying.mode !== "none" && (
                      <>
                        {(keying.mode === "alphaBlack" || keying.mode === "alphaWhite") && (
                          <>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Threshold</label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(keying.threshold * 100)}
                                onChange={(e) => onChange({ keying: { ...keying, threshold: clamp(Number(e.target.value) / 100, 0, 1) } } as any)}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="w-10 text-right text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">{Math.round(keying.threshold * 100)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Softness</label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(keying.softness * 100)}
                                onChange={(e) => onChange({ keying: { ...keying, softness: clamp(Number(e.target.value) / 100, 0, 1) } } as any)}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="w-10 text-right text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">{Math.round(keying.softness * 100)}</span>
                            </div>
                          </>
                        )}
                        {keying.mode === "chromaKey" && (
                          <>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Color</label>
                              <ColorSwatch value={keying.keyColor} onChange={(v) => onChange({ keying: { ...keying, keyColor: v } } as any)} />
                              <input
                                type="text"
                                className={`flex-1 font-mono ${fieldClass}`}
                                value={keying.keyColor}
                                onChange={(e) => onChange({ keying: { ...keying, keyColor: e.target.value } } as any)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Tolerance</label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(keying.tolerance * 100)}
                                onChange={(e) => onChange({ keying: { ...keying, tolerance: clamp(Number(e.target.value) / 100, 0, 1) } } as any)}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="w-10 text-right text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">{Math.round(keying.tolerance * 100)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Softness</label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(keying.softness * 100)}
                                onChange={(e) => onChange({ keying: { ...keying, softness: clamp(Number(e.target.value) / 100, 0, 1) } } as any)}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="w-10 text-right text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">{Math.round(keying.softness * 100)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className={`${fieldLabelClass} w-16 flex-none`}>Spill</label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(keying.spillReduction * 100)}
                                onChange={(e) => onChange({ keying: { ...keying, spillReduction: clamp(Number(e.target.value) / 100, 0, 1) } } as any)}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="w-10 text-right text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-400">{Math.round(keying.spillReduction * 100)}</span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] leading-[1.4] font-semibold text-slate-300">Source</label>
                  <BindingPicker
                    propName="src"
                    type="image"
                    binding={element.bindings?.["src"]}
                    onUpdate={(b) => {
                      const newBindings = { ...element.bindings };
                      if (b) newBindings["src"] = b;
                      else delete newBindings["src"];
                      onChange({ bindings: newBindings } as any);
                    }}
                  />
                </div>
                {!element.bindings?.["src"] ? (
                  <div className="flex gap-2">
                    <input type="text" className={`flex-1 ${fieldClass}`} value={(element as any).src ?? ""} onChange={(e) => onChange({ src: e.target.value } as any)} placeholder="URL" />
                    <button onClick={element.type === "image" ? onPickImage : onPickVideo} className={uiClasses.button}><FolderIcon /></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-md border border-indigo-500/10 bg-indigo-500/5 p-3 text-[11px] leading-[1.4] italic text-indigo-300">
                    <span>Bound to <span className="font-bold text-indigo-400">{SourceCatalog.find(s => s.id === element.bindings?.["src"]?.sourceId)?.label}</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12 flex-none`}>Fit</label>
                <select className={`flex-1 ${fieldClass}`} value={(element as any).fit ?? "cover"} onChange={(e) => onChange({ fit: e.target.value } as any)}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-20 flex-none`}>Blend Mode</label>
                <select className={`flex-1 ${fieldClass}`} value={(element as any).blendMode ?? "normal"} onChange={(e) => onChange({ blendMode: e.target.value } as any)}>
                  <option value="normal">Normal</option>
                  <option value="screen">Screen</option>
                  <option value="multiply">Multiply</option>
                </select>
              </div>
              {((element as any).blendMode ?? "normal") !== "normal" && (
                <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                  Screen is useful for effects on black backgrounds.
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Radius</label>
                <NumberField label="" value={(element as any).borderRadius ?? (element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadius: v, borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>

              {element.type === "video" && (
                <div className="grid grid-cols-2 gap-2 border-t border-[rgba(255,255,255,0.08)] pt-2">
                  <label className="flex items-center gap-2 text-[12px] leading-[1.4] text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).autoplay !== false} onChange={(e) => onChange({ autoplay: e.target.checked } as any)} className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500" /> Auto</label>
                  <label className="flex items-center gap-2 text-[12px] leading-[1.4] text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).loop !== false} onChange={(e) => onChange({ loop: e.target.checked } as any)} className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500" /> Loop</label>
                  <label className="flex items-center gap-2 text-[12px] leading-[1.4] text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).muted !== false} onChange={(e) => onChange({ muted: e.target.checked } as any)} className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500" /> Mute</label>
                </div>
              )}
            </div>
          )}

          {/* PROGRESS */}
          {(element.type === "progressBar" || element.type === "progressRing") && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Fill</label>
                <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).fillColor} onChange={e => onChange({ fillColor: e.target.value } as any)} />
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Track</label>
                <input type="text" className={`flex-1 font-mono ${fieldClass}`} value={(element as any).backgroundColor} onChange={e => onChange({ backgroundColor: e.target.value } as any)} />
              </div>
              {element.type === "progressRing" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Stroke</label>
                  <NumberField label="" value={(element as any).strokeWidthPx ?? 4} onChange={(v) => onChange({ strokeWidthPx: v } as any)} noLabel className="flex-1" />
                </div>
              )}
              {element.type === "progressBar" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Radius</label>
                  <NumberField label="" value={(element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadiusPx: v } as any)} noLabel className="flex-1" />
                </div>
              )}

              {element.type === "progressBar" && (
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-12`}>Dir</label>
                  <select className={`flex-1 ${fieldClass}`} value={(element as any).direction ?? "ltr"} onChange={(e) => onChange({ direction: e.target.value } as any)}>
                    <option value="ltr">L → R</option>
                    <option value="rtl">R → L</option>
                    <option value="ttb">T → B</option>
                    <option value="btt">B → T</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* GROUP */}
          {(element.type === "group" || element.type === "frame") && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Bg</label>
                <input type="text" className={`flex-1 ${fieldClass}`} value={(element as any).backgroundColor ?? ""} onChange={(e) => onChange({ backgroundColor: e.target.value } as any)} placeholder="Transparent" />
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Border</label>
                <div className="flex-1 flex gap-2">
                  <input type="text" className={`flex-1 ${fieldClass}`} value={(element as any).borderColor ?? ""} onChange={(e) => onChange({ borderColor: e.target.value } as any)} placeholder="None" />
                  <NumberField label="" value={(element as any).borderWidth ?? 0} onChange={(v) => onChange({ borderWidth: v } as any)} noLabel className="w-12" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className={`${fieldLabelClass} w-12`}>Radius</label>
                <NumberField label="" value={(element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>
              {element.type === "frame" && (
                <>
                  <div className="my-2 h-px bg-[rgba(255,255,255,0.06)]" />
                  <div className="space-y-3">
                    <label className={uiClasses.label}>Frame Layout</label>
                    <div className="flex items-center gap-2">
                      <label className={`${fieldLabelClass} w-16 flex-none`}>Mode</label>
                      <select
                        className={`flex-1 ${fieldClass}`}
                        value={ensureFrameLayout((element as any).layout).mode}
                        onChange={(e) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), mode: e.target.value } } as any)}
                      >
                        {FRAME_LAYOUT_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <label className={`${fieldLabelClass} w-16 flex-none`}>Gap</label>
                        <NumberField label="" value={ensureFrameLayout((element as any).layout).gap ?? 12} onChange={(v) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), gap: v } } as any)} noLabel className="flex-1" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={`${fieldLabelClass} w-16 flex-none`}>Pad</label>
                        <NumberField label="" value={ensureFrameLayout((element as any).layout).padding ?? 16} onChange={(v) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), padding: v } } as any)} noLabel className="flex-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <label className={`${fieldLabelClass} w-16 flex-none`}>Align</label>
                        <select className={`flex-1 ${fieldClass}`} value={ensureFrameLayout((element as any).layout).align} onChange={(e) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), align: e.target.value } } as any)}>
                          {FRAME_ALIGN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={`${fieldLabelClass} w-16 flex-none`}>Justify</label>
                        <select className={`flex-1 ${fieldClass}`} value={ensureFrameLayout((element as any).layout).justify} onChange={(e) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), justify: e.target.value } } as any)}>
                          {FRAME_JUSTIFY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] leading-[1.4] text-slate-300">
                      <input
                        type="checkbox"
                        checked={ensureFrameLayout((element as any).layout).wrap === true}
                        onChange={(e) => onChange({ layout: { ...ensureFrameLayout((element as any).layout), wrap: e.target.checked } } as any)}
                        className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500"
                      />
                      Wrap items
                    </label>
                    <label className="flex items-center gap-2 text-[12px] leading-[1.4] text-slate-300">
                      <input
                        type="checkbox"
                        checked={(element as any).clipContent !== false}
                        onChange={(e) => onChange({ clipContent: e.target.checked } as any)}
                        className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500"
                      />
                      Clip content to frame
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {parentFrame && element.type !== "frame" && element.type !== "componentInstance" && (
            <div className="space-y-3 rounded-md border border-indigo-500/10 bg-indigo-500/5 px-3 py-3">
              <div>
                <div className="text-[12px] leading-[1.4] tracking-[-0.02em] text-indigo-100">Frame constraints</div>
                <div className="mt-1 text-[11px] leading-[1.4] tracking-[-0.02em] text-indigo-200/80">
                  This layer belongs to {parentFrame.name || "a frame"}. Constraints apply when the frame is resized.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-8 flex-none`}>H</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={ensureConstraints((element as any).constraints).horizontal}
                    onChange={(e) => onChange({ constraints: { ...ensureConstraints((element as any).constraints), horizontal: e.target.value as OverlayConstraintMode } } as any)}
                  >
                    {CONSTRAINT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`${fieldLabelClass} w-8 flex-none`}>V</label>
                  <select
                    className={`flex-1 ${fieldClass}`}
                    value={ensureConstraints((element as any).constraints).vertical}
                    onChange={(e) => onChange({ constraints: { ...ensureConstraints((element as any).constraints), vertical: e.target.value as OverlayConstraintMode } } as any)}
                  >
                    {CONSTRAINT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* MASK */}
          {element.type === "mask" && (
            <div className="space-y-3">
              <div className="rounded-md border border-indigo-500/10 bg-indigo-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md border border-indigo-400/20 bg-[#161618] text-indigo-300">
                    <MaskIcon />
                  </div>
                  <div>
                    <div className="text-[12px] leading-[1.4] font-semibold text-indigo-300">
                      {(element as any).invert ? "Inverse Mask" : "Mask Group"}
                    </div>
                    <div className="text-[11px] leading-[1.4] text-slate-500">
                      {(element as any).invert
                        ? "The shape cuts a hole through the content so only the outside remains visible."
                        : "The shape clips the content so only the area inside the mask stays visible."}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-3">
                  <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#161618] px-3 py-2">
                    <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">Mask workflow</div>
                    <div className="mt-1 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-200">
                      Child 1 is the mask shape. Child 2 is the clipped content.
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] leading-[1.4]">
                    <span className="text-slate-500">Mask Shape:</span>
                    <span className="text-slate-300 font-mono">{(element as any).childIds?.[0]}</span>
                  </div>
                  <div className="flex justify-between text-[11px] leading-[1.4]">
                    <span className="text-slate-500">Content Layer:</span>
                    <span className="text-slate-300 font-mono">{(element as any).childIds?.[1]}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-indigo-500/10">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <div className="text-[12px] leading-[1.4] font-semibold text-slate-200">Invert Mask</div>
                      <div className="text-[11px] leading-[1.4] text-slate-500">
                        Cut a hole instead of clipping to the shape
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={!!(element as any).invert}
                      onChange={(e) => onChange({ invert: e.target.checked } as any)}
                      className="rounded border-[rgba(255,255,255,0.08)] bg-[#161618] accent-indigo-500"
                    />
                  </label>
                </div>

                {onReleaseMask && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                      Release keeps the underlying layers and removes this mask container.
                    </div>
                    <button
                      onClick={() => onReleaseMask(element.id)}
                      className="h-8 w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] text-[12px] leading-[1.4] font-semibold text-slate-300 transition-all hover:border-red-500/50 hover:bg-red-900/30 hover:text-red-200"
                    >
                      Release Mask Group
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </AccordionSection >

      {element.type !== "lower_third" && (
        <AccordionSection title="Animation" defaultOpen={true}>
          <div className="space-y-3">
            <div className="text-[11px] leading-[1.4] text-slate-500">
              Delay is in milliseconds. Start always resets the element to its hidden baseline first, then runs the configured enter animation without saving visibility changes.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("enter")}
                className="h-7 flex-1 rounded-md border border-emerald-800 bg-emerald-900/30 text-[12px] leading-[1.4] text-emerald-200 transition-colors hover:bg-emerald-800/40"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("exit")}
                className="h-7 flex-1 rounded-md border border-amber-800 bg-amber-900/30 text-[12px] leading-[1.4] text-amber-200 transition-colors hover:bg-amber-800/40"
              >
                Test Exit
              </button>
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("reset")}
                className="h-7 flex-1 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] text-[12px] leading-[1.4] text-slate-200 transition-colors hover:bg-[#1d1d20]"
              >
                Reset
              </button>
            </div>

            <div className="text-[11px] leading-[1.4] text-slate-500">
              Preview state: <span className="text-slate-300">{previewVisible ? "Visible" : "Hidden"}</span>
            </div>

            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-12 flex-none`}>Enter</label>
              <select
                className={`flex-1 ${fieldClass}`}
                value={(element as any).animation?.enter ?? "none"}
                onChange={(e) =>
                  onChange({
                    animation: {
                      ...(element as any).animation,
                      enter: e.target.value as OverlayMotionPreset,
                    },
                  } as any)
                }
              >
                {GENERIC_MOTION_OPTIONS.map((option) => (
                  <option key={`enter-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-12 flex-none`}>Exit</label>
              <select
                className={`flex-1 ${fieldClass}`}
                value={(element as any).animation?.exit ?? "none"}
                onChange={(e) =>
                  onChange({
                    animation: {
                      ...(element as any).animation,
                      exit: e.target.value as OverlayMotionPreset,
                    },
                  } as any)
                }
              >
                {GENERIC_MOTION_OPTIONS.map((option) => (
                  <option key={`exit-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-12 flex-none`}>Dur</label>
              <NumberField
                label=""
                value={(element as any).animation?.durationMs ?? 400}
                onChange={(v) =>
                  onChange({
                    animation: {
                      ...(element as any).animation,
                      durationMs: v,
                    },
                  } as any)
                }
                noLabel
                className="flex-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-12 flex-none`}>Delay</label>
              <NumberField
                label=""
                value={(element as any).animation?.delayMs ?? 0}
                onChange={(v) =>
                  onChange({
                    animation: {
                      ...(element as any).animation,
                      delayMs: v,
                    },
                  } as any)
                }
                noLabel
                className="flex-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className={`${fieldLabelClass} w-12 flex-none`}>Ease</label>
              <select
                className={`flex-1 ${fieldClass}`}
                value={(element as any).animation?.easing ?? "ease-out"}
                onChange={(e) =>
                  onChange({
                    animation: {
                      ...(element as any).animation,
                      easing: e.target.value as NonNullable<OverlayAnimation["easing"]>,
                    },
                  } as any)
                }
              >
                {GENERIC_EASING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AccordionSection>
      )}

      {/* Effects Section (Collapsed by default) */}
      {/* Effects Section (Collapsed by default) */}
      <AccordionSection title="Effects" defaultOpen={false}>
        <div className="space-y-4">
          <EffectsStackControls element={element} onChange={onChange} />

          <div className="h-px bg-[rgba(255,255,255,0.06)]" />

          {/* Clip */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="flex-1 text-[12px] leading-[1.4] font-semibold text-slate-300">Masking</label>
              <select
                className={`w-24 ${fieldClass}`}
                value={(element as any).clip?.type ?? "none"}
                onChange={(e) => onChange({ clip: { ...(element as any).clip, type: e.target.value } } as any)}
              >
                <option value="none">None</option>
                <option value="roundRect">Frame</option>
                <option value="circle">Circle</option>
              </select>
            </div>
            {(element as any).clip?.type === "roundRect" && (
              <div className="mt-2 ml-1 flex items-center gap-2 border-l-2 border-[rgba(255,255,255,0.08)] pl-2">
                <label className="w-10 flex-none text-[11px] leading-[1.4] text-slate-500">Radius</label>
                <NumberField label="" value={(element as any).clip?.radius ?? 0} onChange={(v) => onChange({ clip: { ...(element as any).clip, radius: v } } as any)} noLabel className="flex-1" />
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* Data / Behavior Section (Collapsed by default) */}
      {
        (element.type === "text" || element.type === "progressBar" || element.type === "progressRing") && (
          <AccordionSection title="Data & Binding" defaultOpen={false}>
            <div className="space-y-3">
              {(element.type === "progressBar" || element.type === "progressRing") && (
                <div>
                  <label className="mb-1 block text-[12px] leading-[1.4] text-slate-400">Value ({Math.round(((element as any).value ?? 0) * 100)}%)</label>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    className="h-1 w-full rounded-full bg-[#161618]"
                    value={(element as any).value ?? 0}
                    onChange={(e) => onChange({ value: Number(e.target.value) } as any)}
                  />
                </div>
              )}
              {element.type === "text" && (
                <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-2 text-[12px] leading-[1.4] text-slate-400">
                  <div className="mb-1 text-[12px] leading-[1.4] font-semibold text-slate-300">Variable Injection</div>
                  Use <code>{`{{variable}}`}</code> in the text content to bind data from the Test Data panel.
                </div>
              )}
            </div>
          </AccordionSection>
        )
      }

    </div >
  );
}


function resolveRelativeNumberInput(currentValue: number, raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return currentValue;

  if (/^[+\-*/]\s*-?\d+(\.\d+)?$/.test(trimmed)) {
    const op = trimmed[0];
    const operand = Number(trimmed.slice(1).trim());
    if (!Number.isFinite(operand)) return currentValue;
    if (op === "+") return currentValue + operand;
    if (op === "-") return currentValue - operand;
    if (op === "*") return currentValue * operand;
    if (op === "/") return operand === 0 ? currentValue : currentValue / operand;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : currentValue;
}

function NumberField({ label, value, onChange, className, noLabel }: { label: string; value: number; onChange: (v: number) => void, className?: string; noLabel?: boolean }) {
  const [draft, setDraft] = useState<string>(String(Number.isFinite(value) ? value : 0));

  useEffect(() => {
    setDraft(String(Number.isFinite(value) ? value : 0));
  }, [value]);

  return (
    <div className={className}>
      {!noLabel && <label className={`mb-1 block ${uiClasses.fieldLabel}`}>{label}</label>}
      <input
        type="text"
        className={`w-full ${uiClasses.field}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = resolveRelativeNumberInput(value, draft);
          setDraft(String(next));
          onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const next = resolveRelativeNumberInput(value, draft);
            setDraft(String(next));
            onChange(next);
          }
        }}
      />
    </div>
  );
}

// ===== Modal: Shared picker for images/videos (Phase 1: upload + local recent) =====
function AssetPickerModal({
  title,
  scope,
  kind,
  onPick,
  onClose,
}: {
  title: string;
  scope: AssetScope;
  kind: AssetKind;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [recent, setRecent] = useState<AssetItem[]>(() => loadRecentAssets(scope, kind));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => setRecent(loadRecentAssets(scope, kind)), [scope, kind]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accept = kind === "images" ? "image/*" : "video/*";

  const doUpload = useCallback(
    async (file: File) => {
      try {
        setBusy(true);
        setErr(null);
        const { url } = await uploadAssetFile(file, scope, kind);
        pushRecentAsset(scope, kind, url, file.name);
        refresh();
        onPick(url);
      } catch (e: any) {
        setErr(e?.message || "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [scope, kind, onPick, refresh]
  );

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/70" onMouseDown={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-3xl rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
            <div className="text-[14px] leading-[1.4] font-semibold text-slate-100">{title}</div>
            <button
              className={uiClasses.buttonGhost}
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] leading-[1.4] text-slate-400">
                Scope: <span className="text-slate-200">{scope}</span> • Kind:{" "}
                <span className="text-slate-200">{kind}</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={accept}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void doUpload(f);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 items-center justify-center gap-2 rounded-md border border-indigo-400/30 bg-indigo-500/15 px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-indigo-100 transition-colors hover:bg-indigo-500/20 disabled:opacity-60"
                >
                  <FolderIcon />
                  {busy ? "Uploading..." : "Upload file"}
                </button>
              </div>
            </div>

            {err && <div className="text-[12px] leading-[1.4] text-red-400">{err}</div>}

            <div className="overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)]">
              <div className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                <div className="text-[11px] leading-[1.4] uppercase tracking-[0.08em] text-slate-400">Recent</div>
              </div>

              {recent.length === 0 ? (
                <div className="p-4 text-[12px] leading-[1.4] text-slate-500">No recent uploads yet. Upload something.</div>
              ) : (
                <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {recent.map((a) => (
                    <button
                      key={a.url}
                      onClick={() => onPick(a.url)}
                      className="group overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] text-left transition-colors hover:bg-[#1d1d20]"
                      title={a.url}
                    >
                      <div className="aspect-video bg-black/30 flex items-center justify-center overflow-hidden">
                        {kind === "images" ? (
                          <img src={a.url} alt="" className="w-full h-full object-cover" draggable={false} />
                        ) : (
                          <video src={a.url} className="w-full h-full object-cover" muted playsInline />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[12px] leading-[1.4] text-slate-200">{a.name || a.url.split("/").pop() || a.url}</div>
                        <div className="truncate text-[11px] leading-[1.4] text-slate-500">{a.url}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[11px] leading-[1.4] text-slate-500">
              Phase 1: “recent” is localStorage-based (no DB, no server directory listing yet).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestDataPanel({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const [newKey, setNewKey] = useState("");

  return (
    <div className="mt-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] p-4">
      <div className="mb-2 text-[11px] leading-[1.4] uppercase tracking-[0.08em] text-slate-400">Test Data (Variables)</div>
      <div className="space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <div className="w-1/3 truncate font-mono text-[12px] leading-[1.4] text-slate-500" title={k}>{k}</div>
            <input
              type="text"
              className={`flex-1 font-mono ${uiClasses.field}`}
              value={v}
              onChange={e => onChange(k, e.target.value)}
            />
            <button onClick={() => onChange(k, "")} className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-red-400" aria-label={`Clear ${k}`}>
              <svg {...TOOL_ICON_PROPS}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.08)] pt-2">
          <input
            type="text"
            className={`w-1/3 ${uiClasses.field}`}
            placeholder="New key..."
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
          />
          <button
            onClick={() => {
              if (newKey) {
                onChange(newKey, "value");
                setNewKey("");
              }
            }}
            className={uiClasses.button}
          >
            Add
          </button>
        </div>
        <div className="text-[11px] leading-[1.4] text-slate-500">
          Use in text as <code>{`{{key}}`}</code>
        </div>
      </div>
    </div>
  );
}

// ===== UX Refactor Components =====

function SaveTemplateModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [val, setVal] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111113] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
          <h3 className="text-[14px] leading-[1.4] font-semibold text-white">Save Template</h3>
          <button onClick={onClose} className={uiClasses.iconButton} aria-label="Close">
            <svg {...TOOL_ICON_PROPS}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="mb-1 block text-[12px] leading-[1.4] font-medium text-slate-400">Template Name</label>
            <input
              autoFocus
              className={`w-full ${uiClasses.field}`}
              placeholder="My Lower Third"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && val.trim()) onSave(val.trim());
              }}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className={uiClasses.buttonGhost}>
              Cancel
            </button>
            <button
              onClick={() => val.trim() && onSave(val.trim())}
              disabled={!val.trim()}
              className="h-8 rounded-md border border-indigo-400/30 bg-indigo-500/15 px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-indigo-100 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccordionSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[rgba(255,255,255,0.06)] last:border-0 border-t first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-full items-center justify-between bg-[rgba(255,255,255,0.03)] px-3 text-[14px] leading-[1.4] font-medium text-slate-300 select-none transition-colors hover:bg-[rgba(255,255,255,0.05)]"
      >
        <span>{title}</span>
        <span className={`transform transition-transform text-slate-500 ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="space-y-3 bg-[#111113] p-3">{children}</div>}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled
}: {
  icon: string | React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex h-8 w-8 items-center justify-center rounded-md border transition-all
        ${active
          ? "border-indigo-400/30 bg-indigo-500/15 text-indigo-100 shadow-lg shadow-indigo-500/5"
          : "border-[rgba(255,255,255,0.06)] bg-[#161618] text-slate-400 hover:bg-[#1d1d20] hover:text-slate-200"
        }
        ${disabled ? "opacity-20 cursor-not-allowed" : ""}
      `}
      title={label}
    >
      <div className="relative -top-px flex items-center justify-center">{icon}</div>
    </button>
  );
}

const TOOLBAR_ICONS: Record<string, React.ReactNode> = {
  text: <span className="font-serif text-[14px] font-bold leading-none">T</span>,
  box: <div className="h-4 w-4 rounded-sm border-[1.5px] border-current" />,
  pen: <svg {...TOOL_ICON_PROPS}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  image: <svg {...TOOL_ICON_PROPS}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
  video: <svg {...TOOL_ICON_PROPS}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>,
  frame: <svg {...TOOL_ICON_PROPS}><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>,
  bar: <svg {...TOOL_ICON_PROPS}><rect x="2" y="10" width="20" height="4" rx="2" /></svg>,
  ring: <svg {...TOOL_ICON_PROPS}><circle cx="12" cy="12" r="8" /></svg>,
  rect: <svg {...TOOL_ICON_PROPS}><rect x="4" y="4" width="16" height="16" rx="1" /></svg>,
  circle: <svg {...TOOL_ICON_PROPS}><circle cx="12" cy="12" r="9" /></svg>,
  triangle: <svg {...TOOL_ICON_PROPS}><path d="M12 3l10 18H2L12 3z" /></svg>,
  polygon: <svg {...TOOL_ICON_PROPS}><path d="M12 3l8 5v8l-8 5-8-5V8l8-5Z" /></svg>,
  star: <svg {...TOOL_ICON_PROPS}><path d="m12 3 2.6 5.8 6.4.6-4.8 4.2 1.4 6.4L12 17l-5.6 3 1.4-6.4L3 9.4l6.4-.6L12 3Z" /></svg>,
  arrow: <svg {...TOOL_ICON_PROPS}><path d="M4 12h10" /><path d="m11 6 7 6-7 6" /></svg>,
  line: <svg {...TOOL_ICON_PROPS}><line x1="4" y1="20" x2="20" y2="4" /></svg>,
  lower_third: <svg {...TOOL_ICON_PROPS}><rect x="2" y="14" width="20" height="6" rx="1" /><line x1="2" y1="14" x2="22" y2="14" /></svg>
};

function CreationToolbar({
  onAddText,
  onAddBox,
  onAddShape,
  onTogglePenTool,
  penToolActive,
  onAddImage,
  onAddVideo,
  onAddFrame,
  onAddProgress,
  onAddLowerThird,
  onGroup,
  onUngroup,
  onCreateComponent,
  canGroup,
  canUngroup,
  canCreateComponent,
  onSave,
  saving,
  saveOk,
  saveError,
  onTestEvent
}: {
  onAddText: () => void;
  onAddBox: () => void;
  onAddShape: (type: OverlayShapeKind) => void;
  onTogglePenTool: () => void;
  penToolActive: boolean;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddFrame: () => void;
  onAddProgress: (type: "bar" | "ring") => void;
  onAddLowerThird: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onCreateComponent: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  canCreateComponent: boolean;
  onSave: () => void;
  saving?: boolean;
  saveOk?: boolean;
  saveError?: string | null;
  onTestEvent: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <label className={uiClasses.label}>Tools</label>

        <div className="flex gap-1">
          <button
            onClick={onGroup}
            disabled={!canGroup}
            className={`${uiClasses.iconButton} disabled:opacity-20`}
            title={formatShortcutTooltip("group")}
          >
            <svg {...TOOL_ICON_PROPS}><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 4h6M4 9v6M20 9v6M9 20h6" /></svg>
          </button>
          <button
            onClick={onUngroup}
            disabled={!canUngroup}
            className={`${uiClasses.iconButton} disabled:opacity-20`}
            title={formatShortcutTooltip("ungroup")}
          >
            <svg {...TOOL_ICON_PROPS}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {/* Creation Tools (Row 1) */}
        <ToolButton icon={TOOLBAR_ICONS.text} label="Add Text" onClick={onAddText} />
        <ToolButton icon={TOOLBAR_ICONS.box} label="Add Box" onClick={onAddBox} />
        <ToolButton icon={TOOLBAR_ICONS.pen} label="Pen Tool" onClick={onTogglePenTool} active={penToolActive} />
        <ToolButton icon={TOOLBAR_ICONS.image} label="Add Image" onClick={onAddImage} />
        <ToolButton icon={TOOLBAR_ICONS.video} label="Add Video" onClick={onAddVideo} />
        <ToolButton icon={TOOLBAR_ICONS.frame} label="Add Frame" onClick={onAddFrame} />
        <ToolButton icon={TOOLBAR_ICONS.lower_third} label="Add Lower Third" onClick={onAddLowerThird} />
        <ToolButton
          icon={<svg {...TOOL_ICON_PROPS}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
          label="Conversion Selection to Component"
          onClick={onCreateComponent}
          disabled={!canCreateComponent}
        />

        {/* Secondary Tools & Shapes (Row 2) */}
        <ToolButton icon={TOOLBAR_ICONS.bar} label="Add Progress Bar" onClick={() => onAddProgress("bar")} />
        <ToolButton icon={TOOLBAR_ICONS.ring} label="Add Progress Ring" onClick={() => onAddProgress("ring")} />
        <ToolButton icon={TOOLBAR_ICONS.rect} label="Add Rectangle" onClick={() => onAddShape("rect")} />
        <ToolButton icon={TOOLBAR_ICONS.circle} label="Add Circle" onClick={() => onAddShape("circle")} />
        <ToolButton icon={TOOLBAR_ICONS.triangle} label="Add Triangle" onClick={() => onAddShape("triangle")} />
        <ToolButton icon={TOOLBAR_ICONS.line} label="Add Line" onClick={() => onAddShape("line")} />
        <ToolButton icon={TOOLBAR_ICONS.polygon} label="Add Polygon" onClick={() => onAddShape("polygon")} />
        <ToolButton icon={TOOLBAR_ICONS.star} label="Add Star" onClick={() => onAddShape("star")} />
        <ToolButton icon={TOOLBAR_ICONS.arrow} label="Add Arrow" onClick={() => onAddShape("arrow")} />
      </div>

      <div className="mt-1 flex gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3">
        <button
          onClick={onTestEvent}
          className={`${uiClasses.button} w-8 flex-none px-0`}
          title="Send Test Event"
        >
          <BoltIcon />
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          className={`flex h-8 flex-1 items-center justify-center gap-2 rounded-md border text-[12px] leading-[1.4] tracking-[-0.02em] font-semibold transition-all ${saveOk ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" :
            saveError ? "border-red-500/40 bg-red-500/15 text-red-100" :
              "border-indigo-400/30 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/20"
            }`}
        >
          {saving ? (
            <>
              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span>Saving...</span>
            </>
          ) : saveOk ? (
            <><svg {...TOOL_ICON_PROPS}><polyline points="20 6 9 17 4 12" /></svg><span>Saved</span></>
          ) : (
            <><span>Save Changes</span></>
          )}

          {saveError && <span className="ml-1 text-[11px] leading-[1.4] opacity-80">(Error)</span>}
        </button>
      </div>
    </div>
  );
}

function LayersPanel({
  elements,
  layersTopToBottom,
  selectedIds,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onMask,
  onReleaseMask,
  onMoveUp,
  onMoveDown,
  onBringToFront,
  onSendToBack,
  onReorderLayer,
  renamingId,
  renameDraft,
  onBeginRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename
}: {
  elements: OverlayElement[];
  layersTopToBottom: OverlayElement[];
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMask?: (id: string) => void;
  onReleaseMask?: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onReorderLayer: (id: string, targetId: string, placement: "before" | "after") => void;
  renamingId: string | null;
  renameDraft: string;
  onBeginRename: (id: string) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [dragState, setDragState] = useState<{ draggedId: string; overId: string; placement: "before" | "after" } | null>(null);

  // Scroll to selection
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const lastId = selectedIds[selectedIds.length - 1];
    const el = containerRef.current?.querySelector(`[data-layer-id="${lastId}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIds]);

  // Build hierarchy map for rendering
  const allChildIds = new Set<string>();
  elements.forEach(el => {
    if ((el.type === 'group' || el.type === 'frame' || el.type === 'mask' || el.type === 'boolean') && Array.isArray((el as any).childIds)) {
      (el as any).childIds.forEach((cid: string) => allChildIds.add(cid));
    }
  });

  const roots = layersTopToBottom.filter(el => !allChildIds.has(el.id));

  // Recursive render function
  const renderItem = (
    el: OverlayElement,
    depth: number,
    isLastChild: boolean,
    parentTree: boolean[],
    roleLabel?: string
  ) => {
    const isSelected = selectedIds.includes(el.id);
    const isVisible = el.visible !== false;
    const isLocked = el.locked === true;
    const isRenaming = renamingId === el.id;

    // Find children
    const isContainer = el.type === 'group' || el.type === 'frame' || el.type === 'mask' || el.type === 'boolean';
    let children: OverlayElement[] = [];
    if (isContainer) {
      children = layersTopToBottom.filter(c => (el as any).childIds?.includes(c.id));
    }

    return (
      <React.Fragment key={el.id}>
        <div
          data-layer-id={el.id}
          draggable={el.locked !== true}
          className={`${uiClasses.layerRow} select-none cursor-pointer ${isSelected ? "bg-indigo-500/15 text-indigo-50" : "text-slate-400 hover:bg-[rgba(255,255,255,0.03)] hover:text-slate-200"}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(e) => onSelect(el.id, e.shiftKey || e.ctrlKey || e.metaKey)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onBeginRename(el.id);
          }}
          onDragStart={(e) => {
            if (isRenaming) {
              e.preventDefault();
              return;
            }
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", el.id);
            draggedIdRef.current = el.id;
            setDragState({ draggedId: el.id, overId: el.id, placement: "after" });
          }}
          onDragOver={(e) => {
            const draggedId = draggedIdRef.current;
            if (!draggedId || draggedId === el.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const placement = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
            setDragState({ draggedId, overId: el.id, placement });
          }}
          onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLDivElement).contains(e.relatedTarget as Node | null)) {
              setDragState((prev) => (prev?.overId === el.id ? null : prev));
            }
          }}
          onDrop={(e) => {
            const draggedId = draggedIdRef.current;
            if (!draggedId || draggedId === el.id) {
              draggedIdRef.current = null;
              setDragState(null);
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const placement = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
            onReorderLayer(draggedId, el.id, placement);
            draggedIdRef.current = null;
            setDragState(null);
          }}
          onDragEnd={() => {
            draggedIdRef.current = null;
            setDragState(null);
          }}
        >
          {dragState?.overId === el.id && dragState.draggedId !== el.id && (
            <div
              className="absolute left-1 right-1 h-px bg-indigo-300 pointer-events-none"
              style={{ top: dragState.placement === "before" ? 0 : undefined, bottom: dragState.placement === "after" ? 0 : undefined }}
            />
          )}
          {/* Tree Guides */}
          {depth > 0 && (
            <div className="absolute left-0 top-0 bottom-0 w-full pointer-events-none overflow-hidden">
              {parentTree.map((hasNextSibling, idx) => (
                hasNextSibling && (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-px bg-[rgba(255,255,255,0.08)]"
                    style={{ left: `${idx * 16 + 11}px` }}
                  />
                )
              ))}
              <div
                className="absolute top-0 h-3 w-px bg-[rgba(255,255,255,0.12)]"
                style={{ left: `${depth * 16 - 5}px` }}
              />
              <div
                className="absolute top-3 h-px w-3 bg-[rgba(255,255,255,0.12)]"
                style={{ left: `${depth * 16 - 5}px` }}
              />
            </div>
          )}

          {/* Label */}
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className={`min-w-0 flex-1 ${uiClasses.field} h-6`}
            />
          ) : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] leading-[1.4] tracking-[-0.01em] font-medium">
                {el.type === "mask" ? "Mask Group" : el.name || defaultElementLabel(el)}
              </div>
              {roleLabel && (
                <div className="truncate text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                  {roleLabel}
                </div>
              )}
            </div>
          )}

          {/* Controls (Hover/Selected) */}
          <div
            className={`flex flex-shrink-0 items-center gap-1 ${isSelected || isLocked || !isVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }}
              className={`${uiClasses.iconButton} ${isLocked ? "text-amber-500 opacity-100" : "text-slate-500"}`}
              title={isLocked ? "Unlock" : "Lock"}
            >
              <span className="relative -top-px flex items-center justify-center">
                {isLocked ? <LockIcon /> : <UnlockIcon />}
              </span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisible(el.id); }}
              className={`${uiClasses.iconButton} ${!isVisible ? "text-slate-400 opacity-100" : "text-slate-500"}`}
              title={isVisible ? "Hide" : "Show"}
            >
              <span className="relative -top-px flex items-center justify-center">
                {isVisible ? <EyeIcon /> : <EyeOffIcon />}
              </span>
            </button>

            {(el.type === "shape" || el.type === "path" || el.type === "boolean" || el.type === "box") && onMask && (
              <button
                onClick={(e) => { e.stopPropagation(); onMask(el.id); }}
                className={`${uiClasses.iconButton} hover:text-indigo-400`}
                title="Use as Mask"
              >
                <span className="relative -top-px flex items-center justify-center">
                  <MaskIcon />
                </span>
              </button>
            )}

            {el.type === "mask" && onReleaseMask && (
              <button
                onClick={(e) => { e.stopPropagation(); onReleaseMask(el.id); }}
                className={`${uiClasses.iconButton} hover:text-red-400`}
                title="Release Mask"
              >
                <span className="relative -top-px flex items-center justify-center">
                  <UnlockIcon />
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Render children if group */}
        {children.length > 0 && (
          <div className="relative">
            {children.map((c, idx) =>
              renderItem(
                c,
                depth + 1,
                idx === children.length - 1,
                [...parentTree, !isLastChild],
                el.type === "mask" ? (idx === 0 ? "Mask Shape" : "Mask Content") : undefined
              )
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-y-auto bg-[#111113] pb-10 custom-scrollbar">
      {roots.length === 0 && <div className="p-4 text-center text-[12px] leading-[1.4] italic text-slate-600">No layers</div>}
      {roots.map((el, idx) => renderItem(el, 0, idx === roots.length - 1, []))}
    </div>
  );
}

function ComponentLibraryPanel({ components, onInsert, onEdit, onDelete, onCreateVariant }: {
  components: OverlayComponentDef[],
  onInsert: (c: OverlayComponentDef) => void,
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
  onCreateVariant: (id: string) => void
}) {
  if (!components || components.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="mb-2 text-[14px] leading-[1.4] text-slate-300">No Components Found</div>
        <div className="text-[12px] leading-[1.4] text-slate-600">Select elements on the canvas and click "Create Component" to build reusable blocks.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {components.map((comp: OverlayComponentDef) => {
        const isBuiltin = comp.id.startsWith('preset_');

        return (
          <div
            key={comp.id}
            className="group relative flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] p-3 transition-colors hover:border-indigo-500 hover:bg-[#1d1d20] cursor-pointer"
            onClick={() => onInsert(comp)}
          >
            <div className="flex flex-col truncate">
              <span className="truncate pr-2 text-[13px] leading-[1.4] font-semibold text-slate-200" title={comp.name}>{comp.name}</span>
              <span className="mt-1 text-[11px] leading-[1.4] text-slate-500">
                {comp.elements?.length || 0} nodes
                {comp.variantName ? ` • ${comp.variantName}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
              <button
                className={uiClasses.iconButton}
                onClick={(e) => { e.stopPropagation(); onCreateVariant(comp.id); }}
                title="Create Variant"
              >
                <svg {...TOOL_ICON_PROPS}><path d="M5 5h6v6H5z" /><path d="M13 13h6v6h-6z" /><path d="M8 8l8 8" /></svg>
              </button>
              <button
                className={uiClasses.iconButton}
                onClick={(e) => { e.stopPropagation(); onEdit(comp.id); }}
                title="Edit Master"
              >
                <svg {...TOOL_ICON_PROPS}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              {!isBuiltin && (
                <button
                  className={`${uiClasses.iconButton} hover:text-red-400`}
                  onClick={(e) => { e.stopPropagation(); onDelete(comp.id); }}
                  title="Delete"
                >
                  <svg {...TOOL_ICON_PROPS}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              )}
              <button
                className={`${uiClasses.iconButton} hover:bg-indigo-500/15 hover:text-indigo-100`}
                title="Insert Instance"
              >
                <svg {...TOOL_ICON_PROPS}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

