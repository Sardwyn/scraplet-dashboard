// evaluateTimeline.test.ts
// Property-based tests for P1: Timeline Evaluation Monotonicity
// Correctness property: for any valid timeline, evaluateTimeline(t) must
// return a value within [min(keyframeValues), max(keyframeValues)] for all t.

import { evaluateTimeline } from "./evaluateTimeline";
import type { OverlayTimeline, OverlayTimelineKeyframe } from "../overlayTypes";

function makeTimeline(keyframeValues: number[], durationMs = 1000): OverlayTimeline {
  const keyframes: OverlayTimelineKeyframe[] = keyframeValues.map((value, i) => ({
    id: `kf-${i}`,
    t: (i / Math.max(1, keyframeValues.length - 1)) * durationMs,
    value,
    easing: "linear" as const,
  }));
  return {
    durationMs,
    tracks: [{
      id: "track-0",
      elementId: "el-0",
      property: "opacity",
      keyframes,
    }],
  };
}

describe("evaluateTimeline — P1 monotonicity / range invariant", () => {
  test("single keyframe: always returns that value", () => {
    const timeline = makeTimeline([0.5]);
    for (let t = 0; t <= 1000; t += 50) {
      const result = evaluateTimeline(timeline, t);
      expect(result["el-0"]?.opacity).toBe(0.5);
    }
  });

  test("two keyframes: interpolated value stays in range", () => {
    const timeline = makeTimeline([0, 1]);
    for (let t = 0; t <= 1000; t += 10) {
      const result = evaluateTimeline(timeline, t);
      const v = result["el-0"]?.opacity ?? 0;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("multiple keyframes: value always within [min, max] of keyframe values", () => {
    const values = [0.2, 0.8, 0.1, 0.9, 0.5];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const timeline = makeTimeline(values);
    for (let t = 0; t <= 1000; t += 7) {
      const result = evaluateTimeline(timeline, t);
      const v = result["el-0"]?.opacity ?? 0;
      expect(v).toBeGreaterThanOrEqual(min - 0.0001);
      expect(v).toBeLessThanOrEqual(max + 0.0001);
    }
  });

  test("t before first keyframe: returns first keyframe value", () => {
    const timeline = makeTimeline([0.3, 0.7]);
    const result = evaluateTimeline(timeline, -100);
    expect(result["el-0"]?.opacity).toBe(0.3);
  });

  test("t after last keyframe: returns last keyframe value", () => {
    const timeline = makeTimeline([0.3, 0.7]);
    const result = evaluateTimeline(timeline, 9999);
    expect(result["el-0"]?.opacity).toBe(0.7);
  });

  test("hold easing: value jumps only at keyframe boundary", () => {
    const timeline: OverlayTimeline = {
      durationMs: 1000,
      tracks: [{
        id: "track-0",
        elementId: "el-0",
        property: "opacity",
        keyframes: [
          { id: "kf-0", t: 0, value: 0, easing: "hold" },
          { id: "kf-1", t: 500, value: 1, easing: "hold" },
          { id: "kf-2", t: 1000, value: 0.5, easing: "linear" },
        ],
      }],
    };
    // Before t=500, value should be 0 (hold)
    expect(evaluateTimeline(timeline, 499)["el-0"]?.opacity).toBe(0);
    // At t=500, value should be 1
    expect(evaluateTimeline(timeline, 500)["el-0"]?.opacity).toBe(1);
  });

  test("empty timeline: returns empty object", () => {
    const result = evaluateTimeline(undefined, 500);
    expect(result).toEqual({});
  });

  test("property-based: random keyframe sets always stay in range", () => {
    // Simulate fast-check style with manual random sampling
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    for (let trial = 0; trial < 100; trial++) {
      const n = Math.floor(rand(2, 8));
      const values = Array.from({ length: n }, () => rand(-1000, 1000));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const durationMs = rand(100, 5000);
      const timeline = makeTimeline(values, durationMs);
      // Sample 20 time points
      for (let s = 0; s <= 20; s++) {
        const t = (s / 20) * durationMs;
        const result = evaluateTimeline(timeline, t);
        const v = result["el-0"]?.opacity ?? 0;
        expect(v).toBeGreaterThanOrEqual(min - 0.001);
        expect(v).toBeLessThanOrEqual(max + 0.001);
      }
    }
  });
});
