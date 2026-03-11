import React, { useMemo, useRef, useState } from "react";
import {
  OverlayElement,
  OverlayTimeline,
  OverlayTimelineKeyframe,
  OverlayTimelineProperty,
  OverlayTimelineTrack,
} from "../../shared/overlayTypes";

const TRACK_HEIGHT = 28;
const HEADER_WIDTH = 220;
const KEYFRAME_SIZE = 10;

const TIMELINE_PROPERTIES: OverlayTimelineProperty[] = [
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "rotationDeg",
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
};

function TimelineTrackRow({
  durationMs,
  track,
  selectedKeyframeId,
  playheadMs,
  onSelectKeyframe,
  onMoveKeyframe,
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

    const onMove = (moveEvent: MouseEvent) => {
      commitDrag(keyframeId, moveEvent.clientX);
    };

    const onUp = (upEvent: MouseEvent) => {
      commitDrag(keyframeId, upEvent.clientX);
      setDraggingId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex items-center border-b border-slate-900/80" style={{ height: TRACK_HEIGHT }}>
      <div className="w-[220px] flex-none px-3 text-[11px] text-slate-400 uppercase tracking-wide">
        {track.property}
      </div>
      <div
        ref={laneRef}
        className="relative flex-1 h-full bg-slate-950/40"
      >
        <div
          className="absolute top-0 bottom-0 w-px bg-indigo-500/70"
          style={{ left: `${(playheadMs / Math.max(1, durationMs)) * 100}%` }}
        />
        {track.keyframes.map((keyframe) => (
          <button
            key={keyframe.id}
            type="button"
            onMouseDown={onMouseDown(keyframe.id)}
            onClick={() => onSelectKeyframe(track.id, keyframe.id)}
            className={`absolute top-1/2 -translate-y-1/2 rotate-45 border transition-colors ${
              selectedKeyframeId === keyframe.id
                ? "bg-indigo-400 border-white"
                : draggingId === keyframe.id
                  ? "bg-amber-400 border-white"
                  : "bg-slate-300 border-slate-950"
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
  selectedKeyframeId: string | null;
  onSelectKeyframe: (trackId: string | null, keyframeId: string | null) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSetPlayhead: (timeMs: number) => void;
  onSetDuration: (durationMs: number) => void;
  onDeleteSelectedKeyframe: () => void;
  onAddTrack: (elementId: string, property: OverlayTimelineProperty) => void;
  onMoveKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => void;
};

export function TimelinePanel({
  timeline,
  elements,
  selectedIds,
  playheadMs,
  isPlaying,
  selectedKeyframeId,
  onSelectKeyframe,
  onPlay,
  onPause,
  onStop,
  onSetPlayhead,
  onSetDuration,
  onDeleteSelectedKeyframe,
  onAddTrack,
  onMoveKeyframe,
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
    <div className="h-64 border-t border-slate-800 bg-slate-950/95 flex flex-col">
      <div className="h-11 border-b border-slate-800 flex items-center gap-2 px-3">
        <button type="button" onClick={onPlay} className="px-2 py-1 text-xs rounded bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-100 border border-emerald-700">
          Play
        </button>
        <button type="button" onClick={onPause} className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
          Pause
        </button>
        <button type="button" onClick={onStop} className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
          Stop
        </button>
        <button
          type="button"
          onClick={onDeleteSelectedKeyframe}
          disabled={!selectedKeyframeId}
          className="px-2 py-1 text-xs rounded bg-red-900/30 hover:bg-red-800/40 text-red-100 border border-red-900 disabled:opacity-40"
        >
          Delete Keyframe
        </button>
        <div className="ml-3 text-[11px] text-slate-400 font-mono">
          {formatMs(playheadMs)}
        </div>
        <div className="text-[11px] text-slate-600">/</div>
        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
          <span>Duration</span>
          <input
            type="number"
            min={100}
            step={100}
            value={timeline.durationMs}
            onChange={(event) => onSetDuration(Number(event.target.value) || 100)}
            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
          />
          <span>ms</span>
        </div>
        <div className={`ml-auto text-[11px] ${isPlaying ? "text-emerald-400" : "text-slate-500"}`}>
          {isPlaying ? "Playing" : "Paused"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="sticky top-0 z-10 flex h-8 border-b border-slate-800 bg-slate-950/95">
          <div className="w-[220px] flex-none px-3 flex items-center text-[10px] uppercase tracking-widest text-slate-500">
            Tracks
          </div>
          <div
            ref={scrubberRef}
            className="relative flex-1 cursor-col-resize bg-slate-950/30"
            onMouseDown={beginScrub}
          >
            {Array.from({ length: 11 }).map((_, index) => {
              const ratio = index / 10;
              return (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 border-l border-slate-800/80"
                  style={{ left: `${ratio * 100}%` }}
                >
                  <div className="absolute top-1 left-1 text-[10px] text-slate-600">
                    {formatMs(ratio * timeline.durationMs)}
                  </div>
                </div>
              );
            })}
            <div
              className="absolute top-0 bottom-0 w-px bg-amber-400"
              style={{ left: `${(playheadMs / Math.max(1, timeline.durationMs)) * 100}%` }}
            />
          </div>
        </div>

        {visibleElements.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            Select an element or add a keyframed property to start building the timeline.
          </div>
        )}

        {visibleElements.map((element) => {
          const tracks = tracksByElement.get(element.id) || [];
          const existing = new Set(tracks.map((track) => track.property));

          return (
            <div key={element.id} className="border-b border-slate-900/80">
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-900/40">
                <div className="w-[220px] flex-none text-xs font-semibold text-slate-200">
                  {element.name || element.type}
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  {TIMELINE_PROPERTIES.map((property) => (
                    <button
                      key={property}
                      type="button"
                      onClick={() => onAddTrack(element.id, property)}
                      disabled={existing.has(property)}
                      className="px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      + {property}
                    </button>
                  ))}
                </div>
              </div>

              {tracks.length === 0 && (
                <div className="px-3 py-3 text-[11px] text-slate-600">
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
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
