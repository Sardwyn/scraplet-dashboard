// src/widgets/plinko/server/engine.js

// Small deterministic RNG (mulberry32) seeded from a string hash.
function hash32(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPlinkoOutcome({
  seed,
  rows,
  multipliers,
  betAmount,
}) {
  const r = mulberry32(hash32(seed));

  const path = [];
  let rights = 0;

  for (let i = 0; i < rows; i++) {
    const step = r() < 0.5 ? "L" : "R";
    if (step === "R") rights++;
    path.push(step);
  }

  const finalSlot = rights; // 0..rows
  const m = Array.isArray(multipliers) ? multipliers[finalSlot] : 0;
  const multiplier = Number(m ?? 0) || 0;

  const payoutAmount = Math.max(
    0,
    Math.floor((Number(betAmount || 0) || 0) * multiplier)
  );

  return { path, finalSlot, multiplier, payoutAmount };
}
