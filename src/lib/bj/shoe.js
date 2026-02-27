// src/lib/bj/shoe.js
const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

export function createShoe({ shoeId, decks = 6, rng = Math.random } = {}) {
  const cards = [];
  const d = Math.max(1, Math.min(8, Math.floor(decks || 6)));

  let idx = 0;
  for (let di = 0; di < d; di++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${shoeId || "shoe"}:${idx++}`,
          suit,
          rank,
        });
      }
    }
  }

  // Fisher–Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }

  return { shoeId: shoeId || "shoe", cards, cursor: 0 };
}

export function drawCard(shoe) {
  if (!shoe || !Array.isArray(shoe.cards)) throw new Error("Invalid shoe");
  if (shoe.cursor >= shoe.cards.length) throw new Error("DECK_EXHAUSTED");
  const c = shoe.cards[shoe.cursor];
  shoe.cursor += 1;
  return c;
}
