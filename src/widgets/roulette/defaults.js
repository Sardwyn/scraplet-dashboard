// src/widgets/roulette/defaults.js
export const ROULETTE_DEFAULTS = {
  bets: { max: 500, min: 10, step: 10, default: 50 },

  gameplay: {
    wheel: "european",          // european (0) for v1
    cooldownMs: 8000,
    maxQueueLength: 25,
    perUserQueueLimit: 2,
    maxConcurrentSpins: 1,

    allowedBets: {
      color: true,              // red|black
      straight: true,           // 0..36
      oddEven: false,
      highLow: false,
      dozens: false,
      columns: false,
    },
  },

  visuals: {
    theme: "casino",
    stageW: 1280,
    stageH: 720,
    uiScale: 1,
    fontFamily: "Inter",
    cornerRadius: 18,

    backdrop: {
      enabled: true,
      bg: "rgba(0,0,0,0.55)",
      border: "rgba(255,255,255,0.12)",
    },

    wheel: {
      size: 460,
      ringThickness: 54,
      spinMsMin: 2800,
      spinMsMax: 4200,
      turnsMin: 7,
      turnsMax: 12,
      ballRadius: 9,
      ballOrbit: 210,
      tickAlpha: 0.22,
    },
  },

  narration: {
    enabled: true,
    verbosity: "normal",
    cooldownMs: 2000,
  },

  bufferMax: 300,
};
