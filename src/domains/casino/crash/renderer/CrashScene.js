import * as PIXI from "pixi.js";
import { Scene } from "./Scene.js";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function isoToMs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * CrashScene
 * - Reads snapshot.server_now + snapshot.round timestamps
 * - Renders a simple "broadcast plate" with rocket + multiplier HUD
 * - Never decides outcomes / RNG / narration
 */
export class CrashScene extends Scene {
  constructor({ skin }) {
    super();
    this.skin = skin;

    this.app = null;
    this.hostEl = null;

    this.snapshot = null;

    // display objects
    this.root = null;
    this.bg = null;
    this.rocket = null;
    this.flame = null;
    this.boom = null;
    this.hudText = null;

    // cached computed
    this._lastServerNowMs = null;
  }

  async mount(hostEl) {
    this.hostEl = hostEl;

    const width = hostEl.clientWidth || 1280;
    const height = hostEl.clientHeight || 720;

    this.app = new PIXI.Application();
    await this.app.init({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    hostEl.innerHTML = "";
    hostEl.appendChild(this.app.canvas);

    this.root = new PIXI.Container();
    this.app.stage.addChild(this.root);

    await this._loadAssets();

    this._buildScene(width, height);
  }

  async _loadAssets() {
    const textures = (this.skin?.games?.crash?.textures) || {};
    const shared = (this.skin?.shared?.textures) || {};

    const assetsToLoad = [];

    if (shared.plate) assetsToLoad.push({ alias: "plate", src: shared.plate });
    if (textures.rocket) assetsToLoad.push({ alias: "rocket", src: textures.rocket });
    if (textures.flame) assetsToLoad.push({ alias: "flame", src: textures.flame });
    if (textures.boom) assetsToLoad.push({ alias: "boom", src: textures.boom });

    // Load via Pixi Assets system
    // Works in Pixi v7+ / v8
    for (const a of assetsToLoad) {
      try {
        PIXI.Assets.add({ alias: a.alias, src: a.src });
      } catch (_) {
        // ignore re-add
      }
    }
    if (assetsToLoad.length) {
      await PIXI.Assets.load(assetsToLoad.map((a) => a.alias));
    }
  }

  _buildScene(width, height) {
    const params = (this.skin?.games?.crash?.params) || {};
    const hudOffsetY = safeNum(params.hudOffsetY, 24);

    // background plate
    const plateTex = PIXI.Assets.get("plate") || PIXI.Texture.WHITE;
    this.bg = new PIXI.Sprite(plateTex);
    this.bg.width = width;
    this.bg.height = height;
    this.bg.alpha = plateTex === PIXI.Texture.WHITE ? 0.08 : 1;
    this.root.addChild(this.bg);

    // rocket
    const rocketTex = PIXI.Assets.get("rocket") || PIXI.Texture.WHITE;
    this.rocket = new PIXI.Sprite(rocketTex);
    this.rocket.anchor.set(0.5, 0.5);
    this.rocket.width = safeNum(params.rocketW, 140);
    this.rocket.height = safeNum(params.rocketH, 140);
    this.rocket.x = safeNum(params.rocketStartX, 140);
    this.rocket.y = height * 0.55;
    this.root.addChild(this.rocket);

    // flame
    const flameTex = PIXI.Assets.get("flame") || PIXI.Texture.WHITE;
    this.flame = new PIXI.Sprite(flameTex);
    this.flame.anchor.set(0.5, 0.1);
    this.flame.width = safeNum(params.flameW, 70);
    this.flame.height = safeNum(params.flameH, 120);
    this.flame.x = this.rocket.x;
    this.flame.y = this.rocket.y + (this.rocket.height * 0.35);
    this.flame.alpha = flameTex === PIXI.Texture.WHITE ? 0.0 : 1.0;
    this.root.addChild(this.flame);

    // boom overlay (hidden by default)
    const boomTex = PIXI.Assets.get("boom") || PIXI.Texture.WHITE;
    this.boom = new PIXI.Sprite(boomTex);
    this.boom.anchor.set(0.5, 0.5);
    this.boom.width = safeNum(params.boomW, 260);
    this.boom.height = safeNum(params.boomH, 260);
    this.boom.x = width * 0.5;
    this.boom.y = height * 0.5;
    this.boom.alpha = 0.0;
    this.root.addChild(this.boom);

    // HUD text
    this.hudText = new PIXI.Text({
      text: "—",
      style: {
        fontFamily: "Arial",
        fontSize: safeNum(params.hudFontSize, 64),
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 1,
      },
    });
    this.hudText.anchor.set(0.5, 0);
    this.hudText.x = width * 0.5;
    this.hudText.y = hudOffsetY;
    this.root.addChild(this.hudText);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this._lastServerNowMs = isoToMs(snapshot?.server_now);
  }

  tick(dt) {
    if (!this.snapshot || !this.app) return;

    const round = this.snapshot.round;
    if (!round) {
      this._renderIdle();
      return;
    }

    const status = String(round.status || "").toLowerCase();
    const startedMs = isoToMs(round.started_at);
    const endsMs = isoToMs(round.ends_at);
    const serverNowMs = this._lastServerNowMs ?? Date.now();

    // When active: compute progress from timestamps only (no RNG)
    let progress = 0;
    if (startedMs && endsMs && endsMs > startedMs) {
      progress = clamp01((serverNowMs - startedMs) / (endsMs - startedMs));
    }

    // Visual multiplier display:
    // - If cashed_out: freeze at cashout_at_multiplier
    // - If exploded: freeze at crash_multiplier and show boom
    // - If active: interpolate visually up to crash_multiplier (display-only)
    const crashMult = safeNum(round.crash_multiplier, 1.0);
    const cashMult = safeNum(round.cashout_at_multiplier, null);

    let displayMult = 1.0;

    if (status === "cashed_out" && cashMult != null) {
      displayMult = cashMult;
    } else if (status === "exploded") {
      displayMult = crashMult;
    } else {
      // display-only interpolation (smooth & deterministic from progress)
      displayMult = 1 + (crashMult - 1) * progress;
      // 2dp clamp
      displayMult = Math.floor(displayMult * 100) / 100;
      if (displayMult > crashMult) displayMult = crashMult;
      if (displayMult < 1.0) displayMult = 1.0;
    }

    this.hudText.text = `${displayMult.toFixed(2)}x`;

    // rocket movement across screen
    const params = (this.skin?.games?.crash?.params) || {};
    const startX = safeNum(params.rocketStartX, 140);
    const endX = safeNum(params.rocketEndX, (this.app.renderer.width - 140));
    const x = startX + (endX - startX) * progress;

    this.rocket.x = x;
    this.flame.x = x;

    // simple bob + flame flicker while running
    if (status === "active") {
      const t = this.app.ticker.lastTime / 1000;
      this.rocket.y = (this.app.renderer.height * 0.55) + Math.sin(t * 4) * 6;
      this.flame.y = this.rocket.y + (this.rocket.height * 0.35);

      this.flame.alpha = 0.75 + (Math.sin(t * 18) * 0.15);
      this.boom.alpha = 0.0;
    } else if (status === "exploded") {
      this.flame.alpha = 0.0;
      this.boom.alpha = 1.0;
    } else if (status === "cashed_out") {
      this.flame.alpha = 0.0;
      this.boom.alpha = 0.0;
    } else {
      // unknown status: safe idle
      this.flame.alpha = 0.0;
      this.boom.alpha = 0.0;
    }
  }

  _renderIdle() {
    if (!this.hudText) return;
    this.hudText.text = "—";
    if (this.flame) this.flame.alpha = 0.0;
    if (this.boom) this.boom.alpha = 0.0;
  }

  unmount() {
    if (this.hostEl) this.hostEl.innerHTML = "";
    if (this.app) {
      try {
        this.app.destroy(true);
      } catch (_) {}
    }
    this.app = null;
    this.hostEl = null;
  }
}
