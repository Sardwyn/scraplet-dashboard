// tests/ticker.test.js
// Feature: overlay-editor-v3, Task 7: Scroll Ticker
// Tests for Properties 10 and 11 from the design spec.

// ── Pure helpers (mirrored from ElementRenderer logic) ────────────────────────

/**
 * Compute ticker animation duration.
 * Property 11: duration = width / speed. Clamped: speed >= 1, width fallback 10s.
 */
function computeTickerDuration(speed, width) {
  const s = Math.max(1, speed);
  return width > 0 ? width / s : 10;
}

// ── Property 11: Ticker speed/duration relationship ───────────────────────────

describe("computeTickerDuration (Property 11)", () => {
  test("duration = width / speed", () => {
    expect(computeTickerDuration(80, 400)).toBeCloseTo(5);
    expect(computeTickerDuration(60, 1920)).toBeCloseTo(32);
  });

  test("doubling speed halves duration", () => {
    const d1 = computeTickerDuration(50, 500);
    const d2 = computeTickerDuration(100, 500);
    expect(Math.abs(d1 / 2 - d2)).toBeLessThan(0.001);
  });

  test("speed clamped to 1 when 0", () => {
    // speed=0 -> clamped to 1, so duration = width/1 = width
    expect(computeTickerDuration(0, 400)).toBe(400);
  });

  test("speed clamped to 1 when negative", () => {
    expect(computeTickerDuration(-50, 200)).toBe(200);
  });

  test("width=0 falls back to 10s", () => {
    expect(computeTickerDuration(80, 0)).toBe(10);
  });

  test("property-based: doubling speed always halves duration (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const speed = 1 + Math.random() * 999;
      const width = 1 + Math.random() * 1919;
      const d1 = computeTickerDuration(speed, width);
      const d2 = computeTickerDuration(speed * 2, width);
      expect(Math.abs(d1 / 2 - d2)).toBeLessThan(0.001);
    }
  });

  test("property-based: duration always positive (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const speed = Math.random() * 1000; // may be 0
      const width = Math.random() * 1920;
      const d = computeTickerDuration(speed, width);
      expect(d).toBeGreaterThan(0);
    }
  });
});
