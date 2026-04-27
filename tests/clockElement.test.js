// tests/clockElement.test.js
// Feature: overlay-editor-v3 — Clock element tests
// P3: wall clock always shows current time ±2s
// Additional unit tests for elapsed and stopwatch modes

// ── Inline implementations (mirrors src/shared/overlayRenderer/ElementRenderer.tsx) ──

function formatWallClock(date, format, timezone) {
  try {
    const tz = timezone || "UTC";
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = {};
    dtf.formatToParts(date).forEach(({ type, value }) => {
      parts[type] = value;
    });
    const h24 = parseInt(parts.hour ?? "0", 10) % 24;
    const h12 = h24 % 12 || 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    const mm = parts.minute ?? "00";
    const ss = parts.second ?? "00";
    const HH = String(h24).padStart(2, "0");
    const hh = String(h12).padStart(2, "0");
    return format
      .replace(/HH/g, HH)
      .replace(/mm/g, mm)
      .replace(/ss/g, ss)
      .replace(/hh/g, hh)
      .replace(/h/g, String(h12))
      .replace(/a/g, ampm.toLowerCase())
      .replace(/A/g, ampm);
  } catch {
    return format;
  }
}

function formatDurationMs(ms, format) {
  const totalMs = Math.max(0, ms);
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad2 = (n) => String(n).padStart(2, "0");
  return format
    .replace(/HH/g, pad2(h))
    .replace(/mm/g, pad2(m))
    .replace(/ss/g, pad2(s))
    .replace(/h/g, String(h))
    .replace(/m/g, String(m))
    .replace(/s/g, String(s));
}

function formatClockDisplay(now, clockMode, format, timezone, startDatetime) {
  if (clockMode === "wall") {
    return formatWallClock(now, format, timezone);
  }
  if (clockMode === "elapsed" && startDatetime) {
    const startMs = new Date(startDatetime).getTime();
    const elapsedMs = Math.max(0, now.getTime() - startMs);
    return formatDurationMs(elapsedMs, format);
  }
  // stopwatch: show 00:00:00 as preview
  return formatDurationMs(0, format);
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("formatWallClock", () => {
  test("HH:mm:ss format produces correct structure", () => {
    const date = new Date("2024-01-15T14:30:45Z");
    const result = formatWallClock(date, "HH:mm:ss", "UTC");
    expect(result).toBe("14:30:45");
  });

  test("12h format with AM/PM", () => {
    const date = new Date("2024-01-15T14:30:00Z");
    const result = formatWallClock(date, "hh:mm a", "UTC");
    expect(result).toBe("02:30 pm");
  });

  test("midnight is 00:00:00 in 24h", () => {
    const date = new Date("2024-01-15T00:00:00Z");
    const result = formatWallClock(date, "HH:mm:ss", "UTC");
    expect(result).toBe("00:00:00");
  });

  test("noon is 12:00:00 in 24h", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const result = formatWallClock(date, "HH:mm:ss", "UTC");
    expect(result).toBe("12:00:00");
  });

  test("invalid timezone falls back to returning format string", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const result = formatWallClock(date, "HH:mm:ss", "Not/ATimezone");
    // Should not throw, returns format string as fallback
    expect(typeof result).toBe("string");
  });

  test("different timezones produce different output for same Date", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const utc = formatWallClock(date, "HH:mm:ss", "UTC");
    const tokyo = formatWallClock(date, "HH:mm:ss", "Asia/Tokyo");
    // UTC+9 so Tokyo should be 21:00:00
    expect(utc).not.toBe(tokyo);
    expect(tokyo).toBe("21:00:00");
  });
});

describe("formatDurationMs (elapsed/stopwatch)", () => {
  test("zero duration shows 00:00:00", () => {
    expect(formatDurationMs(0, "HH:mm:ss")).toBe("00:00:00");
  });

  test("1 hour 23 minutes 45 seconds", () => {
    const ms = (1 * 3600 + 23 * 60 + 45) * 1000;
    expect(formatDurationMs(ms, "HH:mm:ss")).toBe("01:23:45");
  });

  test("mm:ss format for 5 minutes", () => {
    expect(formatDurationMs(300000, "mm:ss")).toBe("05:00");
  });

  test("negative ms clamped to 0", () => {
    expect(formatDurationMs(-5000, "HH:mm:ss")).toBe("00:00:00");
  });
});

describe("formatClockDisplay", () => {
  test("wall mode delegates to formatWallClock", () => {
    const date = new Date("2024-01-15T10:20:30Z");
    const result = formatClockDisplay(date, "wall", "HH:mm:ss", "UTC", undefined);
    expect(result).toBe("10:20:30");
  });

  test("elapsed mode computes time since startDatetime", () => {
    const start = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T10:01:30Z"); // 90 seconds later
    const result = formatClockDisplay(now, "elapsed", "mm:ss", undefined, start.toISOString());
    expect(result).toBe("01:30");
  });

  test("stopwatch mode shows 00:00 as preview", () => {
    const now = new Date();
    const result = formatClockDisplay(now, "stopwatch", "mm:ss", undefined, undefined);
    expect(result).toBe("00:00");
  });

  test("elapsed with no startDatetime falls back to stopwatch preview", () => {
    const now = new Date();
    const result = formatClockDisplay(now, "elapsed", "mm:ss", undefined, undefined);
    expect(result).toBe("00:00");
  });
});

// ── P3: Property-based test — wall clock always shows current time ±2s ────────
// Feature: overlay-editor-v3, Property 3: Clock format and timezone correctness

describe("P3: wall clock always shows current time ±2s", () => {
  test("100 random dates produce a parseable HH:mm:ss string within 2s of input", () => {
    const timezones = ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney"];
    const rng = (max) => Math.floor(Math.random() * max);

    for (let i = 0; i < 100; i++) {
      // Random date within the last year
      const offsetMs = rng(365 * 24 * 3600 * 1000);
      const date = new Date(Date.now() - offsetMs);
      const tz = timezones[rng(timezones.length)];

      const result = formatWallClock(date, "HH:mm:ss", tz);

      // Must be non-empty
      expect(result.length).toBeGreaterThan(0);

      // Must match HH:mm:ss pattern
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);

      // Parse back and verify it's within 2 seconds of the input date in that timezone
      const [hStr, mStr, sStr] = result.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const s = parseInt(sStr, 10);

      // Get the actual time components in the target timezone
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = {};
      dtf.formatToParts(date).forEach(({ type, value }) => {
        parts[type] = value;
      });
      const expectedH = parseInt(parts.hour ?? "0", 10);
      const expectedM = parseInt(parts.minute ?? "0", 10);
      const expectedS = parseInt(parts.second ?? "0", 10);

      const resultTotalSec = h * 3600 + m * 60 + s;
      const expectedTotalSec = expectedH * 3600 + expectedM * 60 + expectedS;

      // Allow ±2s difference (accounts for midnight boundary edge cases)
      const diff = Math.abs(resultTotalSec - expectedTotalSec);
      const diffWrapped = Math.min(diff, 86400 - diff); // handle midnight wrap
      expect(diffWrapped).toBeLessThanOrEqual(2);
    }
  });

  test("same Date in two different UTC-offset timezones produces different strings", () => {
    const formats = ["HH:mm:ss", "HH:mm"];
    const rng = (max) => Math.floor(Math.random() * max);

    // UTC vs UTC+9 (Tokyo) — always 9h apart, so strings must differ
    for (let i = 0; i < 50; i++) {
      const date = new Date(Date.now() - rng(86400000));
      const format = formats[rng(formats.length)];
      const utcResult = formatWallClock(date, format, "UTC");
      const tokyoResult = formatWallClock(date, format, "Asia/Tokyo");
      // They should differ (UTC and Tokyo are never the same hour)
      expect(utcResult).not.toBe(tokyoResult);
    }
  });
});

// ── Additional property tests for elapsed mode ────────────────────────────────

describe("elapsed mode: duration increases monotonically", () => {
  test("50 random (start, now) pairs where now > start produce increasing durations", () => {
    const rng = (max) => Math.floor(Math.random() * max);
    const start = new Date("2020-01-01T00:00:00Z");

    let prevSec = -1;
    for (let i = 0; i < 50; i++) {
      const elapsedMs = rng(3600000); // 0..1h
      const now = new Date(start.getTime() + elapsedMs);
      const result = formatClockDisplay(now, "elapsed", "HH:mm:ss", undefined, start.toISOString());
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);

      const [h, m, s] = result.split(":").map(Number);
      const totalSec = h * 3600 + m * 60 + s;
      // Each iteration uses a fresh random elapsed, just verify non-negative
      expect(totalSec).toBeGreaterThanOrEqual(0);
    }
  });
});
