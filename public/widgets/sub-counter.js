(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    label: $("label"),
    nums: $("nums"),
    fill: $("fill"),
    hint: $("hint"),
  };

  function tokenFromPath() {
    const m = /^\/w\/([^\/?#]+)/.exec(location.pathname || "");
    return m ? decodeURIComponent(m[1]) : "";
  }

  function getToken() {
    const t = String(window.__WIDGET_TOKEN__ || "").trim();
    if (t) return t;
    const p = tokenFromPath().trim();
    if (p) {
      window.__WIDGET_TOKEN__ = p;
      return p;
    }
    return "";
  }

  function asInt(v, dflt) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : dflt;
  }
  function asBool(v, dflt) {
    if (v === true || v === false) return v;
    const s = String(v ?? "").toLowerCase().trim();
    if (["1","true","yes","on"].includes(s)) return true;
    if (["0","false","no","off"].includes(s)) return false;
    return dflt;
  }
  function asStr(v, dflt) {
    const s = String(v ?? "").trim();
    return s ? s : dflt;
  }

  function readQueryOverrides(cfg) {
    const qs = new URLSearchParams(location.search || "");

    const goal = qs.get("goal");
    const cap = qs.get("cap");
    const label = qs.get("label");
    const overfill = qs.get("overfill");
    const numbers = qs.get("numbers");
    const percent = qs.get("percent");
    const decimals = qs.get("decimals");

    const next = { ...(cfg || {}) };

    if (goal !== null) next.goal = asInt(goal, next.goal);
    if (cap !== null) next.cap = asInt(cap, next.cap);
    if (label !== null) next.label = asStr(label, next.label);
    if (overfill !== null) next.overfill = asBool(overfill, next.overfill);
    if (numbers !== null) next.showNumbers = asBool(numbers, next.showNumbers);
    if (percent !== null) next.showPercent = asBool(percent, next.showPercent);
    if (decimals !== null) next.decimals = asInt(decimals, next.decimals);

    return next;
  }

  const baseCfg = window.__WIDGET_CONFIG__ || {};
  const cfg = readQueryOverrides(baseCfg);

  const state = {
    total: 0,
  };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function render() {
    const goal = Math.max(1, asInt(cfg.goal, 25));
    const cap = Math.max(goal, asInt(cfg.cap, Math.max(goal, 50)));
    const overfill = asBool(cfg.overfill, true);

    const total = Math.max(0, Number(state.total || 0));

    // progress ratio:
    // - normal: 0..goal
    // - overfill: allow >goal up to cap
    const denom = overfill ? cap : goal;
    const shown = overfill ? clamp(total, 0, cap) : clamp(total, 0, goal);
    const pct = denom > 0 ? (shown / denom) * 100 : 0;

    if (el.label) el.label.textContent = asStr(cfg.label, "SUB GOAL");

    const showNumbers = asBool(cfg.showNumbers, true);
    const showPercent = asBool(cfg.showPercent, false);
    const dec = clamp(asInt(cfg.decimals, 0), 0, 2);

    let right = "";
    if (showNumbers) right += `${total.toFixed(dec)} / ${goal}`;
    if (showPercent) {
      const pctGoal = goal > 0 ? (total / goal) * 100 : 0;
      right += (right ? "  •  " : "") + `${pctGoal.toFixed(0)}%`;
    }

    if (el.nums) el.nums.textContent = right;

    if (el.fill) el.fill.style.width = `${clamp(pct, 0, 100)}%`;
  }

  function connect() {
    const token = getToken();
    if (!token) {
      if (el.hint) {
        el.hint.style.display = "block";
        el.hint.textContent = "Missing widget token.";
      }
      return;
    }

    const streamUrl = `/w/${encodeURIComponent(token)}/stream`;
    const es = new EventSource(streamUrl, { withCredentials: true });

    es.addEventListener("hello", () => {
      render();
    });

    // IMPORTANT: do not increment totals — use payload total as source of truth.
    es.addEventListener("subs.update", (ev) => {
      try {
        const row = JSON.parse(ev.data || "{}");
        const total = row?.payload?.total;
        if (typeof total === "number") {
          state.total = total;
          render();
        }
      } catch {}
    });

    // Optional: if your test emitter uses a different event name, you can alias here later.
    es.addEventListener("message", () => {});

    es.onerror = () => {
      // OBS can be noisy; don’t spam the UI.
    };
  }

  connect();
})();
