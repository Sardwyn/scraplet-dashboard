// src/lib/bj/rules.js
export const BJ_DEFAULT_RULES = {
  decks: 6,
  dealerStandsOnSoft17: true,
  blackjackPayout: 1.5, // 3:2
  allowDouble: true,
  allowDoubleAfterHit: false,
  maxPlayerCards: 10,
  minBet: 1,
};

export function normalizeRules(partial = {}) {
  const r = { ...BJ_DEFAULT_RULES, ...(partial || {}) };

  r.decks = clampInt(r.decks, 1, 8, BJ_DEFAULT_RULES.decks);
  r.blackjackPayout = clampNum(r.blackjackPayout, 1.0, 3.0, BJ_DEFAULT_RULES.blackjackPayout);
  r.maxPlayerCards = clampInt(r.maxPlayerCards, 5, 20, BJ_DEFAULT_RULES.maxPlayerCards);
  r.minBet = clampInt(r.minBet, 1, 10_000_000, BJ_DEFAULT_RULES.minBet);

  r.dealerStandsOnSoft17 = !!r.dealerStandsOnSoft17;
  r.allowDouble = !!r.allowDouble;
  r.allowDoubleAfterHit = !!r.allowDoubleAfterHit;

  return r;
}

function clampInt(v, min, max, fallback) {
  const n = Number.isFinite(v) ? Math.floor(v) : fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNum(v, min, max, fallback) {
  const n = Number.isFinite(v) ? Number(v) : fallback;
  return Math.max(min, Math.min(max, n));
}
