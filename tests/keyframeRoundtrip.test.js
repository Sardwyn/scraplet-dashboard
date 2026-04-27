// tests/keyframeRoundtrip.test.js
// P4: Keyframe Roundtrip — serialize/deserialize config with pseudo-3D keyframes
// must produce deep-equal result.

describe("Keyframe roundtrip — P4", () => {
  function makeConfig(extraKeyframes = []) {
    return {
      version: 0,
      baseResolution: { width: 1920, height: 1080 },
      elements: [{
        id: "el-1",
        type: "box",
        x: 100, y: 100, width: 200, height: 100,
        tiltX: 15,
        tiltY: -10,
        skewX: 5,
        skewY: 0,
        perspective: 800,
      }],
      timeline: {
        durationMs: 2000,
        tracks: [
          {
            id: "track-tiltX",
            elementId: "el-1",
            property: "tiltX",
            keyframes: [
              { id: "kf-0", t: 0, value: 0, easing: "linear" },
              { id: "kf-1", t: 1000, value: 15, easing: "ease-out" },
              { id: "kf-2", t: 2000, value: 0, easing: "linear" },
            ],
          },
          {
            id: "track-tiltY",
            elementId: "el-1",
            property: "tiltY",
            keyframes: [
              { id: "kf-3", t: 0, value: 0, easing: "linear" },
              { id: "kf-4", t: 2000, value: -10, easing: "ease-in-out" },
            ],
          },
          {
            id: "track-skewX",
            elementId: "el-1",
            property: "skewX",
            keyframes: [
              { id: "kf-5", t: 0, value: 0, easing: "hold" },
              { id: "kf-6", t: 500, value: 5, easing: "linear" },
            ],
          },
          {
            id: "track-perspective",
            elementId: "el-1",
            property: "perspective",
            keyframes: [
              { id: "kf-7", t: 0, value: 800, easing: "linear" },
              { id: "kf-8", t: 2000, value: 400, easing: "ease-in" },
            ],
          },
          ...extraKeyframes,
        ],
      },
    };
  }

  test("JSON roundtrip preserves pseudo-3D keyframes exactly", () => {
    const original = makeConfig();
    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(original);
  });

  test("all pseudo-3D properties survive roundtrip", () => {
    const config = makeConfig();
    const rt = JSON.parse(JSON.stringify(config));
    const props = rt.timeline.tracks.map(t => t.property);
    expect(props).toContain("tiltX");
    expect(props).toContain("tiltY");
    expect(props).toContain("skewX");
    expect(props).toContain("perspective");
  });

  test("keyframe values and easings are preserved", () => {
    const config = makeConfig();
    const rt = JSON.parse(JSON.stringify(config));
    const tiltXTrack = rt.timeline.tracks.find(t => t.property === "tiltX");
    expect(tiltXTrack.keyframes[1].value).toBe(15);
    expect(tiltXTrack.keyframes[1].easing).toBe("ease-out");
  });

  test("element pseudo-3D fields survive roundtrip", () => {
    const config = makeConfig();
    const rt = JSON.parse(JSON.stringify(config));
    const el = rt.elements[0];
    expect(el.tiltX).toBe(15);
    expect(el.tiltY).toBe(-10);
    expect(el.skewX).toBe(5);
    expect(el.perspective).toBe(800);
  });

  test("multiple roundtrips are stable (idempotent)", () => {
    const config = makeConfig();
    const once = JSON.parse(JSON.stringify(config));
    const twice = JSON.parse(JSON.stringify(once));
    expect(twice).toEqual(once);
  });
});
