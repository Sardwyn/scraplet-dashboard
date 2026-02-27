// src/widgets/plinko/renderer.js

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mergeDeep(base, over) {
  const out = { ...(base || {}) };
  const o = over || {};
  for (const k of Object.keys(o)) {
    const bv = out[k];
    const ov = o[k];
    const bothObjects =
      bv && typeof bv === "object" && !Array.isArray(bv) &&
      ov && typeof ov === "object" && !Array.isArray(ov);

    out[k] = bothObjects ? mergeDeep(bv, ov) : ov;
  }
  return out;
}

function normalizeThemeId(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "casino";
  if (s === "neon" || s === "neonarcade" || s === "neon_arcade" || s === "neon-arcade") return "neon-arcade";
  if (s === "pulp" || s === "scraplet" || s === "scrapletpulp" || s === "scraplet_pulp") return "scraplet-pulp";
  return s;
}

export function renderPlinkoOverlayPage({ publicId, widget }) {
  const cfg = (widget && widget.config_json) ? widget.config_json : {};
  const visuals = cfg.visuals || {};
  const gameplay = cfg.gameplay || {};
  const narration = cfg.narration || {};

  const themeId = normalizeThemeId(visuals.theme);

  // ===== THEME PRESETS =====
  // These are DEFAULTS. Saved config can override via config.visuals.skin and config.visuals.ball.
  const THEME_PRESETS = {
    "casino": {
      backdropBg: "rgba(0,0,0,0.55)",
      backdropBorder: "rgba(255,255,255,0.12)",
      skin: {
        boardBgImage: "",
        pattern: "none", // "none" | "hazard"
        frameColor: "#FFFFFF",
        frameAlpha: 0.14,
        panelFill: "#000000",
        panelAlpha: 0.12,
        pegColor: "#FFFFFF",
        pegAlpha: 0.26,
        slotStrokeColor: "#FFFFFF",
        slotStrokeAlpha: 0.16,
        slotFillColor: "#FFFFFF",
        slotFillAlpha: 0.08,
        slotWinColor: "#7CFFB2",
        slotWinAlpha: 0.35
      },
      ball: {
        imageUrl: "",
        size: 18,
        fit: "contain",     // contain|cover
        mask: "circle",     // circle|rounded|none
        pad: 0.10,          // 0..0.40
        curveMin: 10,
        curveMax: 20,
        controlLift: 0.55,
        xLag: 0.92,
        yEase: "inQuad",
        spinMin: 0.04,
        spinMax: 0.09,
        rimAlpha: 0.18,
        highlightAlpha: 0.18,
        laneOffsets: [0, -6, 6, -12, 12]
      }
    },

    "neon-arcade": {
      backdropBg: "rgba(3,6,18,0.62)",
      backdropBorder: "rgba(128,210,255,0.20)",
      skin: {
        boardBgImage: "",
        pattern: "none",
        frameColor: "#76D6FF",
        frameAlpha: 0.26,
        panelFill: "#060816",
        panelAlpha: 0.22,
        pegColor: "#B8FFEA",
        pegAlpha: 0.40,
        slotStrokeColor: "#76D6FF",
        slotStrokeAlpha: 0.28,
        slotFillColor: "#9A7CFF",
        slotFillAlpha: 0.10,
        slotWinColor: "#FF4FD8",
        slotWinAlpha: 0.48
      },
      ball: {
        imageUrl: "",
        size: 18,
        fit: "contain",
        mask: "circle",
        pad: 0.10,
        curveMin: 11,
        curveMax: 22,
        controlLift: 0.58,
        xLag: 0.90,
        yEase: "inCubic",
        spinMin: 0.05,
        spinMax: 0.11,
        rimAlpha: 0.12,
        highlightAlpha: 0.22,
        laneOffsets: [0, -5, 5, -10, 10]
      }
    },

    // Stronger Scraplet “pulp / studio controller” vibe:
    // - higher contrast
    // - hazard-ish slot area treatment
    // - warmer win glow
    "scraplet-pulp": {
      backdropBg: "rgba(0,0,0,0.62)",
      backdropBorder: "rgba(255,255,255,0.14)",
      skin: {
        boardBgImage: "",
        pattern: "hazard",
        frameColor: "#FFE08A",
        frameAlpha: 0.30,
        panelFill: "#05060a",
        panelAlpha: 0.28,
        pegColor: "#FFFFFF",
        pegAlpha: 0.46,
        slotStrokeColor: "#FFE08A",
        slotStrokeAlpha: 0.34,
        slotFillColor: "#FFE08A",
        slotFillAlpha: 0.10,
        slotWinColor: "#FFB020",
        slotWinAlpha: 0.62
      },
      ball: {
        imageUrl: "",
        size: 18,
        fit: "contain",
        mask: "circle",
        pad: 0.10,
        curveMin: 10,
        curveMax: 24,
        controlLift: 0.60,
        xLag: 0.90,
        yEase: "inQuad",
        spinMin: 0.05,
        spinMax: 0.12,
        rimAlpha: 0.16,
        highlightAlpha: 0.20,
        laneOffsets: [0, -6, 6, -12, 12]
      }
    }
  };

  const preset = THEME_PRESETS[themeId] || THEME_PRESETS["casino"];

  const skinOverrides = visuals.skin || {};
  const ballOverrides = visuals.ball || {};

  const activeSkin = mergeDeep(preset.skin, skinOverrides);
  const activeBall = mergeDeep(preset.ball, ballOverrides);

  // stage/board sizing (leave your current behavior)
  const stageW = Number(visuals.stageW !== undefined ? visuals.stageW : 1280);
  const stageH = Number(visuals.stageH !== undefined ? visuals.stageH : 720);
  const boardW = Number(visuals.boardW !== undefined ? visuals.boardW : 980);
  const boardH = Number(visuals.boardH !== undefined ? visuals.boardH : 520);
  const uiScale = Number(visuals.uiScale !== undefined ? visuals.uiScale : 1);

  // gameplay
  const rows = Number(gameplay.rows !== undefined ? gameplay.rows : 10) || 10;
  const multipliers = Array.isArray(gameplay.multipliers) ? gameplay.multipliers.slice(0, rows + 1) : [];

  const perRowMs = Number(gameplay.perRowMs !== undefined ? gameplay.perRowMs : 260);
  const padMs = Number(gameplay.padMs !== undefined ? gameplay.padMs : 900);
  const cooldownMs = Number(gameplay.cooldownMs !== undefined ? gameplay.cooldownMs : 8000);
  const maxConcurrentBalls = Number(gameplay.maxConcurrentBalls !== undefined ? gameplay.maxConcurrentBalls : 3);

  const title = visuals && visuals.title ? String(visuals.title) : "Plinko";
  const showBrand = visuals && visuals.showBrand !== undefined ? !!visuals.showBrand : true;

  const backdropBg = (visuals.backdrop && visuals.backdrop.bg) ? visuals.backdrop.bg : preset.backdropBg;
  const backdropBorder = (visuals.backdrop && visuals.backdrop.border) ? visuals.backdrop.border : preset.backdropBorder;

  // ball
  const ballImageUrl = activeBall.imageUrl ? String(activeBall.imageUrl) : "";
  const ballSizeRequested = Number(activeBall.size !== undefined ? activeBall.size : 18);

  const ballFit = String(activeBall.fit !== undefined ? activeBall.fit : "contain").trim().toLowerCase();
  const ballMask = String(activeBall.mask !== undefined ? activeBall.mask : "circle").trim().toLowerCase();
  let ballPad = Number(activeBall.pad !== undefined ? activeBall.pad : 0.10);
  if (!isFinite(ballPad)) ballPad = 0.10;
  if (ballPad < 0) ballPad = 0;
  if (ballPad > 0.40) ballPad = 0.40;

  const curveMin = Number(activeBall.curveMin !== undefined ? activeBall.curveMin : 10);
  const curveMax = Number(activeBall.curveMax !== undefined ? activeBall.curveMax : 20);
  const controlLift = Number(activeBall.controlLift !== undefined ? activeBall.controlLift : 0.55);
  const xLag = Number(activeBall.xLag !== undefined ? activeBall.xLag : 0.92);
  const yEase = String(activeBall.yEase !== undefined ? activeBall.yEase : "inQuad");
  const spinMin = Number(activeBall.spinMin !== undefined ? activeBall.spinMin : 0.04);
  const spinMax = Number(activeBall.spinMax !== undefined ? activeBall.spinMax : 0.09);
  const rimAlpha = Number(activeBall.rimAlpha !== undefined ? activeBall.rimAlpha : 0.18);
  const highlightAlpha = Number(activeBall.highlightAlpha !== undefined ? activeBall.highlightAlpha : 0.18);
  const laneOffsets = Array.isArray(activeBall.laneOffsets) ? activeBall.laneOffsets : [0, -6, 6, -12, 12];

  // skin
  const skinBoardBgImage = activeSkin.boardBgImage ? String(activeSkin.boardBgImage) : "";
  const skinPattern = activeSkin.pattern ? String(activeSkin.pattern) : "none";
  const skinFrameColor = activeSkin.frameColor ? String(activeSkin.frameColor) : "#ffffff";
  const skinFrameAlpha = Number(activeSkin.frameAlpha !== undefined ? activeSkin.frameAlpha : 0.14);
  const skinPanelFill = activeSkin.panelFill ? String(activeSkin.panelFill) : "#000000";
  const skinPanelAlpha = Number(activeSkin.panelAlpha !== undefined ? activeSkin.panelAlpha : 0.12);
  const skinPegColor = activeSkin.pegColor ? String(activeSkin.pegColor) : "#ffffff";
  const skinPegAlpha = Number(activeSkin.pegAlpha !== undefined ? activeSkin.pegAlpha : 0.26);
  const skinSlotStrokeColor = activeSkin.slotStrokeColor ? String(activeSkin.slotStrokeColor) : "#ffffff";
  const skinSlotStrokeAlpha = Number(activeSkin.slotStrokeAlpha !== undefined ? activeSkin.slotStrokeAlpha : 0.16);
  const skinSlotFillColor = activeSkin.slotFillColor ? String(activeSkin.slotFillColor) : "#ffffff";
  const skinSlotFillAlpha = Number(activeSkin.slotFillAlpha !== undefined ? activeSkin.slotFillAlpha : 0.08);
  const skinSlotWinColor = activeSkin.slotWinColor ? String(activeSkin.slotWinColor) : "#7CFFB2";
  const skinSlotWinAlpha = Number(activeSkin.slotWinAlpha !== undefined ? activeSkin.slotWinAlpha : 0.35);

  // SFX (standardize to visuals.sfx)
  const sfxCfg = visuals && visuals.sfx ? visuals.sfx : {};
  const sfxEnabled = sfxCfg && sfxCfg.enabled !== undefined ? !!sfxCfg.enabled : true;
  const sfxVolume = Number(sfxCfg && sfxCfg.volume !== undefined ? sfxCfg.volume : 0.35);

  const bigWinMultiplier = Number((narration && narration.bigWinMultiplier !== undefined) ? narration.bigWinMultiplier : 2) || 2;
  const slowMoFactor = Number(sfxCfg && sfxCfg.slowMoFactor !== undefined ? sfxCfg.slowMoFactor : 1.45);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Scraplet • Plinko</title>

  <script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>

  <style>
    :root{
      --stage-w: ${stageW}px;
      --stage-h: ${stageH}px;
      --board-w: ${boardW}px;
      --board-h: ${boardH}px;
      --ui-scale: ${uiScale};
    }
    html, body { height:100%; }
    body{
      margin:0;
      overflow:hidden;
      color:#fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background:
        radial-gradient(1200px 600px at 50% 25%, rgba(20,40,120,0.35), rgba(0,0,0,0) 55%),
        radial-gradient(900px 500px at 65% 55%, rgba(255,160,40,0.08), rgba(0,0,0,0) 60%),
        #05060a;
    }
    #stage{
      width: var(--stage-w);
      height: var(--stage-h);
      position: relative;
      transform-origin: top left;
    }
    #boardHost{
      position:absolute;
      left: 50%;
      top: 54%;
      width: var(--board-w);
      height: var(--board-h);
      transform: translate(-50%, -50%);
    }
    #ui{
      position:absolute;
      left: 28px;
      top: 22px;
      transform: scale(var(--ui-scale));
      transform-origin: top left;
      width: 420px;
      background: ${backdropBg};
      border: 1px solid ${backdropBorder};
      border-radius: 14px;
      padding: 12px 12px 10px;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 34px rgba(0,0,0,0.28);
      opacity: 0;
      pointer-events:none;
    }
    #ui.visible { opacity: 1; pointer-events:auto; }
    .top {
      display:flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      opacity: 0.95;
    }
    .title { font-weight: 900; letter-spacing: 0.2px; font-size: 18px; }
    .meta {
      display:flex; gap:10px; align-items:center;
      font-weight: 800;
      font-size: 12px;
      opacity: 0.9;
    }
    .pill{
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.16);
    }
    .row{
      display:flex;
      gap: 10px;
      align-items:center;
      justify-content: space-between;
      font-size: 12px;
      opacity: 0.9;
    }
    .brand{
      font-weight: 900;
      letter-spacing: .2px;
      opacity: 0.8;
      font-size: 12px;
    }
    #result{
      margin-top: 8px;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .2px;
      opacity: 0.95;
      text-shadow: 0 2px 0 rgba(0,0,0,0.35);
      min-height: 18px;
    }

    /* Debug hidden unless ?debug=1 */
    #debugWrap { display:none; }
    body.debug #debugWrap { display:block; }
  </style>
</head>
<body>
<div id="stage">
  <div id="boardHost"></div>

  <div id="ui">
    <div class="top">
      <div class="title">${esc(title)}</div>
      <div class="meta">
        <div class="pill" id="ballsPill">Balls: —</div>
        <div class="pill" id="queuePill">Queue: —</div>
      </div>
    </div>
    <div class="row">
      <div class="brand">${showBrand ? "Scraplet" : ""}</div>
      <div class="pill" id="themePill">${esc(themeId)}</div>
    </div>
    <div id="result"></div>
  </div>

  <div id="debugWrap">
    <div id="debugPath"
      style="
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        background:rgba(255,0,0,0.85);
        color:#fff;
        padding:10px 14px;
        border-radius:10px;
        font:14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;
        z-index:9999;
        pointer-events:none;
        white-space:pre;
      ">PATH WAITING…</div>

    <div id="debugHud"
      style="
        position:absolute;
        right: 16px;
        bottom: 12px;
        transform: scale(var(--ui-scale));
        transform-origin: bottom right;
        font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        opacity: 0.80;
        white-space: pre;
        background: rgba(0,0,0,0.35);
        padding: 6px 8px;
        border-radius: 8px;
        z-index: 9998;
        pointer-events:none;
        max-width: 520px;
      "></div>
  </div>
</div>

<script>
(function () {
  var qs = "";
  try { qs = String(window.location.search || ""); } catch (e) {}
  if (qs.indexOf("debug=1") !== -1) {
    try { document.body.classList.add("debug"); } catch (e2) {}
  }

  var debugPathEl = document.getElementById("debugPath");
  var debugHudEl = document.getElementById("debugHud");
  function setDebugPath(txt) { if (debugPathEl) debugPathEl.textContent = txt; }
  function setDebugHud(txt) { if (debugHudEl) debugHudEl.textContent = txt; }
  function fatal(msg) { setDebugPath("FATAL:\\n" + msg); }

  window.addEventListener("error", function (e) {
    setDebugPath("JS ERROR:\\n" + (e && e.message ? e.message : String(e)));
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = (r && r.message) ? r.message : (r ? String(r) : String(e));
    setDebugPath("PROMISE ERROR:\\n" + msg);
  });

  if (!window.PIXI) { fatal("PIXI missing (CDN blocked?)"); return; }

  var publicId = ${JSON.stringify(String(publicId))};

  var BOOT = {
    stageW: ${stageW},
    stageH: ${stageH},
    boardW: ${boardW},
    boardH: ${boardH},
    uiScale: ${uiScale},
    rows: ${rows},
    multipliers: ${JSON.stringify(multipliers)},
    perRowMs: ${perRowMs},
    padMs: ${padMs},
    cooldownMs: ${cooldownMs},
    maxConcurrentBalls: ${maxConcurrentBalls},
    bigWinMultiplier: ${bigWinMultiplier},
    slowMoFactor: ${slowMoFactor},
    skin: {
      boardBgImage: ${JSON.stringify(skinBoardBgImage)},
      pattern: ${JSON.stringify(String(skinPattern || "none"))},
      frameColor: ${JSON.stringify(skinFrameColor)},
      frameAlpha: ${skinFrameAlpha},
      panelFill: ${JSON.stringify(skinPanelFill)},
      panelAlpha: ${skinPanelAlpha},
      pegColor: ${JSON.stringify(skinPegColor)},
      pegAlpha: ${skinPegAlpha},
      slotStrokeColor: ${JSON.stringify(skinSlotStrokeColor)},
      slotStrokeAlpha: ${skinSlotStrokeAlpha},
      slotFillColor: ${JSON.stringify(skinSlotFillColor)},
      slotFillAlpha: ${skinSlotFillAlpha},
      slotWinColor: ${JSON.stringify(skinSlotWinColor)},
      slotWinAlpha: ${skinSlotWinAlpha}
    },
    ball: {
      imageUrl: ${JSON.stringify(ballImageUrl)},
      sizeRequested: ${ballSizeRequested},
      size: ${ballSizeRequested},
      fit: ${JSON.stringify(ballFit)},
      mask: ${JSON.stringify(ballMask)},
      pad: ${ballPad},
      curveMin: ${curveMin},
      curveMax: ${curveMax},
      controlLift: ${controlLift},
      xLag: ${xLag},
      yEase: ${JSON.stringify(yEase)},
      spinMin: ${spinMin},
      spinMax: ${spinMax},
      rimAlpha: ${rimAlpha},
      highlightAlpha: ${highlightAlpha},
      laneOffsets: ${JSON.stringify(laneOffsets)}
    },
    fx: (function(){
      var fx = (${JSON.stringify((cfg.visuals && cfg.visuals.fx) ? cfg.visuals.fx : {})}) || {};
      return {
        pegKick: fx.pegKick !== false,
        ballTrail: fx.ballTrail !== false,
        slotBurst: fx.slotBurst !== false,
        bigWinSlowMo: fx.bigWinSlowMo !== false
      };
    })(),
    sfx: {
      enabled: ${sfxEnabled ? "true" : "false"},
      volume: ${sfxVolume},
      drop: "/sfx/plinko_drop.mp3",
      tick: "/sfx/plinko_tick.mp3",
      settle: "/sfx/plinko_settle.mp3",
      bigwin: "/sfx/plinko_bigwin.mp3"
    }
  };

  var stageEl = document.getElementById("stage");
  var hostEl = document.getElementById("boardHost");
  var uiEl = document.getElementById("ui");
  var ballsPill = document.getElementById("ballsPill");
  var queuePill = document.getElementById("queuePill");
  var resultEl = document.getElementById("result");

  function showPanel() { if (uiEl) uiEl.classList.add("visible"); }
  function hidePanel() { if (uiEl) uiEl.classList.remove("visible"); }

  function scaleStage() {
    var vw = window.innerWidth || BOOT.stageW;
    var vh = window.innerHeight || BOOT.stageH;
    var s = Math.min(vw / BOOT.stageW, vh / BOOT.stageH);
    stageEl.style.transform = "scale(" + s + ")";
  }
  scaleStage();
  window.addEventListener("resize", scaleStage);

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  function inQuad(t) { return t * t; }
  function inCubic(t) { return t * t * t; }
  var yEaseFn = (BOOT.ball.yEase === "incubic" || BOOT.ball.yEase === "inCubic") ? inCubic : inQuad;

  function hash32(str) {
    var s = String(str || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function rand01(seed) {
    var x = (seed >>> 0);
    x ^= (x << 13); x >>>= 0;
    x ^= (x >>> 17); x >>>= 0;
    x ^= (x << 5); x >>>= 0;
    return (x >>> 0) / 4294967295;
  }
  function bez2(p0, c, p1, t) {
    var u = 1 - t;
    return {
      x: (u*u)*p0.x + 2*u*t*c.x + (t*t)*p1.x,
      y: (u*u)*p0.y + 2*u*t*c.y + (t*t)*p1.y
    };
  }
  function isRightStep(v) {
    if (v === 1 || v === true) return true;
    var s = String((v !== undefined && v !== null) ? v : "").trim().toLowerCase();
    return (s === "1" || s === "r" || s === "right" || s === "true");
  }

  // ===== SFX =====
  function makeAudio(url, vol) {
    try {
      var a = new Audio(url);
      a.preload = "auto";
      a.volume = vol;
      return a;
    } catch (e) { return null; }
  }
  var SFX = {
    enabled: !!BOOT.sfx.enabled,
    volume: Number(BOOT.sfx.volume || 0.35),
    drop: null,
    tick: null,
    settle: null,
    bigwin: null,
    lastTickAt: 0
  };
  function sfxInit() {
    if (!SFX.enabled) return;
    SFX.drop = makeAudio(BOOT.sfx.drop, SFX.volume);
    SFX.tick = makeAudio(BOOT.sfx.tick, SFX.volume * 0.65);
    SFX.settle = makeAudio(BOOT.sfx.settle, SFX.volume * 0.85);
    SFX.bigwin = makeAudio(BOOT.sfx.bigwin, SFX.volume);
  }
  function sfxPlay(aud) {
    if (!SFX.enabled || !aud) return;
    try {
      var c = aud.cloneNode(true);
      c.volume = aud.volume;
      c.play().catch(function(){});
    } catch (e) {}
  }
  function sfxTickThrottled() {
    var now = Date.now();
    if (now - SFX.lastTickAt < 55) return;
    SFX.lastTickAt = now;
    sfxPlay(SFX.tick);
  }
  sfxInit();

  // ===== PIXI =====
  var app = new PIXI.Application();
  app.init({
    width: BOOT.boardW,
    height: BOOT.boardH,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: 1,
    powerPreference: "high-performance"
  }).then(function () {
    hostEl.appendChild(app.canvas);

    var root = new PIXI.Container();
    app.stage.addChild(root);

    var bgLayer = new PIXI.Container();
    var boardLayer = new PIXI.Container();
    var fxLayer = new PIXI.Container();
    var ballLayer = new PIXI.Container();
    root.addChild(bgLayer);
    root.addChild(boardLayer);
    root.addChild(fxLayer);
    root.addChild(ballLayer);

    // ===== FX state =====
    var FX = {
      pegKick: !!(BOOT.fx && BOOT.fx.pegKick),
      ballTrail: !!(BOOT.fx && BOOT.fx.ballTrail),
      slotBurst: !!(BOOT.fx && BOOT.fx.slotBurst),

      // trail pool
      trail: [],
      trailMax: 40,
      trailEveryN: 2,
      trailTick: 0,

      // burst particles
      burst: []
    };

    function spawnTrailDot(x, y, r, colorInt) {
      if (!FX.ballTrail) return;

      var g;
      if (FX.trail.length < FX.trailMax) {
        g = new PIXI.Graphics();
        fxLayer.addChild(g);
        FX.trail.push({ g: g, life: 0, ttl: 0 });
      }

      // reuse oldest
      var it = FX.trail.shift();
      g = it.g;
      it.life = 0;
      it.ttl = 220;
      FX.trail.push(it);

      g.clear();
      g.circle(0, 0, r);
      g.fill({ color: colorInt, alpha: 0.12 });
      g.x = x; g.y = y;
      g.alpha = 1;
    }

    function spawnSlotBurst(cx, cy, colorInt) {
      if (!FX.slotBurst) return;
      for (var i = 0; i < 14; i++) {
        var a = (Math.PI * 2) * (i / 14);
        var sp = 2 + Math.random() * 3.2;
        FX.burst.push({
          x: cx, y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (1 + Math.random() * 1.8),
          r: 2 + Math.random() * 3,
          life: 0,
          ttl: 520,
          color: colorInt
        });
      }
    }

    var burstG = new PIXI.Graphics();
    fxLayer.addChild(burstG);

    function tickFx(dtMs) {
      // trail fade
      for (var i = 0; i < FX.trail.length; i++) {
        var t = FX.trail[i];
        t.life += dtMs;
        var k = 1 - Math.min(1, t.life / t.ttl);
        t.g.alpha = k;
      }

      // burst particles
      burstG.clear();
      for (var j = FX.burst.length - 1; j >= 0; j--) {
        var p = FX.burst[j];
        p.life += dtMs;
        if (p.life >= p.ttl) { FX.burst.splice(j,1); continue; }
        p.vy += 0.10; // gravity
        p.x += p.vx;
        p.y += p.vy;

        var kk = 1 - (p.life / p.ttl);
        burstG.circle(p.x, p.y, p.r);
        burstG.fill({ color: p.color, alpha: 0.18 * kk });
      }
    }

    function hexToInt(hex) {
      var h = String(hex || "").trim();
      if (!h) return 0xffffff;
      if (h[0] === "#") h = h.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var n = parseInt(h, 16);
      return isFinite(n) ? n : 0xffffff;
    }

    var skinFrameColorInt = hexToInt(BOOT.skin.frameColor);
    var skinPanelFillInt = hexToInt(BOOT.skin.panelFill);
    var skinPegColorInt = hexToInt(BOOT.skin.pegColor);
    var skinSlotStrokeInt = hexToInt(BOOT.skin.slotStrokeColor);
    var skinSlotFillInt = hexToInt(BOOT.skin.slotFillColor);
    var skinSlotWinInt = hexToInt(BOOT.skin.slotWinColor);

    function applyBoardBg(url) {
      bgLayer.removeChildren();

      // optional image
      if (url) {
        try {
          var tex = PIXI.Texture.from(url);
          var spr = new PIXI.Sprite(tex);
          spr.x = 0; spr.y = 0;
          spr.width = BOOT.boardW;
          spr.height = BOOT.boardH;
          spr.alpha = 0.92;
          bgLayer.addChild(spr);
        } catch (e) {}
      }

      // optional pattern overlay
      if (String(BOOT.skin.pattern || "none").toLowerCase() === "hazard") {
        try {
          var g = new PIXI.Graphics();
          // dark slab behind slots area
          g.roundRect(60, BOOT.boardH - 120, BOOT.boardW - 120, 84, 16);
          g.fill({ color: 0x000000, alpha: 0.25 });

          // diagonal hazard stripes
          var x0 = 60;
          var y0 = BOOT.boardH - 114;
          var w = BOOT.boardW - 120;
          var h = 72;
          var stripeW = 18;
          var gap = 10;

          for (var x = -h; x < w + h; x += (stripeW + gap)) {
            g.moveTo(x0 + x, y0 + h);
            g.lineTo(x0 + x + h, y0);
            g.lineTo(x0 + x + h + stripeW, y0);
            g.lineTo(x0 + x + stripeW, y0 + h);
            g.closePath();
            g.fill({ color: 0xFFE08A, alpha: 0.10 });
          }

          bgLayer.addChild(g);
        } catch (e2) {}
      }
    }

    // Default ball texture (used when no imageUrl)
    function makeDefaultBallTexture() {
      var cnv = document.createElement("canvas");
      cnv.width = 64; cnv.height = 64;
      var ctx = cnv.getContext("2d");

      var g = ctx.createRadialGradient(22, 20, 6, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.50, "rgba(245,245,245,0.92)");
      g.addColorStop(1, "rgba(205,205,205,0.98)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(32, 32, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = BOOT.ball.rimAlpha;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(32, 32, 22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = BOOT.ball.highlightAlpha;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(22, 20, 6, 0, Math.PI * 2);
      ctx.fill();

      return PIXI.Texture.from(cnv);
    }

    var ballTexDefault = makeDefaultBallTexture();
    var ballTexSkinned = null;

    function loadBallSkin(url) {
      ballTexSkinned = null;
      if (!url) return;
      try { ballTexSkinned = PIXI.Texture.from(url); }
      catch (e) { ballTexSkinned = null; }
    }

    // ===== Board model =====
    var board = {
      rows: BOOT.rows,
      multipliers: (BOOT.multipliers || []).slice(0),
      bounds: { x: 80, y: 60, w: BOOT.boardW - 160, h: BOOT.boardH - 60 - 70 },
      pegRadius: 4,
      slotY: 0,
      slotH: 44,
      slotW: 0,
      pegs: [],
      slots: []
    };

    var slotFx = {
      activeIndex: -1,
      t0: 0,
      dur: 650,
      g: new PIXI.Graphics()
    };
    fxLayer.addChild(slotFx.g);

    function computeBoard(rows, multipliers) {
      board.rows = rows;
      board.multipliers = multipliers;
      board.pegs.length = 0;
      board.slots.length = 0;

      var bx = board.bounds.x;
      var by = board.bounds.y;
      var bw = board.bounds.w;
      var bh = board.bounds.h;

      var yStep = bh / (rows + 1);
      var xStep = bw / (rows + 1);

      // auto-fit ball so it doesn't look ridiculous relative to spacing
      var requested = Number(BOOT.ball.sizeRequested || 18);
      var maxFit = Math.max(10, Math.floor(xStep * 0.36));
      BOOT.ball.size = Math.min(requested, maxFit);

      // pegs
      for (var r = 0; r < rows; r++) {
        var y = by + yStep * (r + 1);
        var count = r + 1;
        var rowW = xStep * count;
        var x0 = bx + (bw - rowW) / 2 + xStep / 2;
        for (var c = 0; c < count; c++) {
          var x = x0 + c * xStep;
          board.pegs.push({ x: x, y: y, r: r, c: c });
        }
      }

      // slots
      board.slotW = bw / (rows + 1);
      board.slotH = 46;
      board.slotY = by + bh + 10;

      for (var i = 0; i < rows + 1; i++) {
        var sx = bx + i * board.slotW;
        var mv = (multipliers && multipliers[i] !== undefined) ? multipliers[i] : 0;
        var m = Number(mv) || 0;
        board.slots.push({ x: sx, y: board.slotY, w: board.slotW, h: board.slotH, i: i, m: m });
      }

      // refresh background / pattern now that sizes are known
      applyBoardBg(BOOT.skin.boardBgImage);
    }

    function drawBoard() {
      boardLayer.removeChildren();

      var g = new PIXI.Graphics();
      var bx = board.bounds.x;
      var by = board.bounds.y;
      var bw = board.bounds.w;
      var bh = board.bounds.h;

      // frame/panel
      g.roundRect(bx - 14, by - 18, bw + 28, bh + 98, 18);
      g.stroke({ width: 2, color: skinFrameColorInt, alpha: BOOT.skin.frameAlpha });
      g.fill({ color: skinPanelFillInt, alpha: BOOT.skin.panelAlpha });

      // pegs
      for (var pi = 0; pi < board.pegs.length; pi++) {
        var p = board.pegs[pi];
        g.circle(p.x, p.y, board.pegRadius);
        g.fill({ color: skinPegColorInt, alpha: BOOT.skin.pegAlpha });
      }

      // slots
      for (var si = 0; si < board.slots.length; si++) {
        var s = board.slots[si];
        g.roundRect(s.x + 3, s.y, s.w - 6, s.h, 12);
        g.stroke({ width: 1, color: skinSlotStrokeInt, alpha: BOOT.skin.slotStrokeAlpha });
        g.fill({ color: skinSlotFillInt, alpha: BOOT.skin.slotFillAlpha });
      }

      boardLayer.addChild(g);

      // slot labels
      var labels = new PIXI.Container();
      for (var li = 0; li < board.slots.length; li++) {
        var sl = board.slots[li];
        var nm = Number(sl.m);
        var txt = (nm % 1 === 0) ? (nm.toFixed(0) + "x") : (nm.toFixed(1) + "x");

        var t = new PIXI.Text({
          text: txt,
          style: {
            fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            fontSize: 16,
            fill: 0xffffff,
            fontWeight: "800",
            dropShadow: true,
            dropShadowAlpha: 0.50,
            dropShadowDistance: 2
          }
        });
        t.anchor.set(0.5);
        t.x = sl.x + sl.w / 2;
        t.y = sl.y + sl.h / 2 + 1;
        labels.addChild(t);
      }
      boardLayer.addChild(labels);
    }

    function ensureBoard(rows, multipliers) {
      computeBoard(rows, multipliers);
      drawBoard();
    }

    // init theme + ball
    loadBallSkin(BOOT.ball.imageUrl);
    ensureBoard(board.rows, board.multipliers);

    // ===== Ball pool (sprite + optional mask) =====
    var ballPool = [];

    function applyBallPresentation(ballCont, sprite, tex, diameter) {
      // Reset any old mask
      if (ballCont.__maskG) {
        try {
          if (ballCont.__maskG.parent) ballCont.__maskG.parent.removeChild(ballCont.__maskG);
        } catch (e) {}
        ballCont.__maskG = null;
      }
      sprite.mask = null;

      // Default: round ball texture uses old scaling logic
      var isSkinned = !!(BOOT.ball.imageUrl && tex && tex !== ballTexDefault);
      if (!isSkinned) {
        var scaleDefault = diameter / 44;
        sprite.scale.set(scaleDefault, scaleDefault);
        sprite.rotation = 0;
        return;
      }

      // For imageUrl "item balls": fit/mask/pad
      var pad = Number(BOOT.ball.pad || 0);
      if (!isFinite(pad)) pad = 0.10;
      if (pad < 0) pad = 0;
      if (pad > 0.40) pad = 0.40;

      var inner = diameter * (1 - pad * 2);
      if (inner < 2) inner = diameter;

      // If texture size unknown yet, pick a sane fallback and fix later
      var tw = 0, th = 0;
      try {
        tw = tex.width || 0;
        th = tex.height || 0;
      } catch (e2) { tw = 0; th = 0; }

      if (!(tw > 0 && th > 0)) {
        sprite.scale.set((inner / 64), (inner / 64));
      } else {
        var fit = String(BOOT.ball.fit || "contain").toLowerCase();
        var denom = (fit === "cover") ? Math.min(tw, th) : Math.max(tw, th);
        if (denom <= 0) denom = Math.max(tw, th) || 64;
        var s = inner / denom;
        sprite.scale.set(s, s);
      }

      // Mask
      var m = String(BOOT.ball.mask || "circle").toLowerCase();
      if (m !== "none") {
        var g = new PIXI.Graphics();
        if (m === "rounded") {
          var rr = Math.max(4, Math.floor(diameter * 0.22));
          g.roundRect(-diameter / 2, -diameter / 2, diameter, diameter, rr);
        } else {
          g.circle(0, 0, diameter / 2);
        }
        g.fill({ color: 0xffffff, alpha: 1 });

        ballCont.addChild(g);
        sprite.mask = g;
        ballCont.__maskG = g;
      }
    }

    function acquireBall() {
      var c = ballPool.pop();
      if (!c) {
        c = new PIXI.Container();
        var spr = new PIXI.Sprite(ballTexSkinned || ballTexDefault);
        spr.anchor.set(0.5, 0.5);
        c.addChild(spr);
        c.__sprite = spr;
        c.__maskG = null;
      }
      c.__sprite.texture = (ballTexSkinned || ballTexDefault);
      c.visible = true;

      var d = Math.max(10, Number(BOOT.ball.size || 18));
      applyBallPresentation(c, c.__sprite, c.__sprite.texture, d);

      return c;
    }

    function releaseBall(ballCont) {
      if (!ballCont) return;
      ballCont.visible = false;
      if (ballCont.__sprite) ballCont.__sprite.rotation = 0;
      if (ballCont.parent) ballCont.parent.removeChild(ballCont);
      ballPool.push(ballCont);
    }

    function makeControlPoint(p0, p1, dirBias, curveMag) {
      var mx = (p0.x + p1.x) / 2;
      var my = (p0.y + p1.y) / 2;

      var soften = Math.min(1, (p1.y - board.bounds.y) / 120);
      var side = dirBias * soften * (0.12 + rand01((curveMag * 1000) | 0) * 0.14);

      return { x: mx + side * curveMag, y: my - curveMag * BOOT.ball.controlLift };
    }

    var balls = new Map();

    function buildPoints(pathBits, seedInt) {
      var pts = [];

      var bx = board.bounds.x;
      var by = board.bounds.y;
      var bw = board.bounds.w;
      var bh = board.bounds.h;

      var rows = board.rows;
      var yStep = bh / (rows + 1);
      var xStep = bw / (rows + 1);

      var x = bx + bw / 2;
      pts.push({ x: x, y: by - 10 });

      var rights = 0;
      for (var r = 0; r < rows; r++) {
        var stepRight = isRightStep(pathBits && pathBits[r]);
        if (stepRight) rights++;

        var jitter = (rand01((seedInt ^ ((r + 1) * 9187)) >>> 0) - 0.5) * xStep * 0.08;
        x += (stepRight ? +0.5 : -0.5) * xStep + jitter;

        var y = by + yStep * (r + 1);
        pts.push({ x: x, y: y });
      }

      var slotIndex = rights;
      if (slotIndex < 0) slotIndex = 0;
      if (slotIndex > board.slots.length - 1) slotIndex = board.slots.length - 1;

      var slot = board.slots[slotIndex];
      pts.push({ x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 });

      return { pts: pts, slotIndex: slotIndex, rights: rights };
    }

    function postFinished(roundId) {
      return fetch("/api/obs/plinko/" + encodeURIComponent(publicId) + "/finished", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: roundId }),
        cache: "no-store"
      }).catch(function () {});
    }

    function startSlotPulse(slotIndex) {
      slotFx.activeIndex = slotIndex;
      slotFx.t0 = performance.now();
    }

    function drawSlotPulse(now) {
      slotFx.g.clear();
      if (slotFx.activeIndex < 0) return;

      var t = (now - slotFx.t0) / slotFx.dur;
      if (t >= 1) {
        slotFx.activeIndex = -1;
        slotFx.g.scale.set(1,1);
        slotFx.g.pivot.set(0,0);
        slotFx.g.position.set(0,0);
        return;
      }

      var k = 1 - (1 - t) * (1 - t);
      var alpha = (1 - t) * BOOT.skin.slotWinAlpha;
      var grow = 1 + k * 0.12;

      var sl = board.slots[slotFx.activeIndex];
      if (!sl) return;

      var cx = sl.x + sl.w / 2;
      var cy = sl.y + sl.h / 2;

      slotFx.g.roundRect(sl.x + 2, sl.y - 2, sl.w - 4, sl.h + 4, 14);
      slotFx.g.fill({ color: skinSlotWinInt, alpha: alpha });

      slotFx.g.roundRect(sl.x + 1, sl.y - 3, sl.w - 2, sl.h + 6, 16);
      slotFx.g.stroke({ width: 2, color: skinSlotWinInt, alpha: alpha * 0.9 });

      slotFx.g.scale.set(grow, grow);
      slotFx.g.pivot.set(cx, cy);
      slotFx.g.position.set(cx, cy);
    }

    function spawnBall(ev) {
      var roundId = String(ev && ev.roundId ? ev.roundId : "");
      if (!roundId) return;
      if (balls.has(roundId)) return;

      var seedStr = (ev && ev.seed !== undefined) ? ev.seed : (publicId + ":" + roundId);
      var seedInt = hash32(seedStr);

      var laneRaw = (ev && ev.laneIndex !== undefined) ? ev.laneIndex : 0;
      var lane = Number(laneRaw) || 0;

      var offsets = BOOT.ball.laneOffsets || [0];
      var laneOffset = offsets.length ? (offsets[Math.abs(lane) % offsets.length] || 0) : 0;

      var path = (ev && Array.isArray(ev.path)) ? ev.path : [];
      var built = buildPoints(path, seedInt);

      // ensure ball skin is current (if config changes live)
      loadBallSkin(BOOT.ball.imageUrl);

      var spriteCont = acquireBall();
      spriteCont.x = built.pts[0].x + laneOffset;
      spriteCont.y = built.pts[0].y;

      var pts2 = [];
      for (var i = 0; i < built.pts.length; i++) {
        pts2.push({ x: built.pts[i].x + laneOffset, y: built.pts[i].y });
      }

      ballLayer.addChild(spriteCont);

      var curveMag = BOOT.ball.curveMin + rand01(seedInt ^ 0xC0FFEE) * (BOOT.ball.curveMax - BOOT.ball.curveMin);
      var spin = (BOOT.ball.spinMin + rand01(seedInt ^ 0xBADA55) * (BOOT.ball.spinMax - BOOT.ball.spinMin));
      spin = spin * (rand01(seedInt ^ 0x123456) < 0.5 ? -1 : 1);

      var mult = Number(ev && ev.multiplier !== undefined ? ev.multiplier : 0) || 0;
      var isBig = (mult >= BOOT.bigWinMultiplier);

      var dur = (pts2.length - 1) * BOOT.perRowMs + BOOT.padMs;
      if (isBig && BOOT.fx && BOOT.fx.bigWinSlowMo !== false) dur = dur * BOOT.slowMoFactor;

      balls.set(roundId, {
        roundId: roundId,
        seedInt: seedInt,
        cont: spriteCont,
        sprite: spriteCont.__sprite,
        points: pts2,
        slotIndex: built.slotIndex,
        rights: built.rights,
        t0: performance.now(),
        dur: dur,
        curveMag: curveMag,
        spin: spin,
        settled: false,
        settleAt: 0,
        lastSeg: -1,
        isBig: isBig,
        kick: 0,
        kickDir: 0
      });

      sfxPlay(SFX.drop);
    }

    function stepBall(ball, now) {
      var tt = clamp01((now - ball.t0) / ball.dur);
      var pts = ball.points;
      var segs = pts.length - 1;
      if (segs <= 0) return;

      var u = tt * segs;
      var i = (u >= segs) ? (segs - 1) : (u < 0 ? 0 : Math.floor(u));
      var f = u - i;

      var p0 = pts[i];
      var p1 = pts[i + 1];

      // compute directional bias BEFORE FX uses it
      var dx = (p1.x - p0.x);
      var dirBias = (dx === 0) ? 0 : (dx > 0 ? 1 : -1);

      if (i !== ball.lastSeg && i > 0 && i < segs) {
        if (FX.pegKick) {
          ball.kick = (ball.kick || 0) + 1;
          ball.kickDir = (dirBias === 0 ? (Math.random() < 0.5 ? -1 : 1) : dirBias);
        }

        if (FX.ballTrail) {
          FX.trailTick++;
          if ((FX.trailTick % FX.trailEveryN) === 0) {
            spawnTrailDot(ball.cont.x, ball.cont.y, Math.max(2, BOOT.ball.size * 0.18), skinSlotWinInt);
          }
        }

        ball.lastSeg = i;
        sfxTickThrottled();
      }

      var fy = yEaseFn(f);
      var fx = easeOutQuad(fy * BOOT.ball.xLag);

      var c = makeControlPoint(p0, p1, dirBias, ball.curveMag);

      var bx = bez2(p0, c, p1, fx);
      var by = bez2(p0, c, p1, fy);

      ball.cont.x = bx.x;
      ball.cont.y = by.y;

      // Kick offset (the missing Step E) — damped micro-bounce
      if (FX.pegKick && ball.kick) {
        ball.kick = ball.kick * 0.82;
        if (ball.kick < 0.03) ball.kick = 0;

        var amt = ball.kick * 2.2;
        var sx = (ball.kickDir || 1) * amt;
        var sy = -amt * 0.55;

        ball.cont.x += sx;
        ball.cont.y += sy;
      }

      var wob = Math.sin((i + f) * 2.6) * 0.02;
      ball.sprite.rotation += (ball.spin + wob);

      if (!ball.settled && tt >= 1) {
        ball.settled = true;
        ball.settleAt = now;

        startSlotPulse(ball.slotIndex);

        // slot burst
        if (FX.slotBurst) {
          var sl = board.slots[ball.slotIndex];
          if (sl) spawnSlotBurst(sl.x + sl.w/2, sl.y + sl.h/2, skinSlotWinInt);
        }

        sfxPlay(SFX.settle);
        if (ball.isBig) sfxPlay(SFX.bigwin);

        postFinished(ball.roundId);
      }

      if (ball.settled && (now - ball.settleAt) > 900) {
        releaseBall(ball.cont);
        balls.delete(ball.roundId);
      }
    }

    app.ticker.add(function () {
      var now = performance.now();
      var dt = (app && app.ticker && app.ticker.deltaMS) ? app.ticker.deltaMS : 16;

      balls.forEach(function (ball) { stepBall(ball, now); });
      drawSlotPulse(now);
      tickFx(dt);
    });

    // ===== POLL LOOP =====
    var since = 0;
    var lastPollOkAt = 0;
    var lastEventType = "";
    var lastEventSeq = 0;

    function updateHud(state) {
      var inFlight = (state && Array.isArray(state.inFlight)) ? state.inFlight : [];
      var qlen = Number((state && state.queueLength !== undefined) ? state.queueLength : 0) || 0;

      ballsPill.textContent = "Balls: " + inFlight.length + "/" + BOOT.maxConcurrentBalls;
      queuePill.textContent = "Queue: " + qlen;

      var idle = (inFlight.length === 0 && qlen === 0 && balls.size === 0);
      if (idle) hidePanel(); else showPanel();

      var ago = lastPollOkAt ? (Date.now() - lastPollOkAt) : null;
      setDebugHud(
        "poll: " + (ago == null ? "—" : (ago + "ms ago")) +
        " • last: " + (lastEventType || "—") +
        " #" + (lastEventSeq || 0) +
        " • localBalls: " + balls.size
      );
    }

    function handleEvent(ev) {
      if (!ev || !ev.type) return;

      lastEventType = ev.type;
      lastEventSeq = ev.seq || lastEventSeq;

      if (ev.type === "PLINKO_ROUND_START") {
        spawnBall(ev);

        var p = Array.isArray(ev.path) ? ev.path : [];
        var rights = 0;
        for (var k = 0; k < p.length; k++) rights += (isRightStep(p[k]) ? 1 : 0);

        var laneShown = (ev.laneIndex !== undefined) ? ev.laneIndex : "—";
        var seedShown = (ev.seed !== undefined) ? ev.seed : "—";

        setDebugPath(
          "PATH = " + JSON.stringify(p) +
          "\\nRIGHTS = " + rights + " / ROWS = " + BOOT.rows +
          "\\nLANE = " + laneShown +
          "\\nSEED = " + seedShown
        );
        return;
      }

      if (ev.type === "PLINKO_ROUND_SETTLED") {
        var mult = Number(ev.multiplier);
        var mtxt = (mult % 1 === 0) ? (mult.toFixed(0) + "x") : (mult.toFixed(1) + "x");
        var payout = (ev.payoutAmount !== undefined) ? ev.payoutAmount : 0;
        var who = ev.playerName ? ev.playerName : "Player";
        resultEl.textContent = who + " " + mtxt + " +" + payout;
        return;
      }
    }

    function poll() {
      var url = "/api/obs/plinko/" + encodeURIComponent(publicId) + "/poll?since=" + since;

      fetch(url, { method: "GET", cache: "no-store" })
        .then(function (r) {
          return r.text().then(function (text) { return { ok: r.ok, status: r.status, text: text }; });
        })
        .then(function (rt) {
          if (!rt.ok) throw new Error("HTTP " + rt.status + " " + rt.text.slice(0, 180));

          var data;
          try { data = JSON.parse(rt.text); }
          catch (e) { throw new Error("Bad JSON: " + rt.text.slice(0, 180)); }

          if (!data.ok) throw new Error(data.error || "poll_failed");

          lastPollOkAt = Date.now();
          since = data.seq || since;

          // If config is returned, update gameplay live
          if (data.config && data.config.gameplay) {
            var gp = data.config.gameplay || {};
            var rr = Number((gp && gp.rows !== undefined) ? gp.rows : board.rows) || board.rows;
            var mults = Array.isArray(gp.multipliers) ? gp.multipliers.slice(0, rr + 1) : board.multipliers;
            ensureBoard(rr, mults);
            BOOT.rows = rr;
          }

          if (Array.isArray(data.events)) {
            for (var i = 0; i < data.events.length; i++) handleEvent(data.events[i]);
          }

          updateHud(data.state || {});
        })
        .catch(function (e) {
          showPanel();
          setDebugHud(
            "POLL FAILED\\n" +
            "url: " + url + "\\n" +
            "err: " + (e && e.message ? e.message : String(e))
          );
        })
        .finally(function () { setTimeout(poll, 350); });
    }

    showPanel();
    poll();
  }).catch(function (e) {
    fatal(e && e.message ? e.message : String(e));
  });
})();
</script>
</body>
</html>`;
}
