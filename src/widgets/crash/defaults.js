// src/widgets/crash/defaults.js

export const CRASH_WIDGET_KEY = "crash";

// Canonical defaults object (dashboard imports CRASH_DEFAULTS)
export const CRASH_DEFAULTS = {
  skin_key: "neon-v1",
  variant: "horizontal", // "horizontal" | "vertical"
  scale: 1,
  hud: { align: "top" },
};

// Convenience helper (kept for compatibility)
export function getCrashDefaults() {
  // Return a fresh copy so callers don't mutate the shared constant
  return JSON.parse(JSON.stringify(CRASH_DEFAULTS));
}
