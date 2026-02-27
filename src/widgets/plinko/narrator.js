// src/widgets/plinko/narrator.js
// Simple narration builder (same vibe as BJ narrator but smaller).

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function structuredCloneSafe(v) {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

function deepMerge(base, patch) {
  if (!isPlainObject(base)) return structuredCloneSafe(patch);
  if (!isPlainObject(patch)) return structuredCloneSafe(base);

  const out = structuredCloneSafe(base);
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = structuredCloneSafe(v);
  }
  return out;
}

function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
}

function hash32(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(list, seed) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const h = hash32(seed);
  return list[h % list.length];
}

function fmtMult(m) {
  const x = Number(m);
  if (!Number.isFinite(x)) return "0x";
  if (Math.abs(x - Math.round(x)) < 1e-9) return `${Math.round(x)}x`;
  return `${x.toFixed(1)}x`;
}

const lastSentByKey = new Map();

function allowCooldown(dedupeKey, cooldownMs) {
  const now = Date.now();
  const last = lastSentByKey.get(dedupeKey) || 0;
  if (now - last < cooldownMs) return false;
  lastSentByKey.set(dedupeKey, now);

  if (lastSentByKey.size > 2000) {
    const drop = lastSentByKey.size - 1600;
    let i = 0;
    for (const k of lastSentByKey.keys()) {
      lastSentByKey.delete(k);
      i++;
      if (i >= drop) break;
    }
  }
  return true;
}

const BANKS = {
  minimal: {
    settled: [
      "🎯 {p} {m} → +{pay}.",
      "🎯 {m} for {p}. +{pay}.",
      "🎯 {p} landed {m} (+{pay}).",
    ],
    big: [
      "🔥 {p} snipes {m}! +{pay}.",
      "🔥 BIG HIT: {p} {m} → +{pay}.",
    ],
    dud: [
      "😬 {p} {m}.",
      "😬 {m}… unlucky.",
    ],
  },

  hype: {
    settled: [
      "🎯 {p} drops… {m}! +{pay} points.",
      "🎯 Ball lands {m} — {p} gets +{pay}.",
      "🎯 {p} hits {m}. Pay them +{pay}.",
    ],
    big: [
      "🔥 {p} just nuked {m}! +{pay} points!",
      "🔥 MASSIVE: {p} hits {m} → +{pay}.",
      "🔥 {m} pocket! {p} +{pay}.",
    ],
    dud: [
      "😬 {m}. We go again.",
      "😬 That’s pain… {m}.",
      "😬 {p} gets {m}. Unlucky.",
    ],
  },

  dealer: {
    settled: [
      "🎯 {p} lands {m}. Payout +{pay}.",
      "🎯 Result for {p}: {m} (+{pay}).",
      "🎯 {p}: {m}. +{pay} points.",
    ],
    big: [
      "🔥 Big multiplier — {p} hits {m}. +{pay}.",
      "🔥 Strong hit: {p} {m} → +{pay}.",
    ],
    dud: [
      "😬 Low roll: {m}.",
      "😬 Unlucky: {m}.",
    ],
  },
};

function getConfig(plinkoDefaults, widgetConfig) {
  return deepMerge(plinkoDefaults || {}, widgetConfig || {});
}

/**
 * Returns: { text, dedupeKey } OR null
 */
export function buildPlinkoNarration({
  plinkoDefaults,
  widgetConfig,
  kind, // "SETTLED"
  round,
  publicId,
}) {
  const cfg = getConfig(plinkoDefaults, widgetConfig);
  const narr = cfg?.narration || {};
  if (narr.enabled === false) return null;

  const style = String(narr.style || "dealer").toLowerCase();
  const bank = BANKS[style] || BANKS.dealer;

  const cooldownMs = clampInt(narr.cooldownMs ?? 2000, 0, 60000);
  const bigWinMult = Number(narr.bigWinMultiplier ?? 2) || 2;

  const p = String(round?.playerName || "Player");
  const m = fmtMult(round?.multiplier ?? 0);
  const pay = String(round?.payoutAmount ?? 0);

  const roundId = String(round?.roundId || "unknown");
  const dedupeKey = `pl:narr:settled:${publicId}:${round?.playerKey}:${roundId}`;

  // Gate spam: only narrate "big" hits, or always in low traffic.
  const isBig = Number(round?.multiplier ?? 0) >= bigWinMult;
  const isDud = Number(round?.multiplier ?? 0) <= 0.25;

  let tpl = null;

  if (isBig) tpl = pickVariant(bank.big, `${dedupeKey}:BIG`);
  else if (isDud) tpl = pickVariant(bank.dud, `${dedupeKey}:DUD`);
  else tpl = pickVariant(bank.settled, `${dedupeKey}:SET`);

  const text = String(tpl || "")
    .replaceAll("{p}", p)
    .replaceAll("{m}", m)
    .replaceAll("{pay}", pay)
    .trim();

  if (!text) return null;
  if (!allowCooldown(dedupeKey, cooldownMs)) return null;

  return { text, dedupeKey };
}
