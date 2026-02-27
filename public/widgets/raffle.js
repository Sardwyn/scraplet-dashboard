// /public/widgets/raffle.js
// Raffle OBS widget client.
// Listens to SSE at: /w/:token/stream
(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusDot: $("statusDot"),
    animChip: $("animChip"),
    countText: $("countText"),
    joinText: $("joinText"),
    topicText: $("topicText"),
    debugText: $("debugText"),

    labelText: $("labelText"),
    nameText: $("nameText"),
    hintText: $("hintText"),

    confetti: $("confetti"),

    wheelBox: $("wheelBox"),
    wheelList: $("wheelList"),

    slotBox: $("slotBox"),
    slotTxt: $("slotTxt"),
  };

  const state = {
    connected: false,
    topic: "—",
    joinPhrase: "!join",
    count: 0,

    animation: "wheel", // wheel | slot | scramble
    status: "idle",     // idle | collecting | rolling | winner
    sampleNames: ["Wait.", "Loading.", "Drawing."],

    frozenOnWinner: false,
    activeSessionId: null,

    slotTimer: null,
    wheelTimer: null,

    lastWinner: null,
  };

  let es = null;
  let retryMs = 800;

  function debug(msg) {
    if (!el.debugText) return;
    el.debugText.textContent = msg || "";
  }

  function setDot(mode) {
    if (!el.statusDot) return;
    el.statusDot.className = "dot";
    if (mode === "ok") el.statusDot.classList.add("ok");
    else if (mode === "warn") el.statusDot.classList.add("warn");
    else el.statusDot.classList.add("bad");
  }

  function showMode(which) {
    if (el.wheelBox) el.wheelBox.style.display = which === "wheel" ? "block" : "none";
    if (el.slotBox) el.slotBox.style.display = (which === "slot" || which === "scramble") ? "block" : "none";
  }

  function setAnimChip(anim) {
    if (!el.animChip) return;
    el.animChip.textContent = (anim || "—").toUpperCase();
  }

  function setFooter({ count, joinPhrase, topic }) {
    if (el.countText) el.countText.textContent = String(count ?? 0);
    if (el.joinText) el.joinText.textContent = String(joinPhrase || "!join");
    if (el.topicText) el.topicText.textContent = String(topic || "—");
  }

  function stopAll() {
    if (state.slotTimer) {
      clearInterval(state.slotTimer);
      state.slotTimer = null;
    }
    if (state.wheelTimer) {
      clearInterval(state.wheelTimer);
      state.wheelTimer = null;
    }
  }

  function sanitizeName(s) {
    if (!s) return "—";
    const t = String(s).trim();
    if (!t) return "—";
    return t.slice(0, 36);
  }

  function pick(arr) {
    if (!Array.isArray(arr) || !arr.length) return "…";
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---- token handling (FIX) ----
  function tokenFromPath() {
    // /w/<token> or /w/<token>/stream
    const m = /^\/w\/([^\/?#]+)/.exec(location.pathname || "");
    return m ? decodeURIComponent(m[1]) : "";
  }

  function getWidgetToken() {
    const t = String(window.__WIDGET_TOKEN__ || "").trim();
    if (t) return t;

    const p = tokenFromPath().trim();
    if (p) {
      window.__WIDGET_TOKEN__ = p; // stabilize future calls
      return p;
    }
    return "";
  }

  // ---- wheel helpers ----
  function resetWheel() {
    if (!el.wheelList) return;
    el.wheelList.style.transition = "none";
    el.wheelList.style.transform = "translateY(0px)";
    el.wheelList.innerHTML = "";
  }

  function renderWheel(reel, targetIndex) {
    if (!el.wheelList) return;
    el.wheelList.innerHTML = "";
    reel.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "wheel-pill";
      row.textContent = sanitizeName(name);
      if (i === targetIndex) row.classList.add("target");
      el.wheelList.appendChild(row);
    });
  }

  function buildWheelReel(pool, winner) {
    const safePool = (Array.isArray(pool) && pool.length ? pool : state.sampleNames).map(sanitizeName);
    const safeWinner = sanitizeName(winner);

    const reelSize = 33;
    const targetIndex = 17;
    const reel = new Array(reelSize).fill(null).map(() => pick(safePool));
    reel[targetIndex] = safeWinner;
    return { reel, targetIndex };
  }

  function landWheelOnIndex(targetIndex) {
    if (!el.wheelBox || !el.wheelList) return;
    const target = el.wheelList.children[targetIndex];
    if (!target) return;

    const boxRect = el.wheelBox.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const boxCenterY = boxRect.top + (boxRect.height / 2);
    const targetCenterY = targetRect.top + (targetRect.height / 2);

    const delta = boxCenterY - targetCenterY;

    const m = /translateY\(([-0-9.]+)px\)/.exec(el.wheelList.style.transform || "");
    const current = m ? Number(m[1]) : 0;
    const next = current + delta;

    el.wheelList.style.willChange = "transform";
    el.wheelList.style.transition = "transform 1900ms cubic-bezier(0.12, 0.88, 0.12, 1)";
    el.wheelList.style.transform = `translateY(${next}px)`;
  }

  function startWheelRolling(pool) {
    stopAll();
    showMode("wheel");

    const safePool = (Array.isArray(pool) && pool.length ? pool : state.sampleNames).map(sanitizeName);

    const reel = new Array(30).fill(null).map(() => pick(safePool));
    renderWheel(reel, -1);

    const rowEl = el.wheelList?.children?.[0];
    const rowH = rowEl ? rowEl.getBoundingClientRect().height : 36;

    let y = 0;

    if (el.wheelList) {
      el.wheelList.style.transition = "none";
      el.wheelList.style.transform = "translateY(0px)";
      el.wheelList.style.willChange = "transform";
    }

    state.wheelTimer = setInterval(() => {
      if (!el.wheelList) return;

      y -= rowH;

      el.wheelList.style.transition = "transform 120ms linear";
      el.wheelList.style.transform = `translateY(${y}px)`;

      setTimeout(() => {
        if (!el.wheelList) return;

        const first = el.wheelList.firstElementChild;
        if (first) el.wheelList.appendChild(first);

        if (Math.random() < 0.35) {
          const last = el.wheelList.lastElementChild;
          if (last) last.textContent = pick(safePool);
        }

        el.wheelList.style.transition = "none";
        y += rowH;
        el.wheelList.style.transform = `translateY(${y}px)`;
      }, 130);
    }, 140);
  }

  function startSlotRolling(pool) {
    stopAll();
    showMode("slot");

    const safePool = (Array.isArray(pool) && pool.length ? pool : state.sampleNames).map(sanitizeName);
    if (!el.slotTxt) return;

    state.slotTimer = setInterval(() => {
      el.slotTxt.textContent = pick(safePool);
    }, 60);
  }

  function startScrambleRolling(pool) {
    stopAll();
    showMode("scramble");

    const safePool = (Array.isArray(pool) && pool.length ? pool : state.sampleNames).map(sanitizeName);
    if (!el.slotTxt) return;

    const glyphs = "!@#$%^&*()_+=-{}[]<>?/\\|~";
    const glitch = (name) => {
      const s = sanitizeName(name);
      const a = s.split("");
      const n = Math.max(1, Math.min(3, Math.floor(Math.random() * 4)));
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * a.length);
        a[idx] = glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      return (Math.random() < 0.25) ? (a.join("") + " ▌") : a.join("");
    };

    let base = pick(safePool);
    state.slotTimer = setInterval(() => {
      if (Math.random() < 0.35) base = pick(safePool);
      el.slotTxt.textContent = glitch(base);
    }, 55);
  }

  function applyState(payload) {
    const p = payload || {};

    if (p.sessionId) {
      const sid = String(p.sessionId);
      if (state.activeSessionId && sid !== state.activeSessionId) return;
      if (!state.activeSessionId) state.activeSessionId = sid;
    }

    if (state.frozenOnWinner) return;

    const status = String(p.status || "").toLowerCase();

    if (p.sessionId) state.topic = String(p.sessionId);
    if (p.joinPhrase && String(p.joinPhrase).trim()) state.joinPhrase = String(p.joinPhrase).trim();
    if (Number.isFinite(Number(p.count))) state.count = Number(p.count);
    if (p.animation) state.animation = String(p.animation);
    if (Array.isArray(p.sampleNames) && p.sampleNames.length) state.sampleNames = p.sampleNames.slice(0, 120);

    setFooter({ count: state.count, joinPhrase: state.joinPhrase, topic: state.topic });
    setAnimChip(state.animation);

    if (status === "collecting") {
      stopAll();
      showMode("none");
      state.status = "collecting";

      setDot("ok");
      if (el.labelText) el.labelText.textContent = "Collecting";
      if (el.nameText) el.nameText.textContent = "Entries Open";
      if (el.nameText) el.nameText.classList.remove("winner");
      if (el.hintText) el.hintText.textContent = "Waiting for chat joins…";
      return;
    }

    if (status === "rolling") {
      state.status = "rolling";

      setDot("ok");
      if (el.labelText) el.labelText.textContent = "Rolling";
      if (el.nameText) el.nameText.textContent = "—";
      if (el.nameText) el.nameText.classList.remove("winner");
      if (el.hintText) el.hintText.textContent = "Drawing a winner…";

      const pool = p.sampleNames || state.sampleNames;

      if (state.animation === "wheel") startWheelRolling(pool);
      else if (state.animation === "scramble") startScrambleRolling(pool);
      else startSlotRolling(pool);
    }
  }

  function applyWinner(payload) {
    const p = payload || {};
    if (p.sessionId) state.activeSessionId = String(p.sessionId);

    stopAll();
    if (el.wheelList) {
      el.wheelList.style.transition = "none";
      el.wheelList.style.willChange = "auto";
    }

    state.lastWinner = sanitizeName(
      (p.winner && (p.winner.username || p.winner.name)) ||
      p.username ||
      p.name ||
      "—"
    );

    state.status = "winner";
    state.frozenOnWinner = true;

    setDot("ok");
    if (el.labelText) el.labelText.textContent = "Winner";
    if (el.nameText) el.nameText.textContent = state.lastWinner;
    if (el.nameText) el.nameText.classList.add("winner");
    if (el.hintText) el.hintText.textContent = "Winner selected.";

    const pool = p.pool || p.sampleNames || state.sampleNames;

    if (state.animation === "wheel") {
      showMode("wheel");
      const { reel, targetIndex } = buildWheelReel(pool, state.lastWinner);
      renderWheel(reel, targetIndex);
      requestAnimationFrame(() => requestAnimationFrame(() => landWheelOnIndex(targetIndex)));
    } else {
      showMode(state.animation === "scramble" ? "scramble" : "slot");
      if (el.slotTxt) el.slotTxt.textContent = state.lastWinner;
    }

    burstConfetti();
  }

  function burstConfetti() {
    if (!el.confetti) return;
    el.confetti.innerHTML = "";
    el.confetti.style.display = "block";

    const colors = [
      "rgba(129,140,248,0.95)",
      "rgba(34,197,94,0.95)",
      "rgba(250,204,21,0.95)",
      "rgba(239,68,68,0.95)",
      "rgba(244,114,182,0.95)",
    ];

    for (let i = 0; i < 70; i++) {
      const dot = document.createElement("div");
      dot.className = "confetti";
      dot.style.left = (Math.random() * 100).toFixed(3) + "%";
      dot.style.background = colors[i % colors.length];
      dot.style.animationDelay = (Math.random() * 0.15) + "s";
      dot.style.transform = `translateY(0) scale(${0.8 + Math.random() * 0.6})`;
      el.confetti.appendChild(dot);
    }

    setTimeout(() => {
      el.confetti.style.display = "none";
      el.confetti.innerHTML = "";
    }, 1900);
  }

  function resetToWaiting() {
    state.frozenOnWinner = false;
    state.activeSessionId = null;
    stopAll();
    resetWheel();

    state.status = "idle";
    state.lastWinner = null;

    setDot(state.connected ? "warn" : "bad");
    showMode("none");
    if (el.labelText) el.labelText.textContent = "Waiting";
    if (el.nameText) el.nameText.textContent = "—";
    if (el.nameText) el.nameText.classList.remove("winner");
    if (el.hintText) el.hintText.textContent = "Start the raffle from the dashboard.";
    setAnimChip(state.animation);
    setFooter({ count: state.count, joinPhrase: state.joinPhrase, topic: state.topic });
    debug("");
  }

  function normalizeEnvelope(data) {
    if (!data) return null;
    try {
      const obj = JSON.parse(data);
      if (!obj || typeof obj !== "object") return null;
      return { id: obj.id || null, kind: obj.kind || null, payload: obj.payload || null };
    } catch {
      return null;
    }
  }

  const seenEvents = new Set();
  function hasSeenEvent(id) {
    if (!id) return false;
    if (seenEvents.has(id)) return true;
    seenEvents.add(id);
    if (seenEvents.size > 500) {
      const it = seenEvents.values();
      const oldest = it.next().value;
      if (oldest) seenEvents.delete(oldest);
    }
    return false;
  }

  function getStreamUrl() {
    const token = getWidgetToken();
    const base = location.origin.replace(/\/$/, "");
    return `${base}/w/${encodeURIComponent(token)}/stream`;
  }

  function connect() {
    const token = getWidgetToken();
    if (!token) {
      setDot("bad");
      debug("Missing widget token (no /w/:token in URL?)");
      return;
    }

    const streamUrl = getStreamUrl();

    try { if (es) es.close(); } catch {}
    debug("connecting…");
    setDot("warn");

    es = new EventSource(streamUrl);

    es.addEventListener("hello", () => {
      state.connected = true;
      setDot("ok");
      debug("");
      retryMs = 800;
    });

    es.addEventListener("raffle.state", (ev) => {
      const env = normalizeEnvelope(ev.data);
      if (!env || hasSeenEvent(env.id)) return;
      applyState(env.payload);
      debug("raffle.state");
      retryMs = 800;
    });

    es.addEventListener("raffle.winner", (ev) => {
      const env = normalizeEnvelope(ev.data);
      if (!env || hasSeenEvent(env.id)) return;
      applyWinner(env.payload);
      debug("raffle.winner");
      retryMs = 800;
    });

    es.addEventListener("raffle.reset", (ev) => {
      const env = normalizeEnvelope(ev.data);
      if (env && hasSeenEvent(env.id)) return;
      resetToWaiting();
      debug("raffle.reset");
      retryMs = 800;
    });

    es.onmessage = (ev) => {
      const env = normalizeEnvelope(ev.data);
      if (!env || hasSeenEvent(env.id)) return;
      const kind = String(env.kind || "");
      if (kind === "raffle.state") applyState(env.payload);
      else if (kind === "raffle.winner") applyWinner(env.payload);
      else if (kind === "raffle.reset") resetToWaiting();
      if (kind) debug(kind);
      retryMs = 800;
    };

    es.onerror = () => {
      state.connected = false;
      setDot("bad");
      debug("SSE error; retrying…");
      try { es.close(); } catch {}
      setTimeout(connect, retryMs);
      retryMs = Math.min(8000, Math.floor(retryMs * 1.6));
    };
  }

  // boot
  resetToWaiting();
  connect();
})();
