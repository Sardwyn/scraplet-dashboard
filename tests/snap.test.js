// tests/snap.test.js
// Feature: overlay-editor-v3, Task 8: Grid/Snap
// Tests for Property 12: snap rounds to grid multiple.

// Mirror of roundToGrid from OverlayEditorApp.tsx
function roundToGrid(n, grid) {
  if (!grid || grid <= 1) return Math.round(n);
  return Math.round(n / grid) * grid;
}

// snapPosition wraps roundToGrid for both axes
function snapPosition(x, y, gridSize) {
  return [roundToGrid(x, gridSize), roundToGrid(y, gridSize)];
}

// ── Property 12: snap always returns a grid multiple ─────────────────────────

describe("snapPosition (Property 12)", () => {
  test("snaps to nearest 16px grid", () => {
    expect(snapPosition(10, 10, 16)).toEqual([16, 16]);
    expect(snapPosition(7, 7, 16)).toEqual([0, 0]);
    expect(snapPosition(17, 17, 16)).toEqual([16, 16]);
  });

  test("snaps to nearest 32px grid", () => {
    expect(snapPosition(20, 20, 32)).toEqual([32, 32]);
    expect(snapPosition(15, 15, 32)).toEqual([0, 0]);
  });

  test("exact grid position unchanged", () => {
    expect(snapPosition(64, 128, 16)).toEqual([64, 128]);
  });

  test("gridSize=1 returns rounded integers", () => {
    const [sx, sy] = snapPosition(10.7, 20.3, 1);
    expect(sx).toBe(11);
    expect(sy).toBe(20);
  });

  test("gridSize=0 returns rounded integers", () => {
    const [sx, sy] = snapPosition(10.7, 20.3, 0);
    expect(sx).toBe(11);
    expect(sy).toBe(20);
  });

  // Property 12: result is always an exact multiple of gridSize
  test("property-based: result always multiple of gridSize (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 1920;
      const y = Math.random() * 1080;
      const gridSize = [8, 16, 32][Math.floor(Math.random() * 3)];
      const [sx, sy] = snapPosition(x, y, gridSize);
      expect(sx % gridSize).toBe(0);
      expect(sy % gridSize).toBe(0);
    }
  });

  test("property-based: snapped value within half a grid cell of original (100 trials)", () => {
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 1920;
      const y = Math.random() * 1080;
      const gridSize = 16;
      const [sx, sy] = snapPosition(x, y, gridSize);
      expect(Math.abs(sx - x)).toBeLessThanOrEqual(gridSize / 2);
      expect(Math.abs(sy - y)).toBeLessThanOrEqual(gridSize / 2);
    }
  });
});
