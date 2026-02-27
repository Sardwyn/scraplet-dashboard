import { loadSkin } from "./skinLoader.js";
import { CrashScene } from "./CrashScene.js";

export async function bootCrashRenderer({
  hostEl,
  skinKey = "neon-v1",
  platform = "kick",
  channel_id,
  username = null,
  pollMs = 250,
  onDebug = null,
}) {
  const debug = (m) => { if (typeof onDebug === "function") onDebug(String(m)); };

  if (!hostEl) throw new Error("hostEl is required");
  if (!channel_id) throw new Error("channel_id is required");
  if (!window.PIXI) throw new Error("PIXI not found. CDN failed to load.");

  debug(`Loading skin: ${skinKey}…`);
  const skin = await loadSkin(skinKey);
  debug(`Skin loaded: ${skin?.key || "unknown"} v${skin?.version || "?"}`);

  const scene = new CrashScene({ skin });
  await scene.mount(hostEl);
  debug(`Scene mounted. Polling state…`);

  let alive = true;

  async function poll() {
    if (!alive) return;

    const qs = new URLSearchParams();
    qs.set("platform", platform);
    qs.set("channel_id", channel_id);
    if (username) qs.set("username", username);

    const url = `/api/obs/casino/crash/state?${qs.toString()}`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        debug(`STATE HTTP ${res.status} ${res.statusText}\n${url}`);
      } else {
        const json = await res.json();
        if (json && json.server_now) {
          scene.applySnapshot(json);
          debug(`OK\nserver_now=${json.server_now}\nround_status=${json.round?.status || "null"}`);
        } else {
          debug(`STATE malformed (missing server_now)\n${url}`);
        }
      }
    } catch (e) {
      debug(`STATE fetch error:\n${String(e?.message || e)}\n${url}`);
    }

    setTimeout(poll, pollMs);
  }

  poll();

  let last = performance.now();
  function raf(now) {
    if (!alive) return;
    last = now;
    scene.tick();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  return {
    stop() {
      alive = false;
      scene.unmount();
    },
    scene,
  };
}
