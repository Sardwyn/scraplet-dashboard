// src/widgets/blackjack/defaults.js
export const BLACKJACK_DEFAULTS = {
  table: {
    scale: 1.0,
    showHelpText: true,
    showTotals: true,
    showBet: true,
    showLegalActions: true,
  },

  visuals: {
    fontFamily: "Inter",
    cornerRadius: 18,
    shadow: true,
    backdrop: {
      enabled: true,
      bg: "rgba(0,0,0,0.55)",
      border: "rgba(255,255,255,0.12)",
    },

    // How long the overlay stays visible after a hand settles.
    // (Used by session-manager; leaving it here keeps config cohesive.)
    showOutcomeMs: 6000,
  },

  gameplay: {
    dealerStandsOnSoft17: true,
    blackjackPayout: 1.5,
    allowDouble: true,
    allowDoubleAfterHit: false,
    turnTimeoutMs: 15000,
  },

  narration: {
    enabled: true,
    verbosity: "normal", // low | normal | spicy (spicy currently behaves like normal; reserved)
    cooldownMs: 2500,    // local cooldown per dedupe key; Scrapbot also rate-limits/dedupes
  },

  // ring buffer max in memory (event stream)
  bufferMax: 200,
};
