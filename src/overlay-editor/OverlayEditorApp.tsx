import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd, RndDragCallback, RndResizeCallback } from "react-rnd";
import {
  OverlayAnimation,
  OverlayConfigV0,
  OverlayElement,
  OverlayPatternFill,
  OverlayPatternFit,
  OverlayTimeline,
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
];

const DEFAULT_TIMELINE_DURATION_MS = 5000;
const KEYFRAME_TIME_EPSILON_MS = 10;

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
  const resizeOriginRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [draftRotationDegs, setDraftRotationDegs] = useState<Record<string, number>>({});
  const rotationDragRef = useRef<{ id: string; cx: number; cy: number } | null>(null);

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
  const [leftTab, setLeftTab] = useState<"layers" | "components">("layers");
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

  useEffect(() => {
    return () => {
      for (const timerIds of Object.values(previewStartTimersRef.current)) {
        timerIds.forEach((timerId) => window.clearTimeout(timerId));
      }
      previewStartTimersRef.current = {};
    };
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
      map[el.id] = el as AnyEl;
    }
    return map;
  }, [previewElements]);

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

    let frameId = 0;
    const startOffset = timelinePlayheadMs;
    timelinePlaybackStartRef.current = performance.now() - startOffset;

    const tick = (now: number) => {
      const startedAt = timelinePlaybackStartRef.current ?? now;
      const next = Math.min(timeline.durationMs, now - startedAt);
      setTimelinePlayheadMs(next);

      if (next >= timeline.durationMs) {
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
  }, [isTimelinePlaying, timeline.durationMs, timelinePlayheadMs]);

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

  const canGroup = selectedIds.length > 0;
  const canUngroup = !!primarySelectedEl && primarySelectedEl.type === 'group';

  const selectionBounds = useMemo(() => computeSelectionBounds(selectedEls), [selectedEls]);
  const selectionHasLocked = useMemo(() => selectedEls.some((e) => e.locked === true), [selectedEls]);

  const layersTopToBottom = useMemo(() => {
    const els = elementsAny.slice();
    return els.reverse();
  }, [elementsAny]);

  const usedFonts = useMemo(() => {
    const set = new Set<string>();
    for (const el of config.elements) {
      if (el.type === "text" && (el as OverlayTextElement).fontFamily) {
        set.add((el as OverlayTextElement).fontFamily!);
      }
    }
    return Array.from(set);
  }, [config.elements]);

  const allChildIds = useMemo(() => {
    const s = new Set<string>();
    previewElements.forEach(e => {
      if (e.type === 'group' || e.type === 'mask') {
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

      const value = Number((element as any)[property] ?? 0);
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
      if (oldEl.type === 'group' && (patch.x !== undefined || patch.y !== undefined)) {
        const dx = (patch.x ?? oldEl.x) - oldEl.x;
        const dy = (patch.y ?? oldEl.y) - oldEl.y;

        if (dx !== 0 || dy !== 0) {
          const toMove = new Set<string>();
          // Helper to find descendants
          const collect = (pid: string) => {
            const p = nextEls.find(e => e.id === pid);
            if (p && p.type === 'group') {
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
      if (timelineKeyframeId) {
        setSelectedTimelineTrackId(timelineTrackId);
        setSelectedTimelineKeyframeId(timelineKeyframeId);
      }
      return { ...prev, elements: nextEls, timeline: nextTimeline };
    });
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
    const w = kind === "line" ? 200 : 200;
    const h = kind === "line" ? 40 : 200;

    // Center in base resolution
    const x = Math.round(bw / 2 - w / 2);
    const y = Math.round(bh / 2 - h / 2);

    const el: AnyEl = {
      id,
      type: "shape" as any,
      name: kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : kind === "line" ? "Line" : "Triangle",
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
    } as any;

    setConfig((prev) => ({ ...prev, elements: [...prev.elements, el as any] }));
    setSelectedIds([id]);
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
      } else {
        // No explicit content selected: fall back to the layer below in z-order.
        if (shapeIdx <= 0) return prev;
        contentNode = els[shapeIdx - 1] as AnyEl | undefined;
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
    if (!grp || grp.type !== 'group') {
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

  function ungroupSelected() {
    if (!primarySelectedEl || primarySelectedEl.type !== 'group') return;
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
        (e) => e.type === "group" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
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
        (e) => e.type === "group" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
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
        (e) => e.type === "group" && Array.isArray((e as any).childIds) && (e as any).childIds.includes(id)
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

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.key === "Shift") setShiftDown(true);
      if (e.key === "Alt") setAltDown(true);

      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setShowGrid((v) => !v);
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
      if (isTypingTarget(document.activeElement)) return;

      const hasSel = !!primarySelectedEl;
      const step = e.shiftKey ? 10 : 1;

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
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
        if (e.key === "0") {
          e.preventDefault();
          zoomFit();
          return;
        }
        if (e.key === "1") {
          e.preventDefault();
          zoom100();
          return;
        }
        if (e.altKey && e.key.toLowerCase() === "a" && primarySelectedEl) {
          e.preventDefault();
          const matchType = primarySelectedEl.type;
          const nextIds = config.elements
            .filter((el) => el.type === matchType && el.locked !== true)
            .map((el) => el.id);
          setSelectedIds(nextIds);
          return;
        }
      }

      if (e.shiftKey && e.code === "Digit2") {
        e.preventDefault();
        zoomToSelection();
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

        setConfig((prev) => {
          const sel = new Set(selectedIds);
          const next = prev.elements.map((raw) => {
            if (!sel.has(raw.id)) return raw;

            const el = raw as AnyEl;
            const nx = (el.x ?? 0) + dx;
            const ny = (el.y ?? 0) + dy;

            return {
              ...(raw as any),
              x: snapEnabled ? roundToGrid(nx, gridSize) : Math.round(nx),
              y: snapEnabled ? roundToGrid(ny, gridSize) : Math.round(ny),
            };
          });

          return { ...prev, elements: next };
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [primarySelectedEl, selectedIds, selectedEls, selectionHasLocked, snapEnabled, gridSize]);

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

    updateElement(commitId, { x: nx, y: ny });
    clearGuides();
    setDraftRects((prev) => {
      const next = { ...prev };
      delete next[elId];
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
    (id: string, x: number, y: number) => {
      const el = elementsAny.find((e) => e.id === id);
      if (!el) return;
      const duplicate = dragDuplicateRef.current?.sourceId === id ? dragDuplicateRef.current : null;
      const draftId = duplicate?.duplicateId || id;

      let nx = x;
      let ny = y;
      const start = dragStartRef.current[id] ?? { x: el.x ?? 0, y: el.y ?? 0 };
      if (shiftDown) {
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
      }));
    },
    [guideSnapEnabled, snapEnabled, gridSize, elementsAny, baseResolution.width, baseResolution.height, updateGuidesThrottled, shiftDown]
  );

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
    <div className="flex w-full h-[calc(100vh-2rem)] overflow-hidden bg-slate-950 text-slate-200">
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
      <div className="w-60 flex-none flex flex-col border-r border-slate-800 bg-slate-900/80 backdrop-blur-sm z-10">
        {/* Header */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <input
            className="w-full bg-transparent border border-transparent hover:border-slate-700 focus:border-indigo-500 rounded px-1 py-0.5 text-sm font-bold text-slate-100 placeholder-slate-500 transition-colors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled Overlay"
          />
          <div className="flex gap-2 text-[10px] text-slate-500 font-mono pl-1">
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
          onAddImage={addImage}
          onAddVideo={addVideo}
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
        <div className="flex border-b border-slate-800 bg-slate-900 border-t mt-2">
          <button
            onClick={() => setLeftTab("layers")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${leftTab === "layers" ? "text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            <span>Layers</span>
          </button>
          <button
            onClick={() => setLeftTab("components")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${leftTab === "components" ? "text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50" : "text-slate-500 hover:text-slate-300"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            <span>Components</span>
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
              />
            </div>
          )}
          {leftTab === "components" && (
            <div className="flex-1 min-h-0 flex flex-col pt-1">
              <ComponentLibraryPanel
                components={overlayComponents}
                onEdit={enterIsolationMode}
                onDelete={deleteComponent}
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
        </div>

        {/* Footer / Shortcuts */}
        <div className="p-2 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between">
          <span>Ctrl+D Duplicate</span>
          <span>Del Delete</span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0 flex min-w-0">
      {/* CENTER: Canvas */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-[#0f172a]" onMouseDown={() => { /* clear selection if bg click? handled in canvas */ }}>

        {/* Top Data Bar / Canvas Settings */}
        <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 z-10">
          <div className="flex items-center gap-4">
            {/* Grid / Snap Controls */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} className="rounded border-slate-700 bg-slate-800 accent-indigo-500" />
                <span>Snap</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="rounded border-slate-700 bg-slate-800 accent-indigo-500" />
                <span>Grid</span>
              </label>
              <select
                value={gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className="bg-slate-800 border-none rounded text-[10px] text-slate-300 py-0.5 pl-2 pr-6 disabled:opacity-50"
                disabled={!snapEnabled}
              >
                <option value={8}>8px</option>
                <option value={16}>16px</option>
                <option value={32}>32px</option>
              </select>
            </div>

            <div className="w-px h-4 bg-slate-800" />

            {/* Alignment Tools */}
            <div className="flex items-center gap-1">
              <button onClick={() => alignSelection("left")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Left">
                <span className="text-[10px]">|&lt;</span>
              </button>
              <button onClick={() => alignSelection("hcenter")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Center">
                <span className="text-[10px]">|</span>
              </button>
              <button onClick={() => alignSelection("right")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Right">
                <span className="text-[10px]">&gt;|</span>
              </button>
              <button onClick={() => alignSelection("top")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Top">
                <span className="text-[10px]">T</span>
              </button>
              <button onClick={() => alignSelection("vcenter")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Middle">
                <span className="text-[10px]">-</span>
              </button>
              <button onClick={() => alignSelection("bottom")} disabled={selectedIds.length < 2} className="p-1 hover:bg-slate-800 rounded disabled:opacity-20 text-slate-400 hover:text-white" title="Align Bottom">
                <span className="text-[10px]">_</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={zoomOut} className="p-1 hover:bg-slate-800 rounded text-slate-400">－</button>
            <span className="text-xs font-mono w-10 text-center text-slate-300">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} className="p-1 hover:bg-slate-800 rounded text-slate-400">＋</button>
            <button onClick={zoomFit} className="ml-1 text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300 hover:bg-slate-700">Fit</button>
          </div>
        </div>

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
          {editingMasterId && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[50] flex items-center gap-3 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 text-indigo-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">Isolation Mode</span>
              </div>
              <div className="w-px h-3 bg-indigo-400/50" />
              <div className="text-xs font-bold truncate max-w-[200px]">{name}</div>
              <div className="w-px h-3 bg-indigo-400/50" />
              <button
                onClick={exitIsolationMode}
                className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full text-[10px] font-black transition-colors uppercase tracking-widest"
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
              className="bg-slate-800 relative"
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
                          className="absolute -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-fuchsia-400 text-[10px] font-mono text-white"
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
                          className="absolute -translate-y-1/2 px-1.5 py-0.5 rounded bg-fuchsia-400 text-[10px] font-mono text-white"
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
              {marquee.active && (() => {
                const r = getMarqueeRect();
                if (!r) return null;
                return (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute border border-sky-300/90 bg-sky-500/10"
                      style={{ left: r.l, top: r.t, width: r.w, height: r.h }}
                    />
                  </div>
                );
              })()}

              {/* Resize Dimensions Overlay */}
              {resizeStatus && (
                <div
                  className="absolute z-50 pointer-events-none bg-sky-500 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-sm"
                  style={{
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
                  className="cursor-move border border-sky-400 border-dashed"
                >
                  <div className="w-full h-full bg-transparent">
                    <div className="absolute -top-6 left-0 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white border border-white/10">
                      Group ({selectedIds.length})
                    </div>
                  </div>
                </Rnd>
              )}

              {/* Empty State Hint */}
              {config.elements.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                  <div className="w-16 h-16 border-2 border-dashed border-slate-500 rounded-xl mb-4 flex items-center justify-center">
                    <span className="text-3xl text-slate-500">+</span>
                  </div>
                  <p className="text-slate-400 font-medium">Canvas is empty</p>
                  <p className="text-slate-600 text-xs mt-1">Select a tool to add content</p>
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
                const renderedEl = (
                  draftRotationDegs[el.id] !== undefined
                    ? ({ ...el, rotationDeg: draftRotationDegs[el.id] } as AnyEl)
                    : el
                );

                // Figma-style high-contrast selection border
                const selectionStyle = isPrimary
                  ? { boxShadow: "0 0 0 1px #3b82f6, 0 0 0 2px white inset" }
                  : isSelected
                    ? { boxShadow: "0 0 0 1px rgba(96,165,250,0.9)" }
                    : {};

                // Custom resize handle styles
                const handleStyle = {
                  width: 4, height: 4, background: "white", border: "1px solid #3b82f6", borderRadius: 1,
                  pointerEvents: 'auto' as const
                };

                return (
                  <Rnd
                    key={el.id}
                    id={el.id}
                    size={{ width: w, height: h }}
                    position={{ x, y }}
                    bounds="parent"
                    scale={scale}
                    disableDragging={isLocked || isPanning || marquee.active}
                    enableResizing={isPrimary && !isLocked && !isPanning && !marquee.active}
                    lockAspectRatio={shiftDown}
                    resizeHandleStyles={isPrimary ? {
                      topLeft: { ...handleStyle, left: -2, top: -2 },
                      topRight: { ...handleStyle, left: '100%', top: -2, marginLeft: -2 },
                      bottomLeft: { ...handleStyle, left: -2, top: '100%', marginTop: -2 },
                      bottomRight: { ...handleStyle, left: '100%', top: '100%', marginLeft: -2, marginTop: -2 },
                      top: { ...handleStyle, left: '50%', top: -2, marginLeft: -2, cursor: 'n-resize' },
                      bottom: { ...handleStyle, left: '50%', top: '100%', marginLeft: -2, marginTop: -2, cursor: 's-resize' },
                      left: { ...handleStyle, top: '50%', left: -2, marginTop: -2, cursor: 'w-resize' },
                      right: { ...handleStyle, top: '50%', left: '100%', marginLeft: -2, marginTop: -2, cursor: 'e-resize' },
                    } : undefined}
                    onDragStart={(e) => {
                      dragStartRef.current[el.id] = { x: el.x ?? 0, y: el.y ?? 0 };
                      if ((e as any).altKey === true) {
                        dragDuplicateRef.current = { sourceId: el.id, duplicateId: createDragDuplicate(el) };
                      } else {
                        dragDuplicateRef.current = null;
                      }
                    }}
                    onDrag={(e, d) => handleDragLive(el.id, d.x, d.y)}
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

                    onResizeStart={() => {
                      resizeOriginRef.current[el.id] = { x: el.x, y: el.y, width: el.width, height: el.height };
                      setResizeStatus({ x: el.x, y: el.y, width: el.width, height: el.height });
                    }}
                    onResize={(e, dir, ref, delta, pos) => {
                      let nw = ref.offsetWidth;
                      let nh = ref.offsetHeight;
                      let nx = pos.x;
                      let ny = pos.y;
                      const origin = resizeOriginRef.current[el.id];
                      if (altDown && origin) {
                        const dw = nw - origin.width;
                        const dh = nh - origin.height;
                        nx = origin.x - dw / 2;
                        ny = origin.y - dh / 2;
                      }
                      setResizeStatus({
                        x: nx, y: ny,
                        width: nw, height: nh
                      });
                      setDraftRects((prev) => ({
                        ...prev,
                        [el.id]: { x: nx, y: ny, width: nw, height: nh },
                      }));
                    }}
                    onResizeStop={(e, dir, ref, delta, pos) => handleResizeStop(e, dir, ref, delta, pos, el.id)}
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
                    style={isSelected ? selectionStyle : undefined}
                  >
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
                      <div className="absolute -top-6 left-0 text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white font-medium shadow-sm">
                        {el.name || defaultElementLabel(el)}
                        {isLocked ? " 🔒" : ""}
                      </div>
                    )}
                    {isPrimary && !isLocked && !isPanning && !marquee.active && (
                      <>
                        <div className="absolute left-1/2 -top-6 h-6 w-px -translate-x-1/2 bg-sky-400/80 pointer-events-none" />
                        <button
                          type="button"
                          className="absolute left-1/2 -top-10 h-4 w-4 -translate-x-1/2 rounded-full border border-white bg-sky-500 shadow-[0_0_0_2px_rgba(15,23,42,0.85)] cursor-grab active:cursor-grabbing"
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
                      </>
                    )}
                  </Rnd>
                );
              })}
            </div>
          </div>
        </div>
      </div> {/* Close Center Column */}

      {/* Right Column / Inspector */}
      <div className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col overflow-y-auto">
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
                onPick: (url) => updateElement(selectedIds[0], { url } as any)
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
            previewVisible={previewElementsById[selectedIds[0]]?.visible !== false}
            onPreviewVisibilityAction={(action) => triggerPreviewVisibility(selectedIds[0], action)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-xs">
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
        selectedKeyframeId={selectedTimelineKeyframeId}
        onSelectKeyframe={(trackId, keyframeId) => {
          setSelectedTimelineTrackId(trackId);
          setSelectedTimelineKeyframeId(keyframeId);
        }}
        onPlay={() => {
          if (timelinePlayheadMs >= timeline.durationMs) {
            setTimelinePlayheadMs(0);
          }
          setIsTimelinePlaying(true);
        }}
        onPause={() => setIsTimelinePlaying(false)}
        onStop={() => {
          setIsTimelinePlaying(false);
          setTimelinePlayheadMs(0);
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
        onAddTrack={addTimelineTrack}
        onMoveKeyframe={moveTimelineKeyframe}
        onDuplicateKeyframe={duplicateTimelineKeyframe}
        onAddKeyframeAtTime={addTimelineKeyframeAtTime}
      />
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
  if (el.type === "image") return "Image";
  if (el.type === "video") return "Video";
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
  previewVisible?: boolean;
  onPreviewVisibilityAction?: (action: "enter" | "exit" | "reset") => void;
}

function ColorSwatch({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded border border-slate-600 shadow-sm flex-none ${className || "w-5 h-5"}`}>
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
      className={`p-1 rounded ml-1 transition-colors flex-none ${isBound ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-800 hover:text-slate-400"}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
    </button>
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
];

function ensurePatternFill(pattern?: OverlayPatternFill): OverlayPatternFill {
  return {
    src: pattern?.src ?? "",
    fit: pattern?.fit ?? "tile",
    scale: pattern?.scale ?? 100,
    opacity: pattern?.opacity ?? 1,
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
    <div className="ml-14 space-y-3 rounded border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-12 flex-none">Image</label>
        <input
          type="text"
          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
          value={nextPattern.src}
          onChange={(e) => onChange({ ...nextPattern, src: e.target.value })}
          placeholder="/uploads/pattern.png"
        />
        <button
          type="button"
          onClick={onPickImage}
          className="bg-slate-800 border border-slate-700 rounded px-2 text-xs hover:bg-slate-700 transition-colors"
          title="Pick pattern image"
        >
          📂
        </button>
      </div>

      {imageState !== "idle" && (
        <div className={`text-[10px] ${imageState === "ok" ? "text-emerald-400" : "text-amber-400"}`}>
          {imageState === "ok"
            ? "Pattern image loaded."
            : "Pattern image could not be loaded. Renderer will fall back to solid fill."}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-12 flex-none">Fit</label>
        <select
          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
        <label className="text-[10px] text-slate-500 w-12 flex-none">Scale</label>
        <div className="w-20 relative">
          <NumberField
            label=""
            value={Math.round(nextPattern.scale ?? 100)}
            onChange={(v) => onChange({ ...nextPattern, scale: Math.max(1, v) })}
            noLabel
          />
          <span className="absolute right-4 top-1 text-[10px] text-slate-500">%</span>
        </div>
        <div className="text-[10px] text-slate-600 flex-1">
          Scale now applies to tile, cover, and contain.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 w-12 flex-none">Opacity</label>
        <div className="w-20 relative">
          <NumberField
            label=""
            value={Math.round((nextPattern.opacity ?? 1) * 100)}
            onChange={(v) => onChange({ ...nextPattern, opacity: Math.max(0, Math.min(1, v / 100)) })}
            noLabel
          />
          <span className="absolute right-4 top-1 text-[10px] text-slate-500">%</span>
        </div>
      </div>
    </div>
  );
}

function InspectorPanel({
  element, onChange, onRename, onPickImage, onPickPatternImage, onPickVideo,
  ltPreview, onLtPreviewChange, onTestLowerThird,
  overlayComponents,
  isComponentMaster, propsSchema, onUpdateSchema,
  onEditMaster, onReleaseMask,
  previewVisible,
  onPreviewVisibilityAction,
}: InspectorProps) {
  const isVisible = element.visible !== false;
  const isLocked = element.locked === true;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-10 custom-scrollbar">
      {/* Header: Name & Global Status */}
      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/50">
        <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Layer</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs font-medium text-slate-200 focus:border-indigo-500 focus:outline-none"
            value={element.name ?? ""}
            placeholder={defaultElementLabel(element)}
            onChange={(e) => onRename(e.target.value)}
          />
          <button
            onClick={() => onChange({ visible: !isVisible })}
            className={`p-1.5 rounded hover:bg-slate-800 ${!isVisible ? "text-slate-600" : "text-slate-400"}`}
            title="Toggle Visibility"
          >
            {isVisible ? "👁️" : "🙈"}
          </button>
          <button
            onClick={() => onChange({ locked: !isLocked })}
            className={`p-1.5 rounded hover:bg-slate-800 ${isLocked ? "text-amber-500" : "text-slate-400"}`}
            title="Toggle Lock"
          >
            {isLocked ? "🔒" : "🔓"}
          </button>
        </div>
      </div>

      {/* Transform Section */}
      <AccordionSection title="Transform" defaultOpen={true}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-3">X</label>
              <NumberField label="" value={element.x ?? 0} onChange={(v) => onChange({ x: v })} noLabel className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-3">Y</label>
              <NumberField label="" value={element.y ?? 0} onChange={(v) => onChange({ y: v })} noLabel className="flex-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-3">W</label>
              <NumberField label="" value={element.width ?? 0} onChange={(v) => onChange({ width: v })} noLabel className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-3">H</label>
              <NumberField label="" value={element.height ?? 0} onChange={(v) => onChange({ height: v })} noLabel className="flex-1" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/50">
            <label className="text-[10px] text-slate-500 w-12 flex-none">Rotation</label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range" min="-180" max="180"
                className="flex-1 h-1 bg-slate-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:rounded-full"
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
            <label className="text-[10px] text-slate-500 w-12 flex-none">Opacity</label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range" min="0" max="1" step="0.01"
                className="flex-1 h-1 bg-slate-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:rounded-full"
                value={typeof element.opacity === "number" ? element.opacity : 1}
                onChange={(e) => onChange({ opacity: clamp(Number(e.target.value), 0, 1) })}
              />
              <div className="w-12 relative">
                <input
                  type="number"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-right pr-3"
                  value={Math.round((typeof element.opacity === "number" ? element.opacity : 1) * 100)}
                  onChange={(e) => onChange({ opacity: clamp(Number(e.target.value) / 100, 0, 1) })}
                />
                <span className="absolute right-1 top-1 text-[10px] text-slate-500">%</span>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-800/50 my-2" />

          {/* COMPONENT INSTANCE */}
          {element.type === "componentInstance" && (
            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold text-slate-500">Component Properties</label>
              {(() => {
                const def = overlayComponents.find(c => c.id === (element as any).componentId);
                if (!def) return <div className="text-xs text-red-500">Master Definition Missing</div>;
                if (!def.propsSchema || Object.keys(def.propsSchema).length === 0) {
                  return <div className="text-[10px] text-slate-500">No properties exposed by master.</div>;
                }
                const schemaKeys = Object.keys(def.propsSchema);
                return schemaKeys.map(key => {
                  const fieldDef = (def.propsSchema as any)[key];
                  const overrides = (element as any).propOverrides || {};
                  const val = overrides[key] !== undefined ? overrides[key] : fieldDef.default;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-500 w-16 truncate" title={fieldDef.label || key}>{fieldDef.label || key}</label>
                      {fieldDef.type === "color" ? (
                        <ColorSwatch value={val} onChange={(v) => onChange({ propOverrides: { ...overrides, [key]: v } } as any)} />
                      ) : (
                        <input
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 rounded shadow-sm transition-colors flex items-center justify-center gap-2 border border-slate-600 hover:border-indigo-500"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                  Edit Master Component
                </button>
              </div>
            </div>
          )}

          {/* LOWER THIRD */}
          {element.type === "lower_third" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500">Layout</label>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Mode</label>
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
                    <label className="text-[10px] text-slate-500 w-12">Ratio</label>
                    <input
                      type="range" min="0.2" max="0.8" step="0.05"
                      className="flex-1 h-1 bg-slate-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:rounded-full"
                      value={(element as any).layout?.splitRatio ?? 0.6}
                      onChange={(e) => onChange({ layout: { ...(element as any).layout, splitRatio: parseFloat(e.target.value) } } as any)}
                    />
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-800/50 my-2" />

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500">Style</label>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Variant</label>
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
                  <label className="text-[10px] text-slate-500 w-12">Bg</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.bgColor} onChange={(v) => onChange({ style: { ...(element as any).style, bgColor: v } } as any)} />
                    <ColorSwatch value={(element as any).style?.accentColor} onChange={(v) => onChange({ style: { ...(element as any).style, accentColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Title</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.titleColor} onChange={(v) => onChange({ style: { ...(element as any).style, titleColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Sub</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).style?.subtitleColor} onChange={(v) => onChange({ style: { ...(element as any).style, subtitleColor: v } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Pad/Rad</label>
                  <NumberField label="" value={(element as any).style?.paddingPx ?? 0} onChange={(v) => onChange({ style: { ...(element as any).style, paddingPx: v } } as any)} noLabel className="flex-1" />
                  <NumberField label="" value={(element as any).style?.cornerRadiusPx ?? 0} onChange={(v) => onChange({ style: { ...(element as any).style, cornerRadiusPx: v } } as any)} noLabel className="flex-1" />
                </div>
              </div>

              <div className="h-px bg-slate-800/50 my-2" />

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500">Preview (Editor Only)</label>
                <div className="text-[10px] text-slate-500 mb-2">
                  Auto-preview active when selected.
                </div>

                {/* (Save Template button removed) */}

                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => onTestLowerThird("show")}
                    className="flex-1 bg-green-900/40 hover:bg-green-800/60 text-green-200 text-[10px] py-1 rounded border border-green-800 transition-colors"
                  >
                    Test Show (5s)
                  </button>
                  <button
                    onClick={() => onTestLowerThird("hide")}
                    className="flex-1 bg-red-900/40 hover:bg-red-800/60 text-red-200 text-[10px] py-1 rounded border border-red-800 transition-colors"
                  >
                    Test Hide
                  </button>
                </div>

                {(element as any).layout?.mode === "single" ? (
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 w-12">Text</label>
                    <input
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                      value={ltPreview.text}
                      onChange={(e) => onLtPreviewChange({ ...ltPreview, text: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-500 w-12">Title</label>
                      <input
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                        value={ltPreview.title}
                        onChange={(e) => onLtPreviewChange({ ...ltPreview, title: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-500 w-12">Sub</label>
                      <input
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                        value={ltPreview.subtitle}
                        onChange={(e) => onLtPreviewChange({ ...ltPreview, subtitle: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="h-px bg-slate-800/50 my-2" />

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500">Animation</label>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">In/Out</label>
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={(element as any).animation?.in ?? "slideUp"}
                    onChange={(e) => onChange({ animation: { ...(element as any).animation, in: e.target.value } } as any)}
                  >
                    <option value="fade">Fade</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="slideRight">Slide Right</option>
                    <option value="scale">Scale</option>
                  </select>
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
                  <label className="text-[10px] text-slate-500 w-12">Dur (ms)</label>
                  <NumberField label="" value={(element as any).animation?.durationMs ?? 400} onChange={(v) => onChange({ animation: { ...(element as any).animation, durationMs: v } } as any)} noLabel className="flex-1" />
                </div>
              </div>
            </div>
          )}

          {/* BOX */}
          {element.type === "box" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Fill</label>
                <div className="flex-1 flex gap-1 items-center">
                  <ColorSwatch value={(element as any).backgroundColor} onChange={(v) => onChange({ backgroundColor: v } as any)} />
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).backgroundColor ?? ""} onChange={(e) => onChange({ backgroundColor: e.target.value } as any)} placeholder="CSS Color" />
                  {isComponentMaster && <ExposeButton element={element} propPath="backgroundColor" propsSchema={propsSchema} onUpdateSchema={onUpdateSchema} onChange={onChange} />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Type</label>
                <select
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  value={(element as any).pattern ? "pattern" : "solid"}
                  onChange={(e) =>
                    onChange({
                      pattern: e.target.value === "pattern" ? ensurePatternFill((element as any).pattern) : undefined,
                    } as any)
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="pattern">Pattern</option>
                </select>
              </div>
              {(element as any).pattern && (
                <PatternFillControls
                  pattern={(element as any).pattern}
                  onChange={(pattern) => onChange({ pattern } as any)}
                  onPickImage={onPickPatternImage}
                />
              )}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Radius</label>
                <NumberField label="" value={(element as any).borderRadius ?? (element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadius: v, borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>
            </div>
          )}

          {/* SHAPE */}
          {element.type === "shape" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Shape</label>
                <select
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  value={(element as any).shape ?? "rect"}
                  onChange={(e) => onChange({ shape: e.target.value } as any)}
                >
                  <option value="rect">Rectangle</option>
                  <option value="circle">Circle</option>
                  <option value="triangle">Triangle</option>
                  <option value="line">Line</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Fill</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).fillColor} onChange={(v) => onChange({ fillColor: v } as any)} />
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).fillColor ?? ""} onChange={(e) => onChange({ fillColor: e.target.value } as any)} />
                </div>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <label className="text-[10px] text-slate-500 w-8 flex-none">Opac.</label>
                <div className="w-16 relative">
                  <NumberField label="" value={Math.round(((element as any).fillOpacity ?? 1) * 100)} onChange={(v) => onChange({ fillOpacity: v / 100 } as any)} noLabel />
                  <span className="absolute right-4 top-1 text-[10px] text-slate-500">%</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Type</label>
                <select
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  value={(element as any).pattern ? "pattern" : "solid"}
                  onChange={(e) =>
                    onChange({
                      pattern: e.target.value === "pattern" ? ensurePatternFill((element as any).pattern) : undefined,
                    } as any)
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="pattern">Pattern</option>
                </select>
              </div>
              {(element as any).pattern && (
                <PatternFillControls
                  pattern={(element as any).pattern}
                  onChange={(pattern) => onChange({ pattern } as any)}
                  onPickImage={onPickPatternImage}
                />
              )}
              {(element as any).shape === "line" && (element as any).pattern && (
                <div className="ml-14 text-[10px] text-slate-500">
                  Pattern fill is ignored for line shapes in this pass.
                </div>
              )}

              <div className="h-px bg-slate-800/50 my-2" />

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Stroke</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).strokeColor} onChange={(v) => onChange({ strokeColor: v } as any)} />
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).strokeColor ?? ""} onChange={(e) => onChange({ strokeColor: e.target.value } as any)} placeholder="None" />
                </div>
              </div>
              <div className="flex items-center gap-2 ml-14">
                <NumberField label="" value={(element as any).strokeWidthPx ?? 0} onChange={(v) => onChange({ strokeWidthPx: v, strokeWidth: v } as any)} noLabel className="w-16" />
                <select
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs h-[26px]"
                  value={Array.isArray((element as any).strokeDash) && (element as any).strokeDash.length > 0 ? "dashed" : "solid"}
                  onChange={(e) => onChange({ strokeDash: e.target.value === "dashed" ? [6, 4] : [] } as any)}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Radius</label>
                <NumberField label="" value={(element as any).cornerRadiusPx ?? 0} onChange={(v) => onChange({ cornerRadiusPx: v, cornerRadius: v } as any)} noLabel className="flex-1" />
              </div>
            </div>
          )}

          {/* TEXT */}
          {element.type === "text" && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 text-xs font-semibold">Content</label>
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
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs min-h-[60px] font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
                    value={(element as any).text ?? ""}
                    onChange={(e) => onChange({ text: e.target.value } as any)}
                    placeholder="Enter static text..."
                  />
                ) : (
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded text-[10px] text-indigo-300 italic">
                    Bound to <span className="font-bold text-indigo-400">{SourceCatalog.find(s => s.id === element.bindings?.["text"]?.sourceId)?.label}</span>.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Font</label>
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
                  <label className="text-[10px] text-slate-500 w-8 flex-none">Size</label>
                  <NumberField label="" value={(element as any).fontSize ?? 24} onChange={(v) => onChange({ fontSize: v } as any)} noLabel className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-8 flex-none">Wgt</label>
                  <select className="flex-1 bg-slate-950 border border-slate-700 rounded px-1 py-1 text-xs" value={(element as any).fontWeight ?? "normal"} onChange={(e) => onChange({ fontWeight: e.target.value } as any)}>
                    <option value="normal">Reg</option>
                    <option value="bold">Bold</option>
                    <option value="100">Thin</option>
                    <option value="900">Heavy</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Align</label>
                <div className="flex-1 flex border border-slate-700 rounded overflow-hidden">
                  {["left", "center", "right"].map(a => (
                    <button
                      key={a}
                      className={`flex-1 py-1 text-[10px] uppercase ${(element as any).textAlign === a ? "bg-slate-700 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
                      onClick={() => onChange({ textAlign: a } as any)}
                    >
                      {a === 'left' ? '|<' : a === 'right' ? '>|' : '=|='}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-800/50 my-2" />

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Color</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).color} onChange={(v) => onChange({ color: v } as any)} />
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).color ?? ""} onChange={(e) => onChange({ color: e.target.value } as any)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Stroke</label>
                <div className="flex-1 flex gap-2">
                  <ColorSwatch value={(element as any).strokeColor} onChange={(v) => onChange({ strokeColor: v } as any)} />
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).strokeColor ?? ""} onChange={(e) => onChange({ strokeColor: e.target.value } as any)} placeholder="None" />
                  <NumberField label="" value={(element as any).strokeWidthPx ?? 0} onChange={(v) => onChange({ strokeWidthPx: v } as any)} noLabel className="w-12" />
                </div>
              </div>
            </div>
          )}

          {/* IMAGE/VIDEO */}
          {(element.type === "image" || element.type === "video") && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 text-xs font-semibold">Source</label>
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
                    <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none" value={(element as any).src ?? ""} onChange={(e) => onChange({ src: e.target.value } as any)} placeholder="URL" />
                    <button onClick={element.type === "image" ? onPickImage : onPickVideo} className="bg-slate-800 border border-slate-700 rounded px-2 text-xs hover:bg-slate-700 transition-colors">📂</button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded text-[10px] text-indigo-300 italic flex items-center justify-between">
                    <span>Bound to <span className="font-bold text-indigo-400">{SourceCatalog.find(s => s.id === element.bindings?.["src"]?.sourceId)?.label}</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12 flex-none">Fit</label>
                <select className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" value={(element as any).fit ?? "cover"} onChange={(e) => onChange({ fit: e.target.value } as any)}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Radius</label>
                <NumberField label="" value={(element as any).borderRadius ?? (element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadius: v, borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>

              {element.type === "video" && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).autoplay !== false} onChange={(e) => onChange({ autoplay: e.target.checked } as any)} /> Auto</label>
                  <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).loop !== false} onChange={(e) => onChange({ loop: e.target.checked } as any)} /> Loop</label>
                  <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"><input type="checkbox" checked={(element as any).muted !== false} onChange={(e) => onChange({ muted: e.target.checked } as any)} /> Mute</label>
                </div>
              )}
            </div>
          )}

          {/* PROGRESS */}
          {(element.type === "progressBar" || element.type === "progressRing") && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Fill</label>
                <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).fillColor} onChange={e => onChange({ fillColor: e.target.value } as any)} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Track</label>
                <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).backgroundColor} onChange={e => onChange({ backgroundColor: e.target.value } as any)} />
              </div>
              {element.type === "progressRing" && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Stroke</label>
                  <NumberField label="" value={(element as any).strokeWidthPx ?? 4} onChange={(v) => onChange({ strokeWidthPx: v } as any)} noLabel className="flex-1" />
                </div>
              )}
              {element.type === "progressBar" && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Radius</label>
                  <NumberField label="" value={(element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadiusPx: v } as any)} noLabel className="flex-1" />
                </div>
              )}

              {element.type === "progressBar" && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12">Dir</label>
                  <select className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" value={(element as any).direction ?? "ltr"} onChange={(e) => onChange({ direction: e.target.value } as any)}>
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
          {element.type === "group" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Bg</label>
                <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" value={(element as any).backgroundColor ?? ""} onChange={(e) => onChange({ backgroundColor: e.target.value } as any)} placeholder="Transparent" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Border</label>
                <div className="flex-1 flex gap-2">
                  <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" value={(element as any).borderColor ?? ""} onChange={(e) => onChange({ borderColor: e.target.value } as any)} placeholder="None" />
                  <NumberField label="" value={(element as any).borderWidth ?? 0} onChange={(v) => onChange({ borderWidth: v } as any)} noLabel className="w-12" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500 w-12">Radius</label>
                <NumberField label="" value={(element as any).borderRadiusPx ?? 0} onChange={(v) => onChange({ borderRadiusPx: v } as any)} noLabel className="flex-1" />
              </div>
            </div>
          )}

          {/* MASK */}
          {element.type === "mask" && (
            <div className="space-y-3">
              <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎭</span>
                  <div>
                    <div className="text-xs font-bold text-indigo-300">
                      {(element as any).invert ? "Inverse Mask" : "Mask Group"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {(element as any).invert
                        ? "Hides content inside the mask shape and shows content outside it."
                        : "Shows content inside the mask shape and hides content outside it."}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 mt-3">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Mask Shape:</span>
                    <span className="text-slate-300 font-mono">{(element as any).childIds?.[0]}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Content Layer:</span>
                    <span className="text-slate-300 font-mono">{(element as any).childIds?.[1]}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-indigo-500/10">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Invert Mask</div>
                      <div className="text-[10px] text-slate-500">
                        Cut a hole instead of clipping to the shape
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={!!(element as any).invert}
                      onChange={(e) => onChange({ invert: e.target.checked } as any)}
                      className="rounded border-slate-700 bg-slate-800 accent-indigo-500"
                    />
                  </label>
                </div>

                {onReleaseMask && (
                  <button
                    onClick={() => onReleaseMask(element.id)}
                    className="w-full mt-4 py-1.5 bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-200 text-xs font-semibold rounded border border-slate-700 hover:border-red-500/50 transition-all"
                  >
                    Release Mask
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </AccordionSection >

      {element.type !== "lower_third" && (
        <AccordionSection title="Animation" defaultOpen={true}>
          <div className="space-y-3">
            <div className="text-[10px] text-slate-500">
              Delay is in milliseconds. Start always resets the element to its hidden baseline first, then runs the configured enter animation without saving visibility changes.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("enter")}
                className="flex-1 bg-emerald-900/30 hover:bg-emerald-800/50 text-emerald-200 text-[10px] py-1 rounded border border-emerald-800 transition-colors"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("exit")}
                className="flex-1 bg-amber-900/30 hover:bg-amber-800/50 text-amber-200 text-[10px] py-1 rounded border border-amber-800 transition-colors"
              >
                Test Exit
              </button>
              <button
                type="button"
                onClick={() => onPreviewVisibilityAction?.("reset")}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] py-1 rounded border border-slate-700 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="text-[10px] text-slate-500">
              Preview state: <span className="text-slate-300">{previewVisible ? "Visible" : "Hidden"}</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-12 flex-none">Enter</label>
              <select
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
              <label className="text-[10px] text-slate-500 w-12 flex-none">Exit</label>
              <select
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
              <label className="text-[10px] text-slate-500 w-12 flex-none">Dur</label>
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
              <label className="text-[10px] text-slate-500 w-12 flex-none">Delay</label>
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
              <label className="text-[10px] text-slate-500 w-12 flex-none">Ease</label>
              <select
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
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
          {/* Shadow / Glow */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={(element as any).shadow?.enabled === true}
                onChange={(e) => {
                  const s = (element as any).shadow || { color: "#000000", blur: 10, x: 0, y: 4 };
                  onChange({ shadow: { ...s, enabled: e.target.checked } } as any);
                }}
                className="rounded border-slate-700 bg-slate-800 accent-indigo-500"
              />
              <span className="text-xs font-medium text-slate-300">Shadow / Glow</span>
            </label>
            {(element as any).shadow?.enabled && (
              <div className="space-y-2 pl-2 border-l-2 border-slate-800 ml-1">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12 flex-none">Color</label>
                  <div className="flex-1 flex gap-2">
                    <ColorSwatch value={(element as any).shadow?.color} onChange={(v) => onChange({ shadow: { ...(element as any).shadow, color: v } } as any)} />
                    <input type="text" className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono" value={(element as any).shadow?.color} onChange={(e) => onChange({ shadow: { ...(element as any).shadow, color: e.target.value } } as any)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12 flex-none">Blur</label>
                  <NumberField label="" value={(element as any).shadow?.blur} onChange={(v) => onChange({ shadow: { ...(element as any).shadow, blur: v } } as any)} noLabel className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12 flex-none">Offset X</label>
                  <NumberField label="" value={(element as any).shadow?.x} onChange={(v) => onChange({ shadow: { ...(element as any).shadow, x: v } } as any)} noLabel className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 w-12 flex-none">Offset Y</label>
                  <NumberField label="" value={(element as any).shadow?.y} onChange={(v) => onChange({ shadow: { ...(element as any).shadow, y: v } } as any)} noLabel className="flex-1" />
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-slate-800/50" />

          {/* Clip */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-300 flex-1">Masking</label>
              <select
                className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[10px] w-24"
                value={(element as any).clip?.type ?? "none"}
                onChange={(e) => onChange({ clip: { ...(element as any).clip, type: e.target.value } } as any)}
              >
                <option value="none">None</option>
                <option value="roundRect">Frame</option>
                <option value="circle">Circle</option>
              </select>
            </div>
            {(element as any).clip?.type === "roundRect" && (
              <div className="flex items-center gap-2 pl-2 border-l-2 border-slate-800 ml-1 mt-2">
                <label className="text-[10px] text-slate-500 w-10 flex-none">Radius</label>
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
                  <label className="block mb-1 text-slate-400 text-xs">Value ({Math.round(((element as any).value ?? 0) * 100)}%)</label>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    className="w-full h-1 bg-slate-800 rounded-full"
                    value={(element as any).value ?? 0}
                    onChange={(e) => onChange({ value: Number(e.target.value) } as any)}
                  />
                </div>
              )}
              {element.type === "text" && (
                <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800/50">
                  <div className="mb-1 text-slate-300 font-semibold">Variable Injection</div>
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
      {!noLabel && <label className="block mb-1 text-slate-400 text-[10px]">{label}</label>}
      <input
        type="text"
        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
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
          className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-950 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <button
              className="rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
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
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
                >
                  {busy ? "Uploading..." : "Upload file"}
                </button>
              </div>
            </div>

            {err && <div className="text-xs text-red-400">{err}</div>}

            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Recent</div>
              </div>

              {recent.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">No recent uploads yet. Upload something.</div>
              ) : (
                <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {recent.map((a) => (
                    <button
                      key={a.url}
                      onClick={() => onPick(a.url)}
                      className="group rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 overflow-hidden text-left"
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
                        <div className="text-xs text-slate-200 truncate">{a.name || a.url.split("/").pop() || a.url}</div>
                        <div className="text-[10px] text-slate-500 truncate">{a.url}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500">
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
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mt-2">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Test Data (Variables)</div>
      <div className="space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <div className="text-xs text-slate-500 font-mono w-1/3 truncate" title={k}>{k}</div>
            <input
              type="text"
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
              value={v}
              onChange={e => onChange(k, e.target.value)}
            />
            <button onClick={() => onChange(k, "")} className="text-slate-600 hover:text-red-400 px-1">×</button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          <input
            type="text"
            className="w-1/3 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
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
            className="text-xs bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-slate-300"
          >
            Add
          </button>
        </div>
        <div className="text-[10px] text-slate-500">
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-white">Save Template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Template Name</label>
            <input
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              placeholder="My Lower Third"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && val.trim()) onSave(val.trim());
              }}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => val.trim() && onSave(val.trim())}
              disabled={!val.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    <div className="border-b border-slate-800 last:border-0 border-t first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900/40 select-none bg-slate-950/20"
      >
        <span>{title}</span>
        <span className={`transform transition-transform text-slate-500 ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="p-3 bg-slate-900/10 space-y-3">{children}</div>}
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
        flex items-center justify-center w-9 h-9 rounded-lg transition-all border
        ${active
          ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-500/10"
          : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        }
        ${disabled ? "opacity-20 cursor-not-allowed" : ""}
      `}
      title={label}
    >
      <div className="flex items-center justify-center scale-90">{icon}</div>
    </button>
  );
}

const TOOLBAR_ICONS: Record<string, React.ReactNode> = {
  text: <span className="font-serif font-bold text-lg">T</span>,
  box: <div className="w-4 h-4 border-2 border-current rounded-sm" />,
  image: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
  video: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>,
  bar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="10" width="20" height="4" rx="2" /></svg>,
  ring: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /></svg>,
  rect: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1" /></svg>,
  circle: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>,
  triangle: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l10 18H2L12 3z" /></svg>,
  line: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="20" x2="20" y2="4" /></svg>,
  lower_third: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="14" width="20" height="6" rx="1" /><line x1="2" y1="14" x2="22" y2="14" /></svg>
};

function CreationToolbar({
  onAddText,
  onAddBox,
  onAddShape,
  onAddImage,
  onAddVideo,
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
  onAddShape: (type: "rect" | "circle" | "triangle" | "line") => void;
  onAddImage: () => void;
  onAddVideo: () => void;
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
    <div className="flex flex-col gap-3 p-3 border-b border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tools</label>

        <div className="flex gap-1">
          <button
            onClick={onGroup}
            disabled={!canGroup}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800 rounded"
            title="Group Selection (Ctrl+G)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 4h6M4 9v6M20 9v6M9 20h6" /></svg>
          </button>
          <button
            onClick={onUngroup}
            disabled={!canUngroup}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800 rounded"
            title="Ungroup (Ctrl+Shift+G)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {/* Creation Tools (Row 1) */}
        <ToolButton icon={TOOLBAR_ICONS.text} label="Add Text" onClick={onAddText} />
        <ToolButton icon={TOOLBAR_ICONS.box} label="Add Box" onClick={onAddBox} />
        <ToolButton icon={TOOLBAR_ICONS.image} label="Add Image" onClick={onAddImage} />
        <ToolButton icon={TOOLBAR_ICONS.video} label="Add Video" onClick={onAddVideo} />
        <ToolButton icon={TOOLBAR_ICONS.lower_third} label="Add Lower Third" onClick={onAddLowerThird} />
        <ToolButton
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
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
      </div>

      <div className="pt-3 mt-1 border-t border-slate-800 flex gap-2">
        <button
          onClick={onTestEvent}
          className="flex-none px-3 py-2 rounded-lg text-xs font-semibold shadow-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
          title="Send Test Event"
        >
          ⚡
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 ${saveOk ? "bg-emerald-600 text-white" :
            saveError ? "bg-red-600 text-white" :
              "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
        >
          {saving ? (
            <>
              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span>Saving...</span>
            </>
          ) : saveOk ? (
            <><span>✓</span><span>Saved!</span></>
          ) : (
            <><span>Save Changes</span></>
          )}

          {saveError && <span className="ml-1 text-[10px] opacity-80">(Error)</span>}
        </button>
      </div>
    </div>
  );
}

const LAYERS_PANEL_ICONS: Record<string, React.ReactNode> = {
  group: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 4h6M4 9v6M20 9v6M9 20h6" /></svg>,
  text: <span className="font-serif font-bold text-[10px]">T</span>,
  image: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
  video: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>,
  box: <div className="w-2.5 h-2.5 border border-current rounded-sm" />,
  shape: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l10 20H2L12 2z" /></svg>, // Default shape
  mask: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18" /><path d="M3 12h18" /><circle cx="12" cy="12" r="9" /></svg>,
  progress: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
};

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
  onSendToBack
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    if ((el.type === 'group' || el.type === 'mask') && Array.isArray((el as any).childIds)) {
      (el as any).childIds.forEach((cid: string) => allChildIds.add(cid));
    }
  });

  const roots = layersTopToBottom.filter(el => !allChildIds.has(el.id));

  // Recursive render function
  const renderItem = (el: OverlayElement, depth: number, isLastChild: boolean, parentTree: boolean[]) => {
    const isSelected = selectedIds.includes(el.id);
    const isVisible = el.visible !== false;
    const isLocked = el.locked === true;

    // Find children
    const isContainer = el.type === 'group' || el.type === 'mask';
    let children: OverlayElement[] = [];
    if (isContainer) {
      children = layersTopToBottom.filter(c => (el as any).childIds?.includes(c.id));
    }

    const icon = LAYERS_PANEL_ICONS[el.type] || LAYERS_PANEL_ICONS[el.type.startsWith('progress') ? 'progress' : 'box'];

    return (
      <React.Fragment key={el.id}>
        <div
          data-layer-id={el.id}
          className={`
            group flex items-center h-8 pr-2 select-none cursor-pointer border-b border-white/5 relative
            ${isSelected ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}
          `}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={(e) => onSelect(el.id, e.shiftKey || e.ctrlKey || e.metaKey)}
        >
          {/* Tree Guides */}
          {depth > 0 && (
            <div className="absolute left-0 top-0 bottom-0 w-full pointer-events-none overflow-hidden">
              {parentTree.map((hasNextSibling, idx) => (
                hasNextSibling && (
                  <div
                    key={idx}
                    className="absolute bg-slate-700/30 w-px top-0 bottom-0"
                    style={{ left: `${idx * 16 + 15}px` }}
                  />
                )
              ))}
              <div
                className="absolute bg-slate-700/50 w-px top-0 h-4"
                style={{ left: `${depth * 16 - 1}px` }}
              />
              <div
                className="absolute bg-slate-700/50 h-px w-2 top-4"
                style={{ left: `${depth * 16 - 1}px` }}
              />
            </div>
          )}

          {/* Icon */}
          <span className={`w-5 flex items-center justify-center opacity-70 mr-2 flex-shrink-0 ${isSelected ? "text-white" : "text-slate-500"}`}>
            {icon}
          </span>

          {/* Label */}
          <span className="min-w-0 flex-1 text-xs truncate font-medium">
            {el.name || defaultElementLabel(el)}
          </span>

          {/* Controls (Hover/Selected) */}
          <div
            className={`flex items-center gap-1 flex-shrink-0 ${isSelected || isLocked || !isVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }}
              className={`p-1 rounded hover:bg-white/10 ${isLocked ? "text-amber-500 opacity-100" : "text-slate-500"}`}
              title={isLocked ? "Unlock" : "Lock"}
            >
              {isLocked ? "🔒" : "🔓"}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisible(el.id); }}
              className={`p-1 rounded hover:bg-white/10 ${!isVisible ? "text-slate-400 opacity-100" : "text-slate-500"}`}
              title={isVisible ? "Hide" : "Show"}
            >
              {isVisible ? "👁️" : "🙈"}
            </button>

            {el.type === "shape" && onMask && (
              <button
                onClick={(e) => { e.stopPropagation(); onMask(el.id); }}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-indigo-400"
                title="Use as Mask"
              >
                🎭
              </button>
            )}

            {el.type === "mask" && onReleaseMask && (
              <button
                onClick={(e) => { e.stopPropagation(); onReleaseMask(el.id); }}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-red-400"
                title="Release Mask"
              >
                🔓
              </button>
            )}
          </div>
        </div>

        {/* Render children if group */}
        {children.length > 0 && (
          <div className="relative">
            {children.map((c, idx) => renderItem(c, depth + 1, idx === children.length - 1, [...parentTree, !isLastChild]))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-slate-900 overflow-y-auto pb-10 custom-scrollbar">
      {roots.length === 0 && <div className="p-4 text-xs text-slate-600 text-center italic">No layers</div>}
      {roots.map((el, idx) => renderItem(el, 0, idx === roots.length - 1, []))}
    </div>
  );
}

function ComponentLibraryPanel({ components, onInsert, onEdit, onDelete }: {
  components: OverlayComponentDef[],
  onInsert: (c: OverlayComponentDef) => void,
  onEdit: (id: string) => void,
  onDelete: (id: string) => void
}) {
  if (!components || components.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-slate-400 text-sm mb-2">No Components Found</div>
        <div className="text-slate-600 text-xs">Select elements on the canvas and click "Create Component" to build reusable blocks.</div>
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
            className="group relative flex items-center justify-between p-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors"
            onClick={() => onInsert(comp)}
          >
            <div className="flex flex-col truncate">
              <span className="text-sm font-semibold text-slate-200 truncate pr-2" title={comp.name}>{comp.name}</span>
              <span className="text-[10px] text-slate-500 mt-0.5">{comp.elements?.length || 0} nodes</span>
            </div>
            <div className="flex items-center gap-1.5 translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all">
              <button
                className="text-slate-400 hover:text-white p-1.5 rounded-md bg-slate-900/50 hover:bg-slate-600 transition-colors border border-slate-700"
                onClick={(e) => { e.stopPropagation(); onEdit(comp.id); }}
                title="Edit Master"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              {!isBuiltin && (
                <button
                  className="text-slate-400 hover:text-red-400 p-1.5 rounded-md bg-slate-900/50 hover:bg-red-900/30 transition-colors border border-slate-700"
                  onClick={(e) => { e.stopPropagation(); onDelete(comp.id); }}
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              )}
              <button
                className="text-slate-400 hover:text-white p-1.5 rounded-md bg-slate-900/50 hover:bg-indigo-600 transition-colors border border-slate-700"
                title="Insert Instance"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

