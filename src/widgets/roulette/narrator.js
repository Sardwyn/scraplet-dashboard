// src/widgets/roulette/narrator.js
function clampInt(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, Math.trunc(x)));
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
      if (++i >= drop) break;
    }
  }
  return true;
}

export function buildRouletteNarration({ widgetConfig, kind, round, publicId }) {
  const narr = widgetConfig?.narration || {};
  if (narr.enabled === false) return null;

  const cooldownMs = clampInt(narr.cooldownMs ?? 2000, 0, 60000);

  const roundId = String(round?.roundId || "unknown");
  const player = String(round?.playerName || "Player");
  const num = round?.resultNumber;
  const col = String(round?.resultColor || "");
  const betType = String(round?.betType || "");
  const betValue = String(round?.betValue || "");
  const pay = String(round?.payoutAmount ?? 0);

  const dedupeKey = `rou:narr:${publicId}:${round?.playerKey}:${roundId}`;
  if (!allowCooldown(dedupeKey, cooldownMs)) return null;

  const hit =
    (round?.payoutAmount || 0) > 0
      ? `🎡 ${player} HIT! ${num} (${col}) — +${pay}.`
      : `🎡 ${player} spun ${num} (${col}). (${betType}:${betValue}) No payout.`;

  return { text: hit, dedupeKey };
}
