// src/widgets/roulette/server/engine.js
function hash32(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// European wheel order (single 0)
export const EURO_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// Standard red numbers (European)
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function colorForNumber(n) {
  const x = Number(n);
  if (x === 0) return "green";
  return RED.has(x) ? "red" : "black";
}

export function normalizeBet({ betType, betValue, wheel = "european" }) {
  const t = String(betType || "").toLowerCase();

  if (t === "color") {
    const v = String(betValue || "").toLowerCase();
    if (v !== "red" && v !== "black") return { ok: false, error: "bad_bet_value" };
    return { ok: true, betType: "color", betValue: v, wheel };
  }

  if (t === "straight") {
    const n = parseInt(String(betValue), 10);
    if (!Number.isFinite(n) || n < 0 || n > 36) return { ok: false, error: "bad_bet_value" };
    return { ok: true, betType: "straight", betValue: String(n), wheel };
  }

  return { ok: false, error: "unsupported_bet_type" };
}

export function computePayout({ betAmount, betType, betValue, resultNumber, resultColor }) {
  const bet = Math.max(0, Math.trunc(Number(betAmount || 0) || 0));
  const t = String(betType);
  const v = String(betValue);

  let win = false;
  let multiplier = 0;

  if (t === "color") {
    win = (v === resultColor);
    multiplier = win ? 2 : 0;      // 1:1 payout means return = bet*2 (stake+win) if you were doing stake-return
    // In your system so far: payoutAmount = bet * multiplier (no stake return concept)
    // So: 1:1 should be multiplier=1.
    multiplier = win ? 1 : 0;
  } else if (t === "straight") {
    win = (parseInt(v, 10) === resultNumber);
    multiplier = win ? 35 : 0;     // 35:1 (again, payout-only)
  }

  const payoutAmount = Math.max(0, Math.trunc(bet * multiplier));
  return { win, multiplier, payoutAmount };
}

export function createRouletteOutcome({ seed, betAmount, betType, betValue, wheel = "european" }) {
  const idx = hash32(seed) % EURO_WHEEL.length;
  const resultNumber = EURO_WHEEL[idx];
  const resultColor = colorForNumber(resultNumber);

  const payout = computePayout({
    betAmount,
    betType,
    betValue,
    resultNumber,
    resultColor,
  });

  return {
    seed,
    wheel,
    resultNumber,
    resultColor,
    multiplier: payout.multiplier,
    payoutAmount: payout.payoutAmount,
    win: payout.win,
    wheelIndex: idx,
  };
}
