import {
  OverlayTimeline,
  OverlayTimelineEasing,
  OverlayTimelineProperty,
} from "../overlayTypes";

export type OverlayTimelineResolvedValues = Record<
  string,
  Partial<Record<OverlayTimelineProperty, number | string>>
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

function interpolateColor(fromColor: string, toColor: string, progress: number): string {
  const parseHex = (hex: string) => {
    let clean = hex.replace("#", "");
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  };

  try {
    const cA = parseHex(fromColor);
    const cB = parseHex(toColor);

    const r = Math.round(cA.r + (cB.r - cA.r) * progress);
    const g = Math.round(cA.g + (cB.g - cA.g) * progress);
    const b = Math.round(cA.b + (cB.b - cA.b) * progress);
    const a = cA.a + (cB.a - cA.a) * progress;

    const toHexPart = (v: number) => {
      const s = Math.max(0, Math.min(255, v)).toString(16);
      return s.length === 1 ? "0" + s : s;
    };

    if (cA.a === 1 && cB.a === 1) {
      return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`;
    } else {
      return `rgba(${r},${g},${b},${a.toFixed(2)})`;
    }
  } catch (e) {
    return progress >= 0.5 ? toColor : fromColor;
  }
}

function interpolateValue(
  fromValue: number | string,
  toValue: number | string,
  progress: number,
  easing: OverlayTimelineEasing
) {
  if (easing === "hold" || typeof fromValue === "string" || typeof toValue === "string") {
    const isColor = (val: any) => typeof val === "string" && (val.startsWith("#") || val.startsWith("rgb"));
    if (isColor(fromValue) && isColor(toValue) && easing !== "hold") {
      const eased = applyEasing(progress, easing);
      return interpolateColor(String(fromValue), String(toValue), eased);
    }
    return progress >= 0.5 ? toValue : fromValue;
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
