export const SUB_COUNTER_DEFAULTS = {
  enabled: true,

  // Goal behavior
  goal: 25,          // target
  cap: 50,           // visual cap (for overfill / progress scaling)
  overfill: true,    // allow bar > 100% up to cap

  // Display
  label: "SUB GOAL",
  showNumbers: true, // show "x / goal"
  showPercent: false,

  // Optional formatting
  decimals: 0,
};
