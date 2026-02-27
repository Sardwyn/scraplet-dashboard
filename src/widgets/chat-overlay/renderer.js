// src/widgets/chat-overlay/renderer.js
import { CHAT_OVERLAY_DEFAULTS } from "./defaults.js";
import fs from "fs";
import path from "path";

const ICON_DIR = path.join(process.cwd(), "src/widgets/chat-overlay/icons");

function loadIcon(name) {
  try {
    return fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), "utf8");
  } catch {
    return null;
  }
}

const PLATFORM_ICONS_SERVER = {
  kick: loadIcon("kick"),
  youtube: loadIcon("youtube"),
  twitch: loadIcon("twitch"),
  rumble: loadIcon("rumble"),
  discord: loadIcon("discord"),
  tiktok: loadIcon("tiktok"),
};

/* ---------------- utils ---------------- */

function clampInt(n, min, max, fallback) {
  const x = Number.parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(x, min), max);
}

function clampFloat(n, min, max, fallback) {
  const x = Number.parseFloat(String(n ?? ""));
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(x, min), max);
}

const truthy = (v) => {
  if (Array.isArray(v)) v = v.length ? v[v.length - 1] : "";
  if (v === true) return true;
  const s = String(v ?? "").toLowerCase().trim();
  return s === "1" || s === "true" || s === "on" || s === "yes";
};

function safeFontFamily(v, fallback = "Inter, system-ui, sans-serif") {
  const s = String(v || "").trim();
  if (!s) return fallback;
  const cleaned = s.replace(/[^a-zA-Z0-9\s,\-"'()]/g, "").trim();
  return cleaned || fallback;
}

function safeCssColor(v, fallback) {
  const s = String(v || "").trim();
  if (!s) return fallback;

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;

  if (
    /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*(0(\.\d+)?|1(\.0+)?))?\s*\)$/.test(
      s
    )
  )
    return s;

  if (s === "transparent") return s;
  return fallback;
}

function outlineTextShadow(px, color) {
  const p = Math.max(0, Number(px) || 0);
  if (!p) return "none";
  const c = String(color || "rgba(0,0,0,0.85)");
  const s = [
    `${p}px 0 0 ${c}`,
    `-${p}px 0 0 ${c}`,
    `0 ${p}px 0 ${c}`,
    `0 -${p}px 0 ${c}`,
    `${p}px ${p}px 0 ${c}`,
    `-${p}px ${p}px 0 ${c}`,
    `${p}px -${p}px 0 ${c}`,
    `-${p}px -${p}px 0 ${c}`,
    `0 0 1px ${c}`,
  ];
  return s.join(", ");
}

/* ---------------- defaults merge ---------------- */

function mergeDefaults(cfg) {
  const d = CHAT_OVERLAY_DEFAULTS || {};

  const FALLBACK = {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSizePx: 28,
    lineHeight: 1.25,
    messageGapPx: 10,

    showAvatars: true,
    showPlatformIcon: true,
    shadow: true,

    usernameColorMode: "fixed",
    nameColor: "#ffffff",
    messageColor: "#e8e8e8",

    emoteSizePx: 28,
    hideCommands: true,

    animation: "fade",
    maxMessageWidthPx: 0,

    platformAccentMode: "bar",

    // Transform (pseudo-3D / scene mapping)
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
    layoutOrientation: "vertical", // "vertical" | "horizontal"
    horizontalMode: "ticker", // "ticker" | "carousel"
    stripHeightPx: 240,
    tickerPps: 140,
    tickerGapPx: 12,
    carouselHoldMs: 3500,

    bubble: {
      enabled: true,
      radiusPx: 14,
      bg: "rgba(0,0,0,0.55)",
      border: "rgba(255,255,255,0.12)",
    },

    limits: {
      maxMessages: 6,
      fadeMs: 9000,
    },

    pinned: {
      enabled: false,
      text: "",
      style: "bubble",
    },

    smoothing: {
      enabled: true,
      rateLimitPerSec: 12,
      dedupeEnabled: true,
      dedupeWindowMs: 2500,
    },

    outline: {
      enabled: false,
      px: 3,
      color: "rgba(0,0,0,0.85)",
    },

    bufferMax: 120,
  };

  const dd = {
    ...FALLBACK,
    ...d,
    bubble: { ...FALLBACK.bubble, ...(d.bubble || {}) },
    limits: { ...FALLBACK.limits, ...(d.limits || {}) },
    pinned: { ...FALLBACK.pinned, ...(d.pinned || {}) },
    smoothing: { ...FALLBACK.smoothing, ...(d.smoothing || {}) },
    outline: { ...FALLBACK.outline, ...(d.outline || {}) },
    transform: { ...FALLBACK.transform, ...(d.transform || {}) },
  };

  const merged = {
    ...dd,
    ...(cfg || {}),
    bubble: { ...dd.bubble, ...((cfg && cfg.bubble) || {}) },
    limits: { ...dd.limits, ...((cfg && cfg.limits) || {}) },
    pinned: { ...dd.pinned, ...((cfg && cfg.pinned) || {}) },
    smoothing: { ...dd.smoothing, ...((cfg && cfg.smoothing) || {}) },
    outline: { ...dd.outline, ...((cfg && cfg.outline) || {}) },
    transform: { ...dd.transform, ...((cfg && cfg.transform) || {}) },
  };

  merged.fontFamily = safeFontFamily(merged.fontFamily, dd.fontFamily);
  merged.fontSizePx = clampInt(merged.fontSizePx, 10, 64, dd.fontSizePx);
  merged.lineHeight = clampFloat(merged.lineHeight, 0.9, 2.0, dd.lineHeight);
  merged.messageGapPx = clampInt(merged.messageGapPx, 0, 48, dd.messageGapPx);

  merged.showAvatars = merged.showAvatars !== false;
  merged.showPlatformIcon = merged.showPlatformIcon !== false;
  merged.shadow = merged.shadow !== false;

  merged.usernameColorMode =
    merged.usernameColorMode === "hash" ? "hash" : "fixed";
  merged.nameColor = safeCssColor(merged.nameColor, dd.nameColor);
  merged.messageColor = safeCssColor(merged.messageColor, dd.messageColor);

  merged.emoteSizePx = clampInt(merged.emoteSizePx, 16, 64, dd.emoteSizePx);
  merged.hideCommands = merged.hideCommands !== false;

  merged.animation = ["fade", "slide", "none"].includes(String(merged.animation))
    ? String(merged.animation)
    : dd.animation;

  merged.maxMessageWidthPx = clampInt(
    merged.maxMessageWidthPx,
    0,
    1200,
    dd.maxMessageWidthPx
  );

  // platformAccentMode validation
  {
    const pam = String(merged.platformAccentMode || "").toLowerCase().trim();
    if (pam === "none") merged.platformAccentMode = "off"; // legacy alias
    else if (["off", "bar", "dot"].includes(pam)) merged.platformAccentMode = pam;
    else merged.platformAccentMode = dd.platformAccentMode;
  }

  // Layout validation
  merged.layoutOrientation =
    String(merged.layoutOrientation) === "horizontal" ? "horizontal" : "vertical";
  merged.horizontalMode = ["ticker", "carousel"].includes(String(merged.horizontalMode))
    ? String(merged.horizontalMode)
    : dd.horizontalMode;

  merged.carouselHoldMs = clampInt(merged.carouselHoldMs, 800, 20000, dd.carouselHoldMs);

  // Transform validation
  merged.transform = merged.transform || {};
  merged.transform.enabled = truthy(merged.transform.enabled);
  merged.transform.perspectivePx = clampInt(
    merged.transform.perspectivePx,
    200,
    4000,
    (dd.transform && dd.transform.perspectivePx) || 1000
  );
  merged.transform.x = clampInt(
    merged.transform.x,
    -4000,
    4000,
    (dd.transform && dd.transform.x) || 0
  );
  merged.transform.y = clampInt(
    merged.transform.y,
    -4000,
    4000,
    (dd.transform && dd.transform.y) || 0
  );
  merged.transform.scale = clampFloat(
    merged.transform.scale,
    0.1,
    3.0,
    (dd.transform && dd.transform.scale) || 1
  );
  merged.transform.rotateZ = clampFloat(
    merged.transform.rotateZ,
    -180,
    180,
    (dd.transform && dd.transform.rotateZ) || 0
  );
  merged.transform.tiltX = clampFloat(
    merged.transform.tiltX,
    -45,
    45,
    (dd.transform && dd.transform.tiltX) || 0
  );
  merged.transform.tiltY = clampFloat(
    merged.transform.tiltY,
    -45,
    45,
    (dd.transform && dd.transform.tiltY) || 0
  );

  merged.stripHeightPx = clampInt(merged.stripHeightPx, 60, 1200, dd.stripHeightPx);
  merged.tickerPps = clampInt(merged.tickerPps, 30, 900, dd.tickerPps);
  merged.tickerGapPx = clampInt(merged.tickerGapPx, 0, 80, dd.tickerGapPx);
  merged.tickerOneAtATime = merged.tickerOneAtATime !== false;

  merged.bubble.enabled = merged.bubble.enabled !== false;
  merged.bubble.radiusPx = clampInt(
    merged.bubble.radiusPx,
    0,
    48,
    dd.bubble.radiusPx
  );
  merged.bubble.bg = safeCssColor(merged.bubble.bg, dd.bubble.bg);
  merged.bubble.border = safeCssColor(merged.bubble.border, dd.bubble.border);

  merged.limits.maxMessages = clampInt(
    merged.limits.maxMessages,
    1,
    30,
    dd.limits.maxMessages
  );
  merged.limits.fadeMs = clampInt(
    merged.limits.fadeMs,
    1500,
    60000,
    dd.limits.fadeMs
  );

  merged.pinned.enabled = truthy(merged.pinned.enabled);
  merged.pinned.text = String(merged.pinned.text || "").slice(0, 200);
  merged.pinned.style = ["bubble", "plain"].includes(String(merged.pinned.style))
    ? String(merged.pinned.style)
    : dd.pinned.style;

  merged.smoothing.enabled = merged.smoothing.enabled !== false;
  merged.smoothing.rateLimitPerSec = clampInt(
    merged.smoothing.rateLimitPerSec,
    1,
    60,
    dd.smoothing.rateLimitPerSec
  );
  merged.smoothing.dedupeEnabled = merged.smoothing.dedupeEnabled !== false;
  merged.smoothing.dedupeWindowMs = clampInt(
    merged.smoothing.dedupeWindowMs,
    250,
    20000,
    dd.smoothing.dedupeWindowMs
  );

  merged.bufferMax = clampInt(merged.bufferMax, 30, 500, dd.bufferMax);

  merged.outline.enabled = truthy(merged.outline.enabled);
  merged.outline.px = clampInt(merged.outline.px, 0, 8, dd.outline.px);
  merged.outline.color = safeCssColor(merged.outline.color, dd.outline.color);

  return merged;
}

/* ---------------- main ---------------- */

export function renderChatOverlayPage({ publicId, widget }) {
  const cfg = mergeDefaults(widget?.config_json || {});
  const iconsForClient = PLATFORM_ICONS_SERVER;

  const clientCfg = {
    fontFamily: cfg.fontFamily,
    fontSizePx: cfg.fontSizePx,
    lineHeight: cfg.lineHeight,
    messageGapPx: cfg.messageGapPx,

    showAvatars: cfg.showAvatars,
    showPlatformIcon: cfg.showPlatformIcon,
    shadow: cfg.shadow,

    usernameColorMode: cfg.usernameColorMode,
    nameColor: cfg.nameColor,
    messageColor: cfg.messageColor,

    emoteSizePx: cfg.emoteSizePx,
    hideCommands: cfg.hideCommands,

    animation: cfg.animation,
    maxMessageWidthPx: cfg.maxMessageWidthPx,
    platformAccentMode: cfg.platformAccentMode,

    transform: {
      enabled: !!(cfg.transform && cfg.transform.enabled),
      perspectivePx: (cfg.transform && cfg.transform.perspectivePx) || 1000,
      x: (cfg.transform && cfg.transform.x) || 0,
      y: (cfg.transform && cfg.transform.y) || 0,
      scale: (cfg.transform && cfg.transform.scale) || 1,
      rotateZ: (cfg.transform && cfg.transform.rotateZ) || 0,
      tiltX: (cfg.transform && cfg.transform.tiltX) || 0,
      tiltY: (cfg.transform && cfg.transform.tiltY) || 0,
    },

    // Layout / Ticker
    layoutOrientation: cfg.layoutOrientation,
    horizontalMode: cfg.horizontalMode,
    stripHeightPx: cfg.stripHeightPx,
    tickerPps: cfg.tickerPps,
    tickerGapPx: cfg.tickerGapPx,
    tickerOneAtATime: cfg.tickerOneAtATime,
    carouselHoldMs: cfg.carouselHoldMs,

    pinned: {
      enabled: cfg.pinned.enabled,
      text: cfg.pinned.text,
      style: cfg.pinned.style,
    },

    smoothing: {
      enabled: cfg.smoothing.enabled,
      rateLimitPerSec: cfg.smoothing.rateLimitPerSec,
      dedupeEnabled: cfg.smoothing.dedupeEnabled,
      dedupeWindowMs: cfg.smoothing.dedupeWindowMs,
    },

    bubble: {
      enabled: cfg.bubble.enabled,
      bg: cfg.bubble.bg,
      radiusPx: cfg.bubble.radiusPx,
      border: cfg.bubble.border,
    },

    limits: {
      maxMessages: cfg.limits.maxMessages,
      fadeMs: cfg.limits.fadeMs,
    },

    outline: {
      enabled: cfg.outline.enabled,
      px: cfg.outline.px,
      color: cfg.outline.color,
    },
  };

  const animClass =
    cfg.animation === "slide"
      ? "anim-slide"
      : cfg.animation === "none"
      ? "anim-none"
      : "anim-fade";

  const outlineShadow =
    cfg.outline && cfg.outline.enabled && cfg.outline.px > 0
      ? outlineTextShadow(cfg.outline.px, cfg.outline.color)
      : "none";

  const bodyFontCss = cfg.fontFamily ? `font-family:${cfg.fontFamily};` : "";

  const bubbleMaxW =
    cfg.maxMessageWidthPx && cfg.maxMessageWidthPx > 0
      ? `max-width:${cfg.maxMessageWidthPx}px;`
      : "";

  const layoutClass =
    cfg.layoutOrientation === "horizontal" &&
    ["ticker", "carousel"].includes(String(cfg.horizontalMode))
      ? "layout-horizontal layout-ticker"
      : "layout-vertical";

  const tfEnabled = !!(cfg.transform && cfg.transform.enabled);

  const layoutVars = [
    `--strip-h:${(cfg.stripHeightPx || 240)}px`,
    `--ticker-pps:${Number(cfg.tickerPps || 140)}`,
    `--ticker-gap:${(cfg.tickerGapPx ?? 12)}px`,
    `--tf-persp:${(cfg.transform && cfg.transform.perspectivePx) ? cfg.transform.perspectivePx : 1000}px`,
    `--tf-x:${(cfg.transform && cfg.transform.x) ? cfg.transform.x : 0}px`,
    `--tf-y:${(cfg.transform && cfg.transform.y) ? cfg.transform.y : 0}px`,
    `--tf-s:${(cfg.transform && cfg.transform.scale) ? cfg.transform.scale : 1}`,
    `--tf-rz:${(cfg.transform && cfg.transform.rotateZ) ? cfg.transform.rotateZ : 0}deg`,
    `--tf-rx:${(cfg.transform && cfg.transform.tiltX) ? cfg.transform.tiltX : 0}deg`,
    `--tf-ry:${(cfg.transform && cfg.transform.tiltY) ? cfg.transform.tiltY : 0}deg`,
  ].join(";");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scraplet Chat Overlay</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@400;600&family=Archivo:wght@400;600&family=Barlow:wght@400;600&family=Bebas+Neue&family=Press+Start+2P&display=swap" rel="stylesheet">

<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
body{${bodyFontCss}}

body.tf-on #wrap{
  transform-origin: 0 0;
  transform:
    perspective(var(--tf-persp, 1000px))
    translate3d(var(--tf-x, 0px), var(--tf-y, 0px), 0)
    rotateZ(var(--tf-rz, 0deg))
    rotateX(var(--tf-rx, 0deg))
    rotateY(var(--tf-ry, 0deg))
    scale(var(--tf-s, 1));
}

#wrap{
  position:absolute;
  inset:0;
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  padding:18px;
}

/* Pinned is OUTSIDE the message flow */
#pinned-layer{
  flex:0 0 auto;
  width:min(900px,100%);
  margin-bottom:${cfg.messageGapPx}px;
}

/* Messages get remaining space and still bottom-align */
#list{
  flex:1 1 auto;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
  gap:${cfg.messageGapPx}px;
  width:min(900px,100%);
}

/* Platform icon container */
.plat{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color: currentColor;
  line-height: 1;
}
.plat svg{
  width: 18px;
  height: 18px;
  display:block;
}
.plat-fallback{
  font-weight:700;
  font-size: 12px;
}

.pinned{
  display:none;
  color:${cfg.messageColor};
  font-size:${cfg.fontSizePx}px;
  line-height:${cfg.lineHeight};
  text-shadow:${outlineShadow};
  ${bubbleMaxW}
}
.pinned.show{display:block}
.pinned.plain{padding:0;border:none;background:transparent;box-shadow:none;backdrop-filter:none;}
.pinned.bubble{padding:0;border-radius:0;background:transparent;border:none;box-shadow:none;backdrop-filter:none;}
.pinned.bubble.on{
  padding:10px 14px;border-radius:${cfg.bubble.radiusPx}px;
  background:${cfg.bubble.bg};
  border:1px solid ${cfg.bubble.border};
  box-shadow:${cfg.shadow ? "0 10px 30px rgba(0,0,0,.35)" : "none"};
  backdrop-filter:blur(8px);
}

.msg{display:flex;gap:10px;align-items:center;opacity:0;will-change:opacity,transform}
.anim-fade.msg{transform:translateY(10px);transition:opacity 220ms,transform 220ms}
.anim-slide.msg{transform:translateX(-12px);transition:opacity 220ms,transform 220ms}
.anim-none.msg{transition:none}
.msg.show{opacity:1;transform:none}

.avatar{width:36px;height:36px;border-radius:999px;object-fit:cover;display:${cfg.showAvatars ? "block" : "none"}}

.bubble{
  padding:0;border-radius:0;background:transparent;border:none;box-shadow:none;backdrop-filter:none;
  ${bubbleMaxW}
  position:relative;
}
.bubble.on{
  padding:10px 14px;
  border-radius:${cfg.bubble.radiusPx}px;
  background:${cfg.bubble.bg};
  border:1px solid ${cfg.bubble.border};
  box-shadow:${cfg.shadow ? "0 10px 30px rgba(0,0,0,.35)" : "none"};
  backdrop-filter:blur(8px);
}

.accent-bar{position:absolute;left:-6px;top:10px;bottom:10px;width:4px;border-radius:999px;opacity:.95}
.accent-dot{position:absolute;left:-10px;top:16px;width:8px;height:8px;border-radius:999px;opacity:.95}

.top{display:flex;gap:10px;align-items:baseline}
.name{font-weight:600;font-size:${cfg.fontSizePx}px;line-height:1.1;text-shadow:${outlineShadow}}
.text{color:${cfg.messageColor};font-size:${cfg.fontSizePx}px;line-height:${cfg.lineHeight};white-space:pre-wrap;text-shadow:${outlineShadow}}
.plat{font-size:14px;opacity:.9;display:${cfg.showPlatformIcon ? "block" : "none"};text-shadow:${outlineShadow}}

.dup{font-size:13px;line-height:1;opacity:.9;margin-left:8px;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18)}
.dup.pulse{animation:dupPulse 220ms ease-out 1}
@keyframes dupPulse{0%{transform:scale(1)}40%{transform:scale(1.14)}100%{transform:scale(1)}}
.msg.bump{animation:rowBump 220ms ease-out 1}
@keyframes rowBump{0%{transform:translateY(0)}40%{transform:translateY(-2px)}100%{transform:translateY(0)}}

/* ---------------- ticker layout ---------------- */
#ticker-viewport{ display:none; }

.layout-ticker #wrap{
  position:absolute;
  inset:0;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  padding:0;
}

.layout-ticker #pinned-layer{ display:none; }
.layout-ticker #list{ display:none; }

.layout-ticker #ticker-viewport{
  display:block;
  width:100%;
  height:min(var(--strip-h, 240px), 100vh);
  box-sizing:border-box;
  overflow:hidden;
  padding: clamp(8px, 1vw, 16px);
  position: relative;
}

.layout-ticker .avatar{ width:28px; height:28px; }

.ticker-item{
  position:absolute;
  left:0;
  top:50%;
  transform: translate(0px, -50%);
  display:inline-flex;
  align-items:center;
  gap: var(--ticker-gap, 12px);
  white-space: nowrap;
  pointer-events:none;
  will-change: transform;
}

.layout-ticker .ticker-name{
  font-weight:800;
  font-size:${cfg.fontSizePx}px;
  line-height:1.1;
  text-shadow:${outlineShadow};
}
.layout-ticker .ticker-sep{
  opacity:0.7;
  margin: 0 2px;
  text-shadow:${outlineShadow};
}
.layout-ticker .ticker-text{
  color:${cfg.messageColor};
  font-size:${cfg.fontSizePx}px;
  line-height:${cfg.lineHeight};
  text-shadow:${outlineShadow};
}

/* ---------------- ticker edge fade ---------------- */
.layout-ticker #ticker-viewport{
  --edge-fade: 6%;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black var(--edge-fade),
    black calc(100% - var(--edge-fade)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black var(--edge-fade),
    black calc(100% - var(--edge-fade)),
    transparent 100%
  );
}

/* Fallback for browsers without mask support */
.layout-ticker #ticker-viewport::before,
.layout-ticker #ticker-viewport::after{
  content:"";
  position:absolute;
  top:0;
  bottom:0;
  width:48px;
  pointer-events:none;
  z-index:5;
}

.layout-ticker #ticker-viewport::before{
  left:0;
  background: linear-gradient(
    to right,
    rgba(0,0,0,0.75),
    rgba(0,0,0,0)
  );
}

.layout-ticker #ticker-viewport::after{
  right:0;
  background: linear-gradient(
    to left,
    rgba(0,0,0,0.75),
    rgba(0,0,0,0)
  );
}

/* carousel item animates in/out (not continuous scroll) */
.carousel-enter{
  transition: transform 260ms ease-out, opacity 260ms ease-out;
}
.carousel-exit{
  transition: transform 260ms ease-in, opacity 260ms ease-in;
}
</style>
</head>

<body class="${layoutClass}${tfEnabled ? " tf-on" : ""}" style="${layoutVars}">
<div id="wrap">
  <div id="pinned-layer">
    <div id="pinned" class="pinned"></div>
  </div>

  <div id="ticker-viewport"></div>

  <div id="list"></div>
</div>

<script>
const publicId = ${JSON.stringify(String(publicId))};
const cfg = ${JSON.stringify(clientCfg)};
const PLATFORM_ICONS = ${JSON.stringify(iconsForClient)};
const OUTLINE_SHADOW = ${JSON.stringify(outlineShadow)};

let since = 0;

const list = document.getElementById("list");
const pinnedEl = document.getElementById("pinned");
const tickerViewport = document.getElementById("ticker-viewport");

const horizontalMode = (cfg && cfg.layoutOrientation === "horizontal") ? String(cfg.horizontalMode || "ticker") : "vertical";
const isTicker = (horizontalMode === "ticker");
const isCarousel = (horizontalMode === "carousel");

let queue = [];
let draining = false;
let drainTimer = null;

let lastRow = null;
let lastSig = "";
let lastSigTs = 0;
let lastCount = 0;
let lastFadeTimer = null;

const MAX_QUEUE = 250;

/* ticker queue */
let tickerQueue = [];
let tickerRunning = false;

function platformLabel(p){
  const s = String(p || "").toLowerCase();
  if (s === "kick") return "K";
  if (s === "youtube") return "YT";
  if (s === "twitch") return "TW";
  if (s === "rumble") return "RU";
  if (s === "discord") return "DC";
  if (s === "tiktok") return "TT";
  return s ? s.slice(0, 3).toUpperCase() : "";
}

function platformIconHTML(platform){
  const p = String(platform || "").toLowerCase();
  if (PLATFORM_ICONS && PLATFORM_ICONS[p]) return PLATFORM_ICONS[p];
  return '<span class="plat-fallback">' + platformLabel(p) + '</span>';
}

function platformColor(p){
  const s = String(p || "").toLowerCase();
  if (s === "kick") return "#39FF14";
  if (s === "youtube") return "#FF0033";
  if (s === "twitch") return "#9146FF";
  if (s === "rumble") return "#85C742";
  if (s === "discord") return "#5865F2";
  if (s === "tiktok") return "#00F2EA";
  return "#FFFFFF";
}

/* hash coloring lives INSIDE the client script (no template injection) */
function hashToHue(str){
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
function hashedNameColor(username){
  const hue = hashToHue(username);
  return "hsl(" + hue + " 90% 72%)";
}
function getUserName(m){
  const dn = (m && m.display_name != null) ? String(m.display_name).trim() : "";
  if(dn) return dn;

  const un = (m && m.username != null) ? String(m.username).trim() : "";
  if(un) return un;

  const u = (m && m.user) ? m.user : null;
  const n = (u && u.name != null) ? String(u.name).trim() : "";
  if(n) return n;

  return "unknown";
}

function getUserAvatar(m){
  const av = (m && m.avatar_url != null) ? String(m.avatar_url).trim() : "";
  if(av) return av;

  const u = (m && m.user) ? m.user : null;
  const a = (u && u.avatar != null) ? String(u.avatar).trim() : "";
  if(a) return a;

  return "";
}


function getUserName(m){
  const dn = (m && m.display_name != null) ? String(m.display_name).trim() : "";
  if(dn) return dn;
  const un = (m && m.username != null) ? String(m.username).trim() : "";
  if(un) return un;
  const u = (m && m.user) ? m.user : null;
  const n = (u && u.name != null) ? String(u.name).trim() : "";
  if(n) return n;
  return "unknown";
}

function getUserAvatar(m){
  const av = (m && m.avatar_url != null) ? String(m.avatar_url).trim() : "";
  if(av) return av;
  const u = (m && m.user) ? m.user : null;
  const a = (u && u.avatar != null) ? String(u.avatar).trim() : "";
  if(a) return a;
  return "";
}


function getUserName(m){
  const dn = (m && m.display_name != null) ? String(m.display_name).trim() : "";
  if(dn) return dn;
  const un = (m && m.username != null) ? String(m.username).trim() : "";
  if(un) return un;
  const u = (m && m.user) ? m.user : null;
  const n = (u && u.name != null) ? String(u.name).trim() : "";
  if(n) return n;
  return "unknown";
}

function getUserAvatar(m){
  const av = (m && m.avatar_url != null) ? String(m.avatar_url).trim() : "";
  if(av) return av;
  const u = (m && m.user) ? m.user : null;
  const a = (u && u.avatar != null) ? String(u.avatar).trim() : "";
  if(a) return a;
  return "";
}


function resetLastDedupe(){
  lastRow = null; lastSig = ""; lastSigTs = 0; lastCount = 0;
  if(lastFadeTimer) clearTimeout(lastFadeTimer);
  lastFadeTimer = null;
}

function signatureFor(m){
  const p = (m && m.platform) ? String(m.platform) : "";
  const u = getUserName(m);
  const t = (m && m.text) ? String(m.text) : "";
  return p + "|" + u + "|" + t;
}

function renderPinned(){
  if(!cfg.pinned || !cfg.pinned.enabled || !cfg.pinned.text){
    pinnedEl.className = "pinned";
    pinnedEl.textContent = "";
    return;
  }
  pinnedEl.textContent = cfg.pinned.text;
  const st = (cfg.pinned && cfg.pinned.style) ? cfg.pinned.style : "bubble";
  if(st === "plain"){
    pinnedEl.className = "pinned show plain";
    return;
  }
  pinnedEl.className = "pinned show bubble" + (cfg.bubble && cfg.bubble.enabled ? " on" : "");
}

function updateDupBadge(row, count){
  if(!row) return;
  const nameEl = row.querySelector(".name");
  if(!nameEl) return;

  let badge = row.querySelector(".dup");
  if(!badge){
    badge = document.createElement("span");
    badge.className = "dup";
    nameEl.appendChild(badge);
  }
  badge.textContent = "x" + String(count);
  badge.classList.remove("pulse"); void badge.offsetWidth; badge.classList.add("pulse");
  row.classList.add("bump"); setTimeout(() => row.classList.remove("bump"), 240);
}

function renderTextWithEmotes(container, textRaw){
  const t = String(textRaw || "");
  if(!t){ container.textContent = ""; return; }
  const parts = t.split(/(:[a-zA-Z0-9_]+:)/g);
  for(const part of parts){
    const m = part.match(/^:([a-zA-Z0-9_]+):$/);
    if(m){
      const code = m[1];
      const img = document.createElement("img");
      img.alt = code;
      img.style.width = cfg.emoteSizePx + "px";
      img.style.height = cfg.emoteSizePx + "px";
      img.style.verticalAlign = "middle";
      img.style.margin = "0 2px";
      img.src = "/assets/emotes/" + encodeURIComponent(code) + ".png";
      img.onerror = function(){ img.remove(); };
      container.appendChild(img);
    }else{
      container.appendChild(document.createTextNode(part));
    }
  }
}

function setAvatarImg(img, avatarUrl){
  const url = String(avatarUrl || "").trim();
  if(url){
    img.src = url;
    img.onerror = function(){
      img.onerror = null;
      img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    };
    return;
  }
  img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
}

/* ---------------- ticker rendering ---------------- */

function enqueueTicker(m){
  tickerQueue.push(m);
  if(!tickerRunning) runNextHorizontal();
}

function renderTickerItem(m){
  const row = document.createElement("div");
  row.className = "ticker-item";

  const textRaw = String(m && m.text ? m.text : "");
  const p = (m && m.platform) ? String(m.platform) : "";
  const c = platformColor(p);

  if(cfg.showPlatformIcon){
    const plat = document.createElement("div");
    plat.className = "plat";
    plat.style.color = c;
    plat.innerHTML = platformIconHTML(p);
    row.appendChild(plat);
  }

  if(cfg.showAvatars){
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    setAvatarImg(avatar, getUserAvatar(m));
    row.appendChild(avatar);
  }

  const uname = getUserName(m);

  const name = document.createElement("span");
  name.className = "ticker-name";
  name.textContent = uname;
  name.style.color = (cfg.usernameColorMode === "hash") ? hashedNameColor(uname) : cfg.nameColor;

  const sep = document.createElement("span");
  sep.className = "ticker-sep";
  sep.textContent = ":";

  const text = document.createElement("span");
  text.className = "ticker-text";
  renderTextWithEmotes(text, textRaw);

  row.appendChild(name);
  row.appendChild(sep);
  row.appendChild(text);

  // Optional bubble treatment in ticker mode
  if(cfg.bubble && cfg.bubble.enabled){
    row.style.padding = "10px 14px";
    row.style.borderRadius = (cfg.bubble.radiusPx || 16) + "px";
    row.style.background = cfg.bubble.bg;
    row.style.border = "1px solid " + cfg.bubble.border;
    row.style.boxShadow = (cfg.shadow ? "0 10px 30px rgba(0,0,0,.35)" : "none");
    row.style.backdropFilter = "blur(8px)";
  }

  // Outline
  if(OUTLINE_SHADOW && OUTLINE_SHADOW !== "none"){
    row.style.textShadow = OUTLINE_SHADOW;
  }

  row.style.color = cfg.messageColor;
  return row;
}

function runNextHorizontal(){
  if(!tickerViewport){ tickerRunning = false; return; }
  const m = tickerQueue.shift();
  if(!m){ tickerRunning = false; return; }
  tickerRunning = true;

  const textRaw = String(m && m.text ? m.text : "");
  if(cfg.hideCommands && textRaw.startsWith("!")){
    runNextHorizontal();
    return;
  }

  const item = renderTickerItem(m);
  tickerViewport.appendChild(item);

  const viewportW = tickerViewport.clientWidth;
  const itemW = item.getBoundingClientRect().width;

  // --- Carousel mode ---
  if(isCarousel){
    const holdMs = Math.max(800, Number(cfg.carouselHoldMs) || 3500);

    const startX = viewportW + 20;
    const midX = Math.max(20, Math.floor((viewportW - itemW) / 2));
    const exitX = -itemW - 20;

    item.classList.add("carousel-enter");
    item.style.opacity = "0";
    item.style.transform = "translate(" + startX + "px, -50%)";

    item.getBoundingClientRect();
    item.style.opacity = "1";
    item.style.transform = "translate(" + midX + "px, -50%)";

    let finished = false;

    function cleanup(){
      if(finished) return;
      finished = true;
      clearTimeout(holdTimer);
      clearTimeout(safetyTimer);
      item.removeEventListener("transitionend", onExitEnd);
      if(item.isConnected) item.remove();
      runNextHorizontal();
    }

    const holdTimer = setTimeout(() => {
      item.classList.remove("carousel-enter");
      item.classList.add("carousel-exit");
      item.style.opacity = "0";
      item.style.transform = "translate(" + exitX + "px, -50%)";
      item.addEventListener("transitionend", onExitEnd);
    }, holdMs);

    function onExitEnd(){ cleanup(); }

    const safetyTimer = setTimeout(cleanup, holdMs + 2000);
    return;
  }

  // --- Ticker mode (continuous scroll) ---
  const pps = Number(getComputedStyle(document.body).getPropertyValue("--ticker-pps")) || 140;
  const startX = viewportW + 20;
  const endX = -itemW - 20;
  const distance = startX - endX;
  const durationMs = Math.max(2500, Math.round((distance / pps) * 1000));

  item.style.transform = "translate(" + startX + "px, -50%)";
  item.getBoundingClientRect();
  item.style.transition = "transform " + durationMs + "ms linear";
  item.style.transform = "translate(" + endX + "px, -50%)";

  let finished = false;

  function done(){
    if (finished) return;
    finished = true;

    clearTimeout(safetyTimer);
    item.removeEventListener("transitionend", onEnd);

    if(item.isConnected) item.remove();
    runNextHorizontal();
  }

  function onEnd(){ done(); }

  const safetyTimer = setTimeout(done, durationMs + 250);
  item.addEventListener("transitionend", onEnd);
}

/* ---------------- main flow ---------------- */

function enqueueRender(m){
  if(isTicker || isCarousel){
    enqueueTicker(m);
    return;
  }

  if(!cfg.smoothing || !cfg.smoothing.enabled){
    renderMessageNow(m);
    return;
  }
  queue.push(m);
  if(queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  startDrainLoop();
}

function renderMessageNow(m){
  const textRaw = String(m && m.text ? m.text : "");
  if(cfg.hideCommands && textRaw.startsWith("!")) return;

  const now = Date.now();
  if(cfg.smoothing && cfg.smoothing.enabled && cfg.smoothing.dedupeEnabled){
    const sig = signatureFor(m);
    const win = Math.max(250, Number(cfg.smoothing.dedupeWindowMs) || 2500);

    if(lastRow && sig === lastSig && (now - lastSigTs) <= win){
      lastSigTs = now; lastCount += 1;
      updateDupBadge(lastRow, lastCount);

      if(lastFadeTimer) clearTimeout(lastFadeTimer);
      lastFadeTimer = setTimeout(function(){
        lastRow.classList.remove("show");
        setTimeout(function(){ if(lastRow) lastRow.remove(); }, 260);
        resetLastDedupe();
      }, cfg.limits.fadeMs);
      return;
    }

    resetLastDedupe();
    lastSig = sig; lastSigTs = now;
  }

  const row = document.createElement("div");
  row.className = "msg ${animClass}";

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  setAvatarImg(avatar, getUserAvatar(m));

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (cfg.bubble && cfg.bubble.enabled ? " on" : "");

  const p = (m && m.platform) ? String(m.platform) : "";
  const c = platformColor(p);

  if(cfg.platformAccentMode === "bar"){
    const bar = document.createElement("div");
    bar.className = "accent-bar";
    bar.style.background = c;
    bubble.appendChild(bar);
  } else if(cfg.platformAccentMode === "dot"){
    const dot = document.createElement("div");
    dot.className = "accent-dot";
    dot.style.background = c;
    bubble.appendChild(dot);
  }

  const top = document.createElement("div");
  top.className = "top";

  const plat = document.createElement("div");
  plat.className = "plat";
  plat.style.color = c;
  plat.innerHTML = platformIconHTML(p);

  const name = document.createElement("div");
  name.className = "name";
  const uname = getUserName(m);
  name.textContent = uname;
  name.style.color = (cfg.usernameColorMode === "hash") ? hashedNameColor(uname) : cfg.nameColor;

  top.appendChild(plat);
  top.appendChild(name);

  const text = document.createElement("div");
  text.className = "text";
  renderTextWithEmotes(text, textRaw);

  bubble.appendChild(top);
  bubble.appendChild(text);

  row.appendChild(avatar);
  row.appendChild(bubble);

  list.appendChild(row);

  const maxOnScreen = (cfg.limits && cfg.limits.maxMessages ? cfg.limits.maxMessages : 6);
  while(list.children.length > maxOnScreen){
    const first = list.firstElementChild;
    if(first) list.removeChild(first);
  }

  requestAnimationFrame(function(){ row.classList.add("show"); });

  const fadeTimer = setTimeout(function(){
    row.classList.remove("show");
    setTimeout(function(){ row.remove(); }, 260);
    if(row === lastRow) resetLastDedupe();
  }, cfg.limits.fadeMs);

  if(cfg.smoothing && cfg.smoothing.enabled && cfg.smoothing.dedupeEnabled){
    lastRow = row; lastCount = 1; lastFadeTimer = fadeTimer;
  }
}

function drainIntervalMs(){
  if(!cfg.smoothing || !cfg.smoothing.enabled) return 0;
  const r = Math.max(1, Number(cfg.smoothing.rateLimitPerSec) || 12);
  const ms = Math.floor(1000 / r);
  return Math.max(50, ms);
}

function startDrainLoop(){
  if(draining) return;
  draining = true;

  const stepMs = drainIntervalMs();
  if(stepMs <= 0){ draining = false; return; }

  function step(){
    if(!cfg.smoothing || !cfg.smoothing.enabled){
      draining = false; drainTimer = null;
      while(queue.length) renderMessageNow(queue.shift());
      return;
    }

    const m = queue.shift();
    if(m) renderMessageNow(m);

    if(queue.length){
      drainTimer = setTimeout(step, stepMs);
    }else{
      drainTimer = null; draining = false;
    }
  }

  drainTimer = setTimeout(step, stepMs);
}

async function tick(){
  try{
    const r = await fetch("/api/obs/chat/" + encodeURIComponent(publicId) + "/poll?since=" + since, { cache:"no-store" });
    const j = await r.json();
    if(j && j.ok){
      since = j.seq || since;
      const items = j.items || [];
      for(let i=0;i<items.length;i++) enqueueRender(items[i]);
    }
  }catch(e){}
  setTimeout(tick, 350);
}

if(!isTicker){
  renderPinned();
}
tick();
</script>
</body>
</html>`;
}
