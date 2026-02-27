function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderBlackjackOverlayPage({ publicId, widget }) {
  const initialConfig = widget?.config_json || {};

  const cfg = initialConfig || {};
  const visuals = cfg.visuals || {};

  const stageW = Number(visuals.stageW ?? 1280);
  const stageH = Number(visuals.stageH ?? 720);
  const uiScale = Number(visuals.uiScale ?? 1);
  const cornerRadius = Number(visuals.cornerRadius ?? 18);

  const backdropEnabled = visuals?.backdrop?.enabled !== false;
  const backdropBg = visuals?.backdrop?.bg || "rgba(0,0,0,0.55)";
  const backdropBorder = visuals?.backdrop?.border || "rgba(255,255,255,0.12)";

  const title = String(visuals?.title || "Blackjack");
  const subtitle = String(visuals?.subtitle || "Channel points Blackjack");
  const fontFamily = String(visuals?.fontFamily || "Inter");

  const showHelpText = visuals?.showHelpText !== false;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Scraplet • Blackjack</title>

  <style>
    :root{
      --stage-w:${stageW}px;
      --stage-h:${stageH}px;
      --ui-scale:${uiScale};
      --radius:${cornerRadius}px;
      --panel-bg:${esc(backdropBg)};
      --panel-border:${esc(backdropBorder)};
      --text:#fff;
      --muted: rgba(255,255,255,0.72);
      --dim: rgba(255,255,255,0.55);
      --glass: rgba(255,255,255,0.06);
      --glass2: rgba(255,255,255,0.10);
      --stroke: rgba(255,255,255,0.12);
      --green: rgba(34,197,94,0.95);
      --red: rgba(239,68,68,0.95);
      --amber: rgba(245,158,11,0.95);
    }

    html,body{
      width:100%;
      height:100%;
      margin:0;
      overflow:hidden;
      background:transparent;
      font-family:${esc(fontFamily)},system-ui,-apple-system,Segoe UI,Roboto,Arial;
      color:var(--text);
    }

    .wrap{ position:absolute; inset:0; pointer-events:none; }
    .stage{
      position:absolute;
      top:0; left:0;
      width:var(--stage-w);
      height:var(--stage-h);
      transform-origin:top left;
      display:grid;
      place-items:center;
    }

    .panel{
      width: 860px;
      padding: 18px;
      box-sizing: border-box;
      border-radius: var(--radius);
      ${backdropEnabled ? "background:var(--panel-bg);" : "background:transparent;"}
      ${backdropEnabled ? "border:1px solid var(--panel-border);" : "border:none;"}
      opacity:0;
      visibility:hidden;
      transition:opacity 180ms ease, visibility 0s linear 180ms;
    }
    .panel.is-visible{
      opacity:1;
      visibility:visible;
      transition:opacity 180ms ease;
    }

    .top{
      display:flex;
      align-items:baseline;
      justify-content:space-between;
      gap:12px;
      margin-bottom:10px;
      opacity:.98;
    }
    .title{
      font-weight:900;
      letter-spacing:.2px;
      font-size:18px;
    }
    .meta{
      display:flex;
      gap:10px;
      align-items:center;
      flex-wrap:wrap;
      justify-content:flex-end;
      font-size:14px;
    }
    .pill{
      padding:4px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(255,255,255,0.06);
      font-variant-numeric:tabular-nums;
      white-space:nowrap;
    }
    .pill.urgent{
      border-color: rgba(245,158,11,0.38);
      background: rgba(245,158,11,0.10);
    }

    .board{
      position:relative;
      width: 824px;
      border-radius:16px;
      overflow:hidden;
      isolation:isolate;
      padding: 14px;
      box-sizing:border-box;
      border:1px solid rgba(255,255,255,0.10);
      background: rgba(0,0,0,0.22);
    }
    .board::before{
      content:"";
      position:absolute;
      inset:-60px;
      background:
        radial-gradient(900px 420px at 20% 0%, rgba(255,255,255,0.08), transparent 60%),
        radial-gradient(900px 420px at 80% 120%, rgba(255,255,255,0.06), transparent 60%);
      opacity:.9;
      pointer-events:none;
      z-index:0;
      filter: blur(0px);
    }

    .grid{
      position:relative;
      z-index:1;
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items:start;
    }

    .lane{
      border:1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      border-radius: 14px;
      padding: 12px;
    }

    .laneTitle{
      display:flex;
      justify-content:space-between;
      align-items:baseline;
      gap:10px;
      margin-bottom:8px;
    }
    .laneTitle .left{
      font-weight:900;
      letter-spacing:.2px;
      font-size:14px;
    }
    .laneTitle .right{
      font-size:12px;
      color: var(--dim);
      font-variant-numeric: tabular-nums;
      text-align:right;
    }

    .hand{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      min-height: 62px;
      align-items:center;
    }

    .card{
      width: 48px;
      height: 64px;
      border-radius: 10px;
      border:1px solid rgba(255,255,255,0.14);
      background: rgba(0,0,0,0.35);
      display:grid;
      place-items:center;
      box-shadow: 0 8px 22px rgba(0,0,0,0.25);
      position:relative;
      overflow:hidden;
    }

    .card::before{
      content:"";
      position:absolute;
      inset:-30px;
      background: radial-gradient(60px 60px at 20% 10%, rgba(255,255,255,0.14), transparent 60%);
      opacity:.9;
      pointer-events:none;
    }

    .rank{
      font-weight: 1000;
      font-size: 16px;
      letter-spacing: .4px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }
    .suit{
      font-size: 14px;
      opacity: .92;
      margin-top: -4px;
    }

    .red{ color: rgba(239,68,68,0.95); }
    .black{ color: rgba(255,255,255,0.92); }

    .hole{
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.10);
    }
    .hole .rank, .hole .suit{
      opacity:0;
    }
    .hole::after{
      content:"";
      position:absolute;
      inset:8px;
      border-radius:8px;
      border:1px dashed rgba(255,255,255,0.20);
      opacity:.8;
    }

    .summary{
      margin-top:10px;
      display:flex;
      gap:12px;
      align-items:flex-start;
      justify-content:space-between;
      flex-wrap:wrap;
      font-size:14px;
      opacity:.98;
    }

    .sub{
      color: var(--muted);
      opacity:.92;
    }

    .result{
      font-weight:1000;
      letter-spacing:.2px;
    }

    .help{
      margin-top:6px;
      font-size:12px;
      color: var(--dim);
      opacity:.85;
    }

    .debug{
      margin-top:6px;
      font-size:12px;
      opacity:.60;
      font-variant-numeric:tabular-nums;
      color: rgba(255,255,255,0.7);
    }

    .row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-top:8px;
    }

    .rightText{
      text-align:right;
      font-size:12px;
      color: var(--dim);
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="stage" id="stage">
      <div class="panel" id="panel">
        <div class="top">
          <div class="title" id="title">${esc(title)}</div>
          <div class="meta">
            <div class="pill" id="phasePill">Phase: —</div>
            <div class="pill" id="playerPill" style="display:none;">Player: —</div>
            <div class="pill" id="betPill" style="display:none;">Bet: —</div>
            <div class="pill" id="timerPill" style="display:none;">Time: —</div>
          </div>
        </div>

        <div class="board">
          <div class="grid">
            <div class="lane">
              <div class="laneTitle">
                <div class="left">Dealer</div>
                <div class="right" id="dealerRight"></div>
              </div>
              <div class="hand" id="dealerHand"></div>
              <div class="row">
                <div class="sub" id="dealerScore">—</div>
                <div class="rightText" id="dealerMeta"></div>
              </div>
            </div>

            <div class="lane">
              <div class="laneTitle">
                <div class="left">Player</div>
                <div class="right" id="playerRight"></div>
              </div>
              <div class="hand" id="playerHand"></div>
              <div class="row">
                <div class="sub" id="playerScore">—</div>
                <div class="rightText" id="playerMeta"></div>
              </div>
            </div>
          </div>

          <div class="summary">
            <div class="sub" id="subtitle">${esc(subtitle)}</div>
            <div class="result" id="result"></div>
          </div>

          <div class="help" id="help">
            Redeem again to HIT. Let it timeout to STAND.
          </div>

          <div class="debug" id="debug"></div>
        </div>
      </div>
    </div>
  </div>

<script>
(async () => {
  const publicId = ${JSON.stringify(String(publicId))};

  const stageEl = document.getElementById("stage");
  const panelEl = document.getElementById("panel");

  const $phasePill = document.getElementById("phasePill");
  const $playerPill = document.getElementById("playerPill");
  const $betPill = document.getElementById("betPill");
  const $timerPill = document.getElementById("timerPill");

  const $dealerHand = document.getElementById("dealerHand");
  const $playerHand = document.getElementById("playerHand");
  const $dealerScore = document.getElementById("dealerScore");
  const $playerScore = document.getElementById("playerScore");

  const $dealerRight = document.getElementById("dealerRight");
  const $playerRight = document.getElementById("playerRight");

  const $dealerMeta = document.getElementById("dealerMeta");
  const $playerMeta = document.getElementById("playerMeta");

  const $result = document.getElementById("result");
  const $help = document.getElementById("help");
  const $debug = document.getElementById("debug");

  function showPanel(){ panelEl.classList.add("is-visible"); }
  function hidePanel(){ panelEl.classList.remove("is-visible"); }

  function scaleStage(){
    const vw = document.documentElement.clientWidth || 1;
    const vh = document.documentElement.clientHeight || 1;

    const designW = ${stageW} * ${uiScale};
    const designH = ${stageH} * ${uiScale};

    const s = Math.min(vw / designW, vh / designH);
    const x = (vw - designW * s) / 2;
    const y = (vh - designH * s) / 2;

    stageEl.style.transformOrigin = "top left";
    stageEl.style.transform = \`translate(\${x}px,\${y}px) scale(\${s * ${uiScale}})\`;
  }
  scaleStage();
  window.addEventListener("resize", scaleStage);

  function suitSymbol(s){
    const v = String(s || "").toUpperCase();
    if (v === "S") return "♠";
    if (v === "H") return "♥";
    if (v === "D") return "♦";
    if (v === "C") return "♣";
    return "•";
  }

  function isRedSuit(s){
    const v = String(s || "").toUpperCase();
    return (v === "H" || v === "D");
  }

  function renderHand(el, cards, opts){
    el.innerHTML = "";
    const arr = Array.isArray(cards) ? cards : [];
    for (let i=0;i<arr.length;i++){
      const c = arr[i] || {};
      const isHole = !!(opts && opts.holeIndex === i);
      const rank = String(c.rank || "?");
      const suit = String(c.suit || "");
      const red = isRedSuit(suit);

      const d = document.createElement("div");
      d.className = "card" + (isHole ? " hole" : "");
      d.innerHTML = \`
        <div style="display:grid; place-items:center; gap:2px;">
          <div class="rank \${red ? "red" : "black"}">\${rank}</div>
          <div class="suit \${red ? "red" : "black"}">\${suitSymbol(suit)}</div>
        </div>\`;
      el.appendChild(d);
    }
  }

  function phaseLabel(phase){
    const p = String(phase || "—");
    if (p === "BETTING") return "Betting";
    if (p === "DEALING") return "Dealing";
    if (p === "PLAYER_TURN") return "Player Turn";
    if (p === "DEALER_TURN") return "Dealer Turn";
    if (p === "SETTLED") return "Settled";
    return p;
  }

  function applyState(state) {
    if (!state || !state.phase) {
      hidePanel();
      return;
    }

    showPanel();

    const phase = String(state.phase || "");
    $phasePill.textContent = "Phase: " + phaseLabel(phase);

    const pname = state?.player?.name || state?.playerName || state?.player?.username || "";
    if (pname) {
      $playerPill.style.display = "";
      $playerPill.textContent = "Player: " + pname;
    } else {
      $playerPill.style.display = "none";
    }

    const betAmt = state?.bet?.amount;
    if (betAmt != null) {
      $betPill.style.display = "";
      $betPill.textContent = "Bet: " + betAmt;
    } else {
      $betPill.style.display = "none";
    }

    renderHand($dealerHand, state?.dealer?.cards || [], { holeIndex: state?.dealer?.holeHidden ? 1 : -1 });
    renderHand($playerHand, state?.player?.cards || [], { holeIndex: -1 });

    $dealerScore.textContent = (state?.dealer?.score != null) ? ("Score: " + state.dealer.score) : "—";
    $playerScore.textContent = (state?.player?.score != null) ? ("Score: " + state.player.score) : "—";

    const dealerMeta = [];
    if (state?.dealer?.isBlackjack) dealerMeta.push("Blackjack");
    if (state?.dealer?.isBusted) dealerMeta.push("Busted");
    $dealerMeta.textContent = dealerMeta.join(" • ");

    const playerMeta = [];
    if (state?.player?.isBlackjack) playerMeta.push("Blackjack");
    if (state?.player?.isBusted) playerMeta.push("Busted");
    $playerMeta.textContent = playerMeta.join(" • ");

    $help.style.display = (${JSON.stringify(!!showHelpText)} && state?.phase === "PLAYER_TURN") ? "" : "none";
    $result.textContent = state?.result ? state.result.outcome : "";

    $dealerRight.textContent = state?.dealer?.holeHidden ? "Hole card hidden" : "";

    if (state?.result) $playerRight.textContent = state.result.reason || "";
    else if (Array.isArray(state?.legalActions) && state.legalActions.length) {
      $playerRight.textContent = "Actions: " + state.legalActions.join(" / ");
    } else $playerRight.textContent = "";
  }

  let expiresAt = 0;

  function tickTimer(){
    if (!expiresAt) {
      $timerPill.style.display = "none";
      $timerPill.classList.remove("urgent");
      return;
    }

    const now = Date.now();
    const msLeft = Math.max(0, expiresAt - now);
    const sec = Math.ceil(msLeft / 1000);

    $timerPill.style.display = "";
    $timerPill.textContent = "Time: " + sec + "s";

    if (msLeft <= 3000) $timerPill.classList.add("urgent");
    else $timerPill.classList.remove("urgent");
  }

  let since = 0;
  let lastState = null;
  let pollFailStreak = 0;

  function latestSnapshotFromEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev && ev.type === "STATE_SNAPSHOT" && ev.phase) return ev;
    }
    return null;
  }

  async function poll() {
    try {
      const r = await fetch(
        "/api/obs/blackjack/" + encodeURIComponent(publicId) + "/poll?since=" + since,
        { method: "GET", cache: "no-store" }
      );
      if (!r.ok) throw new Error("poll_http_" + r.status);

      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "poll_failed");

      // ✅ restart-safe cursor update:
      // - allow seq=0 (don’t use ||)
      // - if server restarted and seq went backwards, reset cursor so overlay recovers without OBS refresh
      const nextSeq = Number(data?.seq);
      if (Number.isFinite(nextSeq)) {
        if (nextSeq < since) since = 0;
        since = nextSeq;
      }

      lastState = data.state || latestSnapshotFromEvents(data.events) || null;

      if (lastState && lastState.expiresAt) expiresAt = Number(lastState.expiresAt) || 0;

      pollFailStreak = 0;

      const ago = Date.now();
      const lastEvent = (Array.isArray(data.events) && data.events.length) ? data.events[data.events.length - 1] : null;
      $debug.textContent =
        "poll ok • seq=" + (data.seq ?? "—") +
        " • events=" + (Array.isArray(data.events) ? data.events.length : 0) +
        " • last=" + (lastEvent?.type || "—") +
        " • t=" + ago;

      applyState(lastState);
    } catch (e) {
      // ✅ Prevent flicker: keep the last known state visible on transient poll failures.
      // Only hide after sustained failure.
      pollFailStreak++;
      if (pollFailStreak >= 12) {
        hidePanel();
      }
    } finally {
      setTimeout(poll, 250);
    }
  }

  setInterval(tickTimer, 100);
  poll();
})();
</script>
</body>
</html>`;
}
