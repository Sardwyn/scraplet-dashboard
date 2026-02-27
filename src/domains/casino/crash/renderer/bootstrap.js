import { loadSkin } from "./skinLoader.js";
import { CrashScene } from "./CrashScene.js";

export async function bootCrashRenderer({
  hostEl,
  skinKey = "neon-v1",
  platform = "kick",
  channel_id,
  username = null,
  pollMs = 250,
}) {
  if (!hostEl) throw new Error("hostEl is required");
  if (!channel_id) throw new Error("channel_id is required");

  const skin = await loadSkin(skinKey);
  const scene = new CrashScene({ skin });

  await scene.mount(hostEl);

  let alive = true;

  async function poll() {
    if (!alive) return;

    const qs = new URLSearchParams();
    qs.set("platform", platform);
    qs.set("channel_id", channel_id);
    if (username) qs.set("username", username);

    try {
      const res = await fetch(`/api/obs/casino/crash/state?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      // snapshot is { server_now, round }
      if (json && json.server_now) {
        scene.applySnapshot(json);
      }
    } catch (e) {
      // renderer must not die; just keep trying
      // (no console spam by default)
    }

    setTimeout(poll, pollMs);
  }

  poll();

  // local tick loop (Pixi ticker can be used too, but this is explicit & portable)
  let last = performance.now();
  function raf(now) {
    if (!alive) return;
    const dt = (now - last) / 1000;
    last = now;
    scene.tick(dt);
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
