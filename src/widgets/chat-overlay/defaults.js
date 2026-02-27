// src/widgets/chat-overlay/defaults.js

export const CHAT_OVERLAY_DEFAULTS = {
  fontFamily: "Inter",
  fontSizePx: 28,
  lineHeight: 1.25,
  messageGapPx: 10,

  showAvatars: true,
  showPlatformIcon: true,
  shadow: true,

  // Name colour behaviour:
  // - "fixed" uses nameColor
  // - "none" disables special name styling
  usernameColorMode: "fixed",

  nameColor: "#ffffff",
  messageColor: "#e8e8e8",

  emoteSizePx: 28,
  hideCommands: true,

  // "fade" | "slide" | "none"
  animation: "fade",

  // 0 = no clamp
  maxMessageWidthPx: 0,

  // "off" | "bar" | "dot"
  platformAccentMode: "bar",

  outline: {
    enabled: false,
    px: 3,
    color: "rgba(0,0,0,0.85)",
  },

  bubble: {
    enabled: true,
    bg: "rgba(0,0,0,0.55)",
    radiusPx: 14,
    border: "rgba(255,255,255,0.12)",
  },

  limits: {
    maxMessages: 6,
    fadeMs: 9000,
  },

  pinned: {
    enabled: false,
    text: "",
    style: "bubble", // "bubble" | "plain"
  },

  smoothing: {
    enabled: true,
    rateLimitPerSec: 12,
    dedupeEnabled: true,
    dedupeWindowMs: 2500,
  },

  transform: {
    enabled: false,
    perspectivePx: 1000,
    x: 0,
    y: 0,
    scale: 1,
    rotateZ: 0,
    tiltX: 0,
    tiltY: 0,
  },


  // Layout
  // - vertical: stacked messages
  // - horizontal: ticker / bar style
  layoutOrientation: "vertical", // "vertical" | "horizontal"
  horizontalMode: "ticker", // future-proof: "ticker" | "pills"

  // Horizontal ticker controls (used when layoutOrientation === "horizontal")
  stripHeightPx: 240, // recommended OBS browser-source height for ticker
  tickerPps: 140, // pixels-per-second scroll speed
  tickerGapPx: 12,
  tickerOneAtATime: true,
  carouselHoldMs: 3500,

  // ring buffer max in memory (not on screen)
  bufferMax: 120,
};
