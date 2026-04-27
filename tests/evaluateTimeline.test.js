// tests/evaluateTimeline.test.js
// P1: Timeline Evaluation Monotonicity — value must stay within keyframe range

// Import the compiled JS. If not compiled, test the logic inline.
// We inline the logic here to avoid build dependency.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyEasing(progress, easing) {
  const t = clamp(progress, 0, 1);
  switch (easing) {
    case "hold": return 0;
    case "ease-in": return t * t;
    case "ease-out": return 1 - (1 - t) * (1 - t);
    case "ease-in-out": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: return t;
  }
}

function interpolateValue(fromValue, toValue, progress, easing) {
  if (easing === "hold") return progress >= 1 ? toValue : fromValue;
  return fromValue + (toValue - fromValue) * applyEasing(progress, easing);
}

function evaluateTimeline(timeline, currentTimeMs) {
  if (!timeline || !Array.isArray(timeline.tracks) || timeline.tracks.length === 0) return {};
  const resolved = {};
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
      for (let i = 0; i < keyframes.length - 1; i++) {
        const from = keyframes[i];
        const to = keyframes[i + 1];
        if (currentTimeMs < from.t || currentTimeMs > to.t) continue;
        const span = Math.max(1, to.t - from.t);
        const progress = (currentTimeMs - from.t) / span;
        value = interpolateValue(from.value, to.value, progress, to.easing ?? "linear");
        break;
      }
    }
    if (!resolved[track.elementId]) resolved[track.elementId] = {};
    resolved[track.elementId][track.property] = value;
  }
  return resolved;
}

function makeTimeline(values, durationMs = 1000) {
  return {
    durationMs,
    tracks: [{
      id: "track-0",
      elementId: "el-0",
      property: "opacity",
      keyframes: values.map((value, i) => ({
        id: `kf-${i}`,
        t: (i / Math.max(1, values.length - 1)) * durationMs,
        value,
        easing: "linear",
      })),
    }],
  };
}

describe("evaluateTimeline — P1 range invariant", () => {
  test("single keyframe always returns that value", () => {
    const timeline = makeTimeline([0.5]);
    for (let t = 0; t <= 1000; t += 50) {
      expect(evaluateTimeline(timeline, t)["el-0"]?.opacity).toBe(0.5);
    }
  });

  test("two keyframes: interpolated value stays in [0,1]", () => {
    const timeline = makeTimeline([0, 1]);
    for (let t = 0; t <= 1000; t += 10) {
      const v = evaluateTimeline(timeline, t)["el-0"]?.opacity ?? 0;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("multiple keyframes: value always within [min, max]", () => {
    const values = [0.2, 0.8, 0.1, 0.9, 0.5];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const timeline = makeTimeline(values);
    for (let t = 0; t <= 1000; t += 7) {
      const v = evaluateTimeline(timeline, t)["el-0"]?.opacity ?? 0;
      expect(v).toBeGreaterThanOrEqual(min - 0.0001);
      expect(v).toBeLessThanOrEqual(max + 0.0001);
    }
  });

  test("t before first keyframe returns first value", () => {
    const timeline = makeTimeline([0.3, 0.7]);
    expect(evaluateTimeline(timeline, -100)["el-0"]?.opacity).toBe(0.3);
  });

  test("t after last keyframe returns last value", () => {
    const timeline = makeTimeline([0.3, 0.7]);
    expect(evaluateTimeline(timeline, 9999)["el-0"]?.opacity).toBe(0.7);
  });

  test("hold easing: value jumps only at keyframe boundary", () => {
    const timeline = {
      durationMs: 1000,
      tracks: [{
        id: "t0", elementId: "el-0", property: "opacity",
        keyframes: [
          { id: "k0", t: 0, value: 0, easing: "hold" },
          { id: "k1", t: 500, value: 1, easing: "hold" },
          { id: "k2", t: 1000, value: 0.5, easing: "linear" },
        ],
      }],
    };
    expect(evaluateTimeline(timeline, 499)["el-0"]?.opacity).toBe(0);
    expect(evaluateTimeline(timeline, 500)["el-0"]?.opacity).toBe(1);
  });

  test("empty timeline returns empty object", () => {
    expect(evaluateTimeline(undefined, 500)).toEqual({});
  });

  test("property-based: 100 random keyframe sets always stay in range", () => {
    const rand = (min, max) => min + Math.random() * (max - min);
    for (let trial = 0; trial < 100; trial++) {
      const n = Math.floor(rand(2, 8));
      const values = Array.from({ length: n }, () => rand(-1000, 1000));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const durationMs = rand(100, 5000);
      const timeline = makeTimeline(values, durationMs);
      for (let s = 0; s <= 20; s++) {
        const t = (s / 20) * durationMs;
        const v = evaluateTimeline(timeline, t)["el-0"]?.opacity ?? 0;
        expect(v).toBeGreaterThanOrEqual(min - 0.001);
        expect(v).toBeLessThanOrEqual(max + 0.001);
      }
    }
  });
});
