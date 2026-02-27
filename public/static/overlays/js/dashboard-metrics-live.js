// /root/scrapletdashboard/public/js/dashboard-metrics-live.js
(function () {
  const el = (id) => document.getElementById(id);

  const $dot = el("sb-live-dot");
  const $lastPoll = el("sb-last-poll");
  const $latency = el("sb-latency");
  const $errors = el("sb-errors");

  const $uptime = el("sb-uptime");
  const $counters = el("sb-counters");
  const $gauges = el("sb-gauges");
  const $pulse = el("sb-pulse");
  const $pulseCount = el("sb-pulse-count");

  const $ring = el("sb-ring");
  const $ringLimit = el("sb-ring-limit");

  let errorCount = 0;
  let pollTimer = null;

  function fmtTime(d) {
    try { return new Date(d).toLocaleTimeString(); } catch { return String(d); }
  }

  function fmtNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? "0");
    return num.toLocaleString();
  }

  function setDot(ok) {
    if (!$dot) return;
    $dot.className = "inline-block w-2.5 h-2.5 rounded-full " + (ok ? "bg-green-400" : "bg-red-500");
  }

  function renderKeyValueList(container, obj, { sortByValueDesc = true, limit = 20 } = {}) {
    if (!container) return;
    const entries = Object.entries(obj || {});
    if (sortByValueDesc) {
      entries.sort((a, b) => {
        const av = Number(a[1]?.value ?? a[1]);
        const bv = Number(b[1]?.value ?? b[1]);
        if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
        return bv - av;
      });
    } else {
      entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }

    const top = entries.slice(0, limit);

    if (!top.length) {
      container.innerHTML = `<div class="text-gray-500">No data yet.</div>`;
      return;
    }

    container.innerHTML = top
      .map(([k, v]) => {
        const val = (v && typeof v === "object" && "value" in v) ? v.value : v;
        return `
          <div class="flex items-center justify-between gap-3">
            <div class="text-gray-300 truncate" title="${k}">${k}</div>
            <div class="text-gray-100 font-semibold tabular-nums">${fmtNumber(val)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderPulse(container, pulseLatest) {
    if (!container) return;

    const items = Array.isArray(pulseLatest) ? pulseLatest : [];
    if (!items.length) {
      container.innerHTML = `<div class="text-gray-500">No pulse samples yet.</div>`;
      if ($pulseCount) $pulseCount.textContent = "channels: 0";
      return;
    }

    if ($pulseCount) $pulseCount.textContent = `channels: ${items.length}`;

    container.innerHTML = items.slice(0, 8).map((it) => {
      const key = it.key || "";
      const pulse = it.pulse || {};
      const trip = it.tripwire || {};
      const active = !!pulse.active;

      return `
        <div class="border border-gray-800 rounded-lg p-3 ${active ? "bg-gray-800/40" : "bg-gray-900"}">
          <div class="flex items-center justify-between mb-1">
            <div class="font-semibold text-gray-100 truncate" title="${key}">${key}</div>
            <div class="text-xs ${active ? "text-yellow-300" : "text-gray-400"}">
              ${active ? "TRIPWIRE ACTIVE" : "normal"}
            </div>
          </div>
          <div class="text-xs text-gray-400">
            rate/s: <span class="text-gray-200">${typeof pulse.short_rate_per_sec === "number" ? pulse.short_rate_per_sec.toFixed(2) : "—"}</span>
            • unique: <span class="text-gray-200">${pulse.unique_users_short ?? "—"}</span>
            • hold: <span class="text-gray-200">${pulse.hold_ms ?? "—"}ms</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">
            floodTighten: <span class="text-gray-200">${trip.floodTighten ? "true" : "false"}</span>
            • swarmShield: <span class="text-gray-200">${trip.swarmShield ? "true" : "false"}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRing(tbody, items) {
    if (!tbody) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="py-2 text-gray-500" colspan="4">No events yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const ts = r.ts ? fmtTime(r.ts) : "—";
      const chan = r.channelSlug ? `${r.platform || "kick"}:${r.channelSlug}` : (r.platform || "kick");
      const role = r.userRole || "—";

      const flags = [];
      if (r.pulse_active) flags.push("pulse");
      if (r.flood) flags.push("flood");
      if (r.swarm) flags.push("swarm");
      if (r.moderation) flags.push("mod");
      if (r.commandMatched) flags.push("cmd");
      if (r.commandReplySent) flags.push("reply");
      if (r.error) flags.push("err");

      return `
        <tr class="border-t border-gray-800">
          <td class="py-2 pr-2 text-gray-300 tabular-nums">${ts}</td>
          <td class="py-2 pr-2 text-gray-200">${chan}</td>
          <td class="py-2 pr-2 text-gray-300">${role}</td>
          <td class="py-2 pr-2 text-gray-200">${flags.length ? flags.join(", ") : "—"}</td>
        </tr>
      `;
    }).join("");
  }

  async function pollOnce() {
    const t0 = performance.now();

    try {
      const metricsResp = await fetch("/dashboard/api/scrapbot/metrics", { cache: "no-store" });
      const metrics = await metricsResp.json().catch(() => null);

      const t1 = performance.now();
      const latencyMs = Math.round(t1 - t0);

      if (!metrics || !metrics.ok) {
        errorCount++;
        if ($errors) $errors.textContent = String(errorCount);
        setDot(false);
        if ($lastPoll) $lastPoll.textContent = fmtTime(Date.now());
        if ($latency) $latency.textContent = `${latencyMs}ms`;
        return;
      }

      // ok
      setDot(true);
      if ($lastPoll) $lastPoll.textContent = fmtTime(Date.now());
      if ($latency) $latency.textContent = `${latencyMs}ms`;
      if ($errors) $errors.textContent = String(errorCount);

      if ($uptime) $uptime.textContent = `uptime: ${fmtNumber(metrics.uptime_ms)}ms`;

      renderKeyValueList($counters, metrics.counters, { limit: 18 });
      renderKeyValueList($gauges, metrics.gauges, { sortByValueDesc: false, limit: 18 });
      renderPulse($pulse, metrics.pulse_latest);

      // recent ring
      const limit = Number($ringLimit?.value || 25) || 25;
      const recentResp = await fetch(`/dashboard/api/scrapbot/metrics/recent?limit=${encodeURIComponent(String(limit))}&order=newest`, { cache: "no-store" });
      const recent = await recentResp.json().catch(() => null);

      if (recent && recent.ok) renderRing($ring, recent.items);
      else renderRing($ring, []);
    } catch (e) {
      errorCount++;
      if ($errors) $errors.textContent = String(errorCount);
      setDot(false);
      if ($lastPoll) $lastPoll.textContent = fmtTime(Date.now());
      if ($latency) $latency.textContent = "—";
    }
  }

  function start() {
    if (pollTimer) clearInterval(pollTimer);
    pollOnce();
    pollTimer = setInterval(pollOnce, 2000);
  }

  if ($ringLimit) {
    $ringLimit.addEventListener("change", () => pollOnce());
  }

  start();
})();
