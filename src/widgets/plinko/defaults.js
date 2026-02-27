// src/widgets/plinko/defaults.js

export const PLINKO_DEFAULTS = {
  bets: {
    min: 10,
    max: 500,
    step: 10,
    default: 50
  },

  visuals: {
    theme: "casino",

    stageW: 1280,
    stageH: 720,
    boardW: 980,
    boardH: 520,
    uiScale: 1,

    shadow: true,
    cornerRadius: 18,
    fontFamily: "Inter",

    backdrop: {
      enabled: true,
      bg: "rgba(0,0,0,0.55)",
      border: "rgba(255,255,255,0.12)"
    },

    // renderer merges: theme preset -> these overrides
    skin: {},

    // supports “item balls”
    ball: {
      size: 18,
      fit: "contain",   // contain|cover
      mask: "circle",   // circle|rounded|none
      pad: 0.10,
      laneOffsets: [0, -6, 6, -12, 12]
    },

    // standardized
    sfx: {
      enabled: true,
      volume: 0.35,
      slowMoFactor: 1.45
    },

    // NEW: effects toggles
    fx: {
      pegKick: true,      // tiny micro-kick on peg ticks
      ballTrail: true,    // subtle trail behind ball
      slotBurst: true,    // burst particles on settle
      bigWinSlowMo: true  // slow-mo only on big wins
    }
  },

  gameplay: {
    rows: 10,
    padMs: 900,
    perRowMs: 260,
    cooldownMs: 8000,

    multipliers: [0.2, 0.5, 1, 2, 5, 2, 1, 0.5, 0.2, 0.5, 0.2],

    maxQueueLength: 25,
    perUserQueueLimit: 2,
    maxConcurrentBalls: 3
  },

  narration: {
    enabled: true,
    verbosity: "normal",
    cooldownMs: 2000,
    bigWinMultiplier: 2
  },

  bufferMax: 300
};
