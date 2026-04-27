// tests/countdownElement.test.ts
// Feature: overlay-editor-v3 — Countdown Timer element tests
// P1: formatCountdown(ms) never returns a negative time display for any ms >= 0
// P2: When endBehaviour=loop and countdown reaches 0, it resets to exactly durationMs

// ── Inline implementation (mirrors src/shared/overlayRenderer/ElementRenderer.tsx) ──

function formatCountdownMs(ms: number, format: string): string {
  const totalMs = Math.max(0, ms);
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const msRem = Math.floor(totalMs % 1000);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  if (format === "HH:MM:SS") return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (format === "MM:SS") return `${pad2(m + h * 60)}:${pad2(s)}`;
  if (format === "SS") return String(totalSec);

  return format
    .replace(/\{h\}/g, String(h))
    .replace(/\{m\}/g, String(m))
    .replace(/\{s\}/g, String(s))
    .replace(/\{ms\}/g, String(msRem));
}

// Simulates the tick loop's remaining-time computation for loop behaviour
function computeRemainingMs(
  durationMs: number,
  elapsedMs: number,
  endBehaviour: "hold" | "hide" | "loop"
): number {
  let remaining = durationMs - elapsedMs;
  if (remaining <= 0) {
    if (endBehaviour === "loop") {
      // Reset: remaining = durationMs (as if start time was just reset)
      return durationMs;
    }
    return 0; // hold or hide clamp to 0
  }
  return remaining;
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("formatCountdownMs", () => {
  test("HH:MM:SS format for 1h 23m 45s", () => {
    const ms = (1 * 3600 + 23 * 60 + 45) * 1000;
    expect(formatCountdownMs(ms, "HH:MM:SS")).toBe("01:23:45");
  });

  test("MM:SS format for 5 minutes", () => {
    expect(formatCountdownMs(300000, "MM:SS")).toBe("05:00");
  });

  test("SS format returns total seconds as string", () => {
    expect(formatCountdownMs(90000, "SS")).toBe("90");
  });

  test("custom token format {m}m {s}s", () => {
    const ms = (2 * 60 + 30) * 1000;
    expect(formatCountdownMs(ms, "{m}m {s}s")).toBe("2m 30s");
  });

  test("zero ms returns zero display", () => {
    expect(formatCountdownMs(0, "MM:SS")).toBe("00:00");
    expect(formatCountdownMs(0, "HH:MM:SS")).toBe("00:00:00");
    expect(formatCountdownMs(0, "SS")).toBe("0");
  });

  test("negative ms is clamped to 0", () => {
    expect(formatCountdownMs(-5000, "MM:SS")).toBe("00:00");
  });
});

describe("endBehaviour=loop resets to durationMs", () => {
  test("when elapsed >= durationMs, loop returns exactly durationMs", () => {
    const durationMs = 300000;
    const result = computeRemainingMs(durationMs, durationMs, "loop");
    expect(result).toBe(durationMs);
  });

  test("when elapsed > durationMs, loop still returns durationMs", () => {
    const durationMs = 60000;
    const result = computeRemainingMs(durationMs, durationMs + 5000, "loop");
    expect(result).toBe(durationMs);
  });

  test("hold clamps to 0 at expiry", () => {
    expect(computeRemainingMs(60000, 60000, "hold")).toBe(0);
    expect(computeRemainingMs(60000, 70000, "hold")).toBe(0);
  });

  test("hide clamps to 0 at expiry", () => {
    expect(computeRemainingMs(60000, 60000, "hide")).toBe(0);
  });
});

// ── Property-based tests (manual random sampling — no fast-check dependency) ──

describe("P1: formatCountdownMs never returns negative time for any ms >= 0", () => {
  test("100 random non-negative ms values produce non-negative display", () => {
    const formats = ["HH:MM:SS", "MM:SS", "SS", "{h}h {m}m {s}s"];
    const rng = (max: number) => Math.floor(Math.random() * max);

    for (let i = 0; i < 100; i++) {
      const ms = rng(86400000); // 0..24h
      const format = formats[rng(formats.length)];
      const result = formatCountdownMs(ms, format);

      // Result must be a non-empty string
      expect(result.length).toBeGreaterThan(0);

      // For structured formats, no segment should be negative
      if (format === "HH:MM:SS" || format === "MM:SS") {
        const parts = result.split(":").map(Number);
        parts.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
      }
      if (format === "SS") {
        expect(Number(result)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("P2: loop endBehaviour always resets to exactly durationMs", () => {
  test("100 random (durationMs, elapsedMs) pairs where elapsed >= duration", () => {
    const rng = (max: number) => Math.floor(Math.random() * max);

    for (let i = 0; i < 100; i++) {
      const durationMs = rng(3600000) + 1000; // 1s..1h
      const elapsedMs = durationMs + rng(60000); // elapsed >= duration
      const result = computeRemainingMs(durationMs, elapsedMs, "loop");
      expect(result).toBe(durationMs);
    }
  });
});
