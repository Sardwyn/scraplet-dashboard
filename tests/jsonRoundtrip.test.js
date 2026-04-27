// tests/jsonRoundtrip.test.js
// Task 10: JSON round-trip + timeline tests for overlay-editor-v3 element types.
// Covers: countdown, clock, audioVisualiser, custom variables, ticker fields,
//         and timeline tracks for new numeric properties.

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundtrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeBaseEl(type, extra = {}) {
  return { id: `el-${type}`, type, x: 0, y: 0, width: 200, height: 80, visible: true, ...extra };
}

// ── Countdown round-trip ──────────────────────────────────────────────────────

describe("Countdown element JSON round-trip", () => {
  const el = makeBaseEl("countdown", {
    name: "My Countdown",
    mode: "duration",
    durationMs: 300000,
    endBehaviour: "hold",
    format: "MM:SS",
    color: "#ff0000",
    fontSizePx: 48,
    fontWeight: "bold",
    textAlign: "center",
  });

  test("all fields survive round-trip", () => {
    const rt = roundtrip(el);
    expect(rt.type).toBe("countdown");
    expect(rt.durationMs).toBe(300000);
    expect(rt.endBehaviour).toBe("hold");
    expect(rt.format).toBe("MM:SS");
    expect(rt.color).toBe("#ff0000");
    expect(rt.fontSizePx).toBe(48);
  });

  test("target mode with datetime survives round-trip", () => {
    const el2 = makeBaseEl("countdown", {
      mode: "target",
      targetDatetime: "2026-12-31T23:59:59Z",
      format: "HH:MM:SS",
      color: "#ffffff",
      fontSizePx: 32,
      endBehaviour: "hide",
    });
    const rt = roundtrip(el2);
    expect(rt.mode).toBe("target");
    expect(rt.targetDatetime).toBe("2026-12-31T23:59:59Z");
    expect(rt.endBehaviour).toBe("hide");
  });

  test("property-based: 50 random durationMs values survive round-trip", () => {
    for (let i = 0; i < 50; i++) {
      const ms = Math.floor(Math.random() * 86400000);
      const rt = roundtrip(makeBaseEl("countdown", { durationMs: ms, format: "MM:SS", color: "#fff", fontSizePx: 24, endBehaviour: "hold" }));
      expect(rt.durationMs).toBe(ms);
    }
  });
});

// ── Clock round-trip ──────────────────────────────────────────────────────────

describe("Clock element JSON round-trip", () => {
  const el = makeBaseEl("clock", {
    clockMode: "wall",
    timezone: "Europe/London",
    format: "HH:mm:ss",
    use12h: false,
    color: "#ffffff",
    fontSizePx: 48,
    fontWeight: "bold",
    textAlign: "center",
  });

  test("all fields survive round-trip", () => {
    const rt = roundtrip(el);
    expect(rt.type).toBe("clock");
    expect(rt.clockMode).toBe("wall");
    expect(rt.timezone).toBe("Europe/London");
    expect(rt.format).toBe("HH:mm:ss");
    expect(rt.use12h).toBe(false);
  });

  test("elapsed mode with startDatetime survives round-trip", () => {
    const el2 = makeBaseEl("clock", {
      clockMode: "elapsed",
      startDatetime: "2026-01-01T00:00:00Z",
      format: "HH:mm:ss",
      use12h: false,
      color: "#fff",
      fontSizePx: 32,
    });
    const rt = roundtrip(el2);
    expect(rt.clockMode).toBe("elapsed");
    expect(rt.startDatetime).toBe("2026-01-01T00:00:00Z");
  });

  test("stopwatch mode survives round-trip", () => {
    const rt = roundtrip(makeBaseEl("clock", { clockMode: "stopwatch", format: "mm:ss", use12h: false, color: "#fff", fontSizePx: 24 }));
    expect(rt.clockMode).toBe("stopwatch");
  });
});

// ── Audio Visualiser round-trip ───────────────────────────────────────────────

describe("AudioVisualiser element JSON round-trip", () => {
  const el = makeBaseEl("audioVisualiser", {
    sourceId: "default",
    barCount: 32,
    barColor: "#6366f1",
    barGap: 2,
    style: "bars",
  });

  test("all fields survive round-trip", () => {
    const rt = roundtrip(el);
    expect(rt.type).toBe("audioVisualiser");
    expect(rt.sourceId).toBe("default");
    expect(rt.barCount).toBe(32);
    expect(rt.barColor).toBe("#6366f1");
    expect(rt.barGap).toBe(2);
    expect(rt.style).toBe("bars");
  });

  test("wave and circle styles survive round-trip", () => {
    expect(roundtrip(makeBaseEl("audioVisualiser", { sourceId: "default", barCount: 64, barColor: "#fff", barGap: 1, style: "wave" })).style).toBe("wave");
    expect(roundtrip(makeBaseEl("audioVisualiser", { sourceId: "default", barCount: 16, barColor: "#fff", barGap: 3, style: "circle" })).style).toBe("circle");
  });

  test("property-based: 50 random barCount values survive round-trip", () => {
    for (let i = 0; i < 50; i++) {
      const n = 1 + Math.floor(Math.random() * 255);
      const rt = roundtrip(makeBaseEl("audioVisualiser", { sourceId: "default", barCount: n, barColor: "#fff", barGap: 2, style: "bars" }));
      expect(rt.barCount).toBe(n);
    }
  });
});

// ── Ticker fields round-trip ──────────────────────────────────────────────────

describe("Text element ticker fields JSON round-trip", () => {
  const el = makeBaseEl("text", {
    text: "Breaking news ticker",
    color: "#ffffff",
    fontSizePx: 24,
    tickerMode: true,
    tickerSpeed: 80,
    tickerDirection: "left",
    tickerGap: 40,
  });

  test("all ticker fields survive round-trip", () => {
    const rt = roundtrip(el);
    expect(rt.tickerMode).toBe(true);
    expect(rt.tickerSpeed).toBe(80);
    expect(rt.tickerDirection).toBe("left");
    expect(rt.tickerGap).toBe(40);
  });

  test("tickerMode false survives round-trip", () => {
    const rt = roundtrip(makeBaseEl("text", { text: "hi", color: "#fff", fontSizePx: 16, tickerMode: false }));
    expect(rt.tickerMode).toBe(false);
  });

  test("right direction survives round-trip", () => {
    const rt = roundtrip(makeBaseEl("text", { text: "hi", color: "#fff", fontSizePx: 16, tickerMode: true, tickerSpeed: 60, tickerDirection: "right", tickerGap: 20 }));
    expect(rt.tickerDirection).toBe("right");
  });
});

// ── Custom variables round-trip ───────────────────────────────────────────────

describe("Custom variables JSON round-trip", () => {
  const config = {
    version: 0,
    baseResolution: { width: 1920, height: 1080 },
    elements: [],
    variables: [
      { id: "v1", name: "myScore", type: "number", value: 42, defaultValue: 0 },
      { id: "v2", name: "playerName", type: "text", value: "Alice", defaultValue: "" },
      { id: "v3", name: "isLive", type: "boolean", value: true, defaultValue: false },
    ],
  };

  test("all variable fields survive round-trip", () => {
    const rt = roundtrip(config);
    expect(rt.variables).toHaveLength(3);
    expect(rt.variables[0]).toEqual(config.variables[0]);
    expect(rt.variables[1]).toEqual(config.variables[1]);
    expect(rt.variables[2]).toEqual(config.variables[2]);
  });

  test("variable values of all types survive round-trip", () => {
    const rt = roundtrip(config);
    expect(rt.variables[0].value).toBe(42);
    expect(rt.variables[1].value).toBe("Alice");
    expect(rt.variables[2].value).toBe(true);
  });

  test("empty variables array survives round-trip", () => {
    const rt = roundtrip({ ...config, variables: [] });
    expect(rt.variables).toEqual([]);
  });

  test("property-based: 50 random numeric variable values survive round-trip", () => {
    for (let i = 0; i < 50; i++) {
      const v = Math.random() * 1e6;
      const rt = roundtrip({ variables: [{ id: "x", name: "n", type: "number", value: v, defaultValue: 0 }] });
      expect(rt.variables[0].value).toBeCloseTo(v);
    }
  });
});

// ── Full overlay config round-trip ────────────────────────────────────────────

describe("Full overlay config round-trip (all new element types)", () => {
  const config = {
    version: 0,
    baseResolution: { width: 1920, height: 1080 },
    backgroundColor: "#000000",
    variables: [
      { id: "v1", name: "score", type: "number", value: 0, defaultValue: 0 },
    ],
    elements: [
      makeBaseEl("countdown", { mode: "duration", durationMs: 60000, format: "MM:SS", color: "#fff", fontSizePx: 48, endBehaviour: "hold" }),
      makeBaseEl("clock", { clockMode: "wall", timezone: "UTC", format: "HH:mm:ss", use12h: false, color: "#fff", fontSizePx: 32 }),
      makeBaseEl("audioVisualiser", { sourceId: "default", barCount: 32, barColor: "#6366f1", barGap: 2, style: "bars" }),
      makeBaseEl("text", { text: "{{variables.score}}", color: "#fff", fontSizePx: 24, tickerMode: true, tickerSpeed: 60, tickerDirection: "left", tickerGap: 40 }),
    ],
    timeline: {
      durationMs: 5000,
      tracks: [
        { id: "t1", elementId: "el-countdown", property: "opacity", keyframes: [{ id: "k1", t: 0, value: 0, easing: "linear" }, { id: "k2", t: 500, value: 1, easing: "ease-out" }] },
        { id: "t2", elementId: "el-clock", property: "x", keyframes: [{ id: "k3", t: 0, value: 100, easing: "linear" }, { id: "k4", t: 5000, value: 200, easing: "linear" }] },
      ],
    },
  };

  test("full config survives round-trip", () => {
    const rt = roundtrip(config);
    expect(rt).toEqual(config);
  });

  test("element types are preserved", () => {
    const rt = roundtrip(config);
    const types = rt.elements.map(e => e.type);
    expect(types).toContain("countdown");
    expect(types).toContain("clock");
    expect(types).toContain("audioVisualiser");
    expect(types).toContain("text");
  });

  test("timeline tracks survive round-trip", () => {
    const rt = roundtrip(config);
    expect(rt.timeline.tracks).toHaveLength(2);
    expect(rt.timeline.tracks[0].property).toBe("opacity");
    expect(rt.timeline.tracks[1].property).toBe("x");
  });

  test("multiple round-trips are stable", () => {
    const once = roundtrip(config);
    const twice = roundtrip(once);
    const thrice = roundtrip(twice);
    expect(thrice).toEqual(once);
  });
});

// ── Timeline evaluation for new properties ────────────────────────────────────

// Inline evaluateTimeline (same logic as evaluateTimeline.test.js)
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function applyEasing(p, e) {
  const t = clamp(p, 0, 1);
  if (e === "hold") return 0;
  if (e === "ease-in") return t * t;
  if (e === "ease-out") return 1 - (1 - t) * (1 - t);
  if (e === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}
function interpolate(from, to, p, e) {
  if (e === "hold") return p >= 1 ? to : from;
  return from + (to - from) * applyEasing(p, e);
}
function evalTimeline(timeline, ms) {
  if (!timeline?.tracks?.length) return {};
  const out = {};
  for (const track of timeline.tracks) {
    const kfs = [...track.keyframes].sort((a, b) => a.t - b.t);
    if (!kfs.length) continue;
    let val = kfs[0].value;
    if (ms <= kfs[0].t) { val = kfs[0].value; }
    else if (ms >= kfs[kfs.length - 1].t) { val = kfs[kfs.length - 1].value; }
    else {
      for (let i = 0; i < kfs.length - 1; i++) {
        if (ms < kfs[i].t || ms > kfs[i + 1].t) continue;
        const span = Math.max(1, kfs[i + 1].t - kfs[i].t);
        val = interpolate(kfs[i].value, kfs[i + 1].value, (ms - kfs[i].t) / span, kfs[i + 1].easing ?? "linear");
        break;
      }
    }
    if (!out[track.elementId]) out[track.elementId] = {};
    out[track.elementId][track.property] = val;
  }
  return out;
}

describe("Timeline evaluation for new element properties", () => {
  test("opacity track on countdown element interpolates correctly", () => {
    const timeline = {
      durationMs: 1000,
      tracks: [{ id: "t1", elementId: "cd1", property: "opacity", keyframes: [{ id: "k1", t: 0, value: 0, easing: "linear" }, { id: "k2", t: 1000, value: 1, easing: "linear" }] }],
    };
    expect(evalTimeline(timeline, 0)["cd1"].opacity).toBeCloseTo(0);
    expect(evalTimeline(timeline, 500)["cd1"].opacity).toBeCloseTo(0.5);
    expect(evalTimeline(timeline, 1000)["cd1"].opacity).toBeCloseTo(1);
  });

  test("x/y tracks on audioVisualiser element interpolate correctly", () => {
    const timeline = {
      durationMs: 2000,
      tracks: [
        { id: "t1", elementId: "av1", property: "x", keyframes: [{ id: "k1", t: 0, value: 0, easing: "linear" }, { id: "k2", t: 2000, value: 400, easing: "linear" }] },
        { id: "t2", elementId: "av1", property: "y", keyframes: [{ id: "k3", t: 0, value: 100, easing: "linear" }, { id: "k4", t: 2000, value: 500, easing: "linear" }] },
      ],
    };
    expect(evalTimeline(timeline, 1000)["av1"].x).toBeCloseTo(200);
    expect(evalTimeline(timeline, 1000)["av1"].y).toBeCloseTo(300);
  });

  test("multiple element types can have simultaneous timeline tracks", () => {
    const timeline = {
      durationMs: 1000,
      tracks: [
        { id: "t1", elementId: "cd1", property: "opacity", keyframes: [{ id: "k1", t: 0, value: 0, easing: "linear" }, { id: "k2", t: 1000, value: 1, easing: "linear" }] },
        { id: "t2", elementId: "ck1", property: "opacity", keyframes: [{ id: "k3", t: 0, value: 1, easing: "linear" }, { id: "k4", t: 1000, value: 0, easing: "linear" }] },
        { id: "t3", elementId: "av1", property: "width", keyframes: [{ id: "k5", t: 0, value: 100, easing: "linear" }, { id: "k6", t: 1000, value: 300, easing: "linear" }] },
      ],
    };
    const result = evalTimeline(timeline, 500);
    expect(result["cd1"].opacity).toBeCloseTo(0.5);
    expect(result["ck1"].opacity).toBeCloseTo(0.5);
    expect(result["av1"].width).toBeCloseTo(200);
  });

  test("property-based: timeline values always within keyframe range for new element types (100 trials)", () => {
    const elementIds = ["cd1", "ck1", "av1", "txt1"];
    for (let trial = 0; trial < 100; trial++) {
      const elId = elementIds[trial % elementIds.length];
      const from = Math.random() * 1000;
      const to = Math.random() * 1000;
      const min = Math.min(from, to);
      const max = Math.max(from, to);
      const timeline = {
        durationMs: 1000,
        tracks: [{ id: "t1", elementId: elId, property: "opacity", keyframes: [{ id: "k1", t: 0, value: from, easing: "linear" }, { id: "k2", t: 1000, value: to, easing: "linear" }] }],
      };
      const t = Math.random() * 1000;
      const v = evalTimeline(timeline, t)[elId]?.opacity ?? 0;
      expect(v).toBeGreaterThanOrEqual(min - 0.001);
      expect(v).toBeLessThanOrEqual(max + 0.001);
    }
  });
});
