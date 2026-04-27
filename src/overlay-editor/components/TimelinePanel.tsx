import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OverlayElement,
  OverlayTimelineEasing,
  OverlayTimeline,
  OverlayTimelineKeyframe,
  OverlayTimelineProperty,
  OverlayTimelineTrack,
} from "../../shared/overlayTypes";
import { uiClasses, uiTokens } from "../uiTokens";

// ── Constants ─────────────────────────────────────────────────────────────────
const TRACK_HEIGHT = parseInt(uiTokens.control.sm, 10);
const HEADER_WIDTH = 200;
const KF_SIZE = 8;
const RULER_HEIGHT = 24;
const MIN_PX_PER_SEC = 40;
const DEFAULT_PX_PER_SEC = 120;

const TIMELINE_PROPERTIES: OverlayTimelineProperty[] = [
  "x","y","width","height","opacity","rotationDeg",
  "scaleX","scaleY","tiltX","tiltY","skewX","skewY","perspective",
];

const PROPERTY_LABELS: Record<OverlayTimelineProperty, string> = {
  x:"X", y:"Y", width:"Width", height:"Height", opacity:"Opacity",
  rotationDeg:"Rotation", scaleX:"Scale X", scaleY:"Scale Y",
  tiltX:"Tilt X (3D)", tiltY:"Tilt Y (3D)", skewX:"Skew X", skewY:"Skew Y",
  perspective:"Perspective",
};

const EASING_OPTIONS: Array<{ value: OverlayTimelineEasing; label: string }> = [
  { value: "linear",      label: "Linear"      },
  { value: "ease-in",     label: "Ease In"     },
  { value: "ease-out",    label: "Ease Out"    },
  { value: "ease-in-out", label: "Ease In Out" },
  { value: "hold",        label: "Hold"        },
];


// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMs(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.round(Math.max(0, ms) % 1000);
  return `${s}.${String(m).padStart(3,"0")}s`;
}

function isTimelineEligible(el: OverlayElement) { return el.type !== "lower_third"; }

function sortTracks(tracks: OverlayTimelineTrack[]) {
  return [...tracks].sort((a, b) => {
    if (a.elementId !== b.elementId) return a.elementId.localeCompare(b.elementId);
    return TIMELINE_PROPERTIES.indexOf(a.property) - TIMELINE_PROPERTIES.indexOf(b.property);
  });
}

/** Snap a time value to the nearest keyframe on any other track (within threshold px) */
function snapToKeyframes(
  timeMs: number,
  allTracks: OverlayTimelineTrack[],
  excludeTrackId: string,
  pxPerSec: number,
  thresholdPx = 6,
): number {
  const thresholdMs = (thresholdPx / pxPerSec) * 1000;
  let best = timeMs;
  let bestDist = thresholdMs;
  for (const track of allTracks) {
    if (track.id === excludeTrackId) continue;
    for (const kf of track.keyframes) {
      const dist = Math.abs(kf.t - timeMs);
      if (dist < bestDist) { bestDist = dist; best = kf.t; }
    }
  }
  return best;
}

// ── Bezier Curve Editor ───────────────────────────────────────────────────────
const BEZIER_PRESETS: Record<string, [number,number,number,number]> = {
  linear:      [0,   0,   1,   1  ],
  "ease-in":   [0.4, 0,   1,   1  ],
  "ease-out":  [0,   0,   0.6, 1  ],
  "ease-in-out":[0.4,0,   0.6, 1  ],
};

function BezierEditor({
  value,
  onChange,
}: {
  value: [number,number,number,number];
  onChange: (v: [number,number,number,number]) => void;
}) {
  const SIZE = 96;
  const PAD  = 12;
  const inner = SIZE - PAD * 2;
  const [dragging, setDragging] = useState<0|1|null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toSvg = (nx: number, ny: number) => ({
    x: PAD + nx * inner,
    y: PAD + (1 - ny) * inner,
  });

  const fromSvg = (sx: number, sy: number) => ({
    nx: Math.max(0, Math.min(1, (sx - PAD) / inner)),
    ny: Math.max(0, Math.min(1, 1 - (sy - PAD) / inner)),
  });

  const p0 = { x: PAD, y: PAD + inner };
  const p3 = { x: PAD + inner, y: PAD };
  const p1 = toSvg(value[0], value[1]);
  const p2 = toSvg(value[2], value[3]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragging === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (SIZE / rect.width);
    const sy = (e.clientY - rect.top)  * (SIZE / rect.height);
    const { nx, ny } = fromSvg(sx, sy);
    if (dragging === 0) onChange([nx, ny, value[2], value[3]]);
    else                onChange([value[0], value[1], nx, ny]);
  }, [dragging, value, onChange]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging === null) return;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, onMouseMove, onMouseUp]);

  return (
    <div className="space-y-1">
      <svg
        ref={svgRef}
        width={SIZE} height={SIZE}
        className="rounded border border-[rgba(255,255,255,0.08)] bg-[#0d0d0f] cursor-crosshair"
        style={{ display:"block" }}
      >
        {/* grid */}
        {[0.25,0.5,0.75].map(r => (
          <React.Fragment key={r}>
            <line x1={PAD+r*inner} y1={PAD} x2={PAD+r*inner} y2={PAD+inner} stroke="rgba(255,255,255,0.05)" />
            <line x1={PAD} y1={PAD+r*inner} x2={PAD+inner} y2={PAD+r*inner} stroke="rgba(255,255,255,0.05)" />
          </React.Fragment>
        ))}
        {/* diagonal reference */}
        <line x1={p0.x} y1={p0.y} x2={p3.x} y2={p3.y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
        {/* control arms */}
        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#6366f1" strokeOpacity={0.5} />
        <line x1={p3.x} y1={p3.y} x2={p2.x} y2={p2.y} stroke="#6366f1" strokeOpacity={0.5} />
        {/* curve */}
        <path
          d={`M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
          fill="none" stroke="#a5b4fc" strokeWidth={1.5}
        />
        {/* handles */}
        {([p1,p2] as const).map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r={4}
            fill={dragging === i ? "#fff" : "#6366f1"}
            stroke="#fff" strokeWidth={1}
            style={{ cursor:"grab" }}
            onMouseDown={(e) => { e.preventDefault(); setDragging(i as 0|1); }}
          />
        ))}
        {/* endpoints */}
        <circle cx={p0.x} cy={p0.y} r={3} fill="#94a3b8" />
        <circle cx={p3.x} cy={p3.y} r={3} fill="#94a3b8" />
      </svg>
      <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
        {(["x1","y1","x2","y2"] as const).map((k,i) => (
          <label key={k} className="flex items-center gap-1">
            <span className="w-4">{k}</span>
            <input
              type="number" min={0} max={1} step={0.01}
              value={Math.round(value[i]*100)/100}
              onChange={e => {
                const v = [...value] as [number,number,number,number];
                v[i] = parseFloat(e.target.value) || 0;
                onChange(v);
              }}
              className={`w-full ${uiClasses.field} py-0 text-[10px]`}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(BEZIER_PRESETS).map(([name, preset]) => (
          <button
            key={name}
            onClick={() => onChange(preset)}
            className="rounded border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── Track Row ─────────────────────────────────────────────────────────────────
type TrackRowProps = {
  durationMs: number;
  pxPerSec: number;
  track: OverlayTimelineTrack;
  allTracks: OverlayTimelineTrack[];
  selectedKeyframeIds: Set<string>;
  playheadMs: number;
  onSelectKeyframe: (trackId: string, keyframeId: string, additive: boolean) => void;
  onMoveKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => void;
  onMoveSelectedKeyframes: (trackId: string, deltaMs: number) => void;
  onDuplicateKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => string | null;
  onAddKeyframeAtTime: (trackId: string, timeMs: number) => void;
  onCopyKeyframes: () => void;
};

function TimelineTrackRow({
  durationMs, pxPerSec, track, allTracks, selectedKeyframeIds, playheadMs,
  onSelectKeyframe, onMoveKeyframe, onMoveSelectedKeyframes,
  onDuplicateKeyframe, onAddKeyframeAtTime,
}: TrackRowProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const totalWidth = (durationMs / 1000) * pxPerSec;

  const msFromClientX = (clientX: number) => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const rect = lane.getBoundingClientRect();
    const px = clientX - rect.left;
    return Math.max(0, Math.min(durationMs, (px / totalWidth) * durationMs));
  };

  const onMouseDown = (keyframeId: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    onSelectKeyframe(track.id, keyframeId, additive);
    setDraggingId(keyframeId);

    const isMulti = selectedKeyframeIds.has(keyframeId) && selectedKeyframeIds.size > 1;
    let startX = e.clientX;
    let activeId = keyframeId;

    if (e.altKey) {
      const t = msFromClientX(e.clientX);
      activeId = onDuplicateKeyframe(track.id, keyframeId, t) ?? keyframeId;
    }

    const onMove = (me: MouseEvent) => {
      if (isMulti) {
        const deltaMs = ((me.clientX - startX) / totalWidth) * durationMs;
        startX = me.clientX;
        onMoveSelectedKeyframes(track.id, deltaMs);
      } else {
        const t = snapToKeyframes(msFromClientX(me.clientX), allTracks, track.id, pxPerSec);
        onMoveKeyframe(track.id, activeId, t);
      }
    };
    const onUp = (ue: MouseEvent) => {
      if (isMulti) {
        const deltaMs = ((ue.clientX - startX) / totalWidth) * durationMs;
        onMoveSelectedKeyframes(track.id, deltaMs);
      } else {
        const t = snapToKeyframes(msFromClientX(ue.clientX), allTracks, track.id, pxPerSec);
        onMoveKeyframe(track.id, activeId, t);
      }
      setDraggingId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const playheadPx = (playheadMs / Math.max(1, durationMs)) * totalWidth;

  return (
    <div className="flex items-center border-b border-[rgba(255,255,255,0.04)]" style={{ height: TRACK_HEIGHT }}>
      <div
        className="flex-none truncate px-3 text-[11px] leading-[1.4] text-slate-400 uppercase tracking-[0.05em]"
        style={{ width: HEADER_WIDTH }}
      >
        {PROPERTY_LABELS[track.property] ?? track.property}
      </div>
      <div
        ref={laneRef}
        className={`relative h-full flex-none ${uiClasses.timelineLane}`}
        style={{ width: totalWidth }}
        onDoubleClick={(e) => {
          const t = msFromClientX(e.clientX);
          onAddKeyframeAtTime(track.id, t);
        }}
      >
        {/* playhead */}
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-400/80"
          style={{ left: playheadPx }} />
        {track.keyframes.map((kf) => {
          const isSelected = selectedKeyframeIds.has(kf.id);
          const isDragging = draggingId === kf.id;
          return (
            <button
              key={kf.id}
              type="button"
              onMouseDown={onMouseDown(kf.id)}
              className={`absolute top-1/2 -translate-y-1/2 rotate-45 border transition-colors focus:outline-none ${
                isSelected  ? "bg-indigo-300 border-white z-10" :
                isDragging  ? "bg-amber-400 border-white z-10"  :
                              "bg-slate-300 border-[#0f1012]"
              }`}
              style={{
                left: (kf.t / Math.max(1, durationMs)) * totalWidth,
                width: KF_SIZE, height: KF_SIZE,
                marginLeft: -(KF_SIZE / 2),
              }}
              title={`${track.property} @ ${formatMs(kf.t)} = ${Math.round(kf.value * 1000) / 1000}`}
            />
          );
        })}
      </div>
    </div>
  );
}


// ── Ruler ─────────────────────────────────────────────────────────────────────
function TimelineRuler({
  durationMs, pxPerSec, scrollLeft, playheadMs, onScrub,
}: {
  durationMs: number; pxPerSec: number; scrollLeft: number;
  playheadMs: number; onScrub: (ms: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const totalWidth = (durationMs / 1000) * pxPerSec;

  const msFromClientX = (clientX: number) => {
    if (!ref.current) return 0;
    const rect = ref.current.getBoundingClientRect();
    const px = clientX - rect.left + scrollLeft;
    return Math.max(0, Math.min(durationMs, (px / totalWidth) * durationMs));
  };

  const beginScrub = (e: React.MouseEvent) => {
    onScrub(msFromClientX(e.clientX));
    const onMove = (me: MouseEvent) => onScrub(msFromClientX(me.clientX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Compute tick interval: aim for ~60px between ticks
  const targetTickPx = 60;
  const targetTickMs = (targetTickPx / pxPerSec) * 1000;
  const niceIntervals = [50,100,200,250,500,1000,2000,5000];
  const tickIntervalMs = niceIntervals.find(n => n >= targetTickMs) ?? 5000;

  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += tickIntervalMs) ticks.push(t);

  const playheadPx = (playheadMs / Math.max(1, durationMs)) * totalWidth - scrollLeft;

  return (
    <div
      ref={ref}
      className="relative flex-none cursor-col-resize select-none overflow-hidden bg-[#0d0d0f]"
      style={{ height: RULER_HEIGHT, width: "100%" }}
      onMouseDown={beginScrub}
    >
      <div className="absolute top-0 left-0" style={{ width: totalWidth }}>
        {ticks.map(t => {
          const px = (t / Math.max(1, durationMs)) * totalWidth - scrollLeft;
          if (px < -40 || px > window.innerWidth) return null;
          return (
            <div key={t} className="absolute top-0 bottom-0 border-l border-[rgba(255,255,255,0.08)]"
              style={{ left: px }}>
              <span className="absolute top-1 left-1 text-[10px] leading-[1.4] text-slate-500 whitespace-nowrap">
                {formatMs(t)}
              </span>
            </div>
          );
        })}
      </div>
      {/* playhead */}
      <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-400"
        style={{ left: playheadPx }} />
      {/* playhead triangle */}
      <div className="pointer-events-none absolute top-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-amber-400"
        style={{ left: playheadPx - 4 }} />
    </div>
  );
}


// ── Props ─────────────────────────────────────────────────────────────────────
// Event names available for event timelines
export const EVENT_TIMELINE_NAMES = ["raid", "sub", "follow", "donation", "cheer", "host"] as const;
export type EventTimelineName = typeof EVENT_TIMELINE_NAMES[number];

const EVENT_COLORS: Record<string, string> = {
  raid:     "#f59e0b",
  sub:      "#6366f1",
  follow:   "#22c55e",
  donation: "#ec4899",
  cheer:    "#a855f7",
  host:     "#06b6d4",
};

type Props = {
  timeline: OverlayTimeline;
  elements: OverlayElement[];
  selectedIds: string[];
  playheadMs: number;
  isPlaying: boolean;
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  selectedKeyframeIds?: Set<string>;
  selectedKeyframeEasing: OverlayTimelineEasing;
  onSelectKeyframe: (trackId: string | null, keyframeId: string | null, additive?: boolean) => void;
  // Event timeline props
  activeEventTimeline?: string | null;
  eventTimelines?: Record<string, OverlayTimeline>;
  onSetActiveEventTimeline?: (name: string | null) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSetPlayhead: (ms: number) => void;
  onSetDuration: (ms: number) => void;
  onDeleteSelectedKeyframe: () => void;
  onSetPlayback: (patch: { loop?: boolean; reverse?: boolean }) => void;
  onSetSelectedKeyframeEasing: (easing: OverlayTimelineEasing) => void;
  onAddTrack: (elementId: string, property: OverlayTimelineProperty) => void;
  onMoveKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => void;
  onDuplicateKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => string | null;
  onAddKeyframeAtTime: (trackId: string, timeMs: number) => void;
  // new
  onMoveMultipleKeyframes?: (moves: Array<{ trackId: string; keyframeId: string; nextTimeMs: number }>) => void;
  onSetKeyframeBezier?: (trackId: string, keyframeId: string, bezier: [number,number,number,number]) => void;
};


// ── Main Panel ────────────────────────────────────────────────────────────────
export function TimelinePanel({
  timeline, elements, selectedIds, playheadMs, isPlaying,
  selectedTrackId, selectedKeyframeId, selectedKeyframeIds, selectedKeyframeEasing,
  onSelectKeyframe, onPlay, onPause, onStop, onSetPlayhead, onSetDuration,
  onDeleteSelectedKeyframe, onSetPlayback, onSetSelectedKeyframeEasing,
  onAddTrack, onMoveKeyframe, onDuplicateKeyframe, onAddKeyframeAtTime,
  onMoveMultipleKeyframes, onSetKeyframeBezier,
  activeEventTimeline, eventTimelines, onSetActiveEventTimeline,
}: Props) {
  const activeColor = activeEventTimeline ? (EVENT_COLORS[activeEventTimeline] ?? "#6366f1") : null;
  // ── zoom / scroll ──────────────────────────────────────────────────────────
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── multi-select ──────────────────────────────────────────────────────────
  const [selectedKfIds, setSelectedKfIds] = useState<Set<string>>(new Set());
  const [copiedKeyframes, setCopiedKeyframes] = useState<Array<{ trackId: string; t: number; value: number; easing?: OverlayTimelineEasing }>>([]);

  // ── marquee drag-select ───────────────────────────────────────────────────
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number; scrollLeft: number } | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  // ── collapse state ────────────────────────────────────────────────────────
  const [collapsedElements, setCollapsedElements] = useState<Set<string>>(new Set());

  // ── bezier editor ─────────────────────────────────────────────────────────
  const [showBezier, setShowBezier] = useState(false);

  const timelineElements = useMemo(() => elements.filter(isTimelineEligible), [elements]);

  const tracksByElement = useMemo(() => {
    const map = new Map<string, OverlayTimelineTrack[]>();
    for (const track of sortTracks(timeline.tracks || [])) {
      if (!map.has(track.elementId)) map.set(track.elementId, []);
      map.get(track.elementId)!.push(track);
    }
    return map;
  }, [timeline.tracks]);

  const visibleElements = useMemo(() => {
    const sel = new Set(selectedIds);
    return timelineElements.filter(el => sel.has(el.id) || tracksByElement.has(el.id));
  }, [timelineElements, selectedIds, tracksByElement]);

  const totalWidth = (timeline.durationMs / 1000) * pxPerSec;

  // Sync scroll
  const syncScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft((e.target as HTMLDivElement).scrollLeft);
  };

  // Wheel zoom (Ctrl/Cmd + wheel)
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setPxPerSec(prev => Math.max(MIN_PX_PER_SEC, Math.min(2000, prev * (e.deltaY < 0 ? 1.15 : 0.87))));
  };

  // ── multi-select handler ──────────────────────────────────────────────────
  const handleSelectKeyframe = (trackId: string, kfId: string, additive: boolean) => {
    setSelectedKfIds(prev => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (additive && prev.has(kfId)) next.delete(kfId);
      else next.add(kfId);
      return next;
    });
    onSelectKeyframe(trackId, kfId);
  };

  // ── move multiple keyframes ───────────────────────────────────────────────
  const handleMoveSelectedKeyframes = (_trackId: string, deltaMs: number) => {
    if (!onMoveMultipleKeyframes) return;
    const moves: Array<{ trackId: string; keyframeId: string; nextTimeMs: number }> = [];
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) {
          moves.push({ trackId: track.id, keyframeId: kf.id, nextTimeMs: Math.max(0, Math.min(timeline.durationMs, kf.t + deltaMs)) });
        }
      }
    }
    onMoveMultipleKeyframes(moves);
  };

  // ── marquee drag-select handlers ─────────────────────────────────────────
  const onTrackAreaMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start marquee on left-click on the track area background (not on keyframes)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-keyframe]')) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    marqueeRef.current = { startX: x, startY: y, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    setMarquee({ startX: x, startY: y, endX: x, endY: y });

    const onMove = (ev: MouseEvent) => {
      if (!marqueeRef.current) return;
      const ex = ev.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
      const ey = ev.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
      setMarquee({ startX: marqueeRef.current.startX, startY: marqueeRef.current.startY, endX: ex, endY: ey });
    };

    const onUp = (ev: MouseEvent) => {
      if (!marqueeRef.current) return;
      const ex = ev.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
      const ey = ev.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
      const mx0 = Math.min(marqueeRef.current.startX, ex);
      const mx1 = Math.max(marqueeRef.current.startX, ex);
      const my0 = Math.min(marqueeRef.current.startY, ey);
      const my1 = Math.max(marqueeRef.current.startY, ey);

      // Only select if marquee has meaningful size
      if (mx1 - mx0 > 4 || my1 - my0 > 4) {
        // Convert pixel bounds to time range
        const t0 = (mx0 - HEADER_WIDTH) / pxPerSec * 1000;
        const t1 = (mx1 - HEADER_WIDTH) / pxPerSec * 1000;

        // Find all keyframes within the marquee bounds
        const newSelected = new Set<string>();
        let rowY = 0;
        for (const el of visibleElements) {
          const tracks = tracksByElement.get(el.id) || [];
          if (collapsedElements.has(el.id)) {
            rowY += TRACK_HEIGHT + 8; // element header
            continue;
          }
          rowY += TRACK_HEIGHT + 8; // element header
          for (const track of tracks) {
            const rowTop = rowY;
            const rowBottom = rowY + TRACK_HEIGHT;
            if (rowBottom >= my0 && rowTop <= my1) {
              for (const kf of track.keyframes) {
                if (kf.t >= t0 && kf.t <= t1) {
                  newSelected.add(kf.id);
                }
              }
            }
            rowY += TRACK_HEIGHT;
          }
        }

        if (newSelected.size > 0) {
          setSelectedKfIds(ev.shiftKey ? new Set([...selectedKfIds, ...newSelected]) : newSelected);
        } else if (!ev.shiftKey) {
          setSelectedKfIds(new Set());
        }
      }

      marqueeRef.current = null;
      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── copy / paste ──────────────────────────────────────────────────────────
  const copySelected = () => {
    const copied: typeof copiedKeyframes = [];
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) {
          copied.push({ trackId: track.id, t: kf.t, value: kf.value, easing: kf.easing });
        }
      }
    }
    setCopiedKeyframes(copied);
  };

  const pasteAtPlayhead = () => {
    if (!copiedKeyframes.length || !onMoveMultipleKeyframes) return;
    const minT = Math.min(...copiedKeyframes.map(k => k.t));
    const offset = playheadMs - minT;
    copiedKeyframes.forEach(k => {
      onAddKeyframeAtTime(k.trackId, Math.max(0, Math.min(timeline.durationMs, k.t + offset)));
    });
  };

  // Keyboard shortcuts inside panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "c") { e.preventDefault(); copySelected(); }
      if (mod && e.key === "v") { e.preventDefault(); pasteAtPlayhead(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedKfIds.size > 1) {
          // delete all selected — handled by parent for single, here we just clear
          setSelectedKfIds(new Set());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKfIds, copiedKeyframes, playheadMs]);

  // ── bezier for selected keyframe ──────────────────────────────────────────
  const selectedKf = useMemo(() => {
    if (!selectedTrackId || !selectedKeyframeId) return null;
    const track = timeline.tracks.find(t => t.id === selectedTrackId);
    return track?.keyframes.find(k => k.id === selectedKeyframeId) ?? null;
  }, [selectedTrackId, selectedKeyframeId, timeline.tracks]);

  const bezierValue: [number,number,number,number] = useMemo(() => {
    const easing = selectedKf?.easing ?? selectedKeyframeEasing;
    return BEZIER_PRESETS[easing] ?? BEZIER_PRESETS["ease-in-out"];
  }, [selectedKf, selectedKeyframeEasing]);

  return (
    <div
      className="flex h-72 flex-col border-t bg-[#111113]"
      style={{ borderTopColor: activeColor ?? 'rgba(255,255,255,0.08)', borderTopWidth: activeColor ? 2 : 1 }}
      onWheel={onWheel}
    >
      {/* ── Toolbar ── */}
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[rgba(255,255,255,0.08)] px-2">
        {/* Play/Pause */}
        <button type="button" onClick={isPlaying ? onPause : onPlay}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0 ${isPlaying ? "border-amber-500/30 bg-amber-500/15 text-amber-200" : "border-emerald-500/30 bg-emerald-500/12 text-emerald-200"}`}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onStop}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0`}>Stop</button>

        <div className="mx-1 h-3 w-px bg-[rgba(255,255,255,0.08)]" />

        {/* Event timeline switcher — inline */}
        <button type="button" onClick={() => onSetActiveEventTimeline?.(null)}
          className={`h-6 rounded border px-1.5 text-[10px] leading-none font-semibold flex-shrink-0 transition-colors ${!activeEventTimeline ? "border-slate-400/40 bg-slate-500/15 text-slate-200" : "border-[rgba(255,255,255,0.08)] bg-[#161618] text-slate-500 hover:text-slate-300"}`}
        >Base</button>
        {EVENT_TIMELINE_NAMES.map(name => {
          const color = EVENT_COLORS[name];
          const isActive = activeEventTimeline === name;
          const hasData = !!(eventTimelines?.[name]?.tracks?.length);
          return (
            <button key={name} type="button"
              onClick={() => onSetActiveEventTimeline?.(isActive ? null : name)}
              className="h-6 rounded border px-1.5 text-[10px] leading-none font-semibold flex-shrink-0 transition-colors capitalize"
              style={{
                borderColor: isActive ? color : hasData ? `${color}40` : 'rgba(255,255,255,0.08)',
                background: isActive ? `${color}20` : hasData ? `${color}0d` : '#161618',
                color: isActive ? color : hasData ? `${color}bb` : 'rgba(100,116,139,0.5)',
              }}
            >{name}</button>
          );
        })}

        <div className="mx-1 h-3 w-px bg-[rgba(255,255,255,0.08)]" />

        <span className="font-mono text-[11px] text-slate-300 flex-shrink-0">{formatMs(playheadMs)}</span>
        <span className="text-[10px] text-slate-600 flex-shrink-0">/</span>
        <input type="number" min={100} step={100} value={timeline.durationMs}
          onChange={e => onSetDuration(Number(e.target.value) || 100)}
          className="h-6 w-20 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none text-slate-200 transition-colors focus:border-indigo-500/70 focus:outline-none flex-shrink-0" />
        <span className="text-[10px] text-slate-500 flex-shrink-0">ms</span>

        <div className="mx-1 h-3 w-px bg-[rgba(255,255,255,0.08)]" />

        <button type="button" onClick={() => onSetPlayback({ loop: !(timeline.playback?.loop ?? false) })}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0 ${timeline.playback?.loop ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-200" : ""}`}>
          Loop
        </button>
        <button type="button" onClick={() => onSetPlayback({ reverse: !(timeline.playback?.reverse ?? false) })}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0 ${timeline.playback?.reverse ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-200" : ""}`}>
          Rev
        </button>

        <div className="mx-1 h-3 w-px bg-[rgba(255,255,255,0.08)]" />

        <select value={selectedKeyframeEasing} disabled={!selectedKeyframeId}
          onChange={e => onSetSelectedKeyframeEasing(e.target.value as OverlayTimelineEasing)}
          className="h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-1.5 text-[11px] leading-none text-slate-200 transition-colors focus:border-indigo-500/70 focus:outline-none appearance-none flex-shrink-0 disabled:opacity-40">
          {EASING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button type="button" disabled={!selectedKeyframeId}
          onClick={() => setShowBezier(v => !v)}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0 ${showBezier ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-200" : ""} disabled:opacity-40`}>
          Curve
        </button>

        <button type="button" onClick={onDeleteSelectedKeyframe} disabled={!selectedKeyframeId}
          className="h-6 flex-shrink-0 rounded border border-red-500/25 bg-red-500/10 px-2 text-[11px] leading-none font-medium text-red-300 disabled:opacity-40 transition-colors hover:bg-red-500/15">
          Del KF
        </button>

        <div className="mx-1 h-3 w-px bg-[rgba(255,255,255,0.08)]" />

        <button onClick={() => setPxPerSec(p => Math.min(2000, p * 1.5))}
          className="h-6 w-6 flex-shrink-0 rounded border border-[rgba(255,255,255,0.06)] bg-transparent text-[13px] leading-none text-slate-400 transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-slate-100"
          title="Zoom in (Ctrl+scroll)">+</button>
        <span className="text-[10px] text-slate-500 flex-shrink-0">{Math.round(pxPerSec)}px/s</span>
        <button onClick={() => setPxPerSec(p => Math.max(MIN_PX_PER_SEC, p / 1.5))}
          className="h-6 w-6 flex-shrink-0 rounded border border-[rgba(255,255,255,0.06)] bg-transparent text-[13px] leading-none text-slate-400 transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-slate-100"
          title="Zoom out">−</button>
        <button onClick={() => setPxPerSec(DEFAULT_PX_PER_SEC)}
          className={`h-6 rounded border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-none font-medium text-slate-200 transition-colors hover:bg-[#1d1d20] flex-shrink-0`}>Fit</button>

        <div className={`ml-auto text-[10px] flex-shrink-0 ${isPlaying ? "text-emerald-400" : "text-slate-600"}`}>
          {isPlaying ? "▶ Playing" : "■ Stopped"}
        </div>
      </div>

      {/* ── Bezier editor (collapsible) ── */}
      {showBezier && selectedTrackId && selectedKeyframeId && (
        <div className="flex-none border-b border-[rgba(255,255,255,0.08)] bg-[#0d0d0f] p-3">
          <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Easing Curve</div>
          <BezierEditor
            value={bezierValue}
            onChange={v => {
              if (onSetKeyframeBezier && selectedTrackId && selectedKeyframeId) {
                onSetKeyframeBezier(selectedTrackId, selectedKeyframeId, v);
              }
            }}
          />
        </div>
      )}

      {/* ── Scrollable track area ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Ruler row */}
        <div className="flex flex-none border-b border-[rgba(255,255,255,0.08)]" style={{ height: RULER_HEIGHT }}>
          <div className="flex-none bg-[#0d0d0f]" style={{ width: HEADER_WIDTH }} />
          <div className="flex-1 overflow-hidden">
            <TimelineRuler
              durationMs={timeline.durationMs}
              pxPerSec={pxPerSec}
              scrollLeft={scrollLeft}
              playheadMs={playheadMs}
              onScrub={onSetPlayhead}
            />
          </div>
        </div>

        {/* Tracks */}
        <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={syncScroll}>
          {/* Marquee drag-select overlay */}
          {marquee && (() => {
            const x = Math.min(marquee.startX, marquee.endX) - (scrollRef.current?.scrollLeft ?? 0);
            const y = Math.min(marquee.startY, marquee.endY) - (scrollRef.current?.scrollTop ?? 0);
            const w = Math.abs(marquee.endX - marquee.startX);
            const h = Math.abs(marquee.endY - marquee.startY);
            return (
              <div style={{
                position: 'absolute', left: x, top: y, width: w, height: h,
                border: '1px solid rgba(99,102,241,0.7)',
                background: 'rgba(99,102,241,0.08)',
                pointerEvents: 'none', zIndex: 50,
              }} />
            );
          })()}
          <div ref={trackAreaRef} style={{ position: 'relative', minHeight: '100%' }} onMouseDown={onTrackAreaMouseDown}>
          {visibleElements.length === 0 && (
            <div className="px-4 py-5 text-[12px] text-slate-500">
              Select an element or add a keyframed property to start.
            </div>
          )}

          {visibleElements.map(element => {
            const tracks = tracksByElement.get(element.id) || [];
            const existing = new Set(tracks.map(t => t.property));
            const isCollapsed = collapsedElements.has(element.id);

            return (
              <div key={element.id} className="border-b border-[rgba(255,255,255,0.06)]">
                {/* Element header */}
                <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] px-2 py-1.5 sticky left-0">
                  <button
                    type="button"
                    onClick={() => setCollapsedElements(prev => {
                      const next = new Set(prev);
                      if (next.has(element.id)) next.delete(element.id);
                      else next.add(element.id);
                      return next;
                    })}
                    className="flex-none text-[10px] text-slate-500 hover:text-slate-300 w-4"
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                  <span className="flex-none truncate text-[12px] font-semibold text-slate-200" style={{ width: HEADER_WIDTH - 24 }}>
                    {element.name || element.type}
                  </span>
                  {!isCollapsed && (
                    <div className="flex flex-wrap gap-1 pl-1">
                      {TIMELINE_PROPERTIES.map(prop => (
                        <button key={prop} type="button"
                          onClick={() => onAddTrack(element.id, prop)}
                          disabled={existing.has(prop)}
                          className="h-5 rounded border border-[rgba(255,255,255,0.07)] bg-[#161618] px-1.5 text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-30">
                          +{prop}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Track rows */}
                {!isCollapsed && tracks.map(track => (
                  <TimelineTrackRow
                    key={track.id}
                    durationMs={timeline.durationMs}
                    pxPerSec={pxPerSec}
                    track={track}
                    allTracks={timeline.tracks}
                    selectedKeyframeIds={selectedKfIds}
                    playheadMs={playheadMs}
                    onSelectKeyframe={handleSelectKeyframe}
                    onMoveKeyframe={onMoveKeyframe}
                    onMoveSelectedKeyframes={handleMoveSelectedKeyframes}
                    onDuplicateKeyframe={onDuplicateKeyframe}
                    onAddKeyframeAtTime={onAddKeyframeAtTime}
                    onCopyKeyframes={copySelected}
                  />
                ))}
              </div>
            );
          })}
          {/* Spacer so last track isn't flush against bottom */}
          <div style={{ height: 32 }} />
          </div>{/* end trackAreaRef */}
        </div>
      </div>
    </div>
  );
}
