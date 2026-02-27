import { bootCrashRenderer } from "./renderer/bootstrap.js";

const hostEl = document.getElementById("host");
const debugEl = document.getElementById("debug");

function setDebug(msg) {
  if (debugEl) debugEl.textContent = String(msg);
}

function qs() {
  return new URLSearchParams(window.location.search);
}

const q = qs();
const platform = q.get("platform") || "kick";
const channel_id = q.get("channel_id") || "";
const username = q.get("username") || null;
const skin = q.get("skin") || "neon-v1";
const pollMs = Number(q.get("pollMs") || "250");

function fit() {
  hostEl.style.width = `${window.innerWidth}px`;
  hostEl.style.height = `${window.innerHeight}px`;
}
window.addEventListener("resize", fit);
fit();

setDebug(
  `Crash renderer\n` +
  `platform=${platform}\n` +
  `channel_id=${channel_id || "(missing)"}\n` +
  `skin=${skin}\n` +
  `pollMs=${pollMs}\n` +
  `PIXI=${window.PIXI ? "loaded" : "MISSING"}`
);

bootCrashRenderer({
  hostEl,
  skinKey: skin,
  platform,
  channel_id,
  username,
  pollMs,
  onDebug: setDebug,
}).catch((err) => {
  console.error("Crash renderer failed to boot:", err);
  setDebug(`Crash renderer FAILED:\n${String(err?.stack || err)}`);
});
