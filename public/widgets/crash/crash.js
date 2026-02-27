(() => {
  // ─────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────
  const qs = new URLSearchParams(location.search);

  // These should match your DB schema + ingest decisions:
  const platform = (qs.get("platform") || "kick").trim().toLowerCase();

  // IMPORTANT: for Kick, prefer broadcaster_user_id as channel_id
  const channelId = (qs.get("channel_id") || qs.get("channelId") || "").trim();

  // Optional — only used to show a player-specific latest state if you pass it.
  const username = (qs.get("username") || "").trim();

  // Poll rate: keep it light; animation is client-side.
  const POLL_MS = Math.max(300, parseInt(qs.get("poll_ms") || "750", 10) || 750);

  if (!channelId) {
    console.warn("[crashWidget] missing channel_id in query string");
  }

  // ─────────────────────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────────────────────
  const root = document.getElementById("app");
  const multEl = document.getElementById("mult");
  const subLine = document.getElementById("subLine");
  const statusPill = document.getElementById("statusPill");
  const metaLine = document.getElementById("metaLine");
  const resultWrap = document.getElementById("result");
  const resultTitle = document.getElementById("resultTitle");
  const resultSub = document.getElementById("resultSub");
  const flame = document.getElementById("flame");
  const progress = document.getElementById("progress");

  // ─────────────────────────────────────────────────────────────
  // Math (match server vibe)
  // ─────────────────────────────────────────────────────────────
  function clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function easeOutCubic(x) {
    const t = clamp01(x);
    return 1 - Math.pow(1 - t, 3);
  }

  function fmtMult(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return "1.00x";
    return `${n.toFixed(2)}x`;
  }

  function parseIso(s) {
    const t = Date.parse(String(s || ""));
    return Number.isFinite(t) ? t : null;
  }

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  let lastRoundId = null;
  let lastRound = null;

  // Animation state (derived each frame)
  let raf = null;

  function setMode(mode) {
    root.classList.remove("cw--running", "cw--win", "cw--boom");
    if (mode === "running") root.classList.add("cw--running");
    if (mode === "win") root.classList.add("cw--win");
    if (mode === "boom") root.classList.add("cw--boom");
  }

  function setResult(show, title = "", sub = "") {
    resultWrap.hidden = !show;
    resultTitle.textContent = title || "";
    resultSub.textContent = sub || "";
  }

  function computeRunningMultiplier(round, nowMs) {
    const started = parseIso(round.started_at);
    const ends = parseIso(round.ends_at);
    const crashMult = Number(round.crash_multiplier);

    if (!started || !ends || !Number.isFinite(crashMult)) return 1.0;

    const dur = Math.max(1, ends - started);
    const elapsed = nowMs - started;

    const p = clamp01(elapsed / dur);
    const e = easeOutCubic(p);

    const m = 1 + (crashMult - 1) * e;
    return Math.max(1.0, Math.min(crashMult, Math.floor(m * 100) / 100));
  }

  function render(round) {
    const nowMs = Date.now();

    if (!round) {
      setMode(null);
      statusPill.textContent = "IDLE";
      subLine.textContent = "Waiting…";
      metaLine.textContent = channelId ? `channel_id ${channelId} • ${platform}` : `—`;
      multEl.textContent = "1.00x";
      progress.style.width = "0%";
      flame.style.opacity = "0";
      setResult(false);
      return;
    }

    const status = String(round.status || "").toLowerCase();
    const started = parseIso(round.started_at);
    const ends = parseIso(round.ends_at);
    const crashMult = Number(round.crash_multiplier);

    // Header lines
    subLine.textContent = round.username
      ? `Player: ${String(round.username)}`
      : "Crash Round";

    metaLine.textContent = `channel_id ${String(round.channel_id || "")} • wager ${round.chip_wager || 0}`;

    // Status rendering
    if (status === "active") {
      setMode("running");
      statusPill.textContent = "RUNNING";
      flame.style.opacity = "1";

      const m = computeRunningMultiplier(round, nowMs);
      multEl.textContent = fmtMult(m);

      // progress bar based on time
      if (started && ends) {
        const p = clamp01((nowMs - started) / Math.max(1, ends - started));
        progress.style.width = `${Math.floor(p * 100)}%`;
      }

      setResult(false);

      // Client-side explode moment (even if poll lags)
      if (ends && nowMs >= ends) {
        // don’t force status change; server will reconcile.
        // just visually hint:
        statusPill.textContent = "CRASHING…";
      }

      return;
    }

    // Not active: freeze + show outcome
    flame.style.opacity = "0";
    progress.style.width = "100%";

    if (status === "cashed_out") {
      setMode("win");
      statusPill.textContent = "CASHED OUT";

      const cm = Number(round.cashout_at_multiplier || 1.0);
      multEl.textContent = fmtMult(cm);

      const payout = Number(round.payout_chips || 0);
      setResult(true, "💰 Cashout!", `${fmtMult(cm)} • payout ${payout}`);

      return;
    }

    if (status === "exploded") {
      setMode("boom");
      statusPill.textContent = "CRASHED";

      if (Number.isFinite(crashMult)) {
        multEl.textContent = fmtMult(crashMult);
      } else {
        multEl.textContent = "💥";
      }

      setResult(true, "💥 Boom.", `crashed at ${fmtMult(crashMult || 1.0)}`);
      return;
    }

    // Fallback
    setMode(null);
    statusPill.textContent = String(round.status || "DONE").toUpperCase();
    multEl.textContent = fmtMult(1.0);
    setResult(false);
  }

  async function poll() {
    try {
      if (!channelId) {
        render(null);
        return;
      }

      const url = new URL("/api/obs/casino/crash/state", location.origin);
      url.searchParams.set("platform", platform);
      url.searchParams.set("channel_id", channelId);
      if (username) url.searchParams.set("username", username);

      const resp = await fetch(url.toString(), { cache: "no-store" });
      const json = await resp.json().catch(() => null);

      if (!json || !json.ok) {
        render(null);
        return;
      }

      const round = json.round || null;

      // Reset detection
      const rid = round && round.id ? String(round.id) : null;
      if (rid && rid !== lastRoundId) {
        lastRoundId = rid;
        lastRound = round;
      } else {
        lastRound = round;
      }
    } catch (e) {
      // keep rendering last known state
    } finally {
      // keep polling
      setTimeout(poll, POLL_MS);
    }
  }

  function tick() {
    try {
      render(lastRound);
    } finally {
      raf = requestAnimationFrame(tick);
    }
  }

  // Boot
  poll();
  tick();
})();
