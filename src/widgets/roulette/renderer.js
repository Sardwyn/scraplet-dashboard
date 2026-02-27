// src/widgets/roulette/renderer.js
function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderRouletteOverlayPage({ publicId, widget }) {
  const cfg = widget?.config_json || {};
  const ingestKey = String(widget?.ingest_key || "");

  const visuals = cfg.visuals || {};
  const wheelCfg = visuals.wheel || {};
  const stageW = Number(visuals.stageW ?? 1280);
  const stageH = Number(visuals.stageH ?? 720);
  const uiScale = Number(visuals.uiScale ?? 1);
  const cornerRadius = Number(visuals.cornerRadius ?? 18);

  const backdropEnabled = visuals?.backdrop?.enabled !== false;
  const backdropBg = visuals?.backdrop?.bg || "rgba(0,0,0,0.55)";
  const backdropBorder = visuals?.backdrop?.border || "rgba(255,255,255,0.12)";

  const wheelSize = Number(wheelCfg.size ?? 460);
  const ringThickness = Number(wheelCfg.ringThickness ?? 54);
  const spinMsMin = Number(wheelCfg.spinMsMin ?? 2800);
  const spinMsMax = Number(wheelCfg.spinMsMax ?? 4200);
  const turnsMin = Number(wheelCfg.turnsMin ?? 7);
  const turnsMax = Number(wheelCfg.turnsMax ?? 12);
  const ballRadius = Number(wheelCfg.ballRadius ?? 9);
  const ballOrbit = Number(wheelCfg.ballOrbit ?? 210);
  const tickAlpha = Number(wheelCfg.tickAlpha ?? 0.22);

  // Ball motion tuning (safe defaults; can be config’d later)
  const ballFriction = Number(wheelCfg.ballFriction ?? 0.992); // slowdown
  const ballJitter = Number(wheelCfg.ballJitter ?? 0.015); // random wobble
  const radialSpring = Number(wheelCfg.radialSpring ?? 0.02); // orbit spring
  const radialDamp = Number(wheelCfg.radialDamp ?? 0.9); // radial damping
  const radialClampOut = Number(wheelCfg.radialClampOut ?? 8);
  const radialClampIn = Number(wheelCfg.radialClampIn ?? 28);
  const settlePocketInset = Number(wheelCfg.settlePocketInset ?? 22);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Scraplet • Roulette</title>

  <script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>

  <style>
    :root{
      --stage-w:${stageW}px;
      --stage-h:${stageH}px;
      --ui-scale:${uiScale};
      --radius:${cornerRadius}px;
      --panel-bg:${esc(backdropBg)};
      --panel-border:${esc(backdropBorder)};
      --text:#fff;
    }

    html,body{ width:100%; height:100%; margin:0; overflow:hidden; background:transparent;
      font-family:${esc(visuals?.fontFamily || "Inter")},system-ui,-apple-system,Segoe UI,Roboto,Arial; color:var(--text);
    }

    .wrap{ position:absolute; inset:0; pointer-events:none; }
    .stage{ position:absolute; top:0; left:0; width:var(--stage-w); height:var(--stage-h);
      transform-origin:top left; display:grid; place-items:center;
    }

    .panel{
      width: 760px;
      padding: 18px;
      box-sizing: border-box;
      border-radius: var(--radius);
      ${backdropEnabled ? "background:var(--panel-bg);" : "background:transparent;"}
      ${backdropEnabled ? "border:1px solid var(--panel-border);" : "border:none;"}
      opacity:0; visibility:hidden;
      transition:opacity 180ms ease, visibility 0s linear 180ms;
    }
    .panel.is-visible{
      opacity:1; visibility:visible;
      transition:opacity 180ms ease;
    }

    .top{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px; opacity:.95; }
    .title{ font-weight:900; letter-spacing:.2px; font-size:18px; }
    .meta{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; font-size:14px; }
    .pill{ padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.06);
      font-variant-numeric:tabular-nums; white-space:nowrap;
    }

    .board{ position:relative; width:720px; height:520px; border-radius:16px; overflow:hidden; isolation:isolate; }
    .board::before{
      content:""; position:absolute; inset:0;
      background: radial-gradient(900px 420px at 30% 10%, rgba(255,255,255,0.08), transparent 55%),
                  radial-gradient(900px 420px at 80% 90%, rgba(255,255,255,0.06), transparent 60%);
      opacity:.9; pointer-events:none; z-index:0;
    }
    #pixiHost{ position:absolute; inset:0; z-index:2; }

    .footer{ margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:14px; opacity:.95; }
    .result{ font-weight:900; letter-spacing:.2px; }
    .debug{ margin-top:6px; font-size:12px; opacity:.65; font-variant-numeric:tabular-nums; }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="stage" id="stage">
      <div class="panel" id="panel">
        <div class="top">
          <div class="title">Roulette</div>
          <div class="meta">
            <div class="pill" id="spinPill">Spin: —</div>
            <div class="pill" id="queuePill">Queue: —</div>
          </div>
        </div>

        <div class="board">
          <div id="pixiHost"></div>
        </div>

        <div class="footer">
          <div style="opacity:.85;">Channel points Roulette</div>
          <div class="result" id="result"></div>
        </div>
        <div class="debug" id="debug"></div>
      </div>
    </div>
  </div>

<script>
(async () => {
  const publicId = ${JSON.stringify(String(publicId))};
  const ingestKey = ${JSON.stringify(ingestKey)};

  const BOOT = {
    stageW: ${stageW},
    stageH: ${stageH},
    uiScale: ${uiScale},
    wheelSize: ${wheelSize},
    ringThickness: ${ringThickness},
    spinMsMin: ${spinMsMin},
    spinMsMax: ${spinMsMax},
    turnsMin: ${turnsMin},
    turnsMax: ${turnsMax},
    ballRadius: ${ballRadius},
    ballOrbit: ${ballOrbit},
    tickAlpha: ${tickAlpha},

    // ball motion tuning
    ballFriction: ${ballFriction},
    ballJitter: ${ballJitter},
    radialSpring: ${radialSpring},
    radialDamp: ${radialDamp},
    radialClampOut: ${radialClampOut},
    radialClampIn: ${radialClampIn},
    settlePocketInset: ${settlePocketInset},
  };

  const stageEl = document.getElementById("stage");
  const panelEl = document.getElementById("panel");
  const hostEl = document.getElementById("pixiHost");
  const spinPill = document.getElementById("spinPill");
  const queuePill = document.getElementById("queuePill");
  const resultEl = document.getElementById("result");
  const debugEl = document.getElementById("debug");

  function showPanel(){ panelEl.classList.add("is-visible"); }
  function hidePanel(){ panelEl.classList.remove("is-visible"); }

  function scaleStage(){
    const vw = document.documentElement.clientWidth || 1;
    const vh = document.documentElement.clientHeight || 1;

    const designW = BOOT.stageW * BOOT.uiScale;
    const designH = BOOT.stageH * BOOT.uiScale;

    const s = Math.min(vw / designW, vh / designH);
    const x = (vw - designW * s) / 2;
    const y = (vh - designH * s) / 2;

    stageEl.style.transformOrigin = "top left";
    stageEl.style.transform = \`translate(\${x}px,\${y}px) scale(\${s * BOOT.uiScale})\`;
  }
  scaleStage();
  window.addEventListener("resize", scaleStage);

  if (!window.PIXI || !PIXI.Application) {
    debugEl.textContent = "Pixi failed to load (CDN blocked?).";
    showPanel();
    return;
  }

  function clamp01(t){ return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function easeOutCubic(t){ t = clamp01(t); return 1 - Math.pow(1 - t, 3); }

  // Must match engine order for pointer mapping
  const EURO_WHEEL = ${JSON.stringify([
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ])};

  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  function colorFor(n){ if (n === 0) return "green"; return RED.has(n) ? "red" : "black"; }

  const app = new PIXI.Application();
  await app.init({
    width: 720,
    height: 520,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: 1,
    powerPreference: "high-performance",
  });
  hostEl.appendChild(app.canvas);
  app.ticker.maxFPS = 60;

  const root = new PIXI.Container();
  app.stage.addChild(root);

  const cx = 360, cy = 265;
  const wheel = new PIXI.Container();
  wheel.x = cx; wheel.y = cy;
  root.addChild(wheel);

  const pointer = new PIXI.Graphics();
  pointer.beginFill(0xffffff, 0.9);
  pointer.drawPolygon([cx, cy - (BOOT.wheelSize/2) - 8, cx - 12, cy - (BOOT.wheelSize/2) - 30, cx + 12, cy - (BOOT.wheelSize/2) - 30]);
  pointer.endFill();
  root.addChild(pointer);

  // Outer rim + segments
  const rim = new PIXI.Graphics();
  rim.lineStyle({ width: 2, color: 0xffffff, alpha: 0.14 });
  rim.drawCircle(0, 0, BOOT.wheelSize/2);
  wheel.addChild(rim);

  const segCount = EURO_WHEEL.length;
  const segAngle = (Math.PI * 2) / segCount;

  const segGfx = new PIXI.Graphics();
  for (let i=0;i<segCount;i++){
    const n = EURO_WHEEL[i];
    const col = colorFor(n);
    const a0 = -Math.PI/2 + i * segAngle;
    const a1 = a0 + segAngle;

    const fill =
      (col === "green") ? 0x2ecc71 :
      (col === "red") ? 0xe74c3c :
      0x111111;

    segGfx.beginFill(fill, col === "black" ? 0.95 : 0.92);
    segGfx.moveTo(0,0);
    segGfx.arc(0,0, BOOT.wheelSize/2 - 8, a0, a1);
    segGfx.closePath();
    segGfx.endFill();

    // tick
    segGfx.lineStyle({ width: 1, color: 0xffffff, alpha: BOOT.tickAlpha });
    segGfx.moveTo(Math.cos(a0) * (BOOT.wheelSize/2 - 12), Math.sin(a0) * (BOOT.wheelSize/2 - 12));
    segGfx.lineTo(Math.cos(a0) * (BOOT.wheelSize/2 - 4),  Math.sin(a0) * (BOOT.wheelSize/2 - 4));
  }
  wheel.addChild(segGfx);

  // Inner ring
  const inner = new PIXI.Graphics();
  inner.beginFill(0x000000, 0.35);
  inner.drawCircle(0,0, BOOT.wheelSize/2 - BOOT.ringThickness);
  inner.endFill();
  wheel.addChild(inner);

  // Labels
  const labelLayer = new PIXI.Container();
  wheel.addChild(labelLayer);

  const textStyle = new PIXI.TextStyle({
    fill: 0xffffff,
    fontFamily: "Inter, system-ui",
    fontSize: 14,
    fontWeight: "900",
  });

  for (let i=0;i<segCount;i++){
    const n = EURO_WHEEL[i];
    const aMid = -Math.PI/2 + (i + 0.5) * segAngle;
    const r = BOOT.wheelSize/2 - BOOT.ringThickness/2;

    const t = new PIXI.Text({ text: String(n), style: textStyle });
    t.anchor.set(0.5, 0.5);
    t.x = Math.cos(aMid) * r;
    t.y = Math.sin(aMid) * r;
    t.rotation = aMid + Math.PI/2;
    t.alpha = 0.92;
    labelLayer.addChild(t);
  }

  // Ball
  const ball = new PIXI.Graphics();
  ball.beginFill(0xffffff, 0.96);
  ball.drawCircle(0,0, BOOT.ballRadius);
  ball.endFill();
  root.addChild(ball);

  // Ball motion state (independent)
  let ballTheta = -Math.PI / 2;
  let ballVel = 0;
  let ballRad = BOOT.ballOrbit;
  let ballRadVel = 0;

  function setBallFromPolar(){
    ball.x = cx + Math.cos(ballTheta) * ballRad;
    ball.y = cy + Math.sin(ballTheta) * ballRad;
  }
  setBallFromPolar();

  // Spin state
  let spinning = false;
  let spinStart = 0;
  let spinDur = 0;
  let startRot = 0;
  let targetRot = 0;
  let activeRoundId = null;
  let activeResultNumber = 0;

  function wheelIndexForNumber(num){
    const n = Number(num);
    for (let i=0;i<EURO_WHEEL.length;i++){
      if (EURO_WHEEL[i] === n) return i;
    }
    return 0;
  }

  // pointer is at -90deg (top). We want the result segment centered under pointer.
  function rotationForResultNumber(num){
    const i = wheelIndexForNumber(num);
    const aMid = -Math.PI/2 + (i + 0.5) * segAngle; // segment center world angle when wheel rot=0
    return (-Math.PI/2) - aMid;
  }

  function randInt(a,b){ return a + Math.floor(Math.random() * (b - a + 1)); }

  function resetBallForSpin(){
    ballTheta = -Math.PI / 2;
    ballRad = BOOT.ballOrbit;
    ballRadVel = -1.5 - Math.random() * 1.0;
    ballVel = 0.35 + Math.random() * 0.25;
    setBallFromPolar();
  }

  function startSpin(ev){
    spinning = true;
    activeRoundId = ev.roundId || null;
    activeResultNumber = Number(ev.resultNumber ?? 0);

    spinStart = performance.now();
    spinDur = randInt(BOOT.spinMsMin, BOOT.spinMsMax);

    startRot = wheel.rotation;

    const baseTarget = rotationForResultNumber(activeResultNumber);
    const turns = randInt(BOOT.turnsMin, BOOT.turnsMax);
    targetRot = baseTarget + (Math.PI * 2 * turns);

    resetBallForSpin();

    resultEl.textContent = "";
    showPanel();
    spinPill.textContent = "Spin: " + (ev.playerName || "Player");
  }

  function settle(ev){
    const num = ev.resultNumber;
    const col = ev.resultColor;
    const pay = ev.payoutAmount ?? 0;
    resultEl.textContent = (ev.playerName || "Player") + " → " + num + " (" + col + ") +" + pay;
  }

  function shortestAngleDelta(a, b){
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  app.ticker.add(() => {
    if (!spinning) return;

    const t = (performance.now() - spinStart) / spinDur;
    const e = easeOutCubic(clamp01(t));

    // wheel spin
    wheel.rotation = startRot + (targetRot - startRot) * e;

    // ball motion: orbit + radial bounce + decay
    const friction = BOOT.ballFriction;
    const jitter = BOOT.ballJitter;

    ballVel = ballVel * friction + (Math.random() - 0.5) * jitter;

    ballRadVel += (BOOT.ballOrbit - ballRad) * BOOT.radialSpring;
    ballRadVel *= BOOT.radialDamp;
    ballRad += ballRadVel;

    const rMin = BOOT.ballOrbit - BOOT.radialClampIn;
    const rMax = BOOT.ballOrbit + BOOT.radialClampOut;
    if (ballRad < rMin) { ballRad = rMin; ballRadVel *= -0.35; }
    if (ballRad > rMax) { ballRad = rMax; ballRadVel *= -0.35; }

    ballTheta += ballVel;

    const settleT = Math.max(0, (e - 0.78) / 0.22);
    if (settleT > 0) {
      const targetTheta = -Math.PI / 2;
      const d = shortestAngleDelta(ballTheta, targetTheta);
      ballTheta += d * (0.08 + 0.25 * settleT);
      ballVel *= (1 - 0.12 * settleT);

      const dropTargetR = BOOT.ballOrbit - BOOT.settlePocketInset;
      ballRad += (dropTargetR - ballRad) * (0.06 + 0.20 * settleT);
    }

    setBallFromPolar();

    if (t >= 1) {
      spinning = false;
      wheel.rotation = targetRot;

      ballVel = 0;
      ballRad = BOOT.ballOrbit - BOOT.settlePocketInset;
      ballTheta = -Math.PI / 2;
      ballRadVel = 0;
      setBallFromPolar();
    }
  });

  let since = 0;
  let lastPollOkAt = 0;
  let lastEventType = "";
  let lastEventSeq = 0;

  function updateHud(state){
    const inFlight = Array.isArray(state?.inFlight) ? state.inFlight : [];
    const qlen = Number(state?.queueLength ?? 0) || 0;

    queuePill.textContent = "Queue: " + qlen;
    spinPill.textContent = "Spin: " + (inFlight[0]?.playerName || "—");

    const idle = (inFlight.length === 0 && qlen === 0 && !spinning);
    if (idle) hidePanel(); else showPanel();

    const ago = lastPollOkAt ? (Date.now() - lastPollOkAt) : null;
    debugEl.textContent =
      "poll: " + (ago == null ? "—" : ago + "ms ago") +
      " • last: " + (lastEventType || "—") +
      " #" + (lastEventSeq || 0) +
      " • spinning: " + (spinning ? "yes" : "no");
  }

  function handleEvent(ev){
    if (!ev || !ev.type) return;
    lastEventType = ev.type;
    if (ev.seq != null) lastEventSeq = ev.seq;

    if (ev.type === "ROULETTE_ROUND_START") startSpin(ev);
    if (ev.type === "ROULETTE_ROUND_SETTLED") settle(ev);
  }

  async function poll(){
    try{
      const r = await fetch("/api/obs/roulette/" + encodeURIComponent(publicId) + "/poll?since=" + since, { cache:"no-store" });
      if (!r.ok) throw new Error("poll_http_" + r.status);

      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "poll_failed");

      lastPollOkAt = Date.now();

      // ✅ restart-safe cursor update:
      // - allow seq=0 (don't use ||)
      // - if server restarted / ring reset, seq can jump backwards -> reset cursor
      const nextSeq = Number(data?.seq);
      if (Number.isFinite(nextSeq)) {
        if (nextSeq < since) since = 0;
        since = nextSeq;
        lastEventSeq = since; // keep HUD meaningful even with zero events
      }

      updateHud(data.state || null);

      const events = Array.isArray(data.events) ? data.events : [];
      for (let i=0;i<events.length;i++) handleEvent(events[i]);
    } catch(_){
      // swallow
    } finally {
      setTimeout(poll, 220);
    }
  }

  hidePanel();
  poll();
})();
</script>
</body>
</html>`;
}
