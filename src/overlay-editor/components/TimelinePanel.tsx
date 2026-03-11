import React, { useMemo, useRef, useState } from "react";
import {
  OverlayElement,
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
      <div className="flex-none px-3 text-[11px] leading-[1.4] text-slate-300 uppercase tracking-[0.08em]" style={{ width: HEADER_WIDTH }}>
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
                ? "bg-indigo-400 border-white"
                : draggingId === keyframe.id
                  ? "bg-amber-400 border-white"
                  : "bg-slate-300 border-[#0f1012]"
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
  onDuplicateKeyframe: (trackId: string, keyframeId: string, nextTimeMs: number) => string | null;
  onAddKeyframeAtTime: (trackId: string, timeMs: number) => void;
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
    <div className="h-64 border-t border-[rgba(255,255,255,0.08)] bg-[#111113] flex flex-col">
      <div className="h-8 border-b border-[rgba(255,255,255,0.08)] flex items-center gap-2 px-3">
        <button type="button" onClick={onPlay} className="h-7 rounded-md border border-emerald-800 bg-emerald-900/30 px-3 text-[12px] leading-[1.4] font-medium text-emerald-100 transition-colors hover:bg-emerald-800/40">
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
          className="h-7 rounded-md border border-red-900 bg-red-900/25 px-3 text-[12px] leading-[1.4] font-medium text-red-100 transition-colors hover:bg-red-900/35 disabled:opacity-40"
        >
          Delete Keyframe
        </button>
        <div className="ml-2 text-[12px] leading-[1.4] text-slate-300 font-mono">
          {formatMs(playheadMs)}
        </div>
        <div className="text-[11px] leading-[1.4] text-slate-600">/</div>
        <div className="text-[12px] leading-[1.4] text-slate-300 font-mono flex items-center gap-2">
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
        <div className={`ml-auto text-[12px] leading-[1.4] ${isPlaying ? "text-emerald-400" : "text-slate-500"}`}>
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
                  <div className="absolute top-1 left-2 text-[12px] leading-[1.4] text-slate-500">
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
          <div className="px-4 py-5 text-[13px] leading-[1.4] text-slate-500">
            Select an element or add a keyframed property to start building the timeline.
          </div>
        )}

        {visibleElements.map((element) => {
          const tracks = tracksByElement.get(element.id) || [];
          const existing = new Set(tracks.map((track) => track.property));

          return (
            <div key={element.id} className="border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-3 px-3 py-2 bg-[rgba(255,255,255,0.03)]">
                <div className="flex-none text-[13px] leading-[1.4] font-semibold text-slate-200" style={{ width: HEADER_WIDTH }}>
                  {element.name || element.type}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] leading-[1.4]">
                  {TIMELINE_PROPERTIES.map((property) => (
                    <button
                      key={property}
                      type="button"
                      onClick={() => onAddTrack(element.id, property)}
                      disabled={existing.has(property)}
                      className="h-6 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#161618] px-2 text-[11px] leading-[1.4] text-slate-300 transition-colors hover:bg-[#1d1d20] disabled:opacity-40"
                    >
                      + {property}
                    </button>
                  ))}
                </div>
              </div>

              {tracks.length === 0 && (
                <div className="px-3 py-3 text-[12px] leading-[1.4] text-slate-500">
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
