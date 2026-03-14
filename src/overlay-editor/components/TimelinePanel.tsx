import React, { useMemo, useRef, useState } from "react";
import {
  OverlayElement,
  OverlayTimelineEasing,
  OverlayTimeline,
  OverlayTimelineKeyframe,
  OverlayTimelineProperty,
  OverlayTimelineTrack,
} from "../../shared/overlayTypes";
import { uiClasses, uiTokens } from "../uiTokens";

const TRACK_HEIGHT = parseInt(uiTokens.control.sm, 10);
const HEADER_WIDTH = 224;
const KEYFRAME_SIZE = 8;
const PLAYHEAD_WIDTH = 2;

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

const EASING_OPTIONS: Array<{ value: OverlayTimelineEasing; label: string }> = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease In Out" },
  { value: "hold", label: "Hold" },
];

function formatMs(value: number) {
  const totalMs = Math.max(0, Math.round(value));
  const seconds = Math.floor(totalMs / 1000);
  const millis = totalMs % 1000;
  return `${seconds}.${String(millis).padStart(3, "0")}s`;
}

function isTimelineEligible(element: OverlayElement) {
  return element.type !== "lower_third";
}

function sortTracks(tracks: OverlayTimelineTrack[]) {
  return [...tracks].sort((a, b) => {
    if (a.elementId !== b.elementId) return a.elementId.localeCompare(b.elementId);
    return TIMELINE_PROPERTIES.indexOf(a.property) - TIMELINE_PROPERTIES.indexOf(b.property);
  });
}

type TrackRowProps = {
  durationMs: number;
  track: OverlayTimelineTrack;
  selectedKeyframeId: string | null;
  playheadMs: number;
  onSelectKeyframe: (trackId: string, keyframeId: string) => void;
  onMoveKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => void;
  onDuplicateKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => string | null;
  onAddKeyframeAtTime: (trackId: string, timeMs: number) => void;
};

function TimelineTrackRow({
  durationMs,
  track,
  selectedKeyframeId,
  playheadMs,
  onSelectKeyframe,
  onMoveKeyframe,
  onDuplicateKeyframe,
  onAddKeyframeAtTime,
}: TrackRowProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const commitDrag = (keyframeId: string, clientX: number) => {
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onMoveKeyframe(track.id, keyframeId, ratio * durationMs);
  };

  const onMouseDown = (keyframeId: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectKeyframe(track.id, keyframeId);
    setDraggingId(keyframeId);
    const duplicateMode = event.altKey;
    let activeKeyframeId = keyframeId;
    if (duplicateMode) {
      const rect = laneRef.current?.getBoundingClientRect();
      const ratio = rect ? Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) : 0;
      const nextTimeMs = ratio * durationMs;
      activeKeyframeId = onDuplicateKeyframe(track.id, keyframeId, nextTimeMs) ?? keyframeId;
    }

    const onMove = (moveEvent: MouseEvent) => {
      commitDrag(activeKeyframeId, moveEvent.clientX);
    };

    const onUp = (upEvent: MouseEvent) => {
      commitDrag(activeKeyframeId, upEvent.clientX);
      setDraggingId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex items-center border-b border-[rgba(255,255,255,0.06)]" style={{ height: TRACK_HEIGHT }}>
      <div className="flex-none px-3 text-[11px] leading-[1.4] text-slate-300 uppercase tracking-[0.06em]" style={{ width: HEADER_WIDTH }}>
        {track.property}
      </div>
      <div
        ref={laneRef}
        className={`relative flex-1 h-full ${uiClasses.timelineLane}`}
        onDoubleClick={(event) => {
          const rect = laneRef.current?.getBoundingClientRect();
          if (!rect) return;
          const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
          onAddKeyframeAtTime(track.id, ratio * durationMs);
        }}
      >
        <div
          className="absolute top-0 bottom-0 bg-amber-400/90"
          style={{ left: `${(playheadMs / Math.max(1, durationMs)) * 100}%`, width: PLAYHEAD_WIDTH, marginLeft: -(PLAYHEAD_WIDTH / 2) }}
        />
        {track.keyframes.map((keyframe) => (
          <button
            key={keyframe.id}
            type="button"
            onMouseDown={onMouseDown(keyframe.id)}
            onClick={() => onSelectKeyframe(track.id, keyframe.id)}
            className={`absolute top-1/2 -translate-y-1/2 rotate-45 border transition-colors ${
              selectedKeyframeId === keyframe.id
                ? "bg-indigo-300 border-white"
                : draggingId === keyframe.id
                  ? "bg-amber-400 border-white"
                  : "bg-slate-200 border-[#0f1012]"
            }`}
            style={{
              left: `${(keyframe.t / Math.max(1, durationMs)) * 100}%`,
              width: KEYFRAME_SIZE,
              height: KEYFRAME_SIZE,
              marginLeft: -(KEYFRAME_SIZE / 2),
            }}
            title={`${track.property} @ ${formatMs(keyframe.t)} = ${Math.round(keyframe.value * 1000) / 1000}`}
          />
        ))}
      </div>
    </div>
  );
}

type Props = {
  timeline: OverlayTimeline;
  elements: OverlayElement[];
  selectedIds: string[];
  playheadMs: number;
  isPlaying: boolean;
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  selectedKeyframeEasing: OverlayTimelineEasing;
  onSelectKeyframe: (trackId: string | null, keyframeId: string | null) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSetPlayhead: (timeMs: number) => void;
  onSetDuration: (durationMs: number) => void;
  onDeleteSelectedKeyframe: () => void;
  onSetPlayback: (patch: { loop?: boolean; reverse?: boolean }) => void;
  onSetSelectedKeyframeEasing: (easing: OverlayTimelineEasing) => void;
  onAddTrack: (elementId: string, property: OverlayTimelineProperty) => void;
  onMoveKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => void;
  onDuplicateKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => string | null;
  onAddKeyframeAtTime: (trackId: string, timeMs: number) => void;
};

export function TimelinePanel({
  timeline,
  elements,
  selectedIds,
  playheadMs,
  isPlaying,
  selectedTrackId,
  selectedKeyframeId,
  selectedKeyframeEasing,
  onSelectKeyframe,
  onPlay,
  onPause,
  onStop,
  onSetPlayhead,
  onSetDuration,
  onDeleteSelectedKeyframe,
  onSetPlayback,
  onSetSelectedKeyframeEasing,
  onAddTrack,
  onMoveKeyframe,
  onDuplicateKeyframe,
  onAddKeyframeAtTime,
}: Props) {
  const scrubberRef = useRef<HTMLDivElement>(null);

  const timelineElements = useMemo(
    () => elements.filter(isTimelineEligible),
    [elements]
  );

  const tracksByElement = useMemo(() => {
    const map = new Map<string, OverlayTimelineTrack[]>();
    for (const track of sortTracks(timeline.tracks || [])) {
      if (!map.has(track.elementId)) map.set(track.elementId, []);
      map.get(track.elementId)!.push(track);
    }
    return map;
  }, [timeline.tracks]);

  const visibleElements = useMemo(() => {
    const selected = new Set(selectedIds);
    return timelineElements.filter((element) => selected.has(element.id) || tracksByElement.has(element.id));
  }, [timelineElements, selectedIds, tracksByElement]);

  const scrubToClientX = (clientX: number) => {
    const node = scrubberRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onSetPlayhead(ratio * timeline.durationMs);
  };

  const beginScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    scrubToClientX(event.clientX);

    const onMove = (moveEvent: MouseEvent) => scrubToClientX(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex h-64 flex-col border-t border-[rgba(255,255,255,0.08)] bg-[#111113]">
      <div className="h-8 border-b border-[rgba(255,255,255,0.08)] flex items-center gap-2 px-3">
        <button type="button" onClick={onPlay} className="h-7 rounded-md border border-emerald-500/30 bg-emerald-500/12 px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/18">
          Play
        </button>
        <button type="button" onClick={onPause} className={uiClasses.button}>
          Pause
        </button>
        <button type="button" onClick={onStop} className={uiClasses.button}>
          Stop
        </button>
        <button
          type="button"
          onClick={onDeleteSelectedKeyframe}
          disabled={!selectedKeyframeId}
          className="h-7 rounded-md border border-red-500/30 bg-red-500/12 px-3 text-[12px] leading-[1.4] tracking-[-0.02em] font-medium text-red-100 transition-colors hover:bg-red-500/18 disabled:opacity-40"
        >
          Delete Keyframe
        </button>
        <div className="ml-2 font-mono text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-200">
          {formatMs(playheadMs)}
        </div>
        <div className="text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-600">/</div>
        <div className="flex items-center gap-2 font-mono text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-300">
          <span>Duration</span>
          <input
            type="number"
            min={100}
            step={100}
            value={timeline.durationMs}
            onChange={(event) => onSetDuration(Number(event.target.value) || 100)}
            className={`${uiClasses.field} w-24`}
          />
          <span>ms</span>
        </div>
        <button
          type="button"
          onClick={() => onSetPlayback({ loop: !(timeline.playback?.loop ?? false) })}
          className={`${uiClasses.button} ${(timeline.playback?.loop ?? false) ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-100" : ""}`}
        >
          Loop
        </button>
        <button
          type="button"
          onClick={() => onSetPlayback({ reverse: !(timeline.playback?.reverse ?? false) })}
          className={`${uiClasses.button} ${(timeline.playback?.reverse ?? false) ? "border-indigo-400/30 bg-indigo-500/12 text-indigo-100" : ""}`}
        >
          Reverse
        </button>
        <div className="flex items-center gap-2 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-300">
          <span>Easing</span>
          <select
            value={selectedKeyframeEasing}
            disabled={!selectedKeyframeId || !selectedTrackId}
            onChange={(event) => onSetSelectedKeyframeEasing(event.target.value as OverlayTimelineEasing)}
            className={`${uiClasses.field} w-32 disabled:opacity-40`}
          >
            {EASING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={`ml-auto text-[12px] leading-[1.4] tracking-[-0.02em] ${isPlaying ? "text-emerald-300" : "text-slate-500"}`}>
          {isPlaying ? "Playing" : "Paused"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="sticky top-0 z-10 flex h-8 border-b border-[rgba(255,255,255,0.08)] bg-[#111113]">
          <div className={`${uiClasses.sectionHeader} flex-none flex items-center`} style={{ width: HEADER_WIDTH }}>
            Tracks
          </div>
          <div
            ref={scrubberRef}
            className={`relative flex-1 cursor-col-resize ${uiClasses.timelineLane}`}
            onMouseDown={beginScrub}
          >
            {Array.from({ length: 11 }).map((_, index) => {
              const ratio = index / 10;
              return (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 border-l border-[rgba(255,255,255,0.06)]"
                  style={{ left: `${ratio * 100}%` }}
                >
                  <div className="absolute top-1 left-2 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-400">
                    {formatMs(ratio * timeline.durationMs)}
                  </div>
                </div>
              );
            })}
            <div
              className="absolute top-0 bottom-0 bg-amber-400"
              style={{ left: `${(playheadMs / Math.max(1, timeline.durationMs)) * 100}%`, width: PLAYHEAD_WIDTH, marginLeft: -(PLAYHEAD_WIDTH / 2) }}
            />
          </div>
        </div>

        {visibleElements.length === 0 && (
          <div className="px-4 py-5 text-[13px] leading-[1.4] tracking-[-0.01em] text-slate-500">
            Select an element or add a keyframed property to start building the timeline.
          </div>
        )}

        {visibleElements.map((element) => {
          const tracks = tracksByElement.get(element.id) || [];
          const existing = new Set(tracks.map((track) => track.property));

          return (
            <div key={element.id} className="border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-3 bg-[rgba(255,255,255,0.03)] px-3 py-2">
                <div className="flex-none text-[13px] leading-[1.4] tracking-[-0.01em] font-semibold text-slate-200" style={{ width: HEADER_WIDTH }}>
                  {element.name || element.type}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] leading-[1.4] tracking-[-0.02em]">
                  {TIMELINE_PROPERTIES.map((property) => (
                    <button
                      key={property}
                      type="button"
                      onClick={() => onAddTrack(element.id, property)}
                      disabled={existing.has(property)}
                      className="h-6 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-[1.4] tracking-[-0.02em] text-slate-300 transition-colors hover:bg-[#1d1d20] disabled:opacity-40"
                    >
                      + {property}
                    </button>
                  ))}
                </div>
              </div>

              {tracks.length === 0 && (
                <div className="px-3 py-3 text-[12px] leading-[1.4] tracking-[-0.02em] text-slate-500">
                  No tracks yet for this element.
                </div>
              )}

              {tracks.map((track) => (
                <TimelineTrackRow
                  key={track.id}
                  durationMs={timeline.durationMs}
                  track={track}
                  selectedKeyframeId={selectedKeyframeId}
                  playheadMs={playheadMs}
                  onSelectKeyframe={(trackId, keyframeId) => onSelectKeyframe(trackId, keyframeId)}
                  onMoveKeyframe={onMoveKeyframe}
                  onDuplicateKeyframe={onDuplicateKeyframe}
                  onAddKeyframeAtTime={onAddKeyframeAtTime}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
