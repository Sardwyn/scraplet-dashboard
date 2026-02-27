/* /profile-assets/overlays/alerts-renderer.js
 * Alerts renderer (OBS-friendly)
 * - Connect SSE
 * - Play alert cards
 * - ACK lifecycle (started/ended)
 */
(function () {
  const cfg =
    window.__SCRAPLET_ALERTS__ ||
    window.SCRAPLET_ALERTS ||
    window.SCRAPLET_ALERTS_CONFIG ||
    {};

  const publicId = String(cfg.publicId || "").trim();
  const streamUrl = String(cfg.streamUrl || "").trim();
  const ackUrl = String(cfg.ackUrl || "").trim();

  const root =
    document.getElementById("alerts-root") ||
    document.getElementById("scraplet-alerts-root") ||
    document.body;

  function hud(msg) {
    const el = document.getElementById("alerts-hud");
    if (el) el.textContent = String(msg || "");
  }

  function ensureStage() {
    let stage = document.getElementById("alerts-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "alerts-stage";
      stage.style.position = "fixed";
      stage.style.left = "50%";
      stage.style.top = "12%";
      stage.style.transform = "translateX(-50%)";
      stage.style.zIndex = "999999";
      stage.style.pointerEvents = "none";
      root.appendChild(stage);
    }
    return stage;
  }

  async function ack(playId, status, error) {
    if (!ackUrl || !playId) return;
    try {
      await fetch(ackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          play_id: playId,
          status,
          ...(error ? { error: String(error).slice(0, 240) } : {}),
        }),
      });
    } catch {
      // non-fatal
    }
  }

  function showAlert(playId, resolvedPayload) {
    const stage = ensureStage();

    const p = resolvedPayload?.payload || resolvedPayload || {};

    const text =
      p?.alert?.text?.resolved ||
      p?.alert?.text?.template ||
      "Alert!";

    const durationMs = Number(p?.alert?.duration_ms || 6500);

    const card = document.createElement("div");
    card.style.minWidth = "420px";
    card.style.maxWidth = "820px";
    card.style.padding = "16px 18px";
    card.style.borderRadius = "18px";
    card.style.background = "rgba(10, 10, 12, 0.86)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.backdropFilter = "blur(10px)";
    card.style.webkitBackdropFilter = "blur(10px)";
    card.style.boxShadow = "0 18px 48px rgba(0,0,0,0.35)";
    card.style.color = "#fff";
    card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    card.style.fontSize = "22px";
    card.style.lineHeight = "1.2";
    card.style.letterSpacing = "0.2px";
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "center";
    card.style.textAlign = "center";
    card.style.opacity = "0";
    card.style.transform = "translateY(-10px) scale(0.98)";
    card.style.transition = "opacity 180ms ease, transform 180ms ease";

    card.textContent = String(text);
    stage.appendChild(card);

    requestAnimationFrame(() => {
      card.style.opacity = "1";
      card.style.transform = "translateY(0px) scale(1)";
    });

    const life = Math.max(1200, durationMs);

    setTimeout(() => {
      card.style.opacity = "0";
      card.style.transform = "translateY(-10px) scale(0.98)";
      setTimeout(() => card.remove(), 220);
    }, life);

    // ACK lifecycle
    ack(playId, "started");
    setTimeout(() => ack(playId, "ended"), life + 60);
  }

  function start() {
    if (!publicId || !streamUrl) {
      hud("alerts: missing config");
      return;
    }

    hud("alerts: connecting…");

    let es;
    try {
      es = new EventSource(streamUrl);
    } catch (e) {
      hud("alerts: EventSource failed");
      return;
    }

    es.addEventListener("hello", (ev) => {
      try {
        const j = JSON.parse(ev.data);
        hud(`alerts: connected (drained ${j.drained || 0})`);
      } catch {
        hud("alerts: connected");
      }
    });

    es.addEventListener("play", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const playId = data.play_id || data.playId || null;
        const payload = data.payload || data;
        showAlert(playId, payload);
      } catch (e) {
        hud("alerts: bad play payload");
      }
    });

    es.onerror = () => {
      hud("alerts: SSE error (retrying)");
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
