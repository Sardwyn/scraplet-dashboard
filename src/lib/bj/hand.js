// src/lib/bj/hand.js
/**
 * Compute all possible totals with aces counted as 1 or 11.
 */
export function scoreHand(cards) {
  const ranks = (cards || []).map((c) => String(c.rank));

  // base total with all aces as 1
  let base = 0;
  let aceCount = 0;

  for (const r of ranks) {
    if (r === "A") {
      aceCount += 1;
      base += 1;
    } else if (r === "K" || r === "Q" || r === "J") {
      base += 10;
    } else {
      base += parseInt(r, 10);
    }
  }

  const totals = new Set([base]);

  // Each ace can add +10 to become 11 (since already counted as 1)
  for (let i = 1; i <= aceCount; i++) {
    totals.add(base + i * 10);
  }

  const totalsArr = Array.from(totals).sort((a, b) => a - b);

  const bestUnder = totalsArr.filter((t) => t <= 21).pop();
  const bestTotal = bestUnder != null ? bestUnder : totalsArr[0] ?? 0;

  const isBust = totalsArr.every((t) => t > 21);
  const isBlackjack = (cards?.length === 2) && totalsArr.includes(21);

  // soft if bestTotal uses an ace as 11
  const isSoft = !isBust && totalsArr.includes(bestTotal) && totalsArr.includes(bestTotal - 10);

  return { totals: totalsArr, bestTotal, isSoft, isBust, isBlackjack };
}

export function handFromCards(cards) {
  const s = scoreHand(cards);
  return {
    cards: cards || [],
    totals: s.totals,
    bestTotal: s.bestTotal,
    isSoft: s.isSoft,
    isBust: s.isBust,
    isBlackjack: s.isBlackjack,
  };
}
