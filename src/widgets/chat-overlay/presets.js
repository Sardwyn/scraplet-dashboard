// Chat Overlay Presets
// Each preset defines a FULL visual signature.
// No soft tweaks. No inheritance. No ambiguity.

export const CHAT_OVERLAY_PRESETS = [
{
  id: "minimal_clean",
  name: "Minimal Clean",
  config: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSizePx: 26,
    lineHeight: 1.25,
    messageGapPx: 6,

    showAvatars: false,
    showPlatformIcon: false,
    shadow: false,

    usernameColorMode: "fixed",
    nameColor: "#000000",
    messageColor: "#000000",

    bubble: { enabled: false },
    outline: { enabled: false },

    animation: "none",
    platformAccentMode: "off",
    maxMessageWidthPx: 520,

    limits: { maxMessages: 6, fadeMs: 9000 },
  },
}
,

  {
  id: "streamer_pro",
  name: "Streamer Pro",
  config: {
    layoutOrientation: "vertical",
    horizontalMode: "ticker",
    stripHeightPx: 240,
    tickerPps: 140,
    tickerGapPx: 12,
    carouselHoldMs: 3500,

    fontFamily: "Inter, system-ui, sans-serif",
    fontSizePx: 26,
    lineHeight: 1.22,
    messageGapPx: 10,

    showAvatars: true,
    showPlatformIcon: true,
    shadow: true,

    usernameColorMode: "fixed",
    nameColor: "rgba(180,245,255,0.98)",
    messageColor: "rgba(255,255,255,0.92)",

    bubble: {
      enabled: true,
      radiusPx: 14,
      bg: "rgba(0,0,0,0.45)",
      border: "rgba(255,255,255,0.12)",
    },

    outline: { enabled: true, px: 2, color: "rgba(0,0,0,0.85)" },

    animation: "fade",
    platformAccentMode: "dot",
    maxMessageWidthPx: 720,

    limits: { maxMessages: 6, fadeMs: 9000 },
  },
},


  {
    id: "neon_night",
    name: "Neon Night",
    config: {
  layoutOrientation: "vertical",

  // Futuristic font (already in your renderer’s Google Fonts link)
  fontFamily: "Space Grotesk, Inter, system-ui, sans-serif",
  fontSizePx: 26,
  lineHeight: 1.18,

  // Tight stack
  messageGapPx: 3,

  // No avatars, but keep platform decoration
  showAvatars: false,
  showPlatformIcon: true,
  shadow: true,

  // Neon colours
  usernameColorMode: "fixed",
  nameColor: "#B026FF",                 // purple neon
  messageColor: "#00F2EA",              // cyan neon (message body)

  // Hard-edged bubble
  bubble: {
    enabled: true,
    radiusPx: 1,
    bg: "rgba(30,30,30,0.78)",          // dark grey
    border: "rgba(176,38,255,0.55)",    // purple border tint
  },

  // Keep outline OFF to avoid “stroke”; glow comes from bubble/shadow vibe
  outline: {
    enabled: false,
  },

  animation: "fade",

  // You asked specifically for the platform bar
  platformAccentMode: "bar",

  maxMessageWidthPx: 820,

  limits: {
    maxMessages: 7,
    fadeMs: 9500,
  },
},

  },

  {
    id: "pulp_rocket",
    name: "Pulp Rocket",
    config: {
      // Layout
      layoutOrientation: "vertical",
      horizontalMode: "ticker",
      stripHeightPx: 240,
      tickerPps: 140,
      tickerGapPx: 12,
      tickerOneAtATime: true,
      carouselHoldMs: 3500,

      fontFamily: "Bebas Neue, Inter, system-ui",
      fontSizePx: 34,
      lineHeight: 1.15,
      messageGapPx: 14,

      showAvatars: false,
      showPlatformIcon: true,
      shadow: true,

      usernameColorMode: "fixed",
      nameColor: "#ffd28a",
      messageColor: "#fff3e3",

      bubble: {
        enabled: true,
        radiusPx: 20,
        bg: "rgba(30,15,5,0.65)",
        border: "rgba(255,145,60,0.45)",
      },

      outline: {
        enabled: true,
        px: 3,
        color: "rgba(0,0,0,0.85)",
      },

      animation: "slide",
      platformAccentMode: "bar",
      maxMessageWidthPx: 820,

      limits: {
        maxMessages: 4,
        fadeMs: 12000,
      },

      pinned: {
        enabled: true,
        text: "🚀 WELCOME ABOARD",
        style: "bubble",
      },
    },
  },

  {
    id: "firehose",
    name: "Firehose",
    config: {
  layoutOrientation: "vertical",

  fontFamily: "Inter, system-ui, sans-serif",
  fontSizePx: 22,
  lineHeight: 1.15,
  messageGapPx: 4,

  // firehose = density
  showAvatars: false,
  showPlatformIcon: false,
  shadow: false,

  // readable anywhere
  usernameColorMode: "hash",
  nameColor: "#ffffff",
  messageColor: "rgba(255,255,255,0.92)",

  // minimal “pill” bubble so white-on-white never happens
  bubble: {
    enabled: true,
    radiusPx: 10,
    bg: "rgba(0,0,0,0.28)",
    border: "rgba(255,255,255,0.08)",
  },

  // small outline for contrast on bright footage
  outline: {
    enabled: true,
    px: 2,
    color: "rgba(0,0,0,0.85)",
  },

  // no fancy motion in firehose
  animation: "none",
  platformAccentMode: "bar",
  maxMessageWidthPx: 0,

  // the whole point
  limits: {
    maxMessages: 14,
    fadeMs: 5200,
  },

  // keep smoothing high so it doesn't spam-render
  smoothing: {
    enabled: true,
    rateLimitPerSec: 20,
    dedupeEnabled: true,
    dedupeWindowMs: 2000,
  },
}

  },
];
