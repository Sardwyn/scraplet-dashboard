// tests/audioVisualiser.test.js
// Feature: overlay-editor-v3, Task 9: Audio Visualiser
// Tests for Property 13: bar count correctness.

// Mirror of computeVisualizerBars from ElementRenderer.tsx
function computeVisualizerBars(frequencyData, barCount) {
  const step = Math.floor(frequencyData.length / barCount);
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    bars.push(frequencyData[i * step] / 255);
  }
  return bars;
}

// ── Property 13: bar count ────────────────────────────────────────────────────

describe("computeVisualizerBars (Property 13)", () => {
  test("returns exactly barCount bars", () => {
    const data = new Array(256).fill(128);
    expect(computeVisualizerBars(data, 32)).toHaveLength(32);
    expect(computeVisualizerBars(data, 64)).toHaveLength(64);
    expect(computeVisualizerBars(data, 1)).toHaveLength(1);
  });

  test("normalises values to 0..1 range", () => {
    const data = new Array(256).fill(0).map((_, i) => i);
    const bars = computeVisualizerBars(data, 32);
    bars.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  test("full amplitude (255) maps to 1.0", () => {
    const data = new Array(256).fill(255);
    const bars = computeVisualizerBars(data, 32);
    bars.forEach(v => expect(v).toBeCloseTo(1.0));
  });

  test("silence (0) maps to 0.0", () => {
    const data = new Array(256).fill(0);
    const bars = computeVisualizerBars(data, 32);
    bars.forEach(v => expect(v).toBe(0));
  });

  // Property 13: always returns exactly barCount bars for any valid input
  test("property-based: always returns exactly barCount bars (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const barCount = 1 + Math.floor(Math.random() * 255);
      const data = new Array(256).fill(0).map(() => Math.floor(Math.random() * 256));
      const bars = computeVisualizerBars(data, barCount);
      expect(bars).toHaveLength(barCount);
    }
  });

  test("property-based: all bar values in [0,1] (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const barCount = 1 + Math.floor(Math.random() * 64);
      const data = new Array(256).fill(0).map(() => Math.floor(Math.random() * 256));
      const bars = computeVisualizerBars(data, barCount);
      bars.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    }
  });
});
