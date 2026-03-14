import {
  OverlayTimeline,
  OverlayTimelineEasing,
  OverlayTimelineProperty,
} from "../overlayTypes";

export type OverlayTimelineResolvedValues = Record<
  string,
  Partial<Record<OverlayTimelineProperty, number>>
>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyEasing(progress: number, easing: OverlayTimelineEasing) {
  const t = clamp(progress, 0, 1);

  switch (easing) {
    case "hold":
      return 0;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
    default:
      return t;
  }
}

function interpolateValue(
  fromValue: number,
  toValue: number,
  progress: number,
  easing: OverlayTimelineEasing
) {
  if (easing === "hold") {
    return progress >= 1 ? toValue : fromValue;
  }
  const eased = applyEasing(progress, easing);
  return fromValue + (toValue - fromValue) * eased;
}

export function evaluateTimeline(
  timeline: OverlayTimeline | undefined,
  currentTimeMs: number
): OverlayTimelineResolvedValues {
  if (!timeline || !Array.isArray(timeline.tracks) || timeline.tracks.length === 0) {
    return {};
  }

  const resolved: OverlayTimelineResolvedValues = {};

  for (const track of timeline.tracks) {
    if (!track || !track.elementId || !track.property) continue;

    const keyframes = [...(track.keyframes || [])].sort((a, b) => a.t - b.t);
    if (keyframes.length === 0) continue;

    let value = keyframes[0].value;

    if (keyframes.length === 1 || currentTimeMs <= keyframes[0].t) {
      value = keyframes[0].value;
    } else if (currentTimeMs >= keyframes[keyframes.length - 1].t) {
      value = keyframes[keyframes.length - 1].value;
    } else {
      for (let i = 0; i < keyframes.length - 1; i += 1) {
        const from = keyframes[i];
        const to = keyframes[i + 1];

        if (currentTimeMs < from.t || currentTimeMs > to.t) continue;

        const span = Math.max(1, to.t - from.t);
        const progress = (currentTimeMs - from.t) / span;
        value = interpolateValue(
          from.value,
          to.value,
          progress,
          to.easing ?? "linear"
        );
        break;
      }
    }

    if (!resolved[track.elementId]) {
      resolved[track.elementId] = {};
    }
    resolved[track.elementId][track.property] = value;
  }

  return resolved;
}
